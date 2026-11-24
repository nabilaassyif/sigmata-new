package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

type bffApp struct{ clientID, origin string }
type bff struct {
	verifier         verifier
	redis            sessionStore
	issuer, tokenURL string
	secureCookie     bool
	apps             map[string]bffApp
	httpClient       *http.Client
	inference        *inferenceClient
	workflow         *workflow
}
type loginState struct {
	Verifier string `json:"verifier"`
	Nonce    string `json:"nonce"`
	App      string `json:"app"`
}
type session struct {
	AccessToken  string    `json:"accessToken"`
	RefreshToken string    `json:"refreshToken"`
	App          string    `json:"app"`
	ExpiresAt    time.Time `json:"expiresAt"`
}
type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
}
type idClaims struct {
	jwt.RegisteredClaims
	Nonce string `json:"nonce"`
}

func randomValue() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func digest(s string) string {
	sum := sha256.Sum256([]byte(s))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
func (b *bff) app(r *http.Request) (bffApp, bool) { a, ok := b.apps[r.PathValue("app")]; return a, ok }
func (b *bff) cookie(w http.ResponseWriter, name, value, path string, age int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: path, HttpOnly: true, Secure: b.secureCookie, SameSite: http.SameSiteLaxMode, MaxAge: age})
}
func (b *bff) start(w http.ResponseWriter, r *http.Request) {
	app, ok := b.app(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	registration := r.URL.Query().Get("action") == "register"
	if registration && app.clientID != "citizenWeb" {
		http.Error(w, "forbidden", 403)
		return
	}
	if r.URL.Query().Get("action") != "" && !registration {
		http.Error(w, "invalid action", 400)
		return
	}
	state, err := randomValue()
	if err != nil {
		http.Error(w, "unavailable", 503)
		return
	}
	verifier, err := randomValue()
	if err != nil {
		http.Error(w, "unavailable", 503)
		return
	}
	nonce, err := randomValue()
	if err != nil {
		http.Error(w, "unavailable", 503)
		return
	}
	data, _ := json.Marshal(loginState{Verifier: verifier, Nonce: nonce, App: r.PathValue("app")})
	if err = b.redis.set(r.Context(), "oidc:state:"+digest(state), data, 5*time.Minute); err != nil {
		http.Error(w, "unavailable", 503)
		return
	}
	b.cookie(w, "sigmata_state_"+r.PathValue("app"), state, "/api/auth/"+r.PathValue("app")+"/callback", 300)
	endpoint := b.issuer + "/protocol/openid-connect/auth"
	if registration {
		endpoint = b.issuer + "/protocol/openid-connect/registrations"
	}
	q := url.Values{"client_id": {app.clientID}, "redirect_uri": {app.origin + "/api/auth/" + r.PathValue("app") + "/callback"}, "response_type": {"code"}, "scope": {"openid"}, "state": {state}, "nonce": {nonce}, "code_challenge": {digest(verifier)}, "code_challenge_method": {"S256"}}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, endpoint+"?"+q.Encode(), http.StatusFound)
}
func (b *bff) exchange(ctx context.Context, values url.Values) (tokenResponse, error) {
	var result tokenResponse
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.tokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return result, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return result, errors.New("token endpoint failed")
	}
	err = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result)
	if err != nil || result.AccessToken == "" {
		return result, errors.New("invalid token response")
	}
	return result, nil
}
func (b *bff) validateAccess(raw, clientID string) (*identity, error) {
	claims := new(identity)
	token, err := jwt.ParseWithClaims(raw, claims, b.verifier.key, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(b.verifier.issuer), jwt.WithAudience(b.verifier.audience), jwt.WithExpirationRequired())
	if err != nil || !token.Valid || claims.Type != "Bearer" || claims.Subject == "" || claims.AuthorizedParty != clientID {
		return nil, errors.New("invalid access token")
	}
	return claims, nil
}
func (b *bff) validateID(raw, clientID, nonce, subject string) error {
	claims := new(idClaims)
	token, err := jwt.ParseWithClaims(raw, claims, b.verifier.key, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(b.verifier.issuer), jwt.WithAudience(clientID), jwt.WithExpirationRequired())
	if err != nil || !token.Valid || claims.Subject != subject || subtle.ConstantTimeCompare([]byte(claims.Nonce), []byte(nonce)) != 1 {
		return errors.New("invalid id token")
	}
	return nil
}
func (b *bff) callback(w http.ResponseWriter, r *http.Request) {
	app, ok := b.app(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	name := r.PathValue("app")
	state := r.URL.Query().Get("state")
	cookie, err := r.Cookie("sigmata_state_" + name)
	if err != nil || len(state) != 43 || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(state)) != 1 {
		http.Error(w, "invalid state", 400)
		return
	}
	b.cookie(w, "sigmata_state_"+name, "", "/api/auth/"+name+"/callback", -1)
	data, err := b.redis.getDel(r.Context(), "oidc:state:"+digest(state))
	if err != nil {
		http.Error(w, "invalid state", 400)
		return
	}
	var pending loginState
	if json.Unmarshal(data, &pending) != nil || pending.App != name || r.URL.Query().Get("code") == "" {
		http.Error(w, "login failed", 400)
		return
	}
	tokens, err := b.exchange(r.Context(), url.Values{"grant_type": {"authorization_code"}, "client_id": {app.clientID}, "code": {r.URL.Query().Get("code")}, "redirect_uri": {app.origin + "/api/auth/" + name + "/callback"}, "code_verifier": {pending.Verifier}})
	if err != nil || tokens.RefreshToken == "" || tokens.IDToken == "" {
		http.Error(w, "login failed", 502)
		return
	}
	id, err := b.validateAccess(tokens.AccessToken, app.clientID)
	if err != nil || b.validateID(tokens.IDToken, app.clientID, pending.Nonce, id.Subject) != nil {
		http.Error(w, "login failed", 401)
		return
	}
	sid, err := randomValue()
	if err != nil {
		http.Error(w, "unavailable", 503)
		return
	}
	data, _ = json.Marshal(session{AccessToken: tokens.AccessToken, RefreshToken: tokens.RefreshToken, App: name, ExpiresAt: time.Now().Add(8 * time.Hour)})
	if b.redis.set(r.Context(), "oidc:session:"+digest(sid), data, 8*time.Hour) != nil {
		http.Error(w, "unavailable", 503)
		return
	}
	b.cookie(w, "sigmata_session_"+name, sid, "/", 28800)
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, app.origin+"/", http.StatusSeeOther)
}
func (b *bff) authenticateSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		app, ok := b.app(r)
		if !ok {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("Origin") != app.origin {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		name := r.PathValue("app")
		c, err := r.Cookie("sigmata_session_" + name)
		if err != nil || len(c.Value) != 43 {
			http.Error(w, "unauthorized", 401)
			return
		}
		key := "oidc:session:" + digest(c.Value)
		data, err := b.redis.get(r.Context(), key)
		if err != nil {
			http.Error(w, "unauthorized", 401)
			return
		}
		var s session
		if json.Unmarshal(data, &s) != nil || s.App != name || time.Now().After(s.ExpiresAt) {
			http.Error(w, "unauthorized", 401)
			return
		}
		id, err := b.validateAccess(s.AccessToken, app.clientID)
		if err != nil {
			id, err = b.refresh(r.Context(), key, data, &s, app)
			if err != nil {
				http.Error(w, "unauthorized", 401)
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey{}, id)))
	})
}
func (b *bff) current(w http.ResponseWriter, r *http.Request) {
	id := r.Context().Value(identityKey{}).(*identity)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"subject": id.Subject, "roles": id.RealmAccess.Roles})
}

func (b *bff) refresh(ctx context.Context, key string, old []byte, s *session, app bffApp) (*identity, error) {
	lockKey := key + ":refresh"
	lock, err := randomValue()
	if err != nil {
		return nil, err
	}
	acquired, err := b.redis.lock(ctx, lockKey, lock, 10*time.Second)
	if err != nil {
		return nil, err
	}
	if !acquired {
		ticker := time.NewTicker(50 * time.Millisecond)
		defer ticker.Stop()
		timeout := time.NewTimer(6 * time.Second)
		defer timeout.Stop()
		for {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-timeout.C:
				return nil, errors.New("refresh timed out")
			case <-ticker.C:
				latest, err := b.redis.get(ctx, key)
				if err != nil {
					return nil, err
				}
				if string(latest) != string(old) {
					var current session
					if json.Unmarshal(latest, &current) != nil {
						return nil, errors.New("invalid session")
					}
					return b.validateAccess(current.AccessToken, app.clientID)
				}
			}
		}
	}
	defer b.redis.unlock(context.Background(), lockKey, lock)
	latest, err := b.redis.get(ctx, key)
	if err != nil {
		return nil, err
	}
	if string(latest) != string(old) {
		var current session
		if json.Unmarshal(latest, &current) != nil {
			return nil, errors.New("invalid session")
		}
		return b.validateAccess(current.AccessToken, app.clientID)
	}
	tokens, err := b.exchange(ctx, url.Values{"grant_type": {"refresh_token"}, "client_id": {app.clientID}, "refresh_token": {s.RefreshToken}})
	if err != nil {
		return nil, err
	}
	id, err := b.validateAccess(tokens.AccessToken, app.clientID)
	if err != nil {
		return nil, err
	}
	s.AccessToken = tokens.AccessToken
	if tokens.RefreshToken != "" {
		s.RefreshToken = tokens.RefreshToken
	}
	updated, _ := json.Marshal(s)
	result, err := b.redis.compareAndSet(ctx, key, old, updated)
	if err != nil || !result {
		return nil, errors.New("session changed")
	}
	return id, nil
}
func (b *bff) logout(w http.ResponseWriter, r *http.Request) {
	app, ok := b.app(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if r.Header.Get("Origin") != app.origin {
		http.Error(w, "forbidden", 403)
		return
	}
	name := r.PathValue("app")
	c, err := r.Cookie("sigmata_session_" + name)
	if err != nil || len(c.Value) != 43 {
		http.Error(w, "unauthorized", 401)
		return
	}
	key := "oidc:session:" + digest(c.Value)
	data, err := b.redis.getDel(r.Context(), key)
	if err != nil {
		http.Error(w, "unauthorized", 401)
		return
	}
	var s session
	if json.Unmarshal(data, &s) != nil || s.App != name {
		http.Error(w, "unauthorized", 401)
		return
	}
	b.cookie(w, "sigmata_session_"+name, "", "/", -1)
	q := url.Values{"client_id": {app.clientID}, "post_logout_redirect_uri": {app.origin + "/"}}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, b.issuer+"/protocol/openid-connect/logout?"+q.Encode(), http.StatusSeeOther)
}

type sessionStore interface {
	set(context.Context, string, []byte, time.Duration) error
	get(context.Context, string) ([]byte, error)
	getDel(context.Context, string) ([]byte, error)
	lock(context.Context, string, string, time.Duration) (bool, error)
	unlock(context.Context, string, string)
	compareAndSet(context.Context, string, []byte, []byte) (bool, error)
}
type redisStore struct{ client *redis.Client }

func (s redisStore) set(ctx context.Context, k string, v []byte, ttl time.Duration) error {
	return s.client.Set(ctx, k, v, ttl).Err()
}
func (s redisStore) get(ctx context.Context, k string) ([]byte, error) {
	return s.client.Get(ctx, k).Bytes()
}
func (s redisStore) getDel(ctx context.Context, k string) ([]byte, error) {
	return s.client.GetDel(ctx, k).Bytes()
}
func (s redisStore) lock(ctx context.Context, k, v string, ttl time.Duration) (bool, error) {
	return s.client.SetNX(ctx, k, v, ttl).Result()
}
func (s redisStore) unlock(ctx context.Context, k, v string) {
	s.client.Eval(ctx, `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`, []string{k}, v)
}
func (s redisStore) compareAndSet(ctx context.Context, k string, old, updated []byte) (bool, error) {
	result, err := s.client.Eval(ctx, `if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL'); return 1 end return 0`, []string{k}, string(old), string(updated)).Int()
	return result == 1, err
}
