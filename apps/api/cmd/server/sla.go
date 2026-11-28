package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	slaTimezoneName        = "Asia/Jakarta"
	approachingThreshold   = 6 * time.Hour
	approachingDayFraction = 0.25
)

var (
	errSLANotFound         = errors.New("sla complaint not found")
	errRuleNotPermitted    = errors.New("operation not permitted by regulatory rule")
	errExtensionExceeded   = errors.New("requested extension exceeds statutory maximum")
	errInvalidSLATransition = errors.New("invalid sla transition")
	errNoActiveClock       = errors.New("no matching sla clock")
)

func jakartaLocation() *time.Location {
	loc, err := time.LoadLocation(slaTimezoneName)
	if err != nil {
		return time.FixedZone("WIB", 7*3600)
	}
	return loc
}

type slaCalendar struct {
	ID             string
	MunicipalityID string
	Code           string
	Name           string
	Timezone       string
	WorkingDays    []int16
	Exceptions     map[string]bool
}

type slaPolicyVersion struct {
	ID                 string
	PolicyID           string
	MunicipalityID     string
	MunicipalityName   string
	PolicyCode         string
	RegulationTitle    string
	RegulationNumber   string
	SourceURL          string
	CalendarID         string
	VersionNumber      int
	EffectiveFrom      time.Time
	EffectiveTo        *time.Time
	VerificationStatus string
	IsActive           bool
}

type slaRule struct {
	ID                  string
	PolicyVersionID     string
	MunicipalityID      string
	RuleCode            string
	RuleName            string
	ComplaintType       string
	WorkflowStage       string
	DeadlineKind        string
	ResponsibleActor    string
	DurationValue       int
	TimeUnit            string
	StartEvent          string
	CompletionEvent     string
	PausePermitted      bool
	PauseConditions     []string
	ExtensionPermitted  bool
	MaxExtensionValue   *int
	ExtensionTimeUnit   *string
	ExtensionConditions string
	ResetOnReturn       bool
	BreachAction        string
	EscalationTarget    string
	LegalBasis          string
	ArticleReference    string
	EffectiveDate       time.Time
	VerificationStatus  string
	Notes               string
}

type slaInstance struct {
	ID                  string
	ComplaintID         string
	PolicyVersionID     string
	RuleID              string
	RuleCode            string
	RuleName            string
	WorkflowStage       string
	DeadlineKind        string
	ComplaintType       string
	ResponsibleActor    string
	AssignedAgencyID    *string
	AssignedAgencyLabel *string
	TriggeringEvent     string
	DurationValue       int
	TimeUnit            string
	LegalBasis          string
	ArticleReference    string
	StartedAt           time.Time
	OriginalDueAt       time.Time
	DueAt               time.Time
	PausedAt            *time.Time
	TotalPausedSeconds  int64
	ExtensionCount      int
	ExtendedUntil       *time.Time
	ExtensionReason     *string
	Status              string
	CompletedAt         *time.Time
	BreachedAt          *time.Time
	EscalationTarget    string
	BreachAction        string
	ExtensionPermitted  bool
	PausePermitted      bool
	MaxExtensionValue   *int
	ExtensionTimeUnit   *string
	Version             int
}

type slaEvent struct {
	ID             int64          `json:"id"`
	SLAInstanceID  string         `json:"slaInstanceId"`
	ComplaintID    string         `json:"complaintId"`
	IdempotencyKey string         `json:"idempotencyKey"`
	EventType      string         `json:"eventType"`
	Actor          string         `json:"actor"`
	PreviousStatus *string        `json:"previousStatus"`
	NewStatus      string         `json:"newStatus"`
	PreviousDueAt  *time.Time     `json:"previousDueAt"`
	NewDueAt       time.Time      `json:"newDueAt"`
	LegalBasis     string         `json:"legalBasis"`
	Details        map[string]any `json:"details"`
	OccurredAt     time.Time      `json:"occurredAt"`
}

type slaComplaintMeta struct {
	ComplaintID     string
	MunicipalityID  string
	ComplaintType   string
	ResolutionState string
	PolicyVersionID *string
	AgencyID        *string
	AgencyLabel     *string
	CreatedAt       time.Time
}

type slaClockView struct {
	InstanceID         string     `json:"instanceId"`
	RuleCode           string     `json:"ruleCode"`
	RuleName           string     `json:"ruleName"`
	WorkflowStage      string     `json:"workflowStage"`
	DeadlineKind       string     `json:"deadlineKind"`
	ComplaintType      string     `json:"complaintType"`
	ResponsibleActor   string     `json:"responsibleActor"`
	AssignedAgency     *string    `json:"assignedAgency"`
	TriggeringEvent    string     `json:"triggeringEvent"`
	StartedAt          time.Time  `json:"startedAt"`
	OriginalDueAt      time.Time  `json:"originalDueAt"`
	DueAt              time.Time  `json:"dueAt"`
	RemainingSeconds   int64      `json:"remainingSeconds"`
	RemainingDisplay   string     `json:"remainingDisplay"`
	DurationValue      int        `json:"durationValue"`
	TimeUnit           string     `json:"timeUnit"`
	Status             string     `json:"status"`
	ComplianceStatus   string     `json:"complianceStatus"`
	ApproachingWarning bool       `json:"approachingWarning"`
	Overdue            bool       `json:"overdue"`
	PausedAt           *time.Time `json:"pausedAt"`
	TotalPausedSeconds int64      `json:"totalPausedSeconds"`
	ExtensionCount     int        `json:"extensionCount"`
	ExtendedUntil      *time.Time `json:"extendedUntil"`
	ExtensionReason    *string    `json:"extensionReason"`
	ExtensionPermitted bool       `json:"extensionPermitted"`
	PausePermitted     bool       `json:"pausePermitted"`
	EscalationTarget   string     `json:"escalationTarget"`
	LegalBasis         string     `json:"legalBasis"`
	ArticleReference   string     `json:"articleReference"`
	CompletedAt        *time.Time `json:"completedAt"`
	BreachedAt         *time.Time `json:"breachedAt"`
}

type gracePredictionDisclaimer struct {
	PredictedResolutionRisk        string `json:"predictedResolutionRisk"`
	StatutoryComplianceIndependent bool   `json:"statutoryComplianceIndependent"`
	Note                           string `json:"note"`
}

type complaintSLASummary struct {
	ComplaintID                string                    `json:"complaintId"`
	MunicipalityID             string                    `json:"municipalityId"`
	MunicipalityName           string                    `json:"municipalityName"`
	PolicyCode                 string                    `json:"policyCode"`
	PolicyVersion              int                       `json:"policyVersion"`
	RegulationTitle            string                    `json:"regulationTitle"`
	Timezone                   string                    `json:"timezone"`
	CurrentStage               string                    `json:"currentStage"`
	ComplaintType              string                    `json:"complaintType"`
	ResolutionState            string                    `json:"resolutionState"`
	ResponsibleActor           string                    `json:"responsibleActor"`
	ResponsibleAgency          *string                   `json:"responsibleAgency"`
	CitizenActionRequired      bool                      `json:"citizenActionRequired"`
	CitizenActionStage         *string                   `json:"citizenActionStage"`
	CitizenActionDeadline      *slaClockView             `json:"citizenActionDeadline"`
	OverallComplianceStatus    string                    `json:"overallComplianceStatus"`
	ApproachingDeadlineWarning bool                      `json:"approachingDeadlineWarning"`
	Overdue                    bool                      `json:"overdue"`
	ResponseDeadline           *slaClockView             `json:"responseDeadline"`
	ResolutionDeadline         *slaClockView             `json:"resolutionDeadline"`
	ActiveClocks               []slaClockView            `json:"activeClocks"`
	Clocks                     []slaClockView            `json:"clocks"`
	ApprovedExtensions         []slaClockView            `json:"approvedExtensions"`
	Events                     []slaEvent                `json:"events"`
	GracePrediction            gracePredictionDisclaimer `json:"gracePrediction"`
}

type slaActionRequest struct {
	Action          string     `json:"action"`
	IdempotencyKey  string     `json:"idempotencyKey"`
	RuleCode        string     `json:"ruleCode"`
	Actor           string     `json:"actor"`
	ComplaintType   string     `json:"complaintType"`
	AgencyID        *string    `json:"agencyId"`
	AgencyLabel     *string    `json:"agencyLabel"`
	ExtendUntil     *time.Time `json:"extendUntil"`
	ExtendDays      *int       `json:"extendDays"`
	ExtensionReason string     `json:"extensionReason"`
	Reason          string     `json:"reason"`
	Note            string     `json:"note"`
}

type slaStore interface {
	loadComplaintMeta(ctx context.Context, complaintID string) (*slaComplaintMeta, error)
	pinPolicyVersion(ctx context.Context, complaintID, policyVersionID, complaintType string) error
	setComplaintResolutionState(ctx context.Context, complaintID, resolutionState string) error
	setComplaintStatusAndAgency(ctx context.Context, complaintID, status string, agencyID *string) error
	findActivePolicyVersion(ctx context.Context, municipalityID string, at time.Time) (*slaPolicyVersion, error)
	loadPolicyVersionByID(ctx context.Context, policyVersionID string) (*slaPolicyVersion, error)
	loadCalendar(ctx context.Context, calendarID string) (*slaCalendar, error)
	loadRules(ctx context.Context, policyVersionID string) ([]slaRule, error)
	loadInstances(ctx context.Context, complaintID string) ([]slaInstance, error)
	loadEvents(ctx context.Context, complaintID string) ([]slaEvent, error)
	insertInstance(ctx context.Context, inst *slaInstance) error
	updateInstance(ctx context.Context, inst *slaInstance) error
	insertEvent(ctx context.Context, ev *slaEvent) (bool, error)
}

func isWorkingDate(localDate time.Time, cal *slaCalendar) bool {
	key := localDate.Format("2006-01-02")
	if isWorking, ok := cal.Exceptions[key]; ok {
		return isWorking
	}
	isoWeekday := int16(localDate.Weekday())
	if isoWeekday == 0 {
		isoWeekday = 7
	}
	for _, wd := range cal.WorkingDays {
		if wd == isoWeekday {
			return true
		}
	}
	return false
}

// calculateDeadline computes the authoritative statutory deadline in UTC from Asia/Jakarta local rules.
func calculateDeadline(startedAt time.Time, durationValue int, timeUnit string, totalPausedSeconds int64, cal *slaCalendar) time.Time {
	loc := jakartaLocation()
	if cal != nil && cal.Timezone != "" {
		if l, err := time.LoadLocation(cal.Timezone); err == nil {
			loc = l
		}
	}
	paused := time.Duration(totalPausedSeconds) * time.Second
	switch timeUnit {
	case "hours":
		return startedAt.UTC().Add(time.Duration(durationValue)*time.Hour + paused)
	case "calendar_days":
		local := startedAt.In(loc)
		targetLocal := local.AddDate(0, 0, durationValue)
		return targetLocal.UTC().Add(paused)
	case "working_days":
		local := startedAt.In(loc)
		hour, min, sec, nsec := local.Hour(), local.Minute(), local.Second(), local.Nanosecond()
		curDate := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
		remaining := durationValue
		for remaining > 0 {
			curDate = curDate.AddDate(0, 0, 1)
			if cal == nil || isWorkingDate(curDate, cal) {
				remaining--
			}
		}
		targetLocal := time.Date(curDate.Year(), curDate.Month(), curDate.Day(), hour, min, sec, nsec, loc)
		return targetLocal.UTC().Add(paused)
	default:
		return startedAt.UTC().Add(time.Duration(durationValue)*24*time.Hour + paused)
	}
}

func formatRemainingSLA(remaining time.Duration, timeUnit string, status string) string {
	switch status {
	case "completed":
		return "Selesai sesuai tahap"
	case "administratively_closed":
		return "Ditutup administratif"
	case "paused":
		return "Dijeda sementara"
	}
	if remaining <= 0 {
		over := -remaining
		hours := int64(over.Hours())
		mins := int64(over.Minutes()) % 60
		return fmt.Sprintf("Melewati batas %dj %dm", hours, mins)
	}
	totalHours := int64(remaining.Hours())
	days := totalHours / 24
	hours := totalHours % 24
	mins := int64(remaining.Minutes()) % 60
	if timeUnit == "hours" && totalHours < 48 {
		return fmt.Sprintf("%dj %dm tersisa", totalHours, mins)
	}
	if days > 0 {
		return fmt.Sprintf("%d hari %dj tersisa", days, hours)
	}
	return fmt.Sprintf("%dj %dm tersisa", hours, mins)
}

func isApproachingDeadline(inst *slaInstance, now time.Time) bool {
	if inst.Status != "active" {
		return false
	}
	remaining := inst.DueAt.Sub(now)
	if remaining <= 0 {
		return false
	}
	totalWindow := inst.DueAt.Sub(inst.StartedAt)
	if totalWindow <= 0 {
		return remaining <= approachingThreshold
	}
	fractionThreshold := time.Duration(float64(totalWindow) * approachingDayFraction)
	if fractionThreshold > approachingThreshold && totalWindow >= 48*time.Hour {
		fractionThreshold = 12 * time.Hour
	}
	if fractionThreshold < approachingThreshold {
		fractionThreshold = approachingThreshold
	}
	return remaining <= fractionThreshold
}

type slaEngine struct {
	store slaStore
	nowFn func() time.Time
}

func newSLAEngine(store slaStore) *slaEngine {
	return &slaEngine{store: store, nowFn: func() time.Time { return time.Now().UTC() }}
}

func (e *slaEngine) now() time.Time {
	if e.nowFn != nil {
		return e.nowFn().UTC()
	}
	return time.Now().UTC()
}

func (e *slaEngine) startRuleClock(ctx context.Context, meta *slaComplaintMeta, pv *slaPolicyVersion, cal *slaCalendar, rule slaRule, startedAt time.Time, triggeringEvent, actor, idempotencyKey string) (*slaInstance, error) {
	dueAt := calculateDeadline(startedAt, rule.DurationValue, rule.TimeUnit, 0, cal)
	inst := &slaInstance{
		ID:                  uuid.NewString(),
		ComplaintID:         meta.ComplaintID,
		PolicyVersionID:     pv.ID,
		RuleID:              rule.ID,
		RuleCode:            rule.RuleCode,
		RuleName:            rule.RuleName,
		WorkflowStage:       rule.WorkflowStage,
		DeadlineKind:        rule.DeadlineKind,
		ComplaintType:       rule.ComplaintType,
		ResponsibleActor:    rule.ResponsibleActor,
		AssignedAgencyID:    meta.AgencyID,
		AssignedAgencyLabel: meta.AgencyLabel,
		TriggeringEvent:     triggeringEvent,
		DurationValue:       rule.DurationValue,
		TimeUnit:            rule.TimeUnit,
		LegalBasis:          rule.LegalBasis,
		ArticleReference:    rule.ArticleReference,
		StartedAt:           startedAt.UTC(),
		OriginalDueAt:       dueAt,
		DueAt:               dueAt,
		Status:              "active",
		EscalationTarget:    rule.EscalationTarget,
		BreachAction:        rule.BreachAction,
		ExtensionPermitted:  rule.ExtensionPermitted,
		PausePermitted:      rule.PausePermitted,
		MaxExtensionValue:   rule.MaxExtensionValue,
		ExtensionTimeUnit:   rule.ExtensionTimeUnit,
		Version:             1,
	}
	if err := e.store.insertInstance(ctx, inst); err != nil {
		return nil, err
	}
	ev := &slaEvent{
		SLAInstanceID:  inst.ID,
		ComplaintID:    meta.ComplaintID,
		IdempotencyKey: idempotencyKey + ":" + rule.RuleCode,
		EventType:      "started",
		Actor:          actor,
		PreviousStatus: nil,
		NewStatus:      "active",
		PreviousDueAt:  nil,
		NewDueAt:       dueAt,
		LegalBasis:     fmt.Sprintf("%s (%s)", rule.LegalBasis, rule.ArticleReference),
		Details: map[string]any{
			"ruleCode":      rule.RuleCode,
			"workflowStage": rule.WorkflowStage,
			"deadlineKind":  rule.DeadlineKind,
			"timeUnit":      rule.TimeUnit,
			"durationValue": rule.DurationValue,
		},
		OccurredAt: startedAt.UTC(),
	}
	_, err := e.store.insertEvent(ctx, ev)
	return inst, err
}

func ruleMatchesOnReceive(rule slaRule, policyCode, complaintType string) bool {
	if rule.VerificationStatus != "verified" || rule.StartEvent != "complaint_received" {
		return false
	}
	if policyCode == "JOG-PERWALI-79-2023" {
		if complaintType == "sp4n_lapor" {
			return rule.RuleCode == "JOG_SP4N_RESPONSE" || rule.RuleCode == "JOG_VERIFICATION"
		}
		return rule.RuleCode == "JOG_INITIAL_RESPONSE" || rule.RuleCode == "JOG_VERIFICATION"
	}
	return rule.ComplaintType == "all" || rule.ComplaintType == complaintType
}

func ruleMatchesOnDistribute(rule slaRule, policyCode, complaintType string) bool {
	if rule.VerificationStatus != "verified" || rule.StartEvent != "distributed_to_liaison" {
		return false
	}
	if policyCode == "JOG-PERWALI-79-2023" {
		switch complaintType {
		case "normative":
			return rule.RuleCode == "JOG_RESOLUTION_NORMATIVE"
		case "no_field_investigation":
			return rule.RuleCode == "JOG_RESOLUTION_NO_FIELD"
		default:
			return rule.RuleCode == "JOG_RESOLUTION_FIELD"
		}
	}
	if complaintType == "oversight" {
		return rule.RuleCode == "TNG_OVERSIGHT_STATUS"
	}
	return rule.RuleCode == "TNG_ORDINARY_RESPONSE"
}

func (e *slaEngine) onComplaintSubmitted(ctx context.Context, complaintID, municipalityID, complaintType string, submittedAt time.Time, actor, idempotencyKey string) (*complaintSLASummary, error) {
	meta, err := e.store.loadComplaintMeta(ctx, complaintID)
	if err != nil {
		return nil, err
	}
	if complaintType == "" {
		complaintType = meta.ComplaintType
	}
	if complaintType == "" {
		complaintType = "non_oversight"
	}
	pv, err := e.store.findActivePolicyVersion(ctx, municipalityID, submittedAt)
	if err != nil {
		return nil, err
	}
	if err := e.store.pinPolicyVersion(ctx, complaintID, pv.ID, complaintType); err != nil {
		return nil, err
	}
	meta.PolicyVersionID = &pv.ID
	meta.ComplaintType = complaintType

	cal, err := e.store.loadCalendar(ctx, pv.CalendarID)
	if err != nil {
		return nil, err
	}
	rules, err := e.store.loadRules(ctx, pv.ID)
	if err != nil {
		return nil, err
	}
	existing, err := e.store.loadInstances(ctx, complaintID)
	if err != nil {
		return nil, err
	}
	existingByCode := map[string]bool{}
	for _, ex := range existing {
		existingByCode[ex.RuleCode] = true
	}
	for _, r := range rules {
		if existingByCode[r.RuleCode] {
			continue
		}
		if ruleMatchesOnReceive(r, pv.PolicyCode, complaintType) {
			if _, err := e.startRuleClock(ctx, meta, pv, cal, r, submittedAt, "complaint_received", actor, idempotencyKey); err != nil {
				return nil, err
			}
		}
	}
	return e.getComplaintSLA(ctx, complaintID)
}

func (e *slaEngine) onDistributedToLiaison(ctx context.Context, complaintID, complaintType string, agencyID, agencyLabel *string, distributedAt time.Time, actor, idempotencyKey string) (*complaintSLASummary, error) {
	meta, err := e.store.loadComplaintMeta(ctx, complaintID)
	if err != nil {
		return nil, err
	}
	if complaintType != "" {
		meta.ComplaintType = complaintType
	}
	if agencyID != nil {
		meta.AgencyID = agencyID
	}
	if agencyLabel != nil {
		meta.AgencyLabel = agencyLabel
	}
	pv, cal, rules, err := e.loadPolicyContext(ctx, meta, distributedAt)
	if err != nil {
		return nil, err
	}
	if meta.PolicyVersionID == nil {
		if err := e.store.pinPolicyVersion(ctx, complaintID, pv.ID, meta.ComplaintType); err != nil {
			return nil, err
		}
	}
	instances, err := e.store.loadInstances(ctx, complaintID)
	if err != nil {
		return nil, err
	}
	hasResolution := false
	for i := range instances {
		inst := &instances[i]
		if inst.WorkflowStage == "verification" || inst.WorkflowStage == "sp4n_initial_response" {
			if inst.Status == "active" || inst.Status == "paused" {
				if err := e.completeClock(ctx, inst, distributedAt, actor, idempotencyKey+":complete:"+inst.RuleCode); err != nil {
					return nil, err
				}
			}
		}
		if inst.DeadlineKind == "resolution" && (inst.Status == "active" || inst.Status == "paused" || inst.Status == "breached") {
			hasResolution = true
		}
	}
	if !hasResolution {
		for _, r := range rules {
			if ruleMatchesOnDistribute(r, pv.PolicyCode, meta.ComplaintType) {
				if _, err := e.startRuleClock(ctx, meta, pv, cal, r, distributedAt, "distributed_to_liaison", actor, idempotencyKey); err != nil {
					return nil, err
				}
			}
		}
	}
	return e.getComplaintSLA(ctx, complaintID)
}

func (e *slaEngine) loadPolicyContext(ctx context.Context, meta *slaComplaintMeta, refTime time.Time) (*slaPolicyVersion, *slaCalendar, []slaRule, error) {
	var pv *slaPolicyVersion
	var err error
	if meta.PolicyVersionID != nil && *meta.PolicyVersionID != "" {
		pv, err = e.store.loadPolicyVersionByID(ctx, *meta.PolicyVersionID)
	} else {
		pv, err = e.store.findActivePolicyVersion(ctx, meta.MunicipalityID, refTime)
	}
	if err != nil {
		return nil, nil, nil, err
	}
	cal, err := e.store.loadCalendar(ctx, pv.CalendarID)
	if err != nil {
		return nil, nil, nil, err
	}
	rules, err := e.store.loadRules(ctx, pv.ID)
	if err != nil {
		return nil, nil, nil, err
	}
	return pv, cal, rules, nil
}

func (e *slaEngine) evaluateBreaches(ctx context.Context, meta *slaComplaintMeta, instances []slaInstance, now time.Time) error {
	for i := range instances {
		inst := &instances[i]
		if inst.Status == "active" && now.After(inst.DueAt) {
			prev := inst.Status
			breachedAt := inst.DueAt
			inst.Status = "breached"
			inst.BreachedAt = &breachedAt
			inst.Version++
			if err := e.store.updateInstance(ctx, inst); err != nil {
				return err
			}
			_, err := e.store.insertEvent(ctx, &slaEvent{
				SLAInstanceID:  inst.ID,
				ComplaintID:    meta.ComplaintID,
				IdempotencyKey: "breach:" + inst.ID,
				EventType:      "breached",
				Actor:          "sla_engine",
				PreviousStatus: &prev,
				NewStatus:      "breached",
				PreviousDueAt:  &inst.DueAt,
				NewDueAt:       inst.DueAt,
				LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
				Details: map[string]any{
					"breachAction":     inst.BreachAction,
					"escalationTarget": inst.EscalationTarget,
					"autoResolved":     false,
				},
				OccurredAt: breachedAt,
			})
			if err != nil {
				return err
			}
			if inst.EscalationTarget != "" && inst.BreachAction == "escalate" {
				_, err = e.store.insertEvent(ctx, &slaEvent{
					SLAInstanceID:  inst.ID,
					ComplaintID:    meta.ComplaintID,
					IdempotencyKey: "escalate:" + inst.ID,
					EventType:      "escalated",
					Actor:          "sla_engine",
					PreviousStatus: &prev,
					NewStatus:      "breached",
					PreviousDueAt:  &inst.DueAt,
					NewDueAt:       inst.DueAt,
					LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
					Details:        map[string]any{"escalationTarget": inst.EscalationTarget},
					OccurredAt:     now,
				})
				if err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (e *slaEngine) completeClock(ctx context.Context, inst *slaInstance, at time.Time, actor, idempotencyKey string) error {
	prev := inst.Status
	inst.Status = "completed"
	inst.CompletedAt = &at
	inst.Version++
	if err := e.store.updateInstance(ctx, inst); err != nil {
		return err
	}
	_, err := e.store.insertEvent(ctx, &slaEvent{
		SLAInstanceID:  inst.ID,
		ComplaintID:    inst.ComplaintID,
		IdempotencyKey: idempotencyKey,
		EventType:      "completed",
		Actor:          actor,
		PreviousStatus: &prev,
		NewStatus:      "completed",
		PreviousDueAt:  &inst.DueAt,
		NewDueAt:       inst.DueAt,
		LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
		Details:        map[string]any{"ruleCode": inst.RuleCode},
		OccurredAt:     at,
	})
	return err
}

func (e *slaEngine) findTargetClock(instances []slaInstance, ruleCode string, kinds ...string) *slaInstance {
	for i := len(instances) - 1; i >= 0; i-- {
		inst := &instances[i]
		if ruleCode != "" && inst.RuleCode == ruleCode {
			return inst
		}
	}
	if ruleCode != "" {
		return nil
	}
	for _, wantStatus := range []string{"active", "paused", "breached"} {
		for i := len(instances) - 1; i >= 0; i-- {
			inst := &instances[i]
			if inst.Status != wantStatus {
				continue
			}
			if len(kinds) == 0 {
				return inst
			}
			for _, k := range kinds {
				if inst.DeadlineKind == k || inst.WorkflowStage == k {
					return inst
				}
			}
		}
	}
	return nil
}

func (e *slaEngine) applyAction(ctx context.Context, complaintID string, req slaActionRequest) (*complaintSLASummary, bool, error) {
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		return nil, false, errors.New("idempotencyKey is required")
	}
	meta, err := e.store.loadComplaintMeta(ctx, complaintID)
	if err != nil {
		return nil, false, err
	}
	now := e.now()
	pv, cal, rules, err := e.loadPolicyContext(ctx, meta, now)
	if err != nil {
		return nil, false, err
	}
	instances, err := e.store.loadInstances(ctx, complaintID)
	if err != nil {
		return nil, false, err
	}
	if err := e.evaluateBreaches(ctx, meta, instances, now); err != nil {
		return nil, false, err
	}
	events, err := e.store.loadEvents(ctx, complaintID)
	if err != nil {
		return nil, false, err
	}
	for _, ev := range events {
		if ev.IdempotencyKey == req.IdempotencyKey || strings.HasPrefix(ev.IdempotencyKey, req.IdempotencyKey+":") {
			summary, err := e.getComplaintSLA(ctx, complaintID)
			return summary, true, err
		}
	}

	actor := req.Actor
	if actor == "" {
		actor = "system"
	}
	findRule := func(code string) (slaRule, bool) {
		for _, r := range rules {
			if r.RuleCode == code && r.VerificationStatus == "verified" {
				return r, true
			}
		}
		return slaRule{}, false
	}

	switch req.Action {
	case "send_initial_response":
		inst := e.findTargetClock(instances, req.RuleCode, "initial_response")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		if err := e.completeClock(ctx, inst, now, actor, req.IdempotencyKey); err != nil {
			return nil, false, err
		}
	case "complete_verification":
		inst := e.findTargetClock(instances, req.RuleCode, "verification")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		if err := e.completeClock(ctx, inst, now, actor, req.IdempotencyKey); err != nil {
			return nil, false, err
		}
	case "request_citizen_info":
		if ver := e.findTargetClock(instances, "", "verification"); ver != nil && (ver.Status == "active" || ver.Status == "paused") {
			if err := e.completeClock(ctx, ver, now, actor, req.IdempotencyKey+":verify"); err != nil {
				return nil, false, err
			}
		}
		rule, ok := findRule("TNG_CITIZEN_MISSING_INFO")
		if !ok {
			return nil, false, errRuleNotPermitted
		}
		if _, err := e.startRuleClock(ctx, meta, pv, cal, rule, now, "missing_info_requested", actor, req.IdempotencyKey); err != nil {
			return nil, false, err
		}
	case "submit_citizen_info":
		inst := e.findTargetClock(instances, req.RuleCode, "awaiting_citizen_info", "citizen_action")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		if err := e.completeClock(ctx, inst, now, actor, req.IdempotencyKey); err != nil {
			return nil, false, err
		}
	case "start_coordination":
		rule, ok := findRule("JOG_COORDINATION_RESPONSE")
		if !ok {
			return nil, false, errRuleNotPermitted
		}
		if _, err := e.startRuleClock(ctx, meta, pv, cal, rule, now, "coordination_info_received", actor, req.IdempotencyKey); err != nil {
			return nil, false, err
		}
	case "complete_coordination":
		inst := e.findTargetClock(instances, req.RuleCode, "cross_opd_coordination")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		if err := e.completeClock(ctx, inst, now, actor, req.IdempotencyKey); err != nil {
			return nil, false, err
		}
	case "submit_opd_response":
		inst := e.findTargetClock(instances, req.RuleCode, "resolution", "opd_handling", "apip_oversight_handling")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		if err := e.completeClock(ctx, inst, now, actor, req.IdempotencyKey); err != nil {
			return nil, false, err
		}
		if rule, ok := findRule("TNG_CITIZEN_FOLLOWUP"); ok && meta.ComplaintType == "non_oversight" {
			if _, err := e.startRuleClock(ctx, meta, pv, cal, rule, now, "opd_response_delivered", actor, req.IdempotencyKey); err != nil {
				return nil, false, err
			}
		}
	case "submit_citizen_followup":
		inst := e.findTargetClock(instances, req.RuleCode, "awaiting_citizen_followup", "citizen_action")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		if err := e.completeClock(ctx, inst, now, actor, req.IdempotencyKey); err != nil {
			return nil, false, err
		}
	case "opd_return":
		inst := e.findTargetClock(instances, req.RuleCode, "resolution", "opd_handling", "verification")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		prev := inst.Status
		prevAgency := inst.AssignedAgencyLabel
		// Never reset deadline or original_due_at when OPD returns a complaint (Perwali Tangerang Art. 19(4) / Yogyakarta Art. 9).
		inst.AssignedAgencyID = nil
		inst.AssignedAgencyLabel = nil
		inst.Version++
		if err := e.store.updateInstance(ctx, inst); err != nil {
			return nil, false, err
		}
		_ = e.store.setComplaintStatusAndAgency(ctx, complaintID, "awaitingOperator", nil)
		_, err = e.store.insertEvent(ctx, &slaEvent{
			SLAInstanceID:  inst.ID,
			ComplaintID:    complaintID,
			IdempotencyKey: req.IdempotencyKey,
			EventType:      "opd_returned",
			Actor:          actor,
			PreviousStatus: &prev,
			NewStatus:      inst.Status,
			PreviousDueAt:  &inst.DueAt,
			NewDueAt:       inst.DueAt,
			LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
			Details: map[string]any{
				"previousAgency": prevAgency,
				"reason":         req.Reason,
				"deadlineReset":  false,
			},
			OccurredAt: now,
		})
		if err != nil {
			return nil, false, err
		}
	case "reassign_opd":
		inst := e.findTargetClock(instances, req.RuleCode, "resolution", "opd_handling", "verification")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		prev := inst.Status
		prevAgency := inst.AssignedAgencyLabel
		// Preserve historical original_due_at and due_at across OPD reassignment.
		inst.AssignedAgencyID = req.AgencyID
		inst.AssignedAgencyLabel = req.AgencyLabel
		inst.Version++
		if err := e.store.updateInstance(ctx, inst); err != nil {
			return nil, false, err
		}
		_ = e.store.setComplaintStatusAndAgency(ctx, complaintID, "forwarded", req.AgencyID)
		_, err = e.store.insertEvent(ctx, &slaEvent{
			SLAInstanceID:  inst.ID,
			ComplaintID:    complaintID,
			IdempotencyKey: req.IdempotencyKey,
			EventType:      "reassigned",
			Actor:          actor,
			PreviousStatus: &prev,
			NewStatus:      inst.Status,
			PreviousDueAt:  &inst.DueAt,
			NewDueAt:       inst.DueAt,
			LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
			Details: map[string]any{
				"previousAgency": prevAgency,
				"newAgency":      req.AgencyLabel,
				"reason":         req.Reason,
				"deadlineReset":  false,
			},
			OccurredAt: now,
		})
		if err != nil {
			return nil, false, err
		}
	case "pause":
		inst := e.findTargetClock(instances, req.RuleCode, "resolution", "response", "citizen_action")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		if !inst.PausePermitted {
			return nil, false, errRuleNotPermitted
		}
		if inst.Status != "active" {
			return nil, false, errInvalidSLATransition
		}
		prev := inst.Status
		inst.Status = "paused"
		inst.PausedAt = &now
		inst.Version++
		if err := e.store.updateInstance(ctx, inst); err != nil {
			return nil, false, err
		}
		_, err = e.store.insertEvent(ctx, &slaEvent{
			SLAInstanceID:  inst.ID,
			ComplaintID:    complaintID,
			IdempotencyKey: req.IdempotencyKey,
			EventType:      "paused",
			Actor:          actor,
			PreviousStatus: &prev,
			NewStatus:      "paused",
			PreviousDueAt:  &inst.DueAt,
			NewDueAt:       inst.DueAt,
			LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
			Details:        map[string]any{"reason": req.Reason},
			OccurredAt:     now,
		})
		if err != nil {
			return nil, false, err
		}
	case "resume":
		inst := e.findTargetClock(instances, req.RuleCode)
		if inst == nil || inst.Status != "paused" || inst.PausedAt == nil {
			return nil, false, errInvalidSLATransition
		}
		prev := inst.Status
		prevDue := inst.DueAt
		pausedDelta := int64(now.Sub(*inst.PausedAt).Seconds())
		if pausedDelta < 0 {
			pausedDelta = 0
		}
		inst.TotalPausedSeconds += pausedDelta
		inst.PausedAt = nil
		inst.Status = "active"
		inst.DueAt = calculateDeadline(inst.StartedAt, inst.DurationValue, inst.TimeUnit, inst.TotalPausedSeconds, cal)
		inst.Version++
		if err := e.store.updateInstance(ctx, inst); err != nil {
			return nil, false, err
		}
		_, err = e.store.insertEvent(ctx, &slaEvent{
			SLAInstanceID:  inst.ID,
			ComplaintID:    complaintID,
			IdempotencyKey: req.IdempotencyKey,
			EventType:      "resumed",
			Actor:          actor,
			PreviousStatus: &prev,
			NewStatus:      "active",
			PreviousDueAt:  &prevDue,
			NewDueAt:       inst.DueAt,
			LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
			Details:        map[string]any{"pausedSeconds": pausedDelta},
			OccurredAt:     now,
		})
		if err != nil {
			return nil, false, err
		}
	case "extend":
		inst := e.findTargetClock(instances, req.RuleCode, "resolution")
		if inst == nil {
			return nil, false, errNoActiveClock
		}
		if !inst.ExtensionPermitted || inst.MaxExtensionValue == nil || inst.ExtensionTimeUnit == nil {
			return nil, false, errRuleNotPermitted
		}
		maxDue := calculateDeadline(inst.StartedAt, *inst.MaxExtensionValue, *inst.ExtensionTimeUnit, inst.TotalPausedSeconds, cal)
		var targetDue time.Time
		if req.ExtendUntil != nil {
			targetDue = req.ExtendUntil.UTC()
		} else if req.ExtendDays != nil && *req.ExtendDays > 0 {
			targetDue = calculateDeadline(inst.DueAt, *req.ExtendDays, *inst.ExtensionTimeUnit, 0, cal)
		} else {
			targetDue = maxDue
		}
		if targetDue.After(maxDue) {
			return nil, false, errExtensionExceeded
		}
		if !targetDue.After(inst.DueAt) {
			return nil, false, errInvalidSLATransition
		}
		prev := inst.Status
		prevDue := inst.DueAt
		inst.DueAt = targetDue
		inst.ExtendedUntil = &targetDue
		inst.ExtensionCount++
		reason := strings.TrimSpace(req.ExtensionReason)
		if reason == "" {
			reason = strings.TrimSpace(req.Reason)
		}
		inst.ExtensionReason = &reason
		if inst.Status == "breached" && targetDue.After(now) {
			inst.Status = "active"
			inst.BreachedAt = nil
		}
		inst.Version++
		if err := e.store.updateInstance(ctx, inst); err != nil {
			return nil, false, err
		}
		_, err = e.store.insertEvent(ctx, &slaEvent{
			SLAInstanceID:  inst.ID,
			ComplaintID:    complaintID,
			IdempotencyKey: req.IdempotencyKey,
			EventType:      "extended",
			Actor:          actor,
			PreviousStatus: &prev,
			NewStatus:      inst.Status,
			PreviousDueAt:  &prevDue,
			NewDueAt:       targetDue,
			LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
			Details:        map[string]any{"reason": reason, "maxAllowedDueAt": maxDue},
			OccurredAt:     now,
		})
		if err != nil {
			return nil, false, err
		}
	case "resolve_substantively":
		for i := range instances {
			inst := &instances[i]
			if inst.Status == "active" || inst.Status == "paused" || inst.Status == "breached" {
				if err := e.completeClock(ctx, inst, now, actor, req.IdempotencyKey+":"+inst.RuleCode); err != nil {
					return nil, false, err
				}
			}
		}
		if err := e.store.setComplaintResolutionState(ctx, complaintID, "substantively_resolved"); err != nil {
			return nil, false, err
		}
	case "close_administratively":
		inst := e.findTargetClock(instances, req.RuleCode, "citizen_action")
		if inst == nil || inst.BreachAction != "administrative_closure_eligible" {
			return nil, false, errRuleNotPermitted
		}
		prev := inst.Status
		inst.Status = "administratively_closed"
		inst.CompletedAt = &now
		inst.Version++
		if err := e.store.updateInstance(ctx, inst); err != nil {
			return nil, false, err
		}
		_, err = e.store.insertEvent(ctx, &slaEvent{
			SLAInstanceID:  inst.ID,
			ComplaintID:    complaintID,
			IdempotencyKey: req.IdempotencyKey,
			EventType:      "administratively_closed",
			Actor:          actor,
			PreviousStatus: &prev,
			NewStatus:      "administratively_closed",
			PreviousDueAt:  &inst.DueAt,
			NewDueAt:       inst.DueAt,
			LegalBasis:     fmt.Sprintf("%s (%s)", inst.LegalBasis, inst.ArticleReference),
			Details:        map[string]any{"reason": req.Reason},
			OccurredAt:     now,
		})
		if err != nil {
			return nil, false, err
		}
		if err := e.store.setComplaintResolutionState(ctx, complaintID, "administratively_closed"); err != nil {
			return nil, false, err
		}
	default:
		return nil, false, errInvalidSLATransition
	}

	summary, err := e.getComplaintSLA(ctx, complaintID)
	return summary, false, err
}

func (e *slaEngine) getComplaintSLA(ctx context.Context, complaintID string) (*complaintSLASummary, error) {
	meta, err := e.store.loadComplaintMeta(ctx, complaintID)
	if err != nil {
		return nil, err
	}
	now := e.now()
	pv, _, _, err := e.loadPolicyContext(ctx, meta, meta.CreatedAt)
	if err != nil {
		return nil, err
	}
	instances, err := e.store.loadInstances(ctx, complaintID)
	if err != nil {
		return nil, err
	}
	if err := e.evaluateBreaches(ctx, meta, instances, now); err != nil {
		return nil, err
	}
	events, err := e.store.loadEvents(ctx, complaintID)
	if err != nil {
		return nil, err
	}

	views := make([]slaClockView, 0, len(instances))
	activeViews := []slaClockView{}
	approvedExtensions := []slaClockView{}
	var responseClock, resolutionClock, citizenClock *slaClockView
	overallCompliance := "on_track"
	approachingAny := false
	overdueAny := false
	citizenActionRequired := false
	var citizenStage *string
	currentStage := "submitted"
	responsibleActor := "operator"
	responsibleAgency := meta.AgencyLabel

	for i := range instances {
		inst := &instances[i]
		remaining := inst.DueAt.Sub(now)
		approaching := isApproachingDeadline(inst, now)
		overdue := inst.Status == "breached" || (inst.Status == "active" && remaining <= 0)
		compliance := "on_track"
		switch inst.Status {
		case "completed":
			compliance = "completed"
		case "paused":
			compliance = "paused"
		case "administratively_closed":
			compliance = "administratively_closed"
		case "breached":
			compliance = "breached"
		default:
			if overdue {
				compliance = "breached"
			} else if approaching {
				compliance = "approaching_deadline"
			}
		}
		v := slaClockView{
			InstanceID:         inst.ID,
			RuleCode:           inst.RuleCode,
			RuleName:           inst.RuleName,
			WorkflowStage:      inst.WorkflowStage,
			DeadlineKind:       inst.DeadlineKind,
			ComplaintType:      inst.ComplaintType,
			ResponsibleActor:   inst.ResponsibleActor,
			AssignedAgency:     inst.AssignedAgencyLabel,
			TriggeringEvent:    inst.TriggeringEvent,
			StartedAt:          inst.StartedAt,
			OriginalDueAt:      inst.OriginalDueAt,
			DueAt:              inst.DueAt,
			RemainingSeconds:   int64(remaining.Seconds()),
			RemainingDisplay:   formatRemainingSLA(remaining, inst.TimeUnit, inst.Status),
			DurationValue:      inst.DurationValue,
			TimeUnit:           inst.TimeUnit,
			Status:             inst.Status,
			ComplianceStatus:   compliance,
			ApproachingWarning: approaching,
			Overdue:            overdue,
			PausedAt:           inst.PausedAt,
			TotalPausedSeconds: inst.TotalPausedSeconds,
			ExtensionCount:     inst.ExtensionCount,
			ExtendedUntil:      inst.ExtendedUntil,
			ExtensionReason:    inst.ExtensionReason,
			ExtensionPermitted: inst.ExtensionPermitted,
			PausePermitted:     inst.PausePermitted,
			EscalationTarget:   inst.EscalationTarget,
			LegalBasis:         inst.LegalBasis,
			ArticleReference:   inst.ArticleReference,
			CompletedAt:        inst.CompletedAt,
			BreachedAt:         inst.BreachedAt,
		}
		views = append(views, v)
		if inst.ExtensionCount > 0 {
			approvedExtensions = append(approvedExtensions, v)
		}
		if inst.Status == "active" || inst.Status == "paused" || inst.Status == "breached" {
			activeViews = append(activeViews, v)
			currentStage = inst.WorkflowStage
			responsibleActor = inst.ResponsibleActor
			if inst.AssignedAgencyLabel != nil {
				responsibleAgency = inst.AssignedAgencyLabel
			}
		}
		if approaching {
			approachingAny = true
		}
		if overdue {
			overdueAny = true
		}
		if inst.DeadlineKind == "response" && (responseClock == nil || inst.Status == "active" || inst.Status == "breached") {
			c := v
			responseClock = &c
		}
		if inst.DeadlineKind == "resolution" && (resolutionClock == nil || inst.Status == "active" || inst.Status == "breached") {
			c := v
			resolutionClock = &c
		}
		if inst.DeadlineKind == "citizen_action" && (inst.Status == "active" || inst.Status == "breached") {
			c := v
			citizenClock = &c
			citizenActionRequired = true
			st := inst.WorkflowStage
			citizenStage = &st
		}
	}

	if meta.ResolutionState == "substantively_resolved" {
		overallCompliance = "completed"
		currentStage = "substantively_resolved"
	} else if meta.ResolutionState == "administratively_closed" {
		overallCompliance = "administratively_closed"
		currentStage = "administratively_closed"
	} else if overdueAny {
		overallCompliance = "breached"
	} else if approachingAny {
		overallCompliance = "approaching_deadline"
	} else if len(activeViews) == 0 && len(views) > 0 {
		overallCompliance = "completed"
	}

	return &complaintSLASummary{
		ComplaintID:                meta.ComplaintID,
		MunicipalityID:             meta.MunicipalityID,
		MunicipalityName:           pv.MunicipalityName,
		PolicyCode:                 pv.PolicyCode,
		PolicyVersion:              pv.VersionNumber,
		RegulationTitle:            pv.RegulationTitle,
		Timezone:                   slaTimezoneName,
		CurrentStage:               currentStage,
		ComplaintType:              meta.ComplaintType,
		ResolutionState:            meta.ResolutionState,
		ResponsibleActor:           responsibleActor,
		ResponsibleAgency:          responsibleAgency,
		CitizenActionRequired:      citizenActionRequired,
		CitizenActionStage:         citizenStage,
		CitizenActionDeadline:      citizenClock,
		OverallComplianceStatus:    overallCompliance,
		ApproachingDeadlineWarning: approachingAny,
		Overdue:                    overdueAny,
		ResponseDeadline:           responseClock,
		ResolutionDeadline:         resolutionClock,
		ActiveClocks:               activeViews,
		Clocks:                     views,
		ApprovedExtensions:         approvedExtensions,
		Events:                     events,
		GracePrediction: gracePredictionDisclaimer{
			PredictedResolutionRisk:        "research_target_gt_7d_independent",
			StatutoryComplianceIndependent: true,
			Note:                           "GRACE-LAKSA >7d resolution prediction is a research target only and is never treated as statutory SLA compliance.",
		},
	}, nil
}

// ============================================================================
// PostgreSQL SLA Store Implementation
// ============================================================================

type pgSLAStore struct {
	db *pgxpool.Pool
}

func (s *pgSLAStore) loadComplaintMeta(ctx context.Context, complaintID string) (*slaComplaintMeta, error) {
	var m slaComplaintMeta
	err := s.db.QueryRow(ctx, `
		SELECT c.id::text, c.municipalityId::text, c.complaint_type, c.resolution_state,
		       c.policy_version_id::text, c.agencyId::text, a.label, c.createdAt
		FROM laksaComplaints c
		LEFT JOIN laksaAgencies a ON a.id = c.agencyId
		WHERE c.id = $1`, complaintID).Scan(
		&m.ComplaintID, &m.MunicipalityID, &m.ComplaintType, &m.ResolutionState,
		&m.PolicyVersionID, &m.AgencyID, &m.AgencyLabel, &m.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errSLANotFound
	}
	return &m, err
}

func (s *pgSLAStore) pinPolicyVersion(ctx context.Context, complaintID, policyVersionID, complaintType string) error {
	_, err := s.db.Exec(ctx, `UPDATE laksaComplaints SET policy_version_id=$2, complaint_type=$3, updatedAt=now() WHERE id=$1`, complaintID, policyVersionID, complaintType)
	return err
}

func (s *pgSLAStore) setComplaintResolutionState(ctx context.Context, complaintID, resolutionState string) error {
	_, err := s.db.Exec(ctx, `UPDATE laksaComplaints SET resolution_state=$2, updatedAt=now() WHERE id=$1`, complaintID, resolutionState)
	return err
}

func (s *pgSLAStore) setComplaintStatusAndAgency(ctx context.Context, complaintID, status string, agencyID *string) error {
	_, err := s.db.Exec(ctx, `UPDATE laksaComplaints SET status=$2, agencyId=$3, updatedAt=now() WHERE id=$1`, complaintID, status, agencyID)
	return err
}

func (s *pgSLAStore) findActivePolicyVersion(ctx context.Context, municipalityID string, at time.Time) (*slaPolicyVersion, error) {
	localDate := at.In(jakartaLocation()).Format("2006-01-02")
	var pv slaPolicyVersion
	err := s.db.QueryRow(ctx, `
		SELECT pv.id::text, p.id::text, p.municipality_id::text, p.municipality_name,
		       p.code, p.regulation_title, p.regulation_number, p.source_url,
		       pv.calendar_id::text, pv.version_number, pv.effective_from, pv.effective_to,
		       pv.verification_status, pv.is_active
		FROM sla_policy_versions pv
		JOIN sla_policies p ON p.id = pv.policy_id
		WHERE p.municipality_id = $1
		  AND pv.is_active = true
		  AND pv.verification_status = 'verified'
		  AND pv.effective_from <= $2::date
		  AND (pv.effective_to IS NULL OR pv.effective_to >= $2::date)
		ORDER BY pv.version_number DESC
		LIMIT 1`, municipalityID, localDate).Scan(
		&pv.ID, &pv.PolicyID, &pv.MunicipalityID, &pv.MunicipalityName,
		&pv.PolicyCode, &pv.RegulationTitle, &pv.RegulationNumber, &pv.SourceURL,
		&pv.CalendarID, &pv.VersionNumber, &pv.EffectiveFrom, &pv.EffectiveTo,
		&pv.VerificationStatus, &pv.IsActive,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("no verified active sla policy version for municipality")
	}
	return &pv, err
}

func (s *pgSLAStore) loadPolicyVersionByID(ctx context.Context, policyVersionID string) (*slaPolicyVersion, error) {
	var pv slaPolicyVersion
	err := s.db.QueryRow(ctx, `
		SELECT pv.id::text, p.id::text, p.municipality_id::text, p.municipality_name,
		       p.code, p.regulation_title, p.regulation_number, p.source_url,
		       pv.calendar_id::text, pv.version_number, pv.effective_from, pv.effective_to,
		       pv.verification_status, pv.is_active
		FROM sla_policy_versions pv
		JOIN sla_policies p ON p.id = pv.policy_id
		WHERE pv.id = $1`, policyVersionID).Scan(
		&pv.ID, &pv.PolicyID, &pv.MunicipalityID, &pv.MunicipalityName,
		&pv.PolicyCode, &pv.RegulationTitle, &pv.RegulationNumber, &pv.SourceURL,
		&pv.CalendarID, &pv.VersionNumber, &pv.EffectiveFrom, &pv.EffectiveTo,
		&pv.VerificationStatus, &pv.IsActive,
	)
	return &pv, err
}

func (s *pgSLAStore) loadCalendar(ctx context.Context, calendarID string) (*slaCalendar, error) {
	var cal slaCalendar
	err := s.db.QueryRow(ctx, `SELECT id::text, municipality_id::text, code, name, timezone, working_days FROM sla_calendars WHERE id=$1`, calendarID).Scan(
		&cal.ID, &cal.MunicipalityID, &cal.Code, &cal.Name, &cal.Timezone, &cal.WorkingDays,
	)
	if err != nil {
		return nil, err
	}
	cal.Exceptions = map[string]bool{}
	rows, err := s.db.Query(ctx, `SELECT to_char(exception_date, 'YYYY-MM-DD'), is_working_day FROM sla_calendar_exceptions WHERE calendar_id=$1`, calendarID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var d string
		var w bool
		if err := rows.Scan(&d, &w); err != nil {
			return nil, err
		}
		cal.Exceptions[d] = w
	}
	return &cal, rows.Err()
}

func (s *pgSLAStore) loadRules(ctx context.Context, policyVersionID string) ([]slaRule, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id::text, policy_version_id::text, municipality_id::text, rule_code, rule_name,
		       complaint_type, workflow_stage, deadline_kind, responsible_actor,
		       duration_value, time_unit, start_event, completion_event,
		       pause_permitted, pause_conditions, extension_permitted, max_extension_value,
		       extension_time_unit, extension_conditions, reset_on_return, breach_action,
		       escalation_target, legal_basis, article_reference, effective_date, verification_status, notes
		FROM sla_rules
		WHERE policy_version_id = $1
		ORDER BY rule_code ASC`, policyVersionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rules := []slaRule{}
	for rows.Next() {
		var r slaRule
		if err := rows.Scan(
			&r.ID, &r.PolicyVersionID, &r.MunicipalityID, &r.RuleCode, &r.RuleName,
			&r.ComplaintType, &r.WorkflowStage, &r.DeadlineKind, &r.ResponsibleActor,
			&r.DurationValue, &r.TimeUnit, &r.StartEvent, &r.CompletionEvent,
			&r.PausePermitted, &r.PauseConditions, &r.ExtensionPermitted, &r.MaxExtensionValue,
			&r.ExtensionTimeUnit, &r.ExtensionConditions, &r.ResetOnReturn, &r.BreachAction,
			&r.EscalationTarget, &r.LegalBasis, &r.ArticleReference, &r.EffectiveDate, &r.VerificationStatus, &r.Notes,
		); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, rows.Err()
}

func (s *pgSLAStore) loadInstances(ctx context.Context, complaintID string) ([]slaInstance, error) {
	rows, err := s.db.Query(ctx, `
		SELECT i.id::text, i.complaint_id::text, i.policy_version_id::text, i.rule_id::text,
		       i.rule_code, r.rule_name, i.workflow_stage, i.deadline_kind, i.complaint_type,
		       i.responsible_actor, i.assigned_agency_id::text, i.assigned_agency_label,
		       i.triggering_event, i.duration_value, i.time_unit, i.legal_basis, i.article_reference,
		       i.started_at, i.original_due_at, i.due_at, i.paused_at, i.total_paused_seconds,
		       i.extension_count, i.extended_until, i.extension_reason, i.status,
		       i.completed_at, i.breached_at, i.escalation_target, r.breach_action,
		       r.extension_permitted, r.pause_permitted, r.max_extension_value, r.extension_time_unit, i.version
		FROM complaint_sla_instances i
		JOIN sla_rules r ON r.id = i.rule_id
		WHERE i.complaint_id = $1
		ORDER BY i.started_at ASC, i.created_at ASC`, complaintID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []slaInstance{}
	for rows.Next() {
		var inst slaInstance
		if err := rows.Scan(
			&inst.ID, &inst.ComplaintID, &inst.PolicyVersionID, &inst.RuleID,
			&inst.RuleCode, &inst.RuleName, &inst.WorkflowStage, &inst.DeadlineKind, &inst.ComplaintType,
			&inst.ResponsibleActor, &inst.AssignedAgencyID, &inst.AssignedAgencyLabel,
			&inst.TriggeringEvent, &inst.DurationValue, &inst.TimeUnit, &inst.LegalBasis, &inst.ArticleReference,
			&inst.StartedAt, &inst.OriginalDueAt, &inst.DueAt, &inst.PausedAt, &inst.TotalPausedSeconds,
			&inst.ExtensionCount, &inst.ExtendedUntil, &inst.ExtensionReason, &inst.Status,
			&inst.CompletedAt, &inst.BreachedAt, &inst.EscalationTarget, &inst.BreachAction,
			&inst.ExtensionPermitted, &inst.PausePermitted, &inst.MaxExtensionValue, &inst.ExtensionTimeUnit, &inst.Version,
		); err != nil {
			return nil, err
		}
		list = append(list, inst)
	}
	return list, rows.Err()
}

func (s *pgSLAStore) loadEvents(ctx context.Context, complaintID string) ([]slaEvent, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, sla_instance_id::text, complaint_id::text, idempotency_key,
		       event_type, actor, previous_status, new_status, previous_due_at, new_due_at,
		       legal_basis, details, occurred_at
		FROM complaint_sla_events
		WHERE complaint_id = $1
		ORDER BY occurred_at ASC, id ASC`, complaintID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []slaEvent{}
	for rows.Next() {
		var ev slaEvent
		if err := rows.Scan(
			&ev.ID, &ev.SLAInstanceID, &ev.ComplaintID, &ev.IdempotencyKey,
			&ev.EventType, &ev.Actor, &ev.PreviousStatus, &ev.NewStatus, &ev.PreviousDueAt, &ev.NewDueAt,
			&ev.LegalBasis, &ev.Details, &ev.OccurredAt,
		); err != nil {
			return nil, err
		}
		events = append(events, ev)
	}
	return events, rows.Err()
}

func (s *pgSLAStore) insertInstance(ctx context.Context, inst *slaInstance) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO complaint_sla_instances (
			id, complaint_id, policy_version_id, rule_id, rule_code, workflow_stage,
			deadline_kind, complaint_type, responsible_actor, assigned_agency_id, assigned_agency_label,
			triggering_event, duration_value, time_unit, legal_basis, article_reference,
			started_at, original_due_at, due_at, paused_at, total_paused_seconds,
			extension_count, extended_until, extension_reason, status, completed_at, breached_at,
			escalation_target, version
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
		) ON CONFLICT (complaint_id, rule_id, started_at) DO NOTHING`,
		inst.ID, inst.ComplaintID, inst.PolicyVersionID, inst.RuleID, inst.RuleCode, inst.WorkflowStage,
		inst.DeadlineKind, inst.ComplaintType, inst.ResponsibleActor, inst.AssignedAgencyID, inst.AssignedAgencyLabel,
		inst.TriggeringEvent, inst.DurationValue, inst.TimeUnit, inst.LegalBasis, inst.ArticleReference,
		inst.StartedAt, inst.OriginalDueAt, inst.DueAt, inst.PausedAt, inst.TotalPausedSeconds,
		inst.ExtensionCount, inst.ExtendedUntil, inst.ExtensionReason, inst.Status, inst.CompletedAt, inst.BreachedAt,
		inst.EscalationTarget, inst.Version,
	)
	return err
}

func (s *pgSLAStore) updateInstance(ctx context.Context, inst *slaInstance) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE complaint_sla_instances
		SET assigned_agency_id=$2, assigned_agency_label=$3, due_at=$4, paused_at=$5,
		    total_paused_seconds=$6, extension_count=$7, extended_until=$8, extension_reason=$9,
		    status=$10, completed_at=$11, breached_at=$12, version=$13, updated_at=now()
		WHERE id=$1 AND version=$14`,
		inst.ID, inst.AssignedAgencyID, inst.AssignedAgencyLabel, inst.DueAt, inst.PausedAt,
		inst.TotalPausedSeconds, inst.ExtensionCount, inst.ExtendedUntil, inst.ExtensionReason,
		inst.Status, inst.CompletedAt, inst.BreachedAt, inst.Version, inst.Version-1,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("concurrent sla update detected")
	}
	return nil
}

func (s *pgSLAStore) insertEvent(ctx context.Context, ev *slaEvent) (bool, error) {
	detailsJSON, _ := json.Marshal(ev.Details)
	var id int64
	err := s.db.QueryRow(ctx, `
		INSERT INTO complaint_sla_events (
			sla_instance_id, complaint_id, idempotency_key, event_type, actor,
			previous_status, new_status, previous_due_at, new_due_at, legal_basis, details, occurred_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
		ON CONFLICT (sla_instance_id, idempotency_key) DO NOTHING
		RETURNING id`,
		ev.SLAInstanceID, ev.ComplaintID, ev.IdempotencyKey, ev.EventType, ev.Actor,
		ev.PreviousStatus, ev.NewStatus, ev.PreviousDueAt, ev.NewDueAt, ev.LegalBasis, string(detailsJSON), ev.OccurredAt,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	ev.ID = id
	return err == nil, err
}

// ============================================================================
// HTTP Handlers for SLA Endpoints
// ============================================================================

func (w *workflow) getComplaintSLAHandler(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok {
		http.Error(rw, "unauthorized", http.StatusUnauthorized)
		return
	}
	cid := r.PathValue("complaintId")
	if cid == "" {
		cid = r.PathValue("id")
	}
	if _, err := uuid.Parse(cid); err != nil {
		http.NotFound(rw, r)
		return
	}
	isStaff := false
	if id.AuthorizedParty == "internalWeb" {
		for _, role := range id.RealmAccess.Roles {
			if role == "operator" || role == "opdStaff" || role == "admin" {
				isStaff = true
				break
			}
		}
	}
	if !isStaff {
		if id.AuthorizedParty != "citizenWeb" {
			http.Error(rw, "forbidden", http.StatusForbidden)
			return
		}
		var allowed bool
		err := w.db.QueryRow(r.Context(), `SELECT (citizenSubject=$2 OR isPublic=true) FROM laksaComplaints WHERE id=$1`, cid, id.Subject).Scan(&allowed)
		if errors.Is(err, pgx.ErrNoRows) || !allowed {
			http.NotFound(rw, r)
			return
		}
		if err != nil {
			http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
			return
		}
	}
	summary, err := w.sla.getComplaintSLA(r.Context(), cid)
	if errors.Is(err, errSLANotFound) {
		http.NotFound(rw, r)
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(rw, http.StatusOK, summary)
}

func (w *workflow) postSLAEventHandler(rw http.ResponseWriter, r *http.Request) {
	id, ok := r.Context().Value(identityKey{}).(*identity)
	if !ok {
		http.Error(rw, "unauthorized", http.StatusUnauthorized)
		return
	}
	cid := r.PathValue("id")
	if _, err := uuid.Parse(cid); err != nil {
		http.NotFound(rw, r)
		return
	}
	var req slaActionRequest
	decoder := json.NewDecoder(http.MaxBytesReader(rw, r.Body, 16384))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(rw, "invalid sla event payload", http.StatusBadRequest)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		http.Error(rw, "invalid sla event payload", http.StatusBadRequest)
		return
	}
	if req.IdempotencyKey == "" {
		req.IdempotencyKey = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	if len(req.IdempotencyKey) < 8 || len(req.IdempotencyKey) > 128 {
		http.Error(rw, "invalid idempotency key", http.StatusBadRequest)
		return
	}
	req.Actor = id.Subject

	// Enforce citizen-only action restrictions when called from /api/citizen/
	if r.PathValue("app") == "citizen" {
		if req.Action != "submit_citizen_info" && req.Action != "submit_citizen_followup" {
			http.Error(rw, "forbidden", http.StatusForbidden)
			return
		}
		var isOwner bool
		err := w.db.QueryRow(r.Context(), `SELECT citizenSubject=$2 FROM laksaComplaints WHERE id=$1`, cid, id.Subject).Scan(&isOwner)
		if errors.Is(err, pgx.ErrNoRows) || !isOwner {
			http.Error(rw, "forbidden", http.StatusForbidden)
			return
		}
	}

	summary, replayed, err := w.sla.applyAction(r.Context(), cid, req)
	if errors.Is(err, errSLANotFound) {
		http.NotFound(rw, r)
		return
	}
	if errors.Is(err, errRuleNotPermitted) || errors.Is(err, errExtensionExceeded) || errors.Is(err, errInvalidSLATransition) || errors.Is(err, errNoActiveClock) {
		http.Error(rw, err.Error(), http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	writeJSON(rw, http.StatusOK, map[string]any{
		"replayed": replayed,
		"sla":      summary,
	})
}

func (w *workflow) listSLAPoliciesHandler(rw http.ResponseWriter, r *http.Request) {
	rows, err := w.db.Query(r.Context(), `
		SELECT p.municipality_id::text, p.municipality_name, p.code, p.regulation_title,
		       p.regulation_number, p.source_url, pv.id::text, pv.version_number,
		       pv.effective_from, pv.verification_status, pv.is_active
		FROM sla_policies p
		JOIN sla_policy_versions pv ON pv.policy_id = p.id
		ORDER BY p.municipality_name ASC, pv.version_number DESC`)
	if err != nil {
		http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer rows.Close()
	policies := []map[string]any{}
	for rows.Next() {
		var munID, munName, code, title, regNum, srcURL, pvID, verStatus string
		var verNum int
		var effFrom time.Time
		var active bool
		if err := rows.Scan(&munID, &munName, &code, &title, &regNum, &srcURL, &pvID, &verNum, &effFrom, &verStatus, &active); err != nil {
			http.Error(rw, "service unavailable", http.StatusServiceUnavailable)
			return
		}
		rules, _ := w.sla.store.loadRules(r.Context(), pvID)
		sort.Slice(rules, func(i, j int) bool { return rules[i].RuleCode < rules[j].RuleCode })
		policies = append(policies, map[string]any{
			"municipalityId":     munID,
			"municipalityName":   munName,
			"policyCode":         code,
			"regulationTitle":    title,
			"regulationNumber":   regNum,
			"sourceUrl":          srcURL,
			"policyVersionId":    pvID,
			"versionNumber":      verNum,
			"effectiveFrom":      effFrom,
			"verificationStatus": verStatus,
			"isActive":           active,
			"rules":              rules,
		})
	}
	writeJSON(rw, http.StatusOK, map[string]any{"policies": policies})
}
