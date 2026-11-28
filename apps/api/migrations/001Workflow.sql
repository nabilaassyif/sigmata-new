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
    isPublic boolean NOT NULL DEFAULT true,
    district text NOT NULL DEFAULT '',
    city text NOT NULL DEFAULT '',
    upvoteCount integer NOT NULL DEFAULT 1 CHECK (upvoteCount >= 0),
    corroborationCount integer NOT NULL DEFAULT 0 CHECK (corroborationCount >= 0),
    priorityScore double precision NOT NULL DEFAULT 1.0,
    slaDueAt timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
    UNIQUE (citizenSubject, idempotencyKey),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK ((photoKey IS NULL) = (photoMime IS NULL)),
    CHECK (status <> 'forwarded' OR (agencyId IS NOT NULL AND categoryLabel IS NOT NULL AND forwardedAt IS NOT NULL))
);
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS isPublic boolean NOT NULL DEFAULT true;
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS district text NOT NULL DEFAULT '';
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS upvoteCount integer NOT NULL DEFAULT 1;
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS corroborationCount integer NOT NULL DEFAULT 0;
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS priorityScore double precision NOT NULL DEFAULT 1.0;
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS slaDueAt timestamptz NOT NULL DEFAULT (now() + interval '72 hours');
CREATE INDEX IF NOT EXISTS laksaComplaintsPendingIdx ON laksaComplaints (status, updatedAt);
CREATE INDEX IF NOT EXISTS laksaComplaintsPriorityIdx ON laksaComplaints (status, priorityScore DESC, slaDueAt ASC);
CREATE TABLE IF NOT EXISTS laksaComplaintUpvotes (
    complaintId uuid NOT NULL REFERENCES laksaComplaints(id) ON DELETE CASCADE,
    citizenSubject text NOT NULL,
    createdAt timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (complaintId, citizenSubject)
);
CREATE TABLE IF NOT EXISTS laksaComplaintCorroborations (
    complaintId uuid NOT NULL REFERENCES laksaComplaints(id) ON DELETE CASCADE,
    citizenSubject text NOT NULL,
    note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    distanceMeters double precision,
    createdAt timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (complaintId, citizenSubject),
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE TABLE IF NOT EXISTS laksaComplaintEvents (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    complaintId uuid NOT NULL REFERENCES laksaComplaints(id),
    eventType text NOT NULL,
    actor text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    createdAt timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Regulation-Aware SLA Engine Tables (snake_case identifiers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sla_calendars (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    municipality_id uuid NOT NULL UNIQUE,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    timezone text NOT NULL DEFAULT 'Asia/Jakarta',
    working_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sla_calendar_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id uuid NOT NULL REFERENCES sla_calendars(id) ON DELETE CASCADE,
    exception_date date NOT NULL,
    description text NOT NULL,
    is_working_day boolean NOT NULL DEFAULT false,
    UNIQUE (calendar_id, exception_date)
);

CREATE TABLE IF NOT EXISTS sla_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    municipality_id uuid NOT NULL,
    code text NOT NULL UNIQUE,
    municipality_name text NOT NULL,
    regulation_title text NOT NULL,
    regulation_number text NOT NULL,
    source_url text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sla_policy_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id uuid NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
    calendar_id uuid NOT NULL REFERENCES sla_calendars(id),
    version_number integer NOT NULL CHECK (version_number >= 1),
    effective_from date NOT NULL,
    effective_to date,
    verification_status text NOT NULL CHECK (verification_status IN ('draft','verified','superseded')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (policy_id, version_number)
);

CREATE TABLE IF NOT EXISTS sla_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_version_id uuid NOT NULL REFERENCES sla_policy_versions(id) ON DELETE CASCADE,
    municipality_id uuid NOT NULL,
    rule_code text NOT NULL,
    rule_name text NOT NULL,
    complaint_type text NOT NULL,
    workflow_stage text NOT NULL,
    deadline_kind text NOT NULL CHECK (deadline_kind IN ('response','resolution','citizen_action')),
    responsible_actor text NOT NULL,
    duration_value integer NOT NULL CHECK (duration_value > 0),
    time_unit text NOT NULL CHECK (time_unit IN ('hours','calendar_days','working_days')),
    start_event text NOT NULL,
    completion_event text NOT NULL,
    pause_permitted boolean NOT NULL DEFAULT false,
    pause_conditions text[] NOT NULL DEFAULT '{}',
    extension_permitted boolean NOT NULL DEFAULT false,
    max_extension_value integer,
    extension_time_unit text CHECK (extension_time_unit IN ('hours','calendar_days','working_days')),
    extension_conditions text NOT NULL DEFAULT '',
    reset_on_return boolean NOT NULL DEFAULT false,
    breach_action text NOT NULL DEFAULT 'escalate' CHECK (breach_action IN ('escalate','administrative_closure_eligible')),
    escalation_target text NOT NULL DEFAULT '',
    legal_basis text NOT NULL,
    article_reference text NOT NULL,
    effective_date date NOT NULL,
    verification_status text NOT NULL CHECK (verification_status IN ('draft','verified')),
    notes text NOT NULL DEFAULT '',
    UNIQUE (policy_version_id, rule_code)
);

ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS policy_version_id uuid REFERENCES sla_policy_versions(id);
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS complaint_type text NOT NULL DEFAULT 'non_oversight';
ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS resolution_state text NOT NULL DEFAULT 'open';

CREATE TABLE IF NOT EXISTS complaint_sla_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id uuid NOT NULL REFERENCES laksaComplaints(id) ON DELETE CASCADE,
    policy_version_id uuid NOT NULL REFERENCES sla_policy_versions(id),
    rule_id uuid NOT NULL REFERENCES sla_rules(id),
    rule_code text NOT NULL,
    workflow_stage text NOT NULL,
    deadline_kind text NOT NULL CHECK (deadline_kind IN ('response','resolution','citizen_action')),
    complaint_type text NOT NULL,
    responsible_actor text NOT NULL,
    assigned_agency_id uuid REFERENCES laksaAgencies(id),
    assigned_agency_label text,
    triggering_event text NOT NULL,
    duration_value integer NOT NULL,
    time_unit text NOT NULL CHECK (time_unit IN ('hours','calendar_days','working_days')),
    legal_basis text NOT NULL,
    article_reference text NOT NULL,
    started_at timestamptz NOT NULL,
    original_due_at timestamptz NOT NULL,
    due_at timestamptz NOT NULL,
    paused_at timestamptz,
    total_paused_seconds bigint NOT NULL DEFAULT 0 CHECK (total_paused_seconds >= 0),
    extension_count integer NOT NULL DEFAULT 0 CHECK (extension_count >= 0),
    extended_until timestamptz,
    extension_reason text,
    status text NOT NULL CHECK (status IN ('active','paused','completed','breached','administratively_closed')),
    completed_at timestamptz,
    breached_at timestamptz,
    escalation_target text NOT NULL DEFAULT '',
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (complaint_id, rule_id, started_at)
);

CREATE INDEX IF NOT EXISTS complaint_sla_instances_complaint_idx ON complaint_sla_instances (complaint_id, status, due_at);

CREATE TABLE IF NOT EXISTS complaint_sla_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sla_instance_id uuid NOT NULL REFERENCES complaint_sla_instances(id) ON DELETE CASCADE,
    complaint_id uuid NOT NULL REFERENCES laksaComplaints(id) ON DELETE CASCADE,
    idempotency_key text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('started','paused','resumed','extended','completed','breached','escalated','opd_returned','reassigned','administratively_closed')),
    actor text NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    previous_due_at timestamptz,
    new_due_at timestamptz NOT NULL,
    legal_basis text NOT NULL DEFAULT '',
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sla_instance_id, idempotency_key)
);

-- ============================================================================
-- Seed Regulatory Calendars, Policies, Versions & Rules (Idempotent)
-- ============================================================================

INSERT INTO sla_calendars (id, municipality_id, code, name, timezone, working_days)
VALUES
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'CAL_TANGERANG', 'Kalender Kerja Pemerintah Kota Tangerang', 'Asia/Jakarta', '{1,2,3,4,5}'),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'CAL_YOGYAKARTA', 'Kalender Kerja Pemerintah Kota Yogyakarta', 'Asia/Jakarta', '{1,2,3,4,5}')
ON CONFLICT (code) DO NOTHING;

INSERT INTO sla_calendar_exceptions (calendar_id, exception_date, description, is_working_day)
VALUES
    ('10000000-0000-0000-0000-000000000001', '2026-01-01', 'Tahun Baru 2026 Masehi', false),
    ('10000000-0000-0000-0000-000000000001', '2026-05-01', 'Hari Buruh Internasional', false),
    ('10000000-0000-0000-0000-000000000001', '2026-06-01', 'Hari Lahir Pancasila', false),
    ('10000000-0000-0000-0000-000000000001', '2026-08-17', 'Hari Kemerdekaan Republik Indonesia', false),
    ('10000000-0000-0000-0000-000000000001', '2026-12-25', 'Hari Raya Natal', false),
    ('10000000-0000-0000-0000-000000000002', '2026-01-01', 'Tahun Baru 2026 Masehi', false),
    ('10000000-0000-0000-0000-000000000002', '2026-05-01', 'Hari Buruh Internasional', false),
    ('10000000-0000-0000-0000-000000000002', '2026-06-01', 'Hari Lahir Pancasila', false),
    ('10000000-0000-0000-0000-000000000002', '2026-08-17', 'Hari Kemerdekaan Republik Indonesia', false),
    ('10000000-0000-0000-0000-000000000002', '2026-12-25', 'Hari Raya Natal', false)
ON CONFLICT (calendar_id, exception_date) DO NOTHING;

INSERT INTO sla_policies (id, municipality_id, code, municipality_name, regulation_title, regulation_number, source_url)
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'TNG-PERWALI-40-2025',
        'Kota Tangerang',
        'Peraturan Wali Kota Tangerang tentang Pengelolaan Pengaduan Pelayanan Publik',
        'Perwali Kota Tangerang No. 40 Tahun 2025',
        'https://jdih.tangerangkota.go.id/assets/files/produk/file_berkas_produk-20251127-1764210623.pdf'
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000002',
        'JOG-PERWALI-79-2023',
        'Kota Yogyakarta',
        'Peraturan Wali Kota Yogyakarta tentang Pengelolaan Pengaduan Pelayanan Publik',
        'Perwali Kota Yogyakarta No. 79 Tahun 2023',
        'https://peraturan.bpk.go.id/Download/333300/Peraturan%20Walikota%20Yogyakarta%20No%2079%20Tahun%202023.pdf'
    )
ON CONFLICT (code) DO NOTHING;

INSERT INTO sla_policy_versions (id, policy_id, calendar_id, version_number, effective_from, verification_status, is_active)
VALUES
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, '2025-10-16', 'verified', true),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 1, '2023-11-27', 'verified', true)
ON CONFLICT (policy_id, version_number) DO NOTHING;

-- Kota Tangerang Rules (Perwali No. 40 Tahun 2025)
INSERT INTO sla_rules (
    id, policy_version_id, municipality_id, rule_code, rule_name, complaint_type, workflow_stage,
    deadline_kind, responsible_actor, duration_value, time_unit, start_event, completion_event,
    pause_permitted, pause_conditions, extension_permitted, max_extension_value, extension_time_unit,
    extension_conditions, reset_on_return, breach_action, escalation_target,
    legal_basis, article_reference, effective_date, verification_status, notes
)
VALUES
    (
        '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        'TNG_VERIFICATION', 'Verifikasi dan Telaahan Pengaduan', 'all', 'verification',
        'response', 'operator', 3, 'working_days', 'complaint_received', 'verification_completed',
        false, '{}', false, NULL, NULL,
        '', false, 'escalate', 'pejabat_pengelola_pengaduan',
        'Perwali Kota Tangerang No. 40 Tahun 2025', 'Pasal 17 ayat (2)', '2025-10-16', 'verified',
        'Petugas Pelayanan Pengaduan melakukan verifikasi dan telaahan paling lama 3 hari kerja.'
    ),
    (
        '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        'TNG_INITIAL_RESPONSE_DRAFT', 'Tanggapan Awal Setelah Verifikasi (Draft - Tanpa Durasi Numerik di Perwali)', 'all', 'initial_response',
        'response', 'operator', 1, 'working_days', 'verification_completed', 'initial_response_sent',
        false, '{}', false, NULL, NULL,
        '', false, 'escalate', 'pejabat_pengelola_pengaduan',
        'Perwali Kota Tangerang No. 40 Tahun 2025', 'Pasal 18 ayat (1)', '2025-10-16', 'draft',
        'Pasal 18(1) tidak mencantumkan batas waktu numerik; disimpan sebagai draft dan tidak diaktifkan otomatis.'
    ),
    (
        '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        'TNG_CITIZEN_MISSING_INFO', 'Kelengkapan Informasi oleh Pengadu', 'all', 'awaiting_citizen_info',
        'citizen_action', 'citizen', 10, 'working_days', 'missing_info_requested', 'missing_info_submitted',
        false, '{}', false, NULL, NULL,
        '', false, 'administrative_closure_eligible', 'petugas_pelayanan_pengaduan',
        'Perwali Kota Tangerang No. 40 Tahun 2025', 'Pasal 17 ayat (5)-(6)', '2025-10-16', 'verified',
        'Apabila dalam 10 hari kerja pengadu tidak melengkapi informasi, pengaduan dapat diarsipkan/ditutup secara administratif.'
    ),
    (
        '40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        'TNG_ORDINARY_RESPONSE', 'Penyampaian Tanggapan Pengaduan Tidak Berkadar Pengawasan', 'non_oversight', 'opd_handling',
        'resolution', 'opdStaff', 14, 'working_days', 'distributed_to_liaison', 'opd_response_submitted',
        false, '{}', false, NULL, NULL,
        '', false, 'escalate', 'penanggung_jawab_opd',
        'Perwali Kota Tangerang No. 40 Tahun 2025', 'Pasal 21 ayat (3) & Pasal 19 ayat (4)', '2025-10-16', 'verified',
        'Batas waktu 14 hari kerja sejak diterima Pejabat Penghubung. Pengembalian di luar kewenangan (Pasal 19(4)) tidak mereset batas waktu.'
    ),
    (
        '40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        'TNG_CITIZEN_FOLLOWUP', 'Tanggapan Balik Pengadu atas Tindak Lanjut OPD', 'non_oversight', 'awaiting_citizen_followup',
        'citizen_action', 'citizen', 10, 'working_days', 'opd_response_delivered', 'citizen_followup_submitted',
        false, '{}', false, NULL, NULL,
        '', false, 'administrative_closure_eligible', 'pejabat_penghubung_opd',
        'Perwali Kota Tangerang No. 40 Tahun 2025', 'Pasal 21 ayat (6)-(7)', '2025-10-16', 'verified',
        'Apabila pengadu tidak memberikan tanggapan dalam 10 hari kerja, pengaduan selesai dan ditutup secara administratif.'
    ),
    (
        '40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        'TNG_OVERSIGHT_STATUS', 'Informasi Status Tindak Lanjut Pengaduan Berkadar Pengawasan (APIP)', 'oversight', 'apip_oversight_handling',
        'resolution', 'apip', 60, 'working_days', 'distributed_to_liaison', 'oversight_status_submitted',
        false, '{}', false, NULL, NULL,
        '', false, 'escalate', 'inspektur_daerah',
        'Perwali Kota Tangerang No. 40 Tahun 2025', 'Pasal 22 ayat (3)', '2025-10-16', 'verified',
        'Penyampaian informasi status tindak lanjut paling lama 60 hari kerja sejak diterima Pejabat Penghubung APIP.'
    )
ON CONFLICT (policy_version_id, rule_code) DO NOTHING;

-- Kota Yogyakarta Rules (Perwali No. 79 Tahun 2023)
INSERT INTO sla_rules (
    id, policy_version_id, municipality_id, rule_code, rule_name, complaint_type, workflow_stage,
    deadline_kind, responsible_actor, duration_value, time_unit, start_event, completion_event,
    pause_permitted, pause_conditions, extension_permitted, max_extension_value, extension_time_unit,
    extension_conditions, reset_on_return, breach_action, escalation_target,
    legal_basis, article_reference, effective_date, verification_status, notes
)
VALUES
    (
        '40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
        'JOG_INITIAL_RESPONSE', 'Respon Awal Pengaduan UPIK / JSS / Kanal Langsung', 'upik_jss', 'initial_response',
        'response', 'operator', 24, 'hours', 'complaint_received', 'initial_response_sent',
        false, '{}', false, NULL, NULL,
        '', false, 'escalate', 'kepala_opd_pengelola',
        'Perwali Kota Yogyakarta No. 79 Tahun 2023', 'Pasal 6 ayat (2)', '2023-11-27', 'verified',
        'Admin Perangkat Daerah atau Pejabat Penghubung merespon paling lama 1 x 24 jam sejak aduan diterima.'
    ),
    (
        '40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
        'JOG_VERIFICATION', 'Verifikasi Pengaduan', 'all', 'verification',
        'response', 'operator', 3, 'calendar_days', 'complaint_received', 'verification_completed',
        false, '{}', false, NULL, NULL,
        '', false, 'escalate', 'kepala_diskominfo',
        'Perwali Kota Yogyakarta No. 79 Tahun 2023', 'Pasal 7 ayat (2)', '2023-11-27', 'verified',
        'Proses verifikasi pengaduan dilakukan paling lama 3 Hari kalender. Penolakan antar OPD (Pasal 9) tidak mereset batas waktu.'
    ),
    (
        '40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
        'JOG_SP4N_RESPONSE', 'Respon Pengaduan Melalui SP4N-LAPOR!', 'sp4n_lapor', 'sp4n_initial_response',
        'response', 'operator', 3, 'calendar_days', 'complaint_received', 'distributed_to_liaison',
        false, '{}', false, NULL, NULL,
        '', false, 'escalate', 'kepala_diskominfo',
        'Perwali Kota Yogyakarta No. 79 Tahun 2023', 'Pasal 15 ayat (3)', '2023-11-27', 'verified',
        'Admin merespon aduan SP4N-LAPOR! paling lama 3 Hari untuk diteruskan ke Admin OPD / Pejabat Penghubung.'
    ),
    (
        '40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
        'JOG_COORDINATION_RESPONSE', 'Respon Koordinasi Lintas Perangkat Daerah', 'multi_opd', 'cross_opd_coordination',
        'response', 'opdStaff', 144, 'hours', 'coordination_info_received', 'coordination_response_submitted',
        false, '{}', false, NULL, NULL,
        '', false, 'escalate', 'sekretaris_daerah',
        'Perwali Kota Yogyakarta No. 79 Tahun 2023', 'Pasal 19 ayat (1)', '2023-11-27', 'verified',
        'Batas waktu respon koordinasi lintas perangkat daerah paling lama 6 x 24 jam (144 jam) sejak informasi diterima.'
    ),
    (
        '40000000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
        'JOG_RESOLUTION_NORMATIVE', 'Penyelesaian Pengaduan Bersifat Normatif', 'normative', 'resolution',
        'resolution', 'opdStaff', 2, 'calendar_days', 'distributed_to_liaison', 'complaint_resolved',
        false, '{}', true, 60, 'calendar_days',
        'Apabila tidak dapat diselesaikan sesuai batas waktu awal, perpanjangan sampai dengan 60 Hari kalender (Pasal 20 ayat (5)).', false, 'escalate', 'kepala_opd',
        'Perwali Kota Yogyakarta No. 79 Tahun 2023', 'Pasal 20 ayat (2) & (5)', '2023-11-27', 'verified',
        'Penyelesaian normatif paling lama 2 Hari kalender; dapat diperpanjang sampai dengan total 60 Hari.'
    ),
    (
        '40000000-0000-0000-0000-000000000016', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
        'JOG_RESOLUTION_NO_FIELD', 'Penyelesaian Pengaduan Tanpa Pemeriksaan Lapangan', 'no_field_investigation', 'resolution',
        'resolution', 'opdStaff', 6, 'calendar_days', 'distributed_to_liaison', 'complaint_resolved',
        false, '{}', true, 60, 'calendar_days',
        'Apabila tidak dapat diselesaikan sesuai batas waktu awal, perpanjangan sampai dengan 60 Hari kalender (Pasal 20 ayat (5)).', false, 'escalate', 'kepala_opd',
        'Perwali Kota Yogyakarta No. 79 Tahun 2023', 'Pasal 20 ayat (4) & (5)', '2023-11-27', 'verified',
        'Penyelesaian tanpa pemeriksaan lapangan paling lama 6 Hari kalender; dapat diperpanjang sampai dengan total 60 Hari.'
    ),
    (
        '40000000-0000-0000-0000-000000000017', '30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
        'JOG_RESOLUTION_FIELD', 'Penyelesaian Pengaduan Dengan Pemeriksaan Lapangan', 'field_investigation', 'resolution',
        'resolution', 'opdStaff', 14, 'calendar_days', 'distributed_to_liaison', 'complaint_resolved',
        false, '{}', true, 60, 'calendar_days',
        'Apabila tidak dapat diselesaikan sesuai batas waktu awal, perpanjangan sampai dengan 60 Hari kalender (Pasal 20 ayat (5)).', false, 'escalate', 'kepala_opd',
        'Perwali Kota Yogyakarta No. 79 Tahun 2023', 'Pasal 20 ayat (3) & (5)', '2023-11-27', 'verified',
        'Penyelesaian dengan pemeriksaan lapangan paling lama 14 Hari kalender; dapat diperpanjang sampai dengan total 60 Hari.'
    )
ON CONFLICT (policy_version_id, rule_code) DO NOTHING;

-- ============================================================================
-- PostGIS Incident Location & Identity/Profile Boundary Tables
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE laksaComplaints ADD COLUMN IF NOT EXISTS incident_location geography(Point, 4326);
CREATE INDEX IF NOT EXISTS laksa_complaints_incident_location_gix ON laksaComplaints USING GIST (incident_location);
UPDATE laksaComplaints
SET incident_location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND incident_location IS NULL;

INSERT INTO laksaAgencies (label, enabled)
VALUES
    ('Dinas Pekerjaan Umum dan Penataan Ruang', true),
    ('Dinas Perhubungan', true),
    ('Dinas Lingkungan Hidup', true),
    ('Dinas Komunikasi dan Informatika', true),
    ('Dinas Kesehatan', true),
    ('Inspektorat Daerah (APIP)', true),
    ('Satuan Polisi Pamong Praja', true)
ON CONFLICT (label) DO NOTHING;

CREATE TABLE IF NOT EXISTS government_departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id uuid NOT NULL REFERENCES laksaAgencies(id) ON DELETE CASCADE,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO government_departments (agency_id, code, name)
SELECT a.id, d.code, d.name
FROM (VALUES
    ('Dinas Pekerjaan Umum dan Penataan Ruang', 'PUPR-JALAN', 'Bidang Bina Marga & Jalan'),
    ('Dinas Pekerjaan Umum dan Penataan Ruang', 'PUPR-DRAINASE', 'Bidang Sumber Daya Air & Drainase'),
    ('Dinas Perhubungan', 'DISHUB-PJU', 'Bidang Prasarana & Penerangan Jalan Umum'),
    ('Dinas Perhubungan', 'DISHUB-LALIN', 'Bidang Lalu Lintas'),
    ('Dinas Lingkungan Hidup', 'DLH-SAMPAH', 'Bidang Pengelolaan Persampahan'),
    ('Dinas Komunikasi dan Informatika', 'KOMINFO-LAKSA', 'Bidang Pengelolaan Layanan Informasi & LAKSA'),
    ('Inspektorat Daerah (APIP)', 'APIP-PENGAWASAN', 'Inspektorat Pembantu Bidang Pengaduan'),
    ('Satuan Polisi Pamong Praja', 'SATPOL-TRANTIB', 'Bidang Ketentraman dan Ketertiban Umum')
) AS d(agency_label, code, name)
JOIN laksaAgencies a ON a.label = d.agency_label
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS citizen_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_subject text NOT NULL UNIQUE,
    full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 200),
    email text NOT NULL CHECK (length(trim(email)) BETWEEN 3 AND 320),
    phone_number text,
    avatar_url text,
    municipality_code text NOT NULL CHECK (length(trim(municipality_code)) BETWEEN 1 AND 64),
    district_code text,
    subdistrict_code text,
    preferred_language text NOT NULL DEFAULT 'id' CHECK (preferred_language IN ('id', 'en')),
    notification_preferences jsonb NOT NULL DEFAULT '{"inApp":true,"email":true,"push":false,"slaAlerts":true,"statusUpdates":true,"corroborationAlerts":true}'::jsonb,
    account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('pending_onboarding', 'active', 'suspended', 'deactivated')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS government_operator_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_subject text NOT NULL UNIQUE,
    full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 200),
    email text NOT NULL CHECK (length(trim(email)) BETWEEN 3 AND 320),
    employee_number text,
    agency_id uuid NOT NULL REFERENCES laksaAgencies(id),
    municipality_code text NOT NULL CHECK (length(trim(municipality_code)) BETWEEN 1 AND 64),
    department_id uuid REFERENCES government_departments(id),
    position text,
    official_phone_number text,
    avatar_url text,
    account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('pending_onboarding', 'active', 'suspended', 'deactivated')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
