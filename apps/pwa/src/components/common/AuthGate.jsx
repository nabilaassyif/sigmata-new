import { useEffect, useRef, useState } from 'react';
import { api, IS_MOCK, API_MODE } from '../../api';
import {
  ArrowRightIcon,
  ClockHistoryIcon,
  LocationPinIconSolid,
  SigmataLogo,
  TrendingUpIcon,
  UpvoteIcon,
} from '../icons/Icons';
import { ThemeToggleButton } from './ThemeToggleButton';

const PILLARS = [
  {
    code: '01',
    title: 'Bukti Foto Wajib & PostGIS',
    desc: 'Setiap aduan dilengkapi bukti foto terverifikasi dan koordinat presisi untuk mencegah laporan fiktif.',
  },
  {
    code: '02',
    title: 'Validasi Tetangga 5 km',
    desc: 'Warga sekitar dapat mendukung dan mengonfirmasi kejadian di lapangan guna menaikkan skor prioritas antrean.',
  },
  {
    code: '03',
    title: 'AI Routing 2 Tingkat',
    desc: 'GRACE-Core-FT & Featherless AI mengklasifikasikan kategori aduan dan memetakannya ke OPD terkait.',
  },
  {
    code: '04',
    title: 'SLA Regulasi Perwali',
    desc: 'Batas waktu respon dan penyelesaian dihitung secara resmi berdasarkan regulasi daerah di zona Asia/Jakarta.',
  },
];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Lapor + Foto',
    desc: 'Ambil foto kondisi lapangan, tandai lokasi atau GPS, lalu kirim aduan sebagai laporan publik atau privat.',
  },
  {
    step: '02',
    title: 'Verifikasi & AI Disposisi',
    desc: 'Sistem memvalidasi kelengkapan dan merutekan laporan ke perangkat daerah berwenang atau operator peninjau.',
  },
  {
    step: '03',
    title: 'Penanganan OPD',
    desc: 'Dinas menindaklanjuti laporan dengan jam SLA respon dan jam SLA penyelesaian yang dipantau terpisah.',
  },
  {
    step: '04',
    title: 'Tuntas Substantif',
    desc: 'Laporan tidak pernah ditutup otomatis hanya karena lewat tenggat — setiap tahap tercatat di log audit.',
  },
];

// Blocks the app until a citizen session exists (always signed in when running against the mock API).
export function AuthGate({ children }) {
  const [state, setState] = useState('loading'); // loading | signedIn | signedOut | error
  const landingRef = useRef(null);
  const rafRef = useRef(0);
  const coordsRef = useRef({ px: 0, py: 0, sy: 0 });

  useEffect(() => {
    let cancelled = false;
    api
      .getSession()
      .then((session) => !cancelled && setState(session ? 'signedIn' : 'signedOut'))
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state === 'signedIn') return undefined;

    const flushVars = () => {
      rafRef.current = 0;
      const el = landingRef.current;
      if (!el) return;
      const { px, py, sy } = coordsRef.current;
      el.style.setProperty('--px', px.toFixed(4));
      el.style.setProperty('--py', py.toFixed(4));
      el.style.setProperty('--sy', `${sy.toFixed(1)}px`);
    };

    const scheduleFlush = () => {
      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(flushVars);
      }
    };

    const handleScroll = () => {
      coordsRef.current.sy = Math.min(window.scrollY || 0, 1200);
      scheduleFlush();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [state]);

  const handlePointerMove = (e) => {
    const el = landingRef.current;
    if (!el || !window.innerWidth || !window.innerHeight) return;
    const px = (e.clientX / window.innerWidth - 0.5) * 2;
    const py = (e.clientY / window.innerHeight - 0.5) * 2;
    coordsRef.current.px = px;
    coordsRef.current.py = py;
    if (!rafRef.current) {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        const target = landingRef.current;
        if (!target) return;
        target.style.setProperty('--px', coordsRef.current.px.toFixed(4));
        target.style.setProperty('--py', coordsRef.current.py.toFixed(4));
        target.style.setProperty('--sy', `${coordsRef.current.sy.toFixed(1)}px`);
      });
    }
  };

  if (state === 'signedIn') return children;

  return (
    <div
      ref={landingRef}
      className="sig-parallax-landing"
      onMouseMove={handlePointerMove}
    >
      {/* Multi-layer ambient background that responds to scroll and pointer depth */}
      <div className="sig-parallax-bg" aria-hidden="true">
        <div className="sig-parallax-grid" />
        <div className="sig-parallax-orb sig-parallax-orb--1" />
        <div className="sig-parallax-orb sig-parallax-orb--2" />
        <div className="sig-parallax-orb sig-parallax-orb--3" />
      </div>

      {/* Top Glass Header */}
      <header className="sig-parallax-nav">
        <div className="sig-parallax-nav__inner">
          <a href="#top" className="sig-parallax-brand">
            <SigmataLogo size={34} />
            <div className="sig-parallax-brand__text">
              <strong>SIGMATA-LAKSA</strong>
              <span>Civic AI &amp; Statutory SLA</span>
            </div>
          </a>

          <nav className="sig-parallax-links" aria-label="Navigasi landing page">
            <a href="#fitur">Fitur</a>
            <a href="#alur">Alur SLA</a>
            <a href="#regulasi">Regulasi</a>
          </nav>

          <div className="sig-parallax-nav__actions">
            <ThemeToggleButton variant="icon" />
            {!IS_MOCK && (
              <>
                <a className="sig-button sig-button--secondary sig-button--sm sig-parallax-nav__btn" href={api.loginUrl()}>
                  Masuk
                </a>
                <a className="sig-button sig-button--primary sig-button--sm" href={api.registerUrl()}>
                  Daftar
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="top" className="sig-parallax-main">
        {/* Hero Section */}
        <section className="sig-parallax-hero">
          <div className="sig-parallax-hero__copy">
            <span className="sig-parallax-eyebrow">
              LAYANAN ASPIRASI &amp; ADUAN PUBLIK TERVERIFIKASI
            </span>

            <h1 className="sig-parallax-title">
              Laporkan Masalah Kota. <span>Kawal Batas Waktu SLA</span> Secara Real-Time.
            </h1>

            <p className="sig-parallax-subtitle">
              Platform pelaporan warga berbasis bukti foto wajib, validasi tetangga radius 5 km, perutean AI dua tingkat (GRACE + Featherless), serta penghitungan tenggat resmi sesuai Peraturan Wali Kota.
            </p>

            {state === 'loading' && (
              <div className="sig-parallax-session-pill" role="status">
                <span className="sig-parallax-pulse-dot" />
                <span>Memeriksa sesi akunmu...</span>
              </div>
            )}

            {state === 'error' && (
              <div className="sig-parallax-error-box">
                <p className="sig-auth-error" style={{ marginBottom: '10px' }}>
                  Tidak dapat terhubung ke server ({API_MODE}). Pastikan API berjalan.
                </p>
                <div className="sig-parallax-cta-row">
                  <button
                    type="button"
                    className="sig-button sig-button--primary sig-button--md"
                    onClick={() => window.location.reload()}
                  >
                    Coba Lagi
                  </button>
                  {!IS_MOCK && (
                    <>
                      <a className="sig-button sig-button--secondary sig-button--md" href={api.loginUrl()}>
                        Masuk ke Akun
                      </a>
                      <a className="sig-button sig-button--secondary sig-button--md" href={api.registerUrl()}>
                        Daftar Warga Baru
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}

            {state === 'signedOut' && !IS_MOCK && (
              <div className="sig-parallax-cta-row">
                <a className="sig-button sig-button--primary sig-button--lg sig-parallax-cta" href={api.loginUrl()}>
                  <span>Masuk ke Akun Warga</span>
                  <ArrowRightIcon size={17} color="#ffffff" />
                </a>
                <a className="sig-button sig-button--secondary sig-button--lg sig-parallax-cta" href={api.registerUrl()}>
                  Daftar Warga Baru
                </a>
              </div>
            )}

            <div className="sig-parallax-metrics">
              <div>
                <strong>2 Daerah</strong>
                <span>Perwali Tangerang &amp; Yogyakarta</span>
              </div>
              <div>
                <strong>5 km GPS</strong>
                <span>Validasi warga sekitar</span>
              </div>
              <div>
                <strong>Asia/Jakarta</strong>
                <span>Jam kerja &amp; hari libur resmi</span>
              </div>
            </div>
          </div>

          {/* Interactive 3D Floating Parallax Showcase Stack */}
          <div className="sig-parallax-stage" aria-hidden="true">
            <div className="sig-parallax-card sig-parallax-card--sla">
              <div className="sig-parallax-card__head">
                <span className="sig-parallax-chip sig-parallax-chip--teal">
                  <ClockHistoryIcon size={13} color="currentColor" />
                  <span>SLA COMPLIANCE</span>
                </span>
                <span className="sig-parallax-badge">TNG-PERWALI-40-2025</span>
              </div>
              <strong>Respon OPD • Dinas PUPR</strong>
              <p>Ps. 21(3) Perwali Kota Tangerang No. 40 Tahun 2025 — Batas respon 14 hari kerja.</p>
              <div className="sig-parallax-countdown">
                <span>13 Hari Kerja Tersisa</span>
                <small>Terjadwal Zona Asia/Jakarta</small>
              </div>
            </div>

            <div className="sig-parallax-card sig-parallax-card--ai">
              <div className="sig-parallax-card__head">
                <span className="sig-parallax-chip sig-parallax-chip--blue">
                  <TrendingUpIcon size={13} color="currentColor" />
                  <span>AI TWO-TIER ROUTING</span>
                </span>
                <span className="sig-parallax-conf">94.2%</span>
              </div>
              <strong>GRACE-Core-FT + Featherless AI</strong>
              <p>Kategori terdeteksi: <b>INFRASTRUKTUR JALAN</b> — diteruskan otomatis ke OPD berwenang.</p>
              <div className="sig-parallax-mini-bar">
                <span style={{ width: '94%' }} />
              </div>
            </div>

            <div className="sig-parallax-card sig-parallax-card--community">
              <div className="sig-parallax-card__head">
                <span className="sig-parallax-chip sig-parallax-chip--emerald">
                  <LocationPinIconSolid size={13} color="#059669" />
                  <span>KOROBORASI WARGA</span>
                </span>
                <span className="sig-parallax-upvote-pill">
                  <UpvoteIcon size={13} filled color="var(--teal-normal)" />
                  <span>+3.5 Skor</span>
                </span>
              </div>
              <strong>8 Warga Radius &lt; 500m Mengonfirmasi</strong>
              <p>Foto bukti jalan berlubang terverifikasi di Kecamatan Cipondoh.</p>
            </div>
          </div>
        </section>

        {/* Section 1: 4 Pillars */}
        <section id="fitur" className="sig-parallax-section">
          <div className="sig-parallax-section__head">
            <span className="sig-parallax-section__eyebrow">KEUNGGULAN PLATFORM</span>
            <h2>Dirancang untuk Akuntabilitas Publik yang Terukur</h2>
            <p>
              Memisahkan prioritas suara warga dari tenggat hukum instansi agar setiap laporan diproses adil dan transparan.
            </p>
          </div>

          <div className="sig-parallax-pillars">
            {PILLARS.map((item) => (
              <article key={item.code} className="sig-parallax-pillar-card">
                <span className="sig-parallax-pillar-card__num">{item.code}</span>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Section 2: Workflow Timeline */}
        <section id="alur" className="sig-parallax-section">
          <div className="sig-parallax-section__head">
            <span className="sig-parallax-section__eyebrow">ALUR PENANGANAN</span>
            <h2>Dari Foto Laporan Hingga Tuntas Substantif</h2>
          </div>

          <div className="sig-parallax-flow">
            {WORKFLOW_STEPS.map((item) => (
              <div key={item.step} className="sig-parallax-flow__step">
                <div className="sig-parallax-flow__badge">{item.step}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Regulatory Grounding & Bottom CTA */}
        <section id="regulasi" className="sig-parallax-section sig-parallax-regulasi">
          <div className="sig-parallax-reg-grid">
            <article className="sig-parallax-reg-card">
              <span className="sig-parallax-badge">TNG-PERWALI-40-2025</span>
              <h3>Kota Tangerang — Perwali No. 40 Tahun 2025</h3>
              <ul>
                <li>Verifikasi aduan: 3 hari kerja (Ps. 17 ayat 2)</li>
                <li>Respon OPD non-pengawasan: 14 hari kerja (Ps. 21 ayat 3)</li>
                <li>Tanggapan tindak lanjut pelapor: 10 hari kerja (Ps. 21 ayat 6–7)</li>
                <li>Aduan pengawasan APIP: 60 hari kerja (Ps. 22 ayat 3)</li>
              </ul>
            </article>

            <article className="sig-parallax-reg-card">
              <span className="sig-parallax-badge">JOG-PERWALI-79-2023</span>
              <h3>Kota Yogyakarta — Perwali No. 79 Tahun 2023</h3>
              <ul>
                <li>Respon awal pengaduan: 24 jam (Ps. 6 ayat 2)</li>
                <li>Verifikasi &amp; SP4N-LAPOR: 3 hari kalender (Ps. 7 &amp; Ps. 15)</li>
                <li>Koordinasi lintas OPD: 144 jam (Ps. 19 ayat 1)</li>
                <li>Penyelesaian berjenjang: 2 / 6 / 14 s.d. 60 hari kalender (Ps. 20)</li>
              </ul>
            </article>
          </div>

          {!IS_MOCK && (
            <div className="sig-parallax-bottom-cta">
              <div>
                <h3>Siap Melapor dan Mengawal Kota Anda?</h3>
                <p>Masuk atau daftar sebagai warga untuk mulai mengirim aduan dengan bukti foto.</p>
              </div>
              <div className="sig-parallax-cta-row">
                <a className="sig-button sig-button--primary sig-button--md" href={api.loginUrl()}>
                  Masuk Sekarang
                </a>
                <a className="sig-button sig-button--secondary sig-button--md" href={api.registerUrl()}>
                  Daftar Warga Baru
                </a>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
