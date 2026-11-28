import { useEffect, useState } from 'react';
import { StatusBadge } from '../common/Badge';
import { ImageViewerModal } from '../common/ImageViewerModal';
import { api, buildTrackingSteps, formatDeadlineCountdown, formatSlaCountdown, getPriorityMeta } from '../../api';

export function RiwayatCard({
  id,
  category = '[CATEGORY BY SYSTEM]',
  date = '22 Nov 2026',
  description = '',
  image = null,
  status = 'Dalam Proses',
  rawStatus = 'pending',
  agency = null,
  suggestedCategory = null,
  suggestedAgency = null,
  reviewReason = null,
  timestamp = '',
  district = '[Kecamatan]',
  city = '[Kota]',
  upvotes = '1',
  numericUpvotes = 1,
  corroborationCount = 0,
  priorityScore = 1,
  slaDueAt = null,
  slaSummary = null,
  events = [],
  corroborations = [],
  onClick,
}) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isTrackOpen, setIsTrackOpen] = useState(false);
  const [liveSla, setLiveSla] = useState(slaSummary);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setLiveSla(slaSummary);
  }, [slaSummary]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeSla = liveSla || slaSummary;
  const slaInfo = formatSlaCountdown(slaDueAt, status, nowMs, activeSla);
  const priorityInfo = getPriorityMeta(priorityScore, numericUpvotes, corroborationCount);
  const steps = buildTrackingSteps({
    rawStatus,
    status,
    category,
    suggestedCategory,
    agency: agency || suggestedAgency,
    reviewReason,
    slaSummary: activeSla,
  });

  const handleThumbnailClick = (e) => {
    e.stopPropagation();
    setIsViewerOpen(true);
  };

  const handleCardClick = () => {
    setIsTrackOpen(true);
    if (id && api.getComplaintSLA) {
      api
        .getComplaintSLA(id)
        .then((res) => {
          if (res) setLiveSla(res);
        })
        .catch(() => {});
    }
    onClick?.();
  };

  const respClock = activeSla?.responseDeadline;
  const resClock = activeSla?.resolutionDeadline;
  const respCountdown = respClock ? formatDeadlineCountdown(respClock.dueAt, respClock.status, nowMs) : null;
  const resCountdown = resClock ? formatDeadlineCountdown(resClock.dueAt, resClock.status, nowMs) : null;

  return (
    <>
      <article className="sig-riwayat-card" onClick={handleCardClick} style={{ cursor: 'pointer' }}>
        <div className="sig-riwayat-card__header">
          <span className="sig-riwayat-card__category">{category}</span>
          <span className="sig-riwayat-card__date">{date}</span>
        </div>

        <div className="sig-card-signals" style={{ marginBottom: '10px' }}>
          <span className={`sig-sla-pill sig-sla-pill--${slaInfo.tone}`}>
            SLA: {slaInfo.text}
          </span>
          {activeSla?.citizenActionRequired && (
            <span className="sig-sla-pill sig-sla-pill--warning">
              Butuh Tindakan Pelapor
            </span>
          )}
          {activeSla?.approachingDeadlineWarning && !activeSla?.overdue && (
            <span className="sig-sla-pill sig-sla-pill--warning">
              Mendekati Batas Waktu
            </span>
          )}
          <span className={`sig-priority-pill sig-priority-pill--${priorityInfo.level}`}>
            {priorityInfo.label}
          </span>
          {corroborationCount > 0 && (
            <span className="sig-corrob-pill">
              {corroborationCount} Konfirmasi Warga
            </span>
          )}
        </div>

        <div className="sig-riwayat-card__body">
          <p className="sig-riwayat-card__desc">{description}</p>
          <div
            className="sig-riwayat-card__thumbnail"
            onClick={handleThumbnailClick}
            role="button"
            tabIndex={0}
            title="Ketuk untuk melihat ukuran penuh"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleThumbnailClick(e);
              }
            }}
          >
            {image ? (
              <img src={image} alt="Dokumentasi laporan" />
            ) : (
              <div className="sig-riwayat-card__placeholder-img" />
            )}
          </div>
        </div>

        {/* Inline Compact 4-Step Status Progress Tracker */}
        <div className="sig-stepper" aria-label="Progres status laporan">
          {steps.map((step) => (
            <div key={step.key} className={`sig-stepper__step is-${step.state}`}>
              <span className="sig-stepper__dot" />
              <span className="sig-stepper__label">{step.label}</span>
            </div>
          ))}
        </div>

        <div className="sig-riwayat-card__divider" />

        <div className="sig-riwayat-card__footer">
          <div className="sig-riwayat-card__status-col">
            <StatusBadge status={status} />
            <span className="sig-riwayat-card__time">{timestamp}</span>
          </div>

          <div className="sig-riwayat-card__location-col">
            <span className="sig-riwayat-card__district">{district}{city ? ',' : ''}</span>
            {city && <span className="sig-riwayat-card__city">{city}</span>}
          </div>

          <div className="sig-riwayat-card__upvote-col">
            <span className="sig-riwayat-card__upvote-count">{upvotes}</span>
            <span className="sig-riwayat-card__upvote-label">Total Upvote</span>
          </div>
        </div>
      </article>

      <ImageViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={image ? [image] : ['placeholder']}
        initialIndex={0}
        title={`Dokumentasi: ${category}`}
        subtitle={`${district}${city ? `, ${city}` : ''}`}
      />

      {isTrackOpen && (
        <div className="sig-modal-backdrop" onClick={() => setIsTrackOpen(false)}>
          <div className="sig-modal sig-track-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 className="sig-modal__title" style={{ marginBottom: 0 }}>Pelacakan Status & SLA Regulasi</h3>
              <StatusBadge status={status} />
            </div>

            {activeSla && (
              <div className="sig-track-reg-meta">
                <div><strong>Kebijakan:</strong> {activeSla.policyCode} (v{activeSla.policyVersion}) — {activeSla.municipalityName}</div>
                <div><strong>Tahap Saat Ini:</strong> {activeSla.currentStage} • <strong>Penanggung Jawab:</strong> {activeSla.responsibleAgency || activeSla.responsibleActor}</div>
                <div><strong>Status Penyelesaian:</strong> {activeSla.resolutionState === 'substantively_resolved' ? 'Selesai Substantif' : activeSla.resolutionState === 'administratively_closed' ? 'Ditutup Administratif' : 'Terbuka (Dalam Penanganan)'}</div>
              </div>
            )}

            {activeSla?.citizenActionRequired && (
              <div className="sig-track-alert-citizen">
                <strong>Tindakan Pelapor Diperlukan</strong>
                <p>Mohon lengkapi informasi/tanggapan Anda sebelum batas waktu {activeSla.citizenActionDeadline?.legalBasis} ({activeSla.citizenActionDeadline?.articleReference}).</p>
              </div>
            )}

            <div className="sig-track-sla-box">
              <div>
                <div className="sig-track-sla-box__label">Status Kepatuhan SLA Utama ({activeSla?.timezone || 'Asia/Jakarta'})</div>
                <div className={`sig-track-sla-box__value is-${slaInfo.tone}`}>{slaInfo.text}</div>
                {activeSla?.overdue && (
                  <div className="sig-track-sla-box__sub" style={{ color: '#b91c1c', fontWeight: 600 }}>
                    Melewati batas waktu regulasi — tidak otomatis dianggap selesai.
                  </div>
                )}
              </div>
            </div>

            {/* Distinct Response vs Resolution Deadlines */}
            <div className="sig-track-dual-deadlines">
              <div className="sig-track-deadline-card">
                <span className="sig-track-deadline-card__kind">Batas Respon / Verifikasi</span>
                <strong>{respCountdown ? respCountdown.text : 'Belum aktif'}</strong>
                {respClock && (
                  <>
                    <small>{respClock.legalBasis} ({respClock.articleReference})</small>
                    <small>Target: {new Date(respClock.dueAt).toLocaleString('id-ID')}</small>
                  </>
                )}
              </div>
              <div className="sig-track-deadline-card">
                <span className="sig-track-deadline-card__kind">Batas Penyelesaian OPD</span>
                <strong>{resCountdown ? resCountdown.text : 'Menunggu distribusi OPD'}</strong>
                {resClock && (
                  <>
                    <small>{resClock.legalBasis} ({resClock.articleReference})</small>
                    <small>Target: {new Date(resClock.dueAt).toLocaleString('id-ID')}</small>
                  </>
                )}
              </div>
            </div>

            {activeSla?.approvedExtensions && activeSla.approvedExtensions.length > 0 && (
              <div className="sig-corrob-history" style={{ marginBottom: '10px' }}>
                <span className="sig-corrob-history__title">Perpanjangan Waktu Disetujui</span>
                {activeSla.approvedExtensions.map((ext, i) => (
                  <div key={i} className="sig-corrob-history__item">
                    <p>{ext.articleReference}: Diperpanjang hingga {new Date(ext.dueAt).toLocaleString('id-ID')}</p>
                    {ext.extensionReason && <small>Alasan: {ext.extensionReason}</small>}
                  </div>
                ))}
              </div>
            )}

            <div className="sig-track-metrics">
              <div className="sig-track-metric">
                <strong>{numericUpvotes}</strong>
                <span>Upvote</span>
              </div>
              <div className="sig-track-metric">
                <strong>{corroborationCount}</strong>
                <span>Konfirmasi Warga</span>
              </div>
              <div className="sig-track-metric">
                <strong>{Number(priorityScore).toFixed(1)}</strong>
                <span>Skor Prioritas</span>
              </div>
            </div>

            <div className="sig-track-steps">
              {steps.map((step, index) => (
                <div key={step.key} className={`sig-track-step is-${step.state}`}>
                  <div className="sig-track-step__num">{step.state === 'done' ? '✓' : index + 1}</div>
                  <div className="sig-track-step__body">
                    <div className="sig-track-step__title">{step.label}</div>
                    <div className="sig-track-step__desc">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {((activeSla?.events && activeSla.events.length > 0) || (events && events.length > 0)) && (
              <div className="sig-timeline">
                <div className="sig-timeline__title">Riwayat Aktivitas & SLA</div>
                {(activeSla?.events && activeSla.events.length > 0 ? activeSla.events : events).map((ev, idx) => (
                  <div key={idx} className="sig-timeline__item">
                    <span className="sig-timeline__event">
                      {ev.eventType} {ev.legalBasis ? `(${ev.legalBasis})` : ''}
                    </span>
                    <span className="sig-timeline__time">
                      {new Date(ev.occurredAt || ev.createdAt).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {corroborations && corroborations.length > 0 && (
              <div className="sig-corrob-history" style={{ marginTop: '10px' }}>
                <span className="sig-corrob-history__title">
                  Konfirmasi Warga Sekitar ({corroborations.length})
                </span>
                {corroborations.slice(0, 3).map((c, idx) => (
                  <div key={idx} className="sig-corrob-history__item">
                    <p>{c.note || 'Mengonfirmasi kebenaran laporan ini.'}</p>
                    {c.distanceMeters != null && <small>Jarak: {Math.round(c.distanceMeters)} m</small>}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="sig-button sig-button--primary sig-button--full"
              style={{ marginTop: '14px' }}
              onClick={() => setIsTrackOpen(false)}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
