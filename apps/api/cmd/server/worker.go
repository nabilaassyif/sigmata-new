package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
)

const queueKey = "laksa:complaintQueue"
const maxAttempts = 3

var enqueueScript = redis.NewScript(`if redis.call('SET', KEYS[1], '1', 'NX', 'EX', 120) then return redis.call('LPUSH', KEYS[2], ARGV[1]) else return 0 end`)

func (w *workflow) enqueue(ctx context.Context, id string) error {
	return enqueueScript.Run(ctx, w.redis, []string{"laksa:queued:" + id, queueKey}, id).Err()
}

type queuedComplaint struct {
	id, municipalityId, description string
	latitude, longitude             *float64
	photoKey, photoMime             *string
	attempts                        int
}

func (w *workflow) claim(ctx context.Context, id, lease string) (*queuedComplaint, error) {
	var c queuedComplaint
	err := w.db.QueryRow(ctx, `UPDATE laksaComplaints SET status='processing',leaseId=$2,leaseUntil=now()+interval '5 minutes',attempts=attempts+1,updatedAt=now() WHERE id=$1 AND status='pending' AND nextAttemptAt<=now() RETURNING id::text,municipalityId::text,description,latitude,longitude,photoKey,photoMime,attempts`, id, lease).Scan(&c.id, &c.municipalityId, &c.description, &c.latitude, &c.longitude, &c.photoKey, &c.photoMime, &c.attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (w *workflow) catalog(ctx context.Context) ([]string, []string, error) {
	read := func(query string) ([]string, error) {
		rows, err := w.db.Query(ctx, query)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		values := []string{}
		for rows.Next() {
			var value string
			if err := rows.Scan(&value); err != nil {
				return nil, err
			}
			values = append(values, value)
		}
		return values, rows.Err()
	}
	categories, err := read("SELECT label FROM laksaCategories WHERE enabled ORDER BY label")
	if err != nil {
		return nil, nil, err
	}
	agencies, err := read("SELECT label FROM laksaAgencies WHERE enabled ORDER BY label")
	return categories, agencies, err
}

func (w *workflow) finish(ctx context.Context, c *queuedComplaint, lease, category, agency, source, reason string, score *float64, forward bool) error {
	tx, err := w.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var agencyId *string
	if forward {
		var id string
		err = tx.QueryRow(ctx, `SELECT a.id::text FROM laksaAgencies a JOIN laksaCategories c ON c.label=$2 AND c.enabled WHERE a.label=$1 AND a.enabled FOR SHARE OF a,c`, agency, category).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			forward = false
			reason = "Suggested category or agency is not in the active routing catalog"
		} else if err != nil {
			return err
		} else {
			agencyId = &id
		}
	}
	status := "awaitingOperator"
	if forward {
		status = "forwarded"
	}
	var updated string
	err = tx.QueryRow(ctx, `UPDATE laksaComplaints SET status=$3,categoryLabel=CASE WHEN $3='forwarded' THEN $4 ELSE NULL END,agencyId=$5,suggestedCategory=NULLIF($4,''),suggestedAgency=NULLIF($6,''),suggestionSource=NULLIF($7,''),score=$8,reviewReason=NULLIF($9,''),operatorStartedAt=CASE WHEN $3='awaitingOperator' THEN now() ELSE NULL END,forwardedAt=CASE WHEN $3='forwarded' THEN now() ELSE NULL END,leaseId=NULL,leaseUntil=NULL,updatedAt=now() WHERE id=$1 AND status='processing' AND leaseId=$2 AND leaseUntil>now() RETURNING id::text`, c.id, lease, status, category, agencyId, agency, source, score, reason).Scan(&updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO laksaComplaintEvents(complaintId,eventType,actor,details) VALUES($1,$2,'worker',jsonb_build_object('source',$3::text,'score',$4::double precision))`, c.id, status, source, score)
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if forward && w.sla != nil {
		summary, slaErr := w.sla.onDistributedToLiaison(ctx, c.id, "", agencyId, &agency, time.Now().UTC(), "worker", "worker:"+c.id+":"+lease)
		if slaErr == nil && summary != nil && len(summary.ActiveClocks) > 0 {
			earliest := summary.ActiveClocks[0].DueAt
			for _, clk := range summary.ActiveClocks[1:] {
				if clk.DueAt.Before(earliest) {
					earliest = clk.DueAt
				}
			}
			_, _ = w.db.Exec(ctx, `UPDATE laksaComplaints SET slaDueAt=$2 WHERE id=$1`, c.id, earliest)
		}
	}
	return nil
}

func (w *workflow) retry(ctx context.Context, c *queuedComplaint, lease, reason string) error {
	status := "pending"
	if c.attempts >= maxAttempts {
		status = "awaitingOperator"
	}
	var id string
	err := w.db.QueryRow(ctx, `UPDATE laksaComplaints SET status=$3,reviewReason=$4,nextAttemptAt=now()+make_interval(secs => 30 * attempts),operatorStartedAt=CASE WHEN $3='awaitingOperator' THEN now() ELSE NULL END,leaseId=NULL,leaseUntil=NULL,updatedAt=now() WHERE id=$1 AND status='processing' AND leaseId=$2 AND leaseUntil>now() RETURNING id::text`, c.id, lease, status, reason).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}

func (w *workflow) process(ctx context.Context, c *queuedComplaint, lease string) error {
	location := map[string]any(nil)
	if c.latitude != nil && c.longitude != nil {
		location = map[string]any{"latitude": *c.latitude, "longitude": *c.longitude}
	}
	grace, graceErr := w.inference.predict(ctx, inferenceRequest{ComplaintID: c.id, MunicipalityID: c.municipalityId, Description: c.description, GeospatialContext: location})
	if grace.Confidence != nil && (math.IsNaN(*grace.Confidence) || math.IsInf(*grace.Confidence, 0) || *grace.Confidence < 0 || *grace.Confidence > 1) {
		grace.Confidence = nil
	}
	if graceErr == nil && grace.Confidence != nil && !math.IsNaN(*grace.Confidence) && !math.IsInf(*grace.Confidence, 0) && *grace.Confidence >= 0.65 && *grace.Confidence <= 1 && grace.PredictedAgencyLabel != nil && grace.PredictedCategoryLabel != nil {
		return w.finish(ctx, c, lease, *grace.PredictedCategoryLabel, *grace.PredictedAgencyLabel, "grace", "", grace.Confidence, true)
	}
	if w.featherless == nil || w.featherless.apiKey == "" || w.featherless.model == "" {
		category, agency := "", ""
		if grace.PredictedCategoryLabel != nil {
			category = *grace.PredictedCategoryLabel
		}
		if grace.PredictedAgencyLabel != nil {
			agency = *grace.PredictedAgencyLabel
		}
		return w.finish(ctx, c, lease, category, agency, "grace", "Featherless model or API key is not configured", grace.Confidence, false)
	}
	categories, agencies, err := w.catalog(ctx)
	if err != nil {
		return err
	}
	if len(categories) == 0 || len(agencies) == 0 {
		return w.finish(ctx, c, lease, "", "", "", "Routing catalog is empty", nil, false)
	}
	var photo []byte
	mime := ""
	if c.photoKey != nil {
		if w.photos == nil {
			return errors.New("photo storage unavailable")
		}
		photo, err = w.photos.get(ctx, *c.photoKey)
		if err != nil {
			return err
		}
		if c.photoMime == nil {
			return errors.New("photo type missing")
		}
		mime = *c.photoMime
	}
	fallback, err := w.featherless.predict(ctx, c.description, photo, mime, grace, categories, agencies)
	if err != nil {
		return err
	}
	category, agency := strings.TrimSpace(fallback.Category), strings.TrimSpace(fallback.Agency)
	if category == "" || agency == "" || fallback.Confidence == nil || *fallback.Confidence < 0.65 {
		return w.finish(ctx, c, lease, category, agency, "featherless", "Featherless suggestion needs review", fallback.Confidence, false)
	}
	return w.finish(ctx, c, lease, category, agency, "featherless", "", fallback.Confidence, true)
}

func (w *workflow) recover(ctx context.Context) error {
	_, err := w.db.Exec(ctx, `UPDATE laksaComplaints SET status=CASE WHEN attempts >= $1 THEN 'awaitingOperator' ELSE 'pending' END,operatorStartedAt=CASE WHEN attempts >= $1 THEN now() ELSE NULL END,reviewReason=CASE WHEN attempts >= $1 THEN 'Processing lease expired' ELSE reviewReason END,leaseId=NULL,leaseUntil=NULL,updatedAt=now() WHERE status='processing' AND leaseUntil<now()`, maxAttempts)
	if err != nil {
		return err
	}
	rows, err := w.db.Query(ctx, "SELECT id::text FROM laksaComplaints WHERE status='pending' AND nextAttemptAt<=now() ORDER BY priorityScore DESC, updatedAt ASC LIMIT 100")
	if err != nil {
		return err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	for _, id := range ids {
		if err = w.enqueue(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

func (w *workflow) runWorker(ctx context.Context, logger *slog.Logger) {
	nextRecovery := time.Time{}
	for ctx.Err() == nil {
		if time.Now().After(nextRecovery) {
			if err := w.recover(ctx); err != nil {
				logger.Error("workflow recovery failed", "error", err)
			}
			nextRecovery = time.Now().Add(15 * time.Second)
		}
		items, err := w.redis.BRPop(ctx, 5*time.Second, queueKey).Result()
		if err != nil {
			if !errors.Is(err, redis.Nil) && ctx.Err() == nil {
				logger.Error("queue read failed", "error", err)
				time.Sleep(time.Second)
			}
			continue
		}
		if len(items) != 2 {
			continue
		}
		id := items[1]
		_ = w.redis.Del(ctx, "laksa:queued:"+id).Err()
		if _, err = uuid.Parse(id); err != nil {
			continue
		}
		lease := uuid.NewString()
		c, err := w.claim(ctx, id, lease)
		if err != nil {
			logger.Error("claim failed", "error", err)
			continue
		}
		if c == nil {
			continue
		}
		jobCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
		err = w.process(jobCtx, c, lease)
		cancel()
		if err != nil {
			logger.Warn("complaint processing failed", "complaintId", id, "error", fmt.Sprintf("%T", err))
			retryCtx, retryCancel := context.WithTimeout(ctx, 10*time.Second)
			if retryErr := w.retry(retryCtx, c, lease, "Automated processing failed"); retryErr != nil {
				logger.Error("retry scheduling failed", "error", retryErr)
			}
			retryCancel()
		}
	}
}
