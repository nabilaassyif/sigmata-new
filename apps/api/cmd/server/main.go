package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
)

func newHandler(v verifier, backends ...*bff) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	// The application is deliberately not ready until its persistence and auth exist.
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, `{"status":"not_ready"}`, http.StatusServiceUnavailable)
	})
	if len(backends) > 0 && backends[0] != nil {
		backend := backends[0]
		mux.HandleFunc("GET /api/auth/{app}/login", backend.start)
		mux.HandleFunc("GET /api/auth/{app}/callback", backend.callback)
		mux.Handle("GET /api/auth/{app}/session", backend.authenticateSession(http.HandlerFunc(backend.current)))
		mux.HandleFunc("POST /api/auth/{app}/logout", backend.logout)
	}
	return mux
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	v := verifier{issuer: os.Getenv("OIDC_ISSUER"), jwksURL: os.Getenv("OIDC_JWKS_URL"), audience: os.Getenv("OIDC_AUDIENCE"), client: &http.Client{Timeout: 5 * time.Second}}
	if v.issuer == "" || v.jwksURL == "" || v.audience == "" {
		logger.Error("OIDC_ISSUER, OIDC_JWKS_URL and OIDC_AUDIENCE are required")
		os.Exit(1)
	}
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		logger.Error("REDIS_ADDR is required")
		os.Exit(1)
	}
	citizenOrigin := envOr("CITIZEN_ORIGIN", "http://localhost:5173")
	internalOrigin := envOr("INTERNAL_ORIGIN", "http://localhost:5174")
	secureCookie := os.Getenv("SESSION_COOKIE_SECURE") != "false"
	if !secureCookie && (citizenOrigin != "http://localhost:5173" || internalOrigin != "http://localhost:5174") {
		logger.Error("insecure cookies are allowed only for local development")
		os.Exit(1)
	}
	tokenURL := os.Getenv("OIDC_TOKEN_URL")
	if tokenURL == "" {
		logger.Error("OIDC_TOKEN_URL is required")
		os.Exit(1)
	}
	redisClient := redis.NewClient(&redis.Options{Addr: redisAddr})
	backend := &bff{verifier: v, redis: redisStore{client: redisClient}, issuer: v.issuer, tokenURL: tokenURL, secureCookie: secureCookie, httpClient: &http.Client{Timeout: 5 * time.Second}, apps: map[string]bffApp{"citizen": {clientID: "citizenWeb", origin: citizenOrigin}, "internal": {clientID: "internalWeb", origin: internalOrigin}}}
	defer redisClient.Close()
	server := &http.Server{Addr: ":8080", Handler: newHandler(v, backend), ReadHeaderTimeout: 5 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Error("shutdown", "error", err)
		}
	}()
	logger.Info("starting api", "address", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("server failed", "error", err)
		os.Exit(1)
	}
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
