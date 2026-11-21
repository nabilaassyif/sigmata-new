package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type memoryStore map[string][]byte

func (m memoryStore) set(_ context.Context, k string, v []byte, _ time.Duration) error {
	m[k] = v
	return nil
}
func (m memoryStore) get(_ context.Context, k string) ([]byte, error) {
	v, ok := m[k]
	if !ok {
		return nil, errors.New("missing")
	}
	return v, nil
}
func (m memoryStore) getDel(ctx context.Context, k string) ([]byte, error) {
	v, e := m.get(ctx, k)
	delete(m, k)
	return v, e
}
func (m memoryStore) lock(_ context.Context, k, v string, _ time.Duration) (bool, error) {
	if _, ok := m[k]; ok {
		return false, nil
	}
	m[k] = []byte(v)
	return true, nil
}
func (m memoryStore) unlock(_ context.Context, k, v string) {
	if string(m[k]) == v {
		delete(m, k)
	}
}
func (m memoryStore) compareAndSet(_ context.Context, k string, old, next []byte) (bool, error) {
	if string(m[k]) != string(old) {
		return false, nil
	}
	m[k] = next
	return true, nil
}

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestBFFFlow(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	store := memoryStore{}
	issuer := "http://issuer/realms/sigmata"
	origin := "http://localhost:5173"
	var nonce string
	sign := func(claims jwt.Claims) string {
		tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		tok.Header["kid"] = "key"
		value, err := tok.SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	client := &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		var body []byte
		if strings.Contains(r.URL.Path, "certs") {
			body, _ = json.Marshal(map[string]any{"keys": []any{map[string]string{"kid": "key", "kty": "RSA", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())}}})
		} else {
			if err := r.ParseForm(); err != nil {
				t.Fatal(err)
			}
			if r.Form.Get("code_verifier") == "" && r.Form.Get("grant_type") == "authorization_code" {
				t.Error("missing PKCE verifier")
			}
			acc := identity{RegisteredClaims: jwt.RegisteredClaims{Issuer: issuer, Subject: "user", Audience: jwt.ClaimStrings{"sigmata-api"}, ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}, Type: "Bearer", AuthorizedParty: "citizenWeb"}
			acc.RealmAccess.Roles = []string{"citizen"}
			id := idClaims{RegisteredClaims: jwt.RegisteredClaims{Issuer: issuer, Subject: "user", Audience: jwt.ClaimStrings{"citizenWeb"}, ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}, Nonce: nonce}
			body, _ = json.Marshal(tokenResponse{AccessToken: sign(acc), IDToken: sign(id), RefreshToken: "refresh"})
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(body))), Header: make(http.Header)}, nil
	})}
	v := verifier{issuer: issuer, audience: "sigmata-api", jwksURL: "http://keycloak/certs", client: client}
	b := &bff{verifier: v, redis: store, issuer: issuer, tokenURL: "http://keycloak/token", httpClient: client, apps: map[string]bffApp{"citizen": {clientID: "citizenWeb", origin: origin}, "internal": {clientID: "internalWeb", origin: "http://localhost:5174"}}}
	handler := newHandler(v, b)
	start := httptest.NewRecorder()
	handler.ServeHTTP(start, httptest.NewRequest("GET", "/api/auth/citizen/login", nil))
	if start.Code != 302 {
		t.Fatal(start.Code)
	}
	location, err := url.Parse(start.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	q := location.Query()
	nonce = q.Get("nonce")
	if q.Get("code_challenge_method") != "S256" || nonce == "" {
		t.Fatal("missing PKCE or nonce")
	}
	state := q.Get("state")
	stateCookie := start.Result().Cookies()[0]
	bad := httptest.NewRecorder()
	badReq := httptest.NewRequest("GET", "/api/auth/citizen/callback?state=wrong&code=code", nil)
	badReq.AddCookie(stateCookie)
	handler.ServeHTTP(bad, badReq)
	if bad.Code != 400 {
		t.Fatal("invalid state accepted")
	}
	cb := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/auth/citizen/callback?state="+state+"&code=code", nil)
	req.AddCookie(stateCookie)
	handler.ServeHTTP(cb, req)
	if cb.Code != 303 {
		t.Fatalf("callback %d %s", cb.Code, cb.Body.String())
	}
	var sessionCookie *http.Cookie
	for _, c := range cb.Result().Cookies() {
		if c.Name == "sigmata_session_citizen" {
			sessionCookie = c
		}
	}
	if sessionCookie == nil || !sessionCookie.HttpOnly {
		t.Fatal("missing protected session cookie")
	}
	me := httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/auth/citizen/session", nil)
	req.AddCookie(sessionCookie)
	handler.ServeHTTP(me, req)
	if me.Code != 200 || !strings.Contains(me.Body.String(), "citizen") || strings.Contains(me.Body.String(), "refresh") {
		t.Fatalf("session %d %s", me.Code, me.Body.String())
	}
	keyName := "oidc:session:" + digest(sessionCookie.Value)
	var stored session
	if json.Unmarshal(store[keyName], &stored) != nil {
		t.Fatal("invalid stored session")
	}
	expired := identity{RegisteredClaims: jwt.RegisteredClaims{Issuer: issuer, Subject: "user", Audience: jwt.ClaimStrings{"sigmata-api"}, ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute))}, Type: "Bearer", AuthorizedParty: "citizenWeb"}
	stored.AccessToken = sign(expired)
	store[keyName], _ = json.Marshal(stored)
	refreshed := httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/auth/citizen/session", nil)
	req.AddCookie(sessionCookie)
	handler.ServeHTTP(refreshed, req)
	if refreshed.Code != 200 {
		t.Fatalf("refresh: %d", refreshed.Code)
	}
	restricted := http.NewServeMux()
	restricted.Handle("GET /api/auth/{app}/restricted", b.authenticateSession(requireRoles(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }), "admin", "operator")))
	denied := httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/auth/citizen/restricted", nil)
	req.AddCookie(sessionCookie)
	restricted.ServeHTTP(denied, req)
	if denied.Code != 403 {
		t.Fatal("citizen reached privileged route")
	}
	replay := httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/auth/citizen/callback?state="+state+"&code=code", nil)
	req.AddCookie(stateCookie)
	handler.ServeHTTP(replay, req)
	if replay.Code != 400 {
		t.Fatal("state replay accepted")
	}
	rejected := httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/auth/citizen/logout", nil)
	req.Header.Set("Origin", "http://evil.example")
	req.AddCookie(sessionCookie)
	handler.ServeHTTP(rejected, req)
	if rejected.Code != 403 {
		t.Fatal("cross-origin logout accepted")
	}
	logout := httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/auth/citizen/logout", nil)
	req.Header.Set("Origin", origin)
	req.AddCookie(sessionCookie)
	handler.ServeHTTP(logout, req)
	if logout.Code != 303 {
		t.Fatalf("logout %d", logout.Code)
	}
	me = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/auth/citizen/session", nil)
	req.AddCookie(sessionCookie)
	handler.ServeHTTP(me, req)
	if me.Code != 401 {
		t.Fatal("session remained active")
	}
	internal := httptest.NewRecorder()
	handler.ServeHTTP(internal, httptest.NewRequest("GET", "/api/auth/internal/login?action=register", nil))
	if internal.Code != 403 {
		t.Fatal("staff registration allowed")
	}
}
