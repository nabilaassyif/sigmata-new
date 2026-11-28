export type AccountStatus = 'pending_onboarding' | 'active' | 'suspended' | 'deactivated';
export type PreferredLanguage = 'id' | 'en';

export interface NotificationPreferences {
  inApp: boolean;
  email: boolean;
  push: boolean;
  slaAlerts: boolean;
  statusUpdates: boolean;
  corroborationAlerts: boolean;
}

export interface CitizenProfile {
  id: string;
  identitySubject: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  municipalityCode: string;
  districtCode: string | null;
  subdistrictCode: string | null;
  preferredLanguage: PreferredLanguage;
  notificationPreferences: NotificationPreferences;
  accountStatus: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CitizenComplaintStats {
  totalSubmitted: number;
  pendingCount: number;
  awaitingOperatorCount: number;
  forwardedCount: number;
  resolvedCount: number;
  totalUpvotesReceived: number;
  totalCorroborationsGiven: number;
}

export interface GovernmentOperatorProfile {
  id: string;
  identitySubject: string;
  fullName: string;
  email: string;
  employeeNumber: string | null;
  agencyId: string;
  agencyLabel: string | null;
  municipalityCode: string;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  officialPhoneNumber: string | null;
  avatarUrl: string | null;
  accountStatus: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorComplaintStats {
  awaitingReviewCount: number;
  agencyAssignedCount: number;
  decisionsMadeByOperator: number;
  overdueSlaCount: number;
}

export interface IdentityBoundarySummary {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  preferredUsername: string;
  roles: string[];
}

export interface SourceOfTruthBoundaries {
  credentials: 'Keycloak';
  emailVerification: 'Keycloak';
  authenticationRoles: 'Keycloak';
  resourceAuthorization: 'Go';
  citizenProfile: 'PostgreSQL';
  governmentAffiliation: 'PostgreSQL';
  complaintStatistics: 'Derived SQL queries';
  notificationPreferences: 'PostgreSQL';
  complaintIncidentLocation: 'PostGIS';
}
