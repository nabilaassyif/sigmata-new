package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type workflow struct {
	db             *pgxpool.Pool
	redis          *redis.Client
	photos         *photoStore
	inference      *inferenceClient
	featherless    *featherlessClient
	municipalityId string
}

type complaintInput struct {
	Description string   `json:"description"`
	Latitude    *float64 `json:"latitude"`
	Longitude   *float64 `json:"longitude"`
}

func readComplaint(r *http.Request) (complaintInput, []byte, string, error) {
	var input complaintInput
	var photo []byte
	var mime string
	r.Body = http.MaxBytesReader(nil, r.Body, maxPhotoBytes+(1<<20))
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data;") {
		if err := r.ParseMultipartForm(maxPhotoBytes + 1<<16); err != nil {
			return input, nil, "", err
		}
		defer r.MultipartForm.RemoveAll()
		if err := json.Unmarshal([]byte(r.FormValue("complaint")), &input); err != nil {
			return input, nil, "", err
		}
		file, _, err := r.FormFile("photo")
		if err == nil {
			defer file.Close()
			photo, err = io.ReadAll(io.LimitReader(file, maxPhotoBytes+1))
			if err != nil || len(photo) > maxPhotoBytes || len(photo) == 0 {
				return input, nil, "", errors.New("invalid photo size")
			}
			mime = http.DetectContentType(photo)
			if mime != "image/jpeg" && mime != "image/png" {
				return input, nil, "", errors.New("photo must be JPEG or PNG")
			}
			cfg, format, err := image.DecodeConfig(bytes.NewReader(photo))
			if err != nil || cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > 20000000 || (format != "jpeg" && format != "png") {
				return input, nil, "", errors.New("invalid photo")
			}
		} else if !errors.Is(err, http.ErrMissingFile) {
			return input, nil, "", err
		}
	} else {
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			return input, nil, "", err
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			return input, nil, "", errors.New("invalid JSON")
		}
	}
	input.Description = strings.TrimSpace(input.Description)
	if len([]rune(input.Description)) < 1 || len([]rune(input.Description)) > 10000 {
		return input, nil, "", errors.New("invalid description")
	}
	if (input.Latitude == nil) != (input.Longitude == nil) {
		return input, nil, "", errors.New("both coordinates are required")
	}
	if input.Latitude != nil && (math.IsNaN(*input.Latitude) || math.IsNaN(*input.Longitude) || *input.Latitude < -90 || *input.Latitude > 90 || *input.Longitude < -180 || *input.Longitude > 180) {
		return input, nil, "", errors.New("invalid coordinates")
	}
	return input, photo, mime, nil
}

func requestHash(input complaintInput, photo []byte) string {
	data, _ := json.Marshal(input)
	hash := sha256.New()
	hash.Write(data)
	hash.Write(photo)
	return hex.EncodeToString(hash.Sum(nil))
}

func (w *workflow) createComplaint(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" || r.PathValue("app") != "citizen" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(key) < 8 || len(key) > 128 {
		http.Error(rw, "invalid idempotency key", http.StatusBadRequest)
		return
	}
	input, photo, mime, err := readComplaint(r)
	if err != nil {
		http.Error(rw, "invalid complaint", http.StatusBadRequest)
		return
	}
	hash := requestHash(input, photo)
	var previousId, previousHash string
	err = w.db.QueryRow(r.Context(), "SELECT id::text, requestHash FROM laksaComplaints WHERE citizenSubject=$1 AND idempotencyKey=$2", id.Subject, key).Scan(&previousId, &previousHash)
	if err == nil {
		if hash != previousHash {
			http.Error(rw, "idempotency key reused with different complaint", http.StatusConflict)
			return
		}
		writeJSON(rw, http.StatusOK, map[string]any{"complaintId": previousId, "replayed": true})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	complaintId := uuid.NewString()
	var photoKey *string
	var photoMime *string
	if len(photo) > 0 {
		if w.photos == nil {
			http.Error(rw, "photo storage unavailable", http.StatusServiceUnavailable)
			return
		}
		value := "complaints/" + complaintId
		if err := w.photos.put(r.Context(), value, photo, mime); err != nil {
			http.Error(rw, "photo storage unavailable", http.StatusServiceUnavailable)
			return
		}
		photoKey, photoMime = &value, &mime
	}
	committed := false
	defer func() {
		if !committed && photoKey != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = w.photos.remove(ctx, *photoKey)
		}
	}()
	tx, err := w.db.Begin(r.Context())
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer tx.Rollback(r.Context())
	var inserted string
	err = tx.QueryRow(r.Context(), `INSERT INTO laksaComplaints(id,citizenSubject,idempotencyKey,requestHash,municipalityId,description,latitude,longitude,photoKey,photoMime) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(citizenSubject,idempotencyKey) DO NOTHING RETURNING id::text`, complaintId, id.Subject, key, hash, w.municipalityId, input.Description, input.Latitude, input.Longitude, photoKey, photoMime).Scan(&inserted)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(r.Context(), "SELECT id::text, requestHash FROM laksaComplaints WHERE citizenSubject=$1 AND idempotencyKey=$2", id.Subject, key).Scan(&previousId, &previousHash)
		if err != nil {
			http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
			return
		}
		if hash != previousHash {
			http.Error(rw, "idempotency key reused with different complaint", http.StatusConflict)
			return
		}
		writeJSON(rw, http.StatusOK, map[string]any{"complaintId": previousId, "replayed": true})
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	if _, err = tx.Exec(r.Context(), "INSERT INTO laksaComplaintEvents(complaintId,eventType,actor) VALUES($1,'submitted',$2)", inserted, id.Subject); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	committed = true
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	_ = w.enqueue(r.Context(), inserted)
	writeJSON(rw, http.StatusAccepted, map[string]any{"complaintId": inserted, "status": "pending", "replayed": false})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func authorizedComplaint(r *http.Request) (string, bool) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok {
		return "", false
	}
	if r.PathValue("app") == "citizen" && id.AuthorizedParty == "citizenWeb" {
		return id.Subject, true
	}
	if r.PathValue("app") == "internal" && id.AuthorizedParty == "internalWeb" {
		for _, role := range id.RealmAccess.Roles {
			if role == "operator" || role == "admin" {
				return "", true
			}
		}
	}
	return "", false
}

func (w *workflow) getComplaint(rw http.ResponseWriter, r *http.Request) {
	owner, ok := authorizedComplaint(r)
	if !ok {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	if _, err := uuid.Parse(r.PathValue("id")); err != nil {
		http.NotFound(rw, r)
		return
	}
	var id, status, description string
	var hasPhoto bool
	var category, agency, suggestedCategory, suggestedAgency, reason *string
	var created, updated time.Time
	var operatorStarted, forwarded *time.Time
	err := w.db.QueryRow(r.Context(), `SELECT c.id::text,c.status,c.description,c.categoryLabel,a.label,c.suggestedCategory,c.suggestedAgency,c.reviewReason,c.createdAt,c.updatedAt,c.operatorStartedAt,c.forwardedAt,c.photoKey IS NOT NULL FROM laksaComplaints c LEFT JOIN laksaAgencies a ON a.id=c.agencyId WHERE c.id=$1 AND ($2='' OR c.citizenSubject=$2)`, r.PathValue("id"), owner).Scan(&id, &status, &description, &category, &agency, &suggestedCategory, &suggestedAgency, &reason, &created, &updated, &operatorStarted, &forwarded, &hasPhoto)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(rw, r)
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(rw, http.StatusOK, map[string]any{"complaintId": id, "status": status, "description": description, "category": category, "agency": agency, "suggestedCategory": suggestedCategory, "suggestedAgency": suggestedAgency, "reviewReason": reason, "createdAt": created, "updatedAt": updated, "operatorStartedAt": operatorStarted, "forwardedAt": forwarded, "hasPhoto": hasPhoto})
}

func (w *workflow) getPhoto(rw http.ResponseWriter, r *http.Request) {
	owner, ok := authorizedComplaint(r)
	if !ok {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	if w.photos == nil {
		http.Error(rw, "photo storage unavailable", http.StatusServiceUnavailable)
		return
	}
	if _, err := uuid.Parse(r.PathValue("id")); err != nil {
		http.NotFound(rw, r)
		return
	}
	var key, mime *string
	err := w.db.QueryRow(r.Context(), "SELECT photoKey,photoMime FROM laksaComplaints WHERE id=$1 AND ($2='' OR citizenSubject=$2)", r.PathValue("id"), owner).Scan(&key, &mime)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && key == nil) {
		http.NotFound(rw, r)
		return
	}
	if err != nil || mime == nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	data, err := w.photos.get(r.Context(), *key)
	if err != nil {
		http.Error(rw, "photo unavailable", http.StatusBadGateway)
		return
	}
	rw.Header().Set("Content-Type", *mime)
	rw.Header().Set("Cache-Control", "private, no-store")
	rw.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = rw.Write(data)
}

func (w *workflow) listPendingReview(rw http.ResponseWriter, r *http.Request) {
	rows, err := w.db.Query(r.Context(), "SELECT id::text FROM laksaComplaints WHERE status='awaitingOperator' ORDER BY operatorStartedAt LIMIT 100")
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	if rows.Err() != nil || err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(rw, http.StatusOK, map[string]any{"complaintIds": ids})
}
