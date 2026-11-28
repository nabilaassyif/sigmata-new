package main

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type identity struct {
	jwt.RegisteredClaims
	Type              string `json:"typ"`
	AuthorizedParty   string `json:"azp"`
	Email             string `json:"email"`
	EmailVerified     bool   `json:"email_verified"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
	RealmAccess       struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
}
type identityKey struct{}
type verifier struct {
	issuer, audience, jwksURL string
	client                    *http.Client
}

func (v verifier) key(token *jwt.Token) (any, error) {
	if token.Method.Alg() != "RS256" {
		return nil, errors.New("unexpected algorithm")
	}
	kid, ok := token.Header["kid"].(string)
	if !ok || kid == "" {
		return nil, errors.New("missing key id")
	}
	resp, err := v.client.Get(v.jwksURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("key service unavailable")
	}
	var keys struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			Use string `json:"use"`
			Alg string `json:"alg"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&keys); err != nil {
		return nil, err
	}
	for _, k := range keys.Keys {
		if k.Kid != kid || k.Kty != "RSA" || (k.Use != "" && k.Use != "sig") || (k.Alg != "" && k.Alg != "RS256") {
			continue
		}
		n, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			return nil, err
		}
		e, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil || len(e) == 0 || len(e) > 4 {
			return nil, errors.New("invalid exponent")
		}
		exponent := 0
		for _, b := range e {
			exponent = exponent<<8 | int(b)
		}
		if exponent < 3 || len(n) < 256 {
			return nil, errors.New("invalid RSA key")
		}
		return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: exponent}, nil
	}
	return nil, errors.New("unknown key")
}
func (v verifier) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || len(parts[1]) > 16384 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		claims := new(identity)
		token, err := jwt.ParseWithClaims(parts[1], claims, v.key, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(v.issuer), jwt.WithAudience(v.audience), jwt.WithExpirationRequired(), jwt.WithLeeway(5*time.Second))
		if err != nil || !token.Valid || claims.Subject == "" || claims.Type != "Bearer" || (claims.AuthorizedParty != "citizenWeb" && claims.AuthorizedParty != "internalWeb") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey{}, claims)))
	})
}

func requireRoles(next http.Handler, roles ...string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := r.Context().Value(identityKey{}).(*identity)
		if ok && id.AuthorizedParty == "internalWeb" {
			for _, have := range id.RealmAccess.Roles {
				for _, want := range roles {
					if have == want {
						next.ServeHTTP(w, r)
						return
					}
				}
			}
		}
		http.Error(w, "forbidden", http.StatusForbidden)
	})
}
