package main

import (
	"context"
	"errors"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func databaseConfig() (string, error) {
	if value := os.Getenv("DATABASE_URL"); value != "" {
		return value, nil
	}
	host, name, user, password := os.Getenv("DATABASE_HOST"), os.Getenv("DATABASE_NAME"), os.Getenv("DATABASE_USER"), os.Getenv("DATABASE_PASSWORD")
	if host == "" || name == "" || user == "" || password == "" {
		return "", errors.New("database configuration missing")
	}
	u := url.URL{Scheme: "postgres", User: url.UserPassword(user, password), Host: net.JoinHostPort(host, envOr("DATABASE_PORT", "5432")), Path: "/" + name}
	q := u.Query()
	q.Set("sslmode", envOr("DATABASE_SSLMODE", "require"))
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func openDatabase(ctx context.Context) (*pgxpool.Pool, error) {
	dsn, err := databaseConfig()
	if err != nil {
		return nil, err
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, errors.New("invalid database configuration")
	}
	cfg.MaxConns = 10
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("database connection failed")
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, errors.New("database connection failed")
	}
	return pool, nil
}

func redisOptions() (*redis.Options, error) {
	if value := os.Getenv("REDIS_URL"); value != "" {
		opts, err := redis.ParseURL(value)
		if err != nil {
			return nil, errors.New("invalid redis configuration")
		}
		return opts, nil
	}
	if value := os.Getenv("REDIS_ADDR"); value != "" {
		return &redis.Options{Addr: value}, nil
	}
	return nil, errors.New("redis configuration missing")
}

func initWorkflow(ctx context.Context, db *pgxpool.Pool, redisClient *redis.Client) (*workflow, error) {
	municipalityId := os.Getenv("MUNICIPALITY_ID")
	if _, err := uuid.Parse(municipalityId); err != nil {
		return nil, errors.New("MUNICIPALITY_ID must be a UUID")
	}
	var photos *photoStore
	endpoint := os.Getenv("GARAGE_ENDPOINT")
	if endpoint != "" {
		var err error
		photos, err = newPhotoStore(endpoint, os.Getenv("GARAGE_REGION"), os.Getenv("GARAGE_ACCESS_KEY"), os.Getenv("GARAGE_SECRET_KEY"), os.Getenv("GARAGE_BUCKET"))
		if err != nil {
			return nil, err
		}
	}
	apiURL := envOr("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")
	if !strings.HasPrefix(apiURL, "https://") && os.Getenv("ALLOW_INSECURE_FEATHERLESS") != "true" {
		return nil, errors.New("FEATHERLESS_BASE_URL must use HTTPS")
	}
	return &workflow{db: db, redis: redisClient, photos: photos, inference: newInferenceClient(os.Getenv("INFERENCE_URL")), featherless: newFeatherlessClient(apiURL, os.Getenv("FEATHERLESS_API_KEY"), os.Getenv("FEATHERLESS_MODEL")), municipalityId: municipalityId}, nil
}

func migrate(ctx context.Context, db *pgxpool.Pool) error {
	data, err := os.ReadFile(envOr("MIGRATION_PATH", "migrations/001Workflow.sql"))
	if err != nil {
		return errors.New("migration file unavailable")
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(731904012)"); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, string(data)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func startupContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 20*time.Second)
}
