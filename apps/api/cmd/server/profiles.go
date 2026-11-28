package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/minio/minio-go/v7"
)

type notificationPreferences struct {
	InApp               bool `json:"inApp"`
	Email               bool `json:"email"`
	Push                bool `json:"push"`
	SLAAlerts           bool `json:"slaAlerts"`
	StatusUpdates       bool `json:"statusUpdates"`
	CorroborationAlerts bool `json:"corroborationAlerts"`
}

func defaultNotificationPreferences() notificationPreferences {
	return notificationPreferences{
		InApp:               true,
		Email:               true,
		Push:                false,
		SLAAlerts:           true,
		StatusUpdates:       true,
		CorroborationAlerts: true,
	}
}

type citizenProfile struct {
	ID                      string                  `json:"id"`
	IdentitySubject         string                  `json:"identitySubject"`
	FullName                string                  `json:"fullName"`
	Email                   string                  `json:"email"`
	PhoneNumber             *string                 `json:"phoneNumber"`
	AvatarURL               *string                 `json:"avatarUrl"`
	MunicipalityCode        string                  `json:"municipalityCode"`
	DistrictCode            *string                 `json:"districtCode"`
	SubdistrictCode         *string                 `json:"subdistrictCode"`
	PreferredLanguage       string                  `json:"preferredLanguage"`
	NotificationPreferences notificationPreferences `json:"notificationPreferences"`
	AccountStatus           string                  `json:"accountStatus"`
	CreatedAt               time.Time               `json:"createdAt"`
	UpdatedAt               time.Time               `json:"updatedAt"`
}

type citizenProfileInput struct {
	FullName                string                   `json:"fullName"`
	Email                   string                   `json:"email"`
	PhoneNumber             *string                  `json:"phoneNumber"`
	AvatarURL               *string                  `json:"avatarUrl"`
	MunicipalityCode        string                   `json:"municipalityCode"`
	DistrictCode            *string                  `json:"districtCode"`
	SubdistrictCode         *string                  `json:"subdistrictCode"`
	PreferredLanguage       string                   `json:"preferredLanguage"`
	NotificationPreferences *notificationPreferences `json:"notificationPreferences"`
	AccountStatus           string                   `json:"accountStatus"`
}

type citizenComplaintStats struct {
	TotalSubmitted           int `json:"totalSubmitted"`
	PendingCount             int `json:"pendingCount"`
	AwaitingOperatorCount    int `json:"awaitingOperatorCount"`
	ForwardedCount           int `json:"forwardedCount"`
	ResolvedCount            int `json:"resolvedCount"`
	TotalUpvotesReceived     int `json:"totalUpvotesReceived"`
	TotalCorroborationsGiven int `json:"totalCorroborationsGiven"`
}

type governmentOperatorProfile struct {
	ID                  string    `json:"id"`
	IdentitySubject     string    `json:"identitySubject"`
	FullName            string    `json:"fullName"`
	Email               string    `json:"email"`
	EmployeeNumber      *string   `json:"employeeNumber"`
	AgencyID            string    `json:"agencyId"`
	AgencyLabel         *string   `json:"agencyLabel"`
	MunicipalityCode    string    `json:"municipalityCode"`
	DepartmentID        *string   `json:"departmentId"`
	DepartmentName      *string   `json:"departmentName"`
	Position            *string   `json:"position"`
	OfficialPhoneNumber *string   `json:"officialPhoneNumber"`
	AvatarURL           *string   `json:"avatarUrl"`
	AccountStatus       string    `json:"accountStatus"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type operatorProfileInput struct {
	FullName            string  `json:"fullName"`
	Email               string  `json:"email"`
	EmployeeNumber      *string `json:"employeeNumber"`
	AgencyID            string  `json:"agencyId"`
	MunicipalityCode    string  `json:"municipalityCode"`
	DepartmentID        *string `json:"departmentId"`
	Position            *string `json:"position"`
	OfficialPhoneNumber *string `json:"officialPhoneNumber"`
	AvatarURL           *string `json:"avatarUrl"`
	AccountStatus       string  `json:"accountStatus"`
}

type operatorComplaintStats struct {
	AwaitingReviewCount     int `json:"awaitingReviewCount"`
	AgencyAssignedCount     int `json:"agencyAssignedCount"`
	DecisionsMadeByOperator int `json:"decisionsMadeByOperator"`
	OverdueSLACount         int `json:"overdueSlaCount"`
}

var sourceOfTruthBoundaries = map[string]string{
	"credentials":               "Keycloak",
	"emailVerification":         "Keycloak",
	"authenticationRoles":       "Keycloak",
	"resourceAuthorization":     "Go",
	"citizenProfile":            "PostgreSQL",
	"governmentAffiliation":     "PostgreSQL",
	"complaintStatistics":       "Derived SQL queries",
	"notificationPreferences":   "PostgreSQL",
	"complaintIncidentLocation": "PostGIS",
}

func normalizeOptionalString(v *string, maxLen int) (*string, error) {
	if v == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return nil, nil
	}
	if len([]rune(trimmed)) > maxLen {
		return nil, errors.New("field exceeds maximum length")
	}
	return &trimmed, nil
}

func validateAvatarURL(v *string) (*string, error) {
	norm, err := normalizeOptionalString(v, 500)
	if err != nil || norm == nil {
		return norm, err
	}
	u, err := url.Parse(*norm)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http" && !strings.HasPrefix(*norm, "/")) {
		return nil, errors.New("invalid avatarUrl")
	}
	return norm, nil
}

func validateEmailAddress(inputEmail, claimEmail string) (string, error) {
	// Keycloak is source of truth for email when claim is populated.
	effective := strings.TrimSpace(claimEmail)
	if effective == "" {
		effective = strings.TrimSpace(inputEmail)
	}
	if effective == "" || len(effective) > 320 {
		return "", errors.New("email is required")
	}
	if _, err := mail.ParseAddress(effective); err != nil {
		return "", errors.New("invalid email")
	}
	return effective, nil
}

func validateCitizenProfileInput(in citizenProfileInput, id *identity) (citizenProfileInput, error) {
	in.FullName = strings.TrimSpace(in.FullName)
	if in.FullName == "" && id != nil {
		in.FullName = strings.TrimSpace(id.Name)
	}
	if len([]rune(in.FullName)) < 1 || len([]rune(in.FullName)) > 200 {
		return in, errors.New("fullName is required")
	}
	var claimEmail string
	if id != nil {
		claimEmail = id.Email
	}
	email, err := validateEmailAddress(in.Email, claimEmail)
	if err != nil {
		return in, err
	}
	in.Email = email
	in.MunicipalityCode = strings.TrimSpace(in.MunicipalityCode)
	if len(in.MunicipalityCode) < 1 || len(in.MunicipalityCode) > 64 {
		return in, errors.New("municipalityCode is required")
	}
	if in.PhoneNumber, err = normalizeOptionalString(in.PhoneNumber, 40); err != nil {
		return in, err
	}
	if in.AvatarURL, err = validateAvatarURL(in.AvatarURL); err != nil {
		return in, err
	}
	if in.DistrictCode, err = normalizeOptionalString(in.DistrictCode, 100); err != nil {
		return in, err
	}
	if in.SubdistrictCode, err = normalizeOptionalString(in.SubdistrictCode, 100); err != nil {
		return in, err
	}
	in.PreferredLanguage = strings.TrimSpace(in.PreferredLanguage)
	if in.PreferredLanguage == "" {
		in.PreferredLanguage = "id"
	}
	if in.PreferredLanguage != "id" && in.PreferredLanguage != "en" {
		return in, errors.New("preferredLanguage must be id or en")
	}
	if in.NotificationPreferences == nil {
		def := defaultNotificationPreferences()
		in.NotificationPreferences = &def
	}
	in.AccountStatus = strings.TrimSpace(in.AccountStatus)
	if in.AccountStatus == "" || in.AccountStatus == "pending_onboarding" {
		in.AccountStatus = "active"
	}
	if in.AccountStatus != "active" && in.AccountStatus != "deactivated" {
		return in, errors.New("invalid accountStatus")
	}
	return in, nil
}

func hasAnyRole(roles []string, targets ...string) bool {
	for _, r := range roles {
		for _, t := range targets {
			if r == t {
				return true
			}
		}
	}
	return false
}

func validateOperatorProfileInput(in operatorProfileInput, id *identity) (operatorProfileInput, error) {
	in.FullName = strings.TrimSpace(in.FullName)
	if in.FullName == "" && id != nil {
		in.FullName = strings.TrimSpace(id.Name)
	}
	if len([]rune(in.FullName)) < 1 || len([]rune(in.FullName)) > 200 {
		return in, errors.New("fullName is required")
	}
	var claimEmail string
	var roles []string
	if id != nil {
		claimEmail = id.Email
		roles = id.RealmAccess.Roles
	}
	email, err := validateEmailAddress(in.Email, claimEmail)
	if err != nil {
		return in, err
	}
	in.Email = email
	if in.EmployeeNumber, err = normalizeOptionalString(in.EmployeeNumber, 64); err != nil {
		return in, err
	}
	// Conditional requirement: NIP or internal identifier required for operator/opdStaff roles.
	if hasAnyRole(roles, "operator", "opdStaff") && in.EmployeeNumber == nil {
		return in, errors.New("employeeNumber (NIP or internal identifier) is required for operator and opdStaff roles")
	}
	in.AgencyID = strings.TrimSpace(in.AgencyID)
	if _, err := uuid.Parse(in.AgencyID); err != nil {
		return in, errors.New("valid agencyId is required")
	}
	in.MunicipalityCode = strings.TrimSpace(in.MunicipalityCode)
	if len(in.MunicipalityCode) < 1 || len(in.MunicipalityCode) > 64 {
		return in, errors.New("municipalityCode is required")
	}
	if in.DepartmentID, err = normalizeOptionalString(in.DepartmentID, 64); err != nil {
		return in, err
	}
	if in.DepartmentID != nil {
		if _, err := uuid.Parse(*in.DepartmentID); err != nil {
			return in, errors.New("invalid departmentId")
		}
	}
	if in.Position, err = normalizeOptionalString(in.Position, 120); err != nil {
		return in, err
	}
	if in.OfficialPhoneNumber, err = normalizeOptionalString(in.OfficialPhoneNumber, 40); err != nil {
		return in, err
	}
	if in.AvatarURL, err = validateAvatarURL(in.AvatarURL); err != nil {
		return in, err
	}
	in.AccountStatus = strings.TrimSpace(in.AccountStatus)
	if in.AccountStatus == "" || in.AccountStatus == "pending_onboarding" {
		in.AccountStatus = "active"
	}
	if in.AccountStatus != "active" && in.AccountStatus != "deactivated" {
		return in, errors.New("invalid accountStatus")
	}
	return in, nil
}

func identityBoundaryPayload(id *identity) map[string]any {
	return map[string]any{
		"subject":           id.Subject,
		"email":             id.Email,
		"emailVerified":     id.EmailVerified,
		"name":              id.Name,
		"preferredUsername": id.PreferredUsername,
		"roles":             id.RealmAccess.Roles,
	}
}

func (w *workflow) loadCitizenStatistics(r *http.Request, subject string) citizenComplaintStats {
	var stats citizenComplaintStats
	_ = w.db.QueryRow(r.Context(), `
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int,
			COUNT(*) FILTER (WHERE status = 'awaitingOperator')::int,
			COUNT(*) FILTER (WHERE status = 'forwarded')::int,
			COUNT(*) FILTER (WHERE resolution_state = 'substantively_resolved')::int,
			COALESCE(SUM(upvoteCount), 0)::int,
			(SELECT COUNT(*)::int FROM laksaComplaintCorroborations WHERE citizenSubject = $1)
		FROM laksaComplaints
		WHERE citizenSubject = $1`, subject).Scan(
		&stats.TotalSubmitted,
		&stats.PendingCount,
		&stats.AwaitingOperatorCount,
		&stats.ForwardedCount,
		&stats.ResolvedCount,
		&stats.TotalUpvotesReceived,
		&stats.TotalCorroborationsGiven,
	)
	return stats
}

func (w *workflow) getCitizenProfile(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	var p citizenProfile
	var prefsBytes []byte
	err := w.db.QueryRow(r.Context(), `
		SELECT id::text, identity_subject, full_name, email, phone_number, avatar_url,
		       municipality_code, district_code, subdistrict_code, preferred_language,
		       notification_preferences, account_status, created_at, updated_at
		FROM citizen_profiles
		WHERE identity_subject = $1`, id.Subject).Scan(
		&p.ID, &p.IdentitySubject, &p.FullName, &p.Email, &p.PhoneNumber, &p.AvatarURL,
		&p.MunicipalityCode, &p.DistrictCode, &p.SubdistrictCode, &p.PreferredLanguage,
		&prefsBytes, &p.AccountStatus, &p.CreatedAt, &p.UpdatedAt,
	)
	stats := w.loadCitizenStatistics(r, id.Subject)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(rw, http.StatusOK, map[string]any{
			"onboarded":    false,
			"identity":     identityBoundaryPayload(id),
			"profile":      nil,
			"statistics":   stats,
			"sourceOfTruth": sourceOfTruthBoundaries,
		})
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	p.NotificationPreferences = defaultNotificationPreferences()
	_ = json.Unmarshal(prefsBytes, &p.NotificationPreferences)
	writeJSON(rw, http.StatusOK, map[string]any{
		"onboarded":     p.AccountStatus != "pending_onboarding",
		"identity":      identityBoundaryPayload(id),
		"profile":       p,
		"statistics":    stats,
		"sourceOfTruth": sourceOfTruthBoundaries,
	})
}

func (w *workflow) upsertCitizenProfile(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	var raw citizenProfileInput
	decoder := json.NewDecoder(http.MaxBytesReader(rw, r.Body, 16384))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil {
		http.Error(rw, "invalid profile payload", http.StatusBadRequest)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		http.Error(rw, "invalid profile payload", http.StatusBadRequest)
		return
	}
	in, err := validateCitizenProfileInput(raw, id)
	if err != nil {
		http.Error(rw, err.Error(), http.StatusBadRequest)
		return
	}
	prefsJSON, _ := json.Marshal(in.NotificationPreferences)
	var p citizenProfile
	var prefsOut []byte
	err = w.db.QueryRow(r.Context(), `
		INSERT INTO citizen_profiles (
			identity_subject, full_name, email, phone_number, avatar_url,
			municipality_code, district_code, subdistrict_code,
			preferred_language, notification_preferences, account_status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
		ON CONFLICT (identity_subject) DO UPDATE SET
			full_name = EXCLUDED.full_name,
			email = EXCLUDED.email,
			phone_number = EXCLUDED.phone_number,
			avatar_url = EXCLUDED.avatar_url,
			municipality_code = EXCLUDED.municipality_code,
			district_code = EXCLUDED.district_code,
			subdistrict_code = EXCLUDED.subdistrict_code,
			preferred_language = EXCLUDED.preferred_language,
			notification_preferences = EXCLUDED.notification_preferences,
			account_status = CASE WHEN citizen_profiles.account_status = 'suspended' THEN 'suspended' ELSE EXCLUDED.account_status END,
			updated_at = now()
		RETURNING id::text, identity_subject, full_name, email, phone_number, avatar_url,
		          municipality_code, district_code, subdistrict_code, preferred_language,
		          notification_preferences, account_status, created_at, updated_at`,
		id.Subject, in.FullName, in.Email, in.PhoneNumber, in.AvatarURL,
		in.MunicipalityCode, in.DistrictCode, in.SubdistrictCode,
		in.PreferredLanguage, string(prefsJSON), in.AccountStatus,
	).Scan(
		&p.ID, &p.IdentitySubject, &p.FullName, &p.Email, &p.PhoneNumber, &p.AvatarURL,
		&p.MunicipalityCode, &p.DistrictCode, &p.SubdistrictCode, &p.PreferredLanguage,
		&prefsOut, &p.AccountStatus, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	p.NotificationPreferences = defaultNotificationPreferences()
	_ = json.Unmarshal(prefsOut, &p.NotificationPreferences)
	stats := w.loadCitizenStatistics(r, id.Subject)
	writeJSON(rw, http.StatusOK, map[string]any{
		"onboarded":     p.AccountStatus != "pending_onboarding",
		"identity":      identityBoundaryPayload(id),
		"profile":       p,
		"statistics":    stats,
		"sourceOfTruth": sourceOfTruthBoundaries,
	})
}

func (w *workflow) loadOperatorStatistics(r *http.Request, subject string, agencyID *string) operatorComplaintStats {
	var stats operatorComplaintStats
	_ = w.db.QueryRow(r.Context(), `
		SELECT
			(SELECT COUNT(*)::int FROM laksaComplaints WHERE status = 'awaitingOperator'),
			(SELECT COUNT(*)::int FROM laksaComplaints WHERE $2::uuid IS NOT NULL AND agencyId = $2::uuid),
			(SELECT COUNT(*)::int FROM laksaComplaintEvents WHERE actor = $1 AND eventType = 'operatorForwarded'),
			(SELECT COUNT(*)::int FROM complaint_sla_instances WHERE status = 'breached')`,
		subject, agencyID,
	).Scan(
		&stats.AwaitingReviewCount,
		&stats.AgencyAssignedCount,
		&stats.DecisionsMadeByOperator,
		&stats.OverdueSLACount,
	)
	return stats
}

func (w *workflow) getInternalOrganizations(rw http.ResponseWriter, r *http.Request) {
	agRows, err := w.db.Query(r.Context(), `SELECT id::text, label FROM laksaAgencies WHERE enabled = true ORDER BY label`)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer agRows.Close()
	agencies := []map[string]any{}
	for agRows.Next() {
		var id, label string
		if err := agRows.Scan(&id, &label); err != nil {
			http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
			return
		}
		agencies = append(agencies, map[string]any{"id": id, "label": label})
	}

	depRows, err := w.db.Query(r.Context(), `SELECT id::text, agency_id::text, code, name FROM government_departments WHERE enabled = true ORDER BY name`)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer depRows.Close()
	departments := []map[string]any{}
	for depRows.Next() {
		var id, agencyID, code, name string
		if err := depRows.Scan(&id, &agencyID, &code, &name); err != nil {
			http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
			return
		}
		departments = append(departments, map[string]any{"id": id, "agencyId": agencyID, "code": code, "name": name})
	}

	municipalities := []map[string]any{
		{"code": "36.71", "name": "Kota Tangerang", "municipalityId": "00000000-0000-0000-0000-000000000001"},
		{"code": "34.71", "name": "Kota Yogyakarta", "municipalityId": "00000000-0000-0000-0000-000000000002"},
	}

	writeJSON(rw, http.StatusOK, map[string]any{
		"municipalities": municipalities,
		"agencies":       agencies,
		"departments":    departments,
	})
}

func (w *workflow) getOperatorProfile(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "internalWeb" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	var p governmentOperatorProfile
	err := w.db.QueryRow(r.Context(), `
		SELECT op.id::text, op.identity_subject, op.full_name, op.email, op.employee_number,
		       op.agency_id::text, a.label, op.municipality_code, op.department_id::text,
		       gd.name, op.position, op.official_phone_number, op.avatar_url,
		       op.account_status, op.created_at, op.updated_at
		FROM government_operator_profiles op
		LEFT JOIN laksaAgencies a ON a.id = op.agency_id
		LEFT JOIN government_departments gd ON gd.id = op.department_id
		WHERE op.identity_subject = $1`, id.Subject).Scan(
		&p.ID, &p.IdentitySubject, &p.FullName, &p.Email, &p.EmployeeNumber,
		&p.AgencyID, &p.AgencyLabel, &p.MunicipalityCode, &p.DepartmentID,
		&p.DepartmentName, &p.Position, &p.OfficialPhoneNumber, &p.AvatarURL,
		&p.AccountStatus, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(rw, http.StatusOK, map[string]any{
			"onboarded":     false,
			"identity":      identityBoundaryPayload(id),
			"profile":       nil,
			"statistics":    w.loadOperatorStatistics(r, id.Subject, nil),
			"sourceOfTruth": sourceOfTruthBoundaries,
		})
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	stats := w.loadOperatorStatistics(r, id.Subject, &p.AgencyID)
	writeJSON(rw, http.StatusOK, map[string]any{
		"onboarded":     p.AccountStatus != "pending_onboarding",
		"identity":      identityBoundaryPayload(id),
		"profile":       p,
		"statistics":    stats,
		"sourceOfTruth": sourceOfTruthBoundaries,
	})
}

func (w *workflow) upsertOperatorProfile(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "internalWeb" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	var raw operatorProfileInput
	decoder := json.NewDecoder(http.MaxBytesReader(rw, r.Body, 16384))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil {
		http.Error(rw, "invalid operator profile payload", http.StatusBadRequest)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		http.Error(rw, "invalid operator profile payload", http.StatusBadRequest)
		return
	}
	in, err := validateOperatorProfileInput(raw, id)
	if err != nil {
		http.Error(rw, err.Error(), http.StatusBadRequest)
		return
	}

	var agencyExists bool
	if err := w.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM laksaAgencies WHERE id=$1 AND enabled=true)`, in.AgencyID).Scan(&agencyExists); err != nil || !agencyExists {
		http.Error(rw, "unknown or disabled agencyId", http.StatusBadRequest)
		return
	}
	if in.DepartmentID != nil {
		var deptMatches bool
		if err := w.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM government_departments WHERE id=$1 AND agency_id=$2 AND enabled=true)`, *in.DepartmentID, in.AgencyID).Scan(&deptMatches); err != nil || !deptMatches {
			http.Error(rw, "departmentId does not belong to selected agencyId", http.StatusBadRequest)
			return
		}
	}

	var p governmentOperatorProfile
	err = w.db.QueryRow(r.Context(), `
		INSERT INTO government_operator_profiles (
			identity_subject, full_name, email, employee_number, agency_id,
			municipality_code, department_id, position, official_phone_number,
			avatar_url, account_status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (identity_subject) DO UPDATE SET
			full_name = EXCLUDED.full_name,
			email = EXCLUDED.email,
			employee_number = EXCLUDED.employee_number,
			agency_id = EXCLUDED.agency_id,
			municipality_code = EXCLUDED.municipality_code,
			department_id = EXCLUDED.department_id,
			position = EXCLUDED.position,
			official_phone_number = EXCLUDED.official_phone_number,
			avatar_url = EXCLUDED.avatar_url,
			account_status = CASE WHEN government_operator_profiles.account_status = 'suspended' THEN 'suspended' ELSE EXCLUDED.account_status END,
			updated_at = now()
		RETURNING id::text, identity_subject, full_name, email, employee_number,
		          agency_id::text, municipality_code, department_id::text,
		          position, official_phone_number, avatar_url, account_status, created_at, updated_at`,
		id.Subject, in.FullName, in.Email, in.EmployeeNumber, in.AgencyID,
		in.MunicipalityCode, in.DepartmentID, in.Position, in.OfficialPhoneNumber,
		in.AvatarURL, in.AccountStatus,
	).Scan(
		&p.ID, &p.IdentitySubject, &p.FullName, &p.Email, &p.EmployeeNumber,
		&p.AgencyID, &p.MunicipalityCode, &p.DepartmentID,
		&p.Position, &p.OfficialPhoneNumber, &p.AvatarURL, &p.AccountStatus, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	_ = w.db.QueryRow(r.Context(), `SELECT label FROM laksaAgencies WHERE id=$1`, p.AgencyID).Scan(&p.AgencyLabel)
	if p.DepartmentID != nil {
		_ = w.db.QueryRow(r.Context(), `SELECT name FROM government_departments WHERE id=$1`, *p.DepartmentID).Scan(&p.DepartmentName)
	}
	stats := w.loadOperatorStatistics(r, id.Subject, &p.AgencyID)
	writeJSON(rw, http.StatusOK, map[string]any{
		"onboarded":     p.AccountStatus != "pending_onboarding",
		"identity":      identityBoundaryPayload(id),
		"profile":       p,
		"statistics":    stats,
		"sourceOfTruth": sourceOfTruthBoundaries,
	})
}

func avatarObjectKey(scope, subject string) string {
	sum := sha256.Sum256([]byte(subject))
	return "avatars/" + scope + "/" + hex.EncodeToString(sum[:])
}

func readAvatarFile(r *http.Request) ([]byte, string, error) {
	r.Body = http.MaxBytesReader(nil, r.Body, maxPhotoBytes+(1<<16))
	if err := r.ParseMultipartForm(maxPhotoBytes + (1 << 16)); err != nil {
		return nil, "", errors.New("invalid multipart upload")
	}
	defer r.MultipartForm.RemoveAll()
	file, _, err := r.FormFile("avatar")
	if err != nil {
		return nil, "", errors.New("avatar file is required")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxPhotoBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxPhotoBytes {
		return nil, "", errors.New("invalid avatar size")
	}
	mime := http.DetectContentType(data)
	if mime != "image/jpeg" && mime != "image/png" {
		return nil, "", errors.New("avatar must be JPEG or PNG")
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > 20000000 || (format != "jpeg" && format != "png") {
		return nil, "", errors.New("invalid avatar image")
	}
	return data, mime, nil
}

func (w *workflow) uploadAvatar(rw http.ResponseWriter, r *http.Request, scope string) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok {
		http.Error(rw, "unauthorized", http.StatusUnauthorized)
		return
	}
	if w.photos == nil {
		http.Error(rw, "photo storage unavailable", http.StatusServiceUnavailable)
		return
	}
	data, mime, err := readAvatarFile(r)
	if err != nil {
		http.Error(rw, err.Error(), http.StatusBadRequest)
		return
	}
	key := avatarObjectKey(scope, id.Subject)
	if err := w.photos.put(r.Context(), key, data, mime); err != nil {
		http.Error(rw, "avatar storage unavailable", http.StatusServiceUnavailable)
		return
	}
	avatarURL := fmt.Sprintf("/api/%s/profile/avatar?v=%d", scope, time.Now().UnixMilli())
	if scope == "citizen" {
		_, _ = w.db.Exec(r.Context(), `UPDATE citizen_profiles SET avatar_url=$2, updated_at=now() WHERE identity_subject=$1`, id.Subject, avatarURL)
	} else {
		_, _ = w.db.Exec(r.Context(), `UPDATE government_operator_profiles SET avatar_url=$2, updated_at=now() WHERE identity_subject=$1`, id.Subject, avatarURL)
	}
	writeJSON(rw, http.StatusOK, map[string]any{"avatarUrl": avatarURL})
}

func (w *workflow) getAvatar(rw http.ResponseWriter, r *http.Request, scope string) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok {
		http.Error(rw, "unauthorized", http.StatusUnauthorized)
		return
	}
	if w.photos == nil {
		http.Error(rw, "photo storage unavailable", http.StatusServiceUnavailable)
		return
	}
	key := avatarObjectKey(scope, id.Subject)
	data, err := w.photos.get(r.Context(), key)
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			http.NotFound(rw, r)
			return
		}
		http.Error(rw, "avatar unavailable", http.StatusBadGateway)
		return
	}
	mime := http.DetectContentType(data)
	rw.Header().Set("Content-Type", mime)
	rw.Header().Set("Cache-Control", "private, no-store")
	rw.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = rw.Write(data)
}

func (w *workflow) uploadCitizenAvatar(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	w.uploadAvatar(rw, r, "citizen")
}

func (w *workflow) getCitizenAvatar(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "citizenWeb" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	w.getAvatar(rw, r, "citizen")
}

func (w *workflow) uploadOperatorAvatar(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "internalWeb" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	w.uploadAvatar(rw, r, "internal")
}

func (w *workflow) getOperatorAvatar(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok || id.AuthorizedParty != "internalWeb" {
		http.Error(rw, "forbidden", http.StatusForbidden)
		return
	}
	w.getAvatar(rw, r, "internal")
}
