package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func newHandler(v verifier) http.Handler {
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
	mux.Handle("GET /api/me", v.authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		id := r.Context().Value(identityKey{}).(*identity)
		_ = json.NewEncoder(w).Encode(map[string]any{"subject": id.Subject, "roles": id.RealmAccess.Roles})
	})))
	return mux
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	v := verifier{issuer: os.Getenv("OIDC_ISSUER"), jwksURL: os.Getenv("OIDC_JWKS_URL"), audience: os.Getenv("OIDC_AUDIENCE"), client: &http.Client{Timeout: 5 * time.Second}}
	if v.issuer == "" || v.jwksURL == "" || v.audience == "" {
		logger.Error("OIDC_ISSUER, OIDC_JWKS_URL and OIDC_AUDIENCE are required")
		os.Exit(1)
	}
	server := &http.Server{Addr: ":8080", Handler: newHandler(v), ReadHeaderTimeout: 5 * time.Second}
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
