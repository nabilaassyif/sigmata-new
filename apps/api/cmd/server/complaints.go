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

const (
	baseSLAHours                 = 72.0
	minSLAHours                  = 24.0
	maxCorroborationRadiusMeters = 5000.0
)

type workflow struct {
	db             *pgxpool.Pool
	redis          *redis.Client
	photos         *photoStore
	inference      *inferenceClient
	featherless    *featherlessClient
	sla            *slaEngine
	municipalityId string
}

type complaintInput struct {
	Description    string   `json:"description"`
	Latitude       *float64 `json:"latitude"`
	Longitude      *float64 `json:"longitude"`
	IsPublic       *bool    `json:"isPublic"`
	District       string   `json:"district"`
	City           string   `json:"city"`
	ComplaintType  string   `json:"complaintType"`
	MunicipalityID string   `json:"municipalityId"`
}

type corroborateInput struct {
	Note      string   `json:"note"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

func computePriorityScore(upvotes, corroborations int) float64 {
	if upvotes < 0 {
		upvotes = 0
	}
	if corroborations < 0 {
		corroborations = 0
	}
	return 1.0 + math.Log1p(float64(upvotes))*2.0 + float64(corroborations)*3.5
}

func computePriorityAndSLA(createdAt time.Time, upvotes, corroborations int) (float64, time.Time) {
	score := computePriorityScore(upvotes, corroborations)
	reductionHours := float64(corroborations*2) + float64(upvotes/5)
	slaHours := math.Max(minSLAHours, baseSLAHours-reductionHours)
	return score, createdAt.Add(time.Duration(slaHours * float64(time.Hour)))
}

func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusMeters = 6371000.0
	toRad := func(deg float64) float64 { return deg * math.Pi / 180.0 }
	dLat := toRad(lat2 - lat1)
	dLon := toRad(lon2 - lon1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusMeters * c
}

func validateCoordinates(lat, lng *float64) error {
	if (lat == nil) != (lng == nil) {
		return errors.New("both coordinates are required")
	}
	if lat != nil && (math.IsNaN(*lat) || math.IsNaN(*lng) || *lat < -90 || *lat > 90 || *lng < -180 || *lng > 180) {
		return errors.New("invalid coordinates")
	}
	return nil
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
	input.District = strings.TrimSpace(input.District)
	input.City = strings.TrimSpace(input.City)
	if len([]rune(input.District)) > 120 || len([]rune(input.City)) > 120 {
		return input, nil, "", errors.New("invalid location text")
	}
	if err := validateCoordinates(input.Latitude, input.Longitude); err != nil {
		return input, nil, "", err
	}
	if len(photo) == 0 {
		return input, nil, "", errors.New("photo documentation is required")
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
		msg := "invalid complaint"
		if err.Error() == "photo documentation is required" || err.Error() == "photo must be JPEG or PNG" || err.Error() == "invalid photo size" {
			msg = err.Error()
		}
		http.Error(rw, msg, http.StatusBadRequest)
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

	isPublic := true
	if input.IsPublic != nil {
		isPublic = *input.IsPublic
	}
	complaintType := strings.TrimSpace(input.ComplaintType)
	switch complaintType {
	case "", "non_oversight", "oversight", "upik_jss", "sp4n_lapor", "normative", "no_field_investigation", "field_investigation":
	default:
		http.Error(rw, "invalid complaintType", http.StatusBadRequest)
		return
	}
	if complaintType == "" {
		complaintType = "non_oversight"
	}
	munID := w.municipalityId
	if strings.TrimSpace(input.MunicipalityID) != "" {
		if _, err := uuid.Parse(input.MunicipalityID); err != nil {
			http.Error(rw, "invalid municipalityId", http.StatusBadRequest)
			return
		}
		munID = strings.TrimSpace(input.MunicipalityID)
	}
	now := time.Now().UTC()
	priorityScore := computePriorityScore(1, 0)
	slaDueAt := now.Add(baseSLAHours * time.Hour)

	var inserted string
	err = tx.QueryRow(r.Context(), `INSERT INTO laksaComplaints(id,citizenSubject,idempotencyKey,requestHash,municipalityId,description,latitude,longitude,incident_location,photoKey,photoMime,isPublic,district,city,complaint_type,upvoteCount,corroborationCount,priorityScore,slaDueAt,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7::double precision IS NOT NULL AND $8::double precision IS NOT NULL THEN ST_SetSRID(ST_MakePoint($8,$7),4326)::geography ELSE NULL END,$9,$10,$11,$12,$13,$14,1,0,$15,$16,$17,$17) ON CONFLICT(citizenSubject,idempotencyKey) DO NOTHING RETURNING id::text`, complaintId, id.Subject, key, hash, munID, input.Description, input.Latitude, input.Longitude, photoKey, photoMime, isPublic, input.District, input.City, complaintType, priorityScore, slaDueAt, now).Scan(&inserted)
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
	if _, err = tx.Exec(r.Context(), "INSERT INTO laksaComplaintUpvotes(complaintId,citizenSubject) VALUES($1,$2) ON CONFLICT DO NOTHING", inserted, id.Subject); err != nil {
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
	var slaSummary *complaintSLASummary
	if w.sla != nil {
		slaSummary, _ = w.sla.onComplaintSubmitted(r.Context(), inserted, munID, complaintType, now, id.Subject, key)
		if slaSummary != nil && len(slaSummary.ActiveClocks) > 0 {
			earliest := slaSummary.ActiveClocks[0].DueAt
			for _, clk := range slaSummary.ActiveClocks[1:] {
				if clk.DueAt.Before(earliest) {
					earliest = clk.DueAt
				}
			}
			slaDueAt = earliest
			_, _ = w.db.Exec(r.Context(), `UPDATE laksaComplaints SET slaDueAt=$2 WHERE id=$1`, inserted, slaDueAt)
		}
	}
	_ = w.enqueue(r.Context(), inserted)
	writeJSON(rw, http.StatusAccepted, map[string]any{
		"complaintId":        inserted,
		"status":             "pending",
		"replayed":           false,
		"slaDueAt":           slaDueAt,
		"slaSummary":         slaSummary,
		"upvoteCount":        1,
		"corroborationCount": 0,
		"priorityScore":      priorityScore,
	})
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

func (w *workflow) loadComplaintEvents(ctx context.Context, complaintId string) ([]map[string]any, error) {
	rows, err := w.db.Query(ctx, `SELECT eventType, actor, details, createdAt FROM laksaComplaintEvents WHERE complaintId=$1 ORDER BY createdAt ASC, id ASC`, complaintId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []map[string]any{}
	for rows.Next() {
		var eventType, actor string
		var details map[string]any
		var created time.Time
		if err := rows.Scan(&eventType, &actor, &details, &created); err != nil {
			return nil, err
		}
		events = append(events, map[string]any{
			"eventType": eventType,
			"actor":     actor,
			"details":   details,
			"createdAt": created,
		})
	}
	return events, rows.Err()
}

func (w *workflow) loadComplaintCorroborations(ctx context.Context, complaintId string) ([]map[string]any, error) {
	rows, err := w.db.Query(ctx, `SELECT note, distanceMeters, createdAt FROM laksaComplaintCorroborations WHERE complaintId=$1 ORDER BY createdAt DESC LIMIT 25`, complaintId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var note string
		var dist *float64
		var created time.Time
		if err := rows.Scan(&note, &dist, &created); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{
			"note":           note,
			"distanceMeters": dist,
			"createdAt":      created,
		})
	}
	return items, rows.Err()
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
	var id, status, description, district, city string
	var hasPhoto, isPublic, viewerUpvoted, viewerCorroborated bool
	var category, agency, suggestedCategory, suggestedAgency, reason *string
	var created, updated, slaDueAt time.Time
	var operatorStarted, forwarded *time.Time
	var upvotes, corroborations int
	var priorityScore float64
	err := w.db.QueryRow(r.Context(), `
		SELECT c.id::text, c.status, c.description, c.categoryLabel, a.label,
		       c.suggestedCategory, c.suggestedAgency, c.reviewReason,
		       c.createdAt, c.updatedAt, c.operatorStartedAt, c.forwardedAt,
		       c.photoKey IS NOT NULL, c.isPublic, c.district, c.city,
		       c.upvoteCount, c.corroborationCount, c.priorityScore, c.slaDueAt,
		       EXISTS(SELECT 1 FROM laksaComplaintUpvotes u WHERE u.complaintId=c.id AND u.citizenSubject=$2),
		       EXISTS(SELECT 1 FROM laksaComplaintCorroborations cr WHERE cr.complaintId=c.id AND cr.citizenSubject=$2)
		FROM laksaComplaints c
		LEFT JOIN laksaAgencies a ON a.id=c.agencyId
		WHERE c.id=$1 AND ($2='' OR c.citizenSubject=$2 OR c.isPublic=true)`, r.PathValue("id"), owner).Scan(
		&id, &status, &description, &category, &agency,
		&suggestedCategory, &suggestedAgency, &reason,
		&created, &updated, &operatorStarted, &forwarded,
		&hasPhoto, &isPublic, &district, &city,
		&upvotes, &corroborations, &priorityScore, &slaDueAt,
		&viewerUpvoted, &viewerCorroborated,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(rw, r)
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	events, err := w.loadComplaintEvents(r.Context(), id)
	if err != nil {
		events = []map[string]any{}
	}
	corroborationList, err := w.loadComplaintCorroborations(r.Context(), id)
	if err != nil {
		corroborationList = []map[string]any{}
	}
	var slaSummary *complaintSLASummary
	if w.sla != nil {
		slaSummary, _ = w.sla.getComplaintSLA(r.Context(), id)
	}
	writeJSON(rw, http.StatusOK, map[string]any{
		"complaintId":        id,
		"status":             status,
		"description":        description,
		"category":           category,
		"agency":             agency,
		"suggestedCategory":  suggestedCategory,
		"suggestedAgency":    suggestedAgency,
		"reviewReason":       reason,
		"createdAt":          created,
		"updatedAt":          updated,
		"operatorStartedAt":  operatorStarted,
		"forwardedAt":        forwarded,
		"hasPhoto":           hasPhoto,
		"isPublic":           isPublic,
		"district":           district,
		"city":               city,
		"upvoteCount":        upvotes,
		"corroborationCount": corroborations,
		"priorityScore":      priorityScore,
		"slaDueAt":           slaDueAt,
		"slaSummary":         slaSummary,
		"viewerUpvoted":      viewerUpvoted,
		"viewerCorroborated": viewerCorroborated,
		"events":             events,
		"corroborations":     corroborationList,
	})
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
	err := w.db.QueryRow(r.Context(), "SELECT photoKey,photoMime FROM laksaComplaints WHERE id=$1 AND ($2='' OR citizenSubject=$2 OR isPublic=true)", r.PathValue("id"), owner).Scan(&key, &mime)
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
	rows, err := w.db.Query(r.Context(), "SELECT id::text, priorityScore, upvoteCount, corroborationCount, slaDueAt FROM laksaComplaints WHERE status='awaitingOperator' ORDER BY priorityScore DESC, slaDueAt ASC, operatorStartedAt ASC LIMIT 100")
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer rows.Close()
	ids := []string{}
	items := []map[string]any{}
	for rows.Next() {
		var id string
		var priorityScore float64
		var upvotes, corroborations int
		var slaDueAt time.Time
		if err = rows.Scan(&id, &priorityScore, &upvotes, &corroborations, &slaDueAt); err != nil {
			break
		}
		ids = append(ids, id)
		items = append(items, map[string]any{
			"complaintId":        id,
			"priorityScore":      priorityScore,
			"upvoteCount":        upvotes,
			"corroborationCount": corroborations,
			"slaDueAt":           slaDueAt,
		})
	}
	if rows.Err() != nil || err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(rw, http.StatusOK, map[string]any{"complaintIds": ids, "complaints": items})
}

func (w *workflow) scanComplaintList(ctx context.Context, rows pgx.Rows, includeDetails bool) ([]map[string]any, error) {
	items := []map[string]any{}
	for rows.Next() {
		var cid, status, description, district, city string
		var hasPhoto, isPublic, viewerUpvoted, viewerCorroborated bool
		var category, agency, suggestedCategory, suggestedAgency, reason *string
		var created, updated, slaDueAt time.Time
		var operatorStarted, forwarded *time.Time
		var upvotes, corroborations int
		var priorityScore float64
		if err := rows.Scan(
			&cid, &status, &description, &category, &agency,
			&suggestedCategory, &suggestedAgency, &reason,
			&created, &updated, &operatorStarted, &forwarded,
			&hasPhoto, &isPublic, &district, &city,
			&upvotes, &corroborations, &priorityScore, &slaDueAt,
			&viewerUpvoted, &viewerCorroborated,
		); err != nil {
			return nil, err
		}
		item := map[string]any{
			"complaintId":        cid,
			"status":             status,
			"description":        description,
			"category":           category,
			"agency":             agency,
			"suggestedCategory":  suggestedCategory,
			"suggestedAgency":    suggestedAgency,
			"reviewReason":       reason,
			"createdAt":          created,
			"updatedAt":          updated,
			"operatorStartedAt":  operatorStarted,
			"forwardedAt":        forwarded,
			"hasPhoto":           hasPhoto,
			"isPublic":           isPublic,
			"district":           district,
			"city":               city,
			"upvoteCount":        upvotes,
			"corroborationCount": corroborations,
			"priorityScore":      priorityScore,
			"slaDueAt":           slaDueAt,
			"viewerUpvoted":      viewerUpvoted,
			"viewerCorroborated": viewerCorroborated,
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if includeDetails {
		for _, item := range items {
			cid := item["complaintId"].(string)
			events, err := w.loadComplaintEvents(ctx, cid)
			if err == nil {
				item["events"] = events
			} else {
				item["events"] = []map[string]any{}
			}
			corrs, err := w.loadComplaintCorroborations(ctx, cid)
			if err == nil {
				item["corroborations"] = corrs
			} else {
				item["corroborations"] = []map[string]any{}
			}
			if w.sla != nil {
				if slaSummary, err := w.sla.getComplaintSLA(ctx, cid); err == nil {
					item["slaSummary"] = slaSummary
				}
			}
		}
	}
	return items, nil
}

func (w *workflow) listMyComplaints(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" || r.PathValue("app") != "citizen" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	rows, err := w.db.Query(r.Context(), `
		SELECT c.id::text, c.status, c.description, c.categoryLabel, a.label,
		       c.suggestedCategory, c.suggestedAgency, c.reviewReason,
		       c.createdAt, c.updatedAt, c.operatorStartedAt, c.forwardedAt,
		       c.photoKey IS NOT NULL, c.isPublic, c.district, c.city,
		       c.upvoteCount, c.corroborationCount, c.priorityScore, c.slaDueAt,
		       EXISTS(SELECT 1 FROM laksaComplaintUpvotes u WHERE u.complaintId=c.id AND u.citizenSubject=$1),
		       EXISTS(SELECT 1 FROM laksaComplaintCorroborations cr WHERE cr.complaintId=c.id AND cr.citizenSubject=$1)
		FROM laksaComplaints c
		LEFT JOIN laksaAgencies a ON a.id=c.agencyId
		WHERE c.citizenSubject=$1
		ORDER BY c.createdAt DESC
		LIMIT 100`, id.Subject)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer rows.Close()
	items, err := w.scanComplaintList(r.Context(), rows, true)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(rw, http.StatusOK, map[string]any{"complaints": items})
}

func (w *workflow) listPublicFeed(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" || r.PathValue("app") != "citizen" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	orderBy := "c.createdAt DESC"
	switch r.URL.Query().Get("sort") {
	case "terpopuler", "prioritas":
		orderBy = "c.priorityScore DESC, c.upvoteCount DESC, c.createdAt DESC"
	case "terlama":
		orderBy = "c.createdAt ASC"
	}
	rows, err := w.db.Query(r.Context(), `
		SELECT c.id::text, c.status, c.description, c.categoryLabel, a.label,
		       c.suggestedCategory, c.suggestedAgency, c.reviewReason,
		       c.createdAt, c.updatedAt, c.operatorStartedAt, c.forwardedAt,
		       c.photoKey IS NOT NULL, c.isPublic, c.district, c.city,
		       c.upvoteCount, c.corroborationCount, c.priorityScore, c.slaDueAt,
		       EXISTS(SELECT 1 FROM laksaComplaintUpvotes u WHERE u.complaintId=c.id AND u.citizenSubject=$1),
		       EXISTS(SELECT 1 FROM laksaComplaintCorroborations cr WHERE cr.complaintId=c.id AND cr.citizenSubject=$1)
		FROM laksaComplaints c
		LEFT JOIN laksaAgencies a ON a.id=c.agencyId
		WHERE c.isPublic=true
		ORDER BY `+orderBy+`
		LIMIT 100`, id.Subject)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer rows.Close()
	items, err := w.scanComplaintList(r.Context(), rows, true)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(rw, http.StatusOK, map[string]any{"complaints": items})
}

func (w *workflow) toggleUpvote(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" || r.PathValue("app") != "citizen" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	cid := r.PathValue("id")
	if _, err := uuid.Parse(cid); err != nil {
		http.NotFound(rw, r)
		return
	}
	tx, err := w.db.Begin(r.Context())
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer tx.Rollback(r.Context())

	var isPublic bool
	var ownerSubject string
	var corroborations int
	err = tx.QueryRow(r.Context(), `SELECT isPublic, citizenSubject, corroborationCount FROM laksaComplaints WHERE id=$1 FOR UPDATE`, cid).Scan(&isPublic, &ownerSubject, &corroborations)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !isPublic && ownerSubject != id.Subject) {
		http.NotFound(rw, r)
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	var deletedId string
	err = tx.QueryRow(r.Context(), `DELETE FROM laksaComplaintUpvotes WHERE complaintId=$1 AND citizenSubject=$2 RETURNING complaintId::text`, cid, id.Subject).Scan(&deletedId)
	upvoted := false
	if errors.Is(err, pgx.ErrNoRows) {
		if _, err = tx.Exec(r.Context(), `INSERT INTO laksaComplaintUpvotes(complaintId, citizenSubject) VALUES($1,$2)`, cid, id.Subject); err != nil {
			http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
			return
		}
		upvoted = true
	} else if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	var upvotes int
	if err = tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM laksaComplaintUpvotes WHERE complaintId=$1`, cid).Scan(&upvotes); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	priorityScore := computePriorityScore(upvotes, corroborations)
	if _, err = tx.Exec(r.Context(), `UPDATE laksaComplaints SET upvoteCount=$2, priorityScore=$3, updatedAt=now() WHERE id=$1`, cid, upvotes, priorityScore); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	var slaDueAt time.Time
	_ = w.db.QueryRow(r.Context(), `SELECT slaDueAt FROM laksaComplaints WHERE id=$1`, cid).Scan(&slaDueAt)
	writeJSON(rw, http.StatusOK, map[string]any{
		"complaintId":        cid,
		"upvoted":            upvoted,
		"upvoteCount":        upvotes,
		"corroborationCount": corroborations,
		"priorityScore":      priorityScore,
		"slaDueAt":           slaDueAt,
	})
}

func (w *workflow) corroborateComplaint(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" || r.PathValue("app") != "citizen" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	cid := r.PathValue("id")
	if _, err := uuid.Parse(cid); err != nil {
		http.NotFound(rw, r)
		return
	}
	var input corroborateInput
	decoder := json.NewDecoder(http.MaxBytesReader(rw, r.Body, 8192))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		http.Error(rw, "invalid corroboration", http.StatusBadRequest)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		http.Error(rw, "invalid corroboration", http.StatusBadRequest)
		return
	}
	input.Note = strings.TrimSpace(input.Note)
	if len([]rune(input.Note)) > 1000 {
		http.Error(rw, "corroboration note too long", http.StatusBadRequest)
		return
	}
	if err := validateCoordinates(input.Latitude, input.Longitude); err != nil {
		http.Error(rw, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := w.db.Begin(r.Context())
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer tx.Rollback(r.Context())

	var isPublic bool
	var ownerSubject string
	var upvotes int
	var compLat, compLng *float64
	err = tx.QueryRow(r.Context(), `SELECT isPublic, citizenSubject, upvoteCount, latitude, longitude FROM laksaComplaints WHERE id=$1 FOR UPDATE`, cid).Scan(&isPublic, &ownerSubject, &upvotes, &compLat, &compLng)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !isPublic && ownerSubject != id.Subject) {
		http.NotFound(rw, r)
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	var distanceMeters *float64
	if compLat != nil && compLng != nil && input.Latitude != nil && input.Longitude != nil {
		dist := haversineMeters(*compLat, *compLng, *input.Latitude, *input.Longitude)
		if dist > maxCorroborationRadiusMeters {
			http.Error(rw, "outside neighborhood corroboration radius", http.StatusBadRequest)
			return
		}
		distanceMeters = &dist
	}

	if _, err = tx.Exec(r.Context(), `
		INSERT INTO laksaComplaintCorroborations(complaintId, citizenSubject, note, latitude, longitude, distanceMeters)
		VALUES($1,$2,$3,$4,$5,$6)
		ON CONFLICT(complaintId, citizenSubject) DO UPDATE SET
			note=EXCLUDED.note,
			latitude=EXCLUDED.latitude,
			longitude=EXCLUDED.longitude,
			distanceMeters=EXCLUDED.distanceMeters`,
		cid, id.Subject, input.Note, input.Latitude, input.Longitude, distanceMeters); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	var corroborations int
	if err = tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM laksaComplaintCorroborations WHERE complaintId=$1`, cid).Scan(&corroborations); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	priorityScore := computePriorityScore(upvotes, corroborations)
	if _, err = tx.Exec(r.Context(), `UPDATE laksaComplaints SET corroborationCount=$2, priorityScore=$3, updatedAt=now() WHERE id=$1`, cid, corroborations, priorityScore); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO laksaComplaintEvents(complaintId,eventType,actor,details) VALUES($1,'corroborated',$2,jsonb_build_object('note',$3::text,'distanceMeters',$4::double precision))`, cid, id.Subject, input.Note, distanceMeters); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	var slaDueAt time.Time
	_ = w.db.QueryRow(r.Context(), `SELECT slaDueAt FROM laksaComplaints WHERE id=$1`, cid).Scan(&slaDueAt)
	writeJSON(rw, http.StatusOK, map[string]any{
		"complaintId":        cid,
		"corroborated":       true,
		"upvoteCount":        upvotes,
		"corroborationCount": corroborations,
		"priorityScore":      priorityScore,
		"slaDueAt":           slaDueAt,
		"distanceMeters":     distanceMeters,
	})
}
