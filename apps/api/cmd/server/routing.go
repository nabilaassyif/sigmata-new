package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type catalogInput struct {
	Categories []string `json:"categories"`
	Agencies   []string `json:"agencies"`
}

func (w *workflow) updateCatalog(rw http.ResponseWriter, r *http.Request) {
	var input catalogInput
	decoder := json.NewDecoder(http.MaxBytesReader(rw, r.Body, 131072))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		http.Error(rw, "invalid catalog", 400)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF || len(input.Categories) > 500 || len(input.Agencies) > 500 {
		http.Error(rw, "invalid catalog", 400)
		return
	}
	for _, list := range [][]string{input.Categories, input.Agencies} {
		for _, value := range list {
			if value != strings.TrimSpace(value) || len(value) == 0 || len(value) > 300 {
				http.Error(rw, "invalid catalog", 400)
				return
			}
		}
	}
	tx, err := w.db.Begin(r.Context())
	if err != nil {
		http.Error(rw, "service unavailable", 503)
		return
	}
	defer tx.Rollback(r.Context())
	for _, name := range input.Categories {
		if _, err = tx.Exec(r.Context(), "INSERT INTO laksaCategories(label) VALUES($1) ON CONFLICT(label) DO NOTHING", name); err != nil {
			http.Error(rw, "service unavailable", 503)
			return
		}
	}
	for _, name := range input.Agencies {
		if _, err = tx.Exec(r.Context(), "INSERT INTO laksaAgencies(label) VALUES($1) ON CONFLICT(label) DO NOTHING", name); err != nil {
			http.Error(rw, "service unavailable", 503)
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(rw, "service unavailable", 503)
		return
	}
	writeJSON(rw, 200, map[string]any{"status": "ok"})
}

func (w *workflow) getCatalog(rw http.ResponseWriter, r *http.Request) {
	categories, agencies, err := w.catalog(r.Context())
	if err != nil {
		http.Error(rw, "service unavailable", 503)
		return
	}
	writeJSON(rw, 200, map[string]any{"categories": categories, "agencies": agencies})
}

func (w *workflow) decideComplaint(rw http.ResponseWriter, r *http.Request) {
	var input struct {
		Category string `json:"category"`
		Agency   string `json:"agency"`
	}
	if _, err := uuid.Parse(r.PathValue("id")); err != nil {
		http.NotFound(rw, r)
		return
	}
	decoder := json.NewDecoder(http.MaxBytesReader(rw, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		http.Error(rw, "invalid decision", 400)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF || input.Category == "" || input.Agency == "" {
		http.Error(rw, "invalid decision", 400)
		return
	}
	identity := r.Context().Value(identityKey{}).(*identity)
	tx, err := w.db.Begin(r.Context())
	if err != nil {
		http.Error(rw, "service unavailable", 503)
		return
	}
	defer tx.Rollback(r.Context())
	var agencyId string
	err = tx.QueryRow(r.Context(), `SELECT a.id::text FROM laksaAgencies a JOIN laksaCategories c ON c.label=$2 AND c.enabled WHERE a.label=$1 AND a.enabled FOR SHARE OF a,c`, input.Agency, input.Category).Scan(&agencyId)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(rw, "unknown category or agency", 400)
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", 503)
		return
	}
	var id string
	err = tx.QueryRow(r.Context(), `UPDATE laksaComplaints SET status='forwarded',categoryLabel=$2,agencyId=$3,forwardedAt=now(),updatedAt=now() WHERE id=$1 AND status='awaitingOperator' RETURNING id::text`, r.PathValue("id"), input.Category, agencyId).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(rw, "complaint is not awaiting review", 409)
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", 503)
		return
	}
	if _, err = tx.Exec(r.Context(), "INSERT INTO laksaComplaintEvents(complaintId,eventType,actor) VALUES($1,'operatorForwarded',$2)", id, identity.Subject); err != nil {
		http.Error(rw, "service unavailable", 503)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(rw, "service unavailable", 503)
		return
	}
	var slaSummary *complaintSLASummary
	if w.sla != nil {
		slaSummary, _ = w.sla.onDistributedToLiaison(r.Context(), id, "", &agencyId, &input.Agency, time.Now().UTC(), identity.Subject, "operator:"+id)
		if slaSummary != nil && len(slaSummary.ActiveClocks) > 0 {
			earliest := slaSummary.ActiveClocks[0].DueAt
			for _, clk := range slaSummary.ActiveClocks[1:] {
				if clk.DueAt.Before(earliest) {
					earliest = clk.DueAt
				}
			}
			_, _ = w.db.Exec(r.Context(), `UPDATE laksaComplaints SET slaDueAt=$2 WHERE id=$1`, id, earliest)
		}
	}
	writeJSON(rw, 200, map[string]any{"complaintId": id, "status": "forwarded", "slaSummary": slaSummary})
}
