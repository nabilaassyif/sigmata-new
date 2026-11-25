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
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if len(backends) == 0 || backends[0] == nil || backends[0].workflow == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"not_ready"}`))
			return
		}
		workflow := backends[0].workflow
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		var schemaReady bool
		if workflow.db.Ping(ctx) != nil || workflow.redis.Ping(ctx).Err() != nil || workflow.db.QueryRow(ctx, "SELECT to_regclass('laksacomplaints') IS NOT NULL").Scan(&schemaReady) != nil || !schemaReady {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"not_ready"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})
	if len(backends) > 0 && backends[0] != nil {
		backend := backends[0]
		mux.HandleFunc("GET /api/auth/{app}/login", backend.start)
		mux.HandleFunc("GET /api/auth/{app}/callback", backend.callback)
		mux.Handle("GET /api/auth/{app}/session", backend.authenticateSession(http.HandlerFunc(backend.current)))
		mux.HandleFunc("POST /api/auth/{app}/logout", backend.logout)
		mux.Handle("POST /api/{app}/inference/predict", backend.authenticateSession(requireRoles(http.HandlerFunc(backend.predictPreview), "operator", "opdStaff", "admin")))
		if backend.workflow != nil {
			w := backend.workflow
			register := func(method, path, app string, handler http.Handler) {
				mux.Handle(method+" /api/"+app+path, http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
					r.SetPathValue("app", app)
					backend.authenticateSession(handler).ServeHTTP(rw, r)
				}))
			}
			for _, app := range []string{"citizen", "internal"} {
				register("GET", "/complaints/{id}", app, http.HandlerFunc(w.getComplaint))
				register("GET", "/complaints/{id}/photo", app, http.HandlerFunc(w.getPhoto))
			}
			register("POST", "/complaints", "citizen", http.HandlerFunc(w.createComplaint))
			register("GET", "/complaints", "citizen", http.HandlerFunc(w.listMyComplaints))
			register("GET", "/complaints", "internal", requireRoles(http.HandlerFunc(w.listPendingReview), "operator", "admin"))
			register("POST", "/complaints/{id}/decision", "internal", requireRoles(http.HandlerFunc(w.decideComplaint), "operator", "admin"))
			register("GET", "/routing/catalog", "internal", requireRoles(http.HandlerFunc(w.getCatalog), "operator", "admin"))
			register("POST", "/routing/catalog", "internal", requireRoles(http.HandlerFunc(w.updateCatalog), "admin"))
		}
	}
	return mux
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	startCtx, startCancel := startupContext()
	db, err := openDatabase(startCtx)
	startCancel()
	if err != nil {
		logger.Error("database unavailable", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	err = migrate(ctx, db)
	cancel()
	if err != nil {
		logger.Error("migration failed", "error", err)
		os.Exit(1)
	}
	logger.Info("migration complete")
	redisOpts, err := redisOptions()
	if err != nil {
		logger.Error("redis configuration invalid", "error", err)
		os.Exit(1)
	}
	redisClient := redis.NewClient(redisOpts)
	defer redisClient.Close()
	w, err := initWorkflow(context.Background(), db, redisClient)
	if err != nil {
		logger.Error("workflow configuration invalid", "error", err)
		os.Exit(1)
	}
	if os.Getenv("APP_MODE") == "worker" {
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		w.runWorker(ctx, logger)
		return
	}
	v := verifier{issuer: os.Getenv("OIDC_ISSUER"), jwksURL: os.Getenv("OIDC_JWKS_URL"), audience: os.Getenv("OIDC_AUDIENCE"), client: &http.Client{Timeout: 5 * time.Second}}
	if v.issuer == "" || v.jwksURL == "" || v.audience == "" {
		logger.Error("OIDC_ISSUER, OIDC_JWKS_URL and OIDC_AUDIENCE are required")
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
	backend := &bff{verifier: v, redis: redisStore{client: redisClient}, issuer: v.issuer, tokenURL: tokenURL, secureCookie: secureCookie, httpClient: &http.Client{Timeout: 5 * time.Second}, inference: w.inference, workflow: w, apps: map[string]bffApp{"citizen": {clientID: "citizenWeb", origin: citizenOrigin}, "internal": {clientID: "internalWeb", origin: internalOrigin}}}
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
