CREATE TABLE IF NOT EXISTS laksaAgencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label text NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS laksaCategories (
    label text PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS laksaComplaints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    citizenSubject text NOT NULL,
    idempotencyKey text NOT NULL,
    requestHash text NOT NULL,
    municipalityId uuid NOT NULL,
    description text NOT NULL CHECK (length(description) BETWEEN 1 AND 10000),
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    photoKey text,
    photoMime text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','awaitingOperator','forwarded')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    nextAttemptAt timestamptz NOT NULL DEFAULT now(),
    leaseId uuid,
    leaseUntil timestamptz,
    categoryLabel text,
    agencyId uuid REFERENCES laksaAgencies(id),
    suggestedCategory text,
    suggestedAgency text,
    suggestionSource text,
    score double precision CHECK (score BETWEEN 0 AND 1),
    reviewReason text,
    createdAt timestamptz NOT NULL DEFAULT now(),
    updatedAt timestamptz NOT NULL DEFAULT now(),
    operatorStartedAt timestamptz,
    forwardedAt timestamptz,
    UNIQUE (citizenSubject, idempotencyKey),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK ((photoKey IS NULL) = (photoMime IS NULL)),
    CHECK (status <> 'forwarded' OR (agencyId IS NOT NULL AND categoryLabel IS NOT NULL AND forwardedAt IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS laksaComplaintsPendingIdx ON laksaComplaints (status, updatedAt);
CREATE TABLE IF NOT EXISTS laksaComplaintEvents (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    complaintId uuid NOT NULL REFERENCES laksaComplaints(id),
    eventType text NOT NULL,
    actor text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    createdAt timestamptz NOT NULL DEFAULT now()
);
