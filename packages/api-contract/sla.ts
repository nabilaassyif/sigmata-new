export type SlaTimeUnit = 'hours' | 'calendar_days' | 'working_days';
export type SlaDeadlineKind = 'response' | 'resolution' | 'citizen_action';
export type SlaClockStatus = 'active' | 'paused' | 'completed' | 'breached' | 'administratively_closed';
export type SlaComplianceStatus = 'on_track' | 'approaching_deadline' | 'breached' | 'completed' | 'paused' | 'administratively_closed';
export type ComplaintResolutionState = 'open' | 'substantively_resolved' | 'administratively_closed';

export interface SlaClock {
  instanceId: string;
  ruleCode: string;
  ruleName: string;
  workflowStage: string;
  deadlineKind: SlaDeadlineKind;
  complaintType: string;
  responsibleActor: string;
  assignedAgency: string | null;
  triggeringEvent: string;
  startedAt: string;
  originalDueAt: string;
  dueAt: string;
  remainingSeconds: number;
  remainingDisplay: string;
  durationValue: number;
  timeUnit: SlaTimeUnit;
  status: SlaClockStatus;
  complianceStatus: SlaComplianceStatus;
  approachingWarning: boolean;
  overdue: boolean;
  pausedAt: string | null;
  totalPausedSeconds: number;
  extensionCount: number;
  extendedUntil: string | null;
  extensionReason: string | null;
  extensionPermitted: boolean;
  pausePermitted: boolean;
  escalationTarget: string;
  legalBasis: string;
  articleReference: string;
  completedAt: string | null;
  breachedAt: string | null;
}

export interface SlaEvent {
  id: number;
  slaInstanceId: string;
  complaintId: string;
  idempotencyKey: string;
  eventType: string;
  actor: string;
  previousStatus: string | null;
  newStatus: string;
  previousDueAt: string | null;
  newDueAt: string;
  legalBasis: string;
  details: Record<string, unknown>;
  occurredAt: string;
}

export interface GracePredictionDisclaimer {
  predictedResolutionRisk: string;
  statutoryComplianceIndependent: true;
  note: string;
}

export interface ComplaintSlaSummary {
  complaintId: string;
  municipalityId: string;
  municipalityName: string;
  policyCode: string;
  policyVersion: number;
  regulationTitle: string;
  timezone: 'Asia/Jakarta';
  currentStage: string;
  complaintType: string;
  resolutionState: ComplaintResolutionState;
  responsibleActor: string;
  responsibleAgency: string | null;
  citizenActionRequired: boolean;
  citizenActionStage: string | null;
  citizenActionDeadline: SlaClock | null;
  overallComplianceStatus: SlaComplianceStatus;
  approachingDeadlineWarning: boolean;
  overdue: boolean;
  responseDeadline: SlaClock | null;
  resolutionDeadline: SlaClock | null;
  activeClocks: SlaClock[];
  clocks: SlaClock[];
  approvedExtensions: SlaClock[];
  events: SlaEvent[];
  gracePrediction: GracePredictionDisclaimer;
}
