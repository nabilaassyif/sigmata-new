import { useRef, useState } from 'react';
import { Navbar } from '../components/common/Navbar';
import { Button } from '../components/common/Button';
import { SigmataLogo, UserIcon } from '../components/icons/Icons';
import { api } from '../api';

const MUNICIPALITIES = [
  {
    code: '36.71',
    name: 'Kota Tangerang',
    subtitle: 'Layanan LAKSA & Perwali 40/2025',
    badge: 'TNG',
    districts: ['Cipondoh', 'Karawaci', 'Ciledug', 'Tangerang', 'Cibodas', 'Batuceper'],
  },
  {
    code: '34.71',
    name: 'Kota Yogyakarta',
    subtitle: 'Layanan UPIK & Perwali 79/2023',
    badge: 'JOG',
    districts: ['Gondokusuman', 'Jetis', 'Umbulharjo', 'Kotagede', 'Danurejan', 'Wirobrajan'],
  },
];

const AVATAR_PRESETS = [
  { id: 'warga-1', label: 'Ceria', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=WargaSigmata1' },
  { id: 'warga-2', label: 'Aktif', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=WargaSigmata2' },
  { id: 'warga-3', label: 'Peduli', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=WargaSigmata3' },
  { id: 'warga-4', label: 'Sigap', url: 'https://api.dicebear.com/9.x/thumbs/svg?seed=WargaSigmata4' },
];

const DEFAULT_PREFS = {
  inApp: true,
  email: true,
  push: false,
  slaAlerts: true,
  statusUpdates: true,
  corroborationAlerts: true,
};

const PREF_ITEMS = [
  { key: 'inApp', title: 'Notifikasi Dalam Aplikasi', desc: 'Tampilkan pembaruan langsung di beranda & riwayat' },
  { key: 'email', title: 'Ringkasan Email', desc: 'Kirim bukti lapor & update penting ke email' },
  { key: 'push', title: 'Push Notification', desc: 'Terima peringatan instan di perangkat seluler' },
  { key: 'slaAlerts', title: 'Pengingat Batas Waktu SLA', desc: 'Pantau tenggat respon & penyelesaian instansi' },
  { key: 'statusUpdates', title: 'Perubahan Status & Disposisi OPD', desc: 'Info saat laporan diverifikasi & diteruskan' },
  { key: 'corroborationAlerts', title: 'Konfirmasi Warga Sekitar', desc: 'Kabar saat tetangga ikut memvalidasi laporanmu' },
];

export function OnboardingProfilePage({
  mode = 'onboarding', // 'onboarding' | 'edit'
  profileData,
  onSaved,
  onBack,
}) {
  const identity = profileData?.identity || {};
  const existing = profileData?.profile || null;
  const stats = profileData?.statistics || {};

  const [step, setStep] = useState(1);
  const [stepReady, setStepReady] = useState(true);
  const [shake, setShake] = useState(false);

  const [fullName, setFullName] = useState(existing?.fullName || identity.name || '');
  const [email, setEmail] = useState(existing?.email || identity.email || '');
  const [phoneNumber, setPhoneNumber] = useState(existing?.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState(existing?.avatarUrl || AVATAR_PRESETS[0].url);
  const [municipalityCode, setMunicipalityCode] = useState(existing?.municipalityCode || '36.71');
  const [districtCode, setDistrictCode] = useState(existing?.districtCode || '');
  const [subdistrictCode, setSubdistrictCode] = useState(existing?.subdistrictCode || '');
  const [preferredLanguage, setPreferredLanguage] = useState(existing?.preferredLanguage || 'id');
  const [prefs, setPrefs] = useState({
    ...DEFAULT_PREFS,
    ...(existing?.notificationPreferences || {}),
  });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const avatarInputRef = useRef(null);

  const isOnboarding = mode === 'onboarding';
  const activeMunicipality = MUNICIPALITIES.find((m) => m.code === municipalityCode) || MUNICIPALITIES[0];
  const enabledPrefCount = Object.values(prefs).filter(Boolean).length;

  const triggerShake = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError('');
    try {
      const res = await api.uploadAvatar(file);
      if (res?.avatarUrl) {
        setAvatarUrl(res.avatarUrl);
      }
    } catch (err) {
      triggerShake(err?.message || 'Gagal mengunggah avatar (pastikan PNG/JPG maks 5 MB).');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const togglePref = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const advanceToStep = (nextStep) => {
    setStepReady(false);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setStepReady(true), 350);
  };

  const handleNextStep = () => {
    setError('');
    if (step === 1) {
      if (!fullName.trim()) {
        triggerShake('Yuk isi nama lengkapmu dulu sebelum lanjut!');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        triggerShake('Mohon isi alamat email yang valid.');
        return;
      }
      advanceToStep(2);
      return;
    }
    if (step === 2) {
      if (!municipalityCode) {
        triggerShake('Pilih kota/kabupaten tempat tinggalmu terlebih dahulu.');
        return;
      }
      advanceToStep(3);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isOnboarding && (step !== 3 || !stepReady)) return;
    if (saving) return;
    if (!fullName.trim()) {
      triggerShake('Nama lengkap wajib diisi.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      triggerShake('Email wajib diisi dengan format yang benar.');
      return;
    }
    if (!municipalityCode) {
      triggerShake('Pilih wilayah kota/kabupaten terlebih dahulu.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await api.saveProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        municipalityCode,
        districtCode: districtCode.trim() || null,
        subdistrictCode: subdistrictCode.trim() || null,
        preferredLanguage,
        notificationPreferences: prefs,
        accountStatus: 'active',
      });
      onSaved?.(updated);
    } catch (err) {
      triggerShake(err?.message || 'Gagal menyimpan profil. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  if (isOnboarding) {
    const progressPct = step === 1 ? 33 : step === 2 ? 66 : 100;
    const stepTitles = [
      { title: 'Kenalan Dulu Yuk!', sub: 'Atur nama tampilan, avatar, dan kontak aktifmu.' },
      { title: 'Di Mana Wilayahmu?', sub: 'Bantu kami menyesuaikan rute dinas & aturan daerahmu.' },
      { title: 'Tetap Terhubung!', sub: 'Pilih kabar yang ingin kamu terima saat laporan diproses.' },
    ];
    const currentMeta = stepTitles[step - 1];

    return (
      <div className="sig-page sig-onboarding-page">
        {/* Unskippable Branded Header with Animated Progress */}
        <header className="sig-onboard-header">
          <div className="sig-onboard-header__top">
            <div className="sig-onboard-brand">
              <SigmataLogo size={30} />
              <div>
                <div className="sig-onboard-brand__name">SIGMATA-LAKSA</div>
                <div className="sig-onboard-brand__tag">Pengaturan Awal Akun</div>
              </div>
            </div>
            <span className="sig-onboard-step-pill">Langkah {step} / 3</span>
          </div>

          <div className="sig-onboard-progress-track" aria-label={`Progres langkah ${step} dari 3`}>
            <div className="sig-onboard-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="sig-onboard-dots">
            {[
              { n: 1, label: 'Identitas' },
              { n: 2, label: 'Wilayah' },
              { n: 3, label: 'Notifikasi' },
            ].map((item) => (
              <div
                key={item.n}
                className={`sig-onboard-dot ${step === item.n ? 'is-current' : step > item.n ? 'is-done' : ''}`}
              >
                <span className="sig-onboard-dot__circle">{step > item.n ? '✓' : item.n}</span>
                <span className="sig-onboard-dot__label">{item.label}</span>
              </div>
            ))}
          </div>
        </header>

        <main className="sig-page__content sig-form-content" style={{ paddingBottom: '44px' }}>
          <section key={`hero-${step}`} className="sig-profile-hero sig-onboard-anim-in">
            <div className="sig-profile-hero__badge">Langkah {step} dari 3</div>
            <h1 className="sig-profile-hero__title">{currentMeta.title}</h1>
            <p className="sig-profile-hero__sub">{currentMeta.sub}</p>
          </section>

          <form
            onSubmit={(e) => e.preventDefault()}
            className={shake ? 'sig-onboard-shake' : ''}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {step === 1 && (
              <div key="step-1" className="sig-onboard-step-panel sig-onboard-anim-in">
                <div className="sig-onboard-greeting">
                  <div className="sig-onboard-avatar-preview">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar pilihan" />
                    ) : (
                      <UserIcon size={28} color="#ffffff" />
                    )}
                  </div>
                  <div>
                    <div className="sig-onboard-greeting__title">
                      Halo, {fullName.trim() || 'Warga Hebat'}!
                    </div>
                    <div className="sig-onboard-greeting__sub">
                      Pilih gaya avatarmu dan lengkapi data dirimu di bawah ini.
                    </div>
                  </div>
                </div>

                <div className="sig-profile-card">
                  <h3 className="sig-profile-card__title">Foto Profil / Avatar</h3>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    onChange={handleAvatarFileChange}
                    style={{ display: 'none' }}
                  />
                  <div className="sig-avatar-grid">
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`sig-avatar-option ${avatarUrl === preset.url ? 'is-selected' : ''}`}
                        onClick={() => setAvatarUrl(preset.url)}
                      >
                        <img src={preset.url} alt={preset.label} />
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="sig-button sig-button--secondary sig-button--sm sig-button--full"
                    disabled={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {uploadingAvatar ? 'Mengunggah foto...' : 'Unggah Foto Sendiri (JPG/PNG, maks 5 MB)'}
                  </button>
                </div>

                <div className="sig-profile-card">
                  <h3 className="sig-profile-card__title">Identitas Warga</h3>
                  <div className="sig-profile-field">
                    <label>
                      Nama Lengkap <span className="sig-form__req">*)</span>
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      autoFocus
                    />
                  </div>

                  <div className="sig-profile-field">
                    <label>
                      Alamat Email <span className="sig-form__req">*)</span>{' '}
                      {identity.emailVerified && <span className="sig-profile-chip">Terverifikasi</span>}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      readOnly={Boolean(identity.email)}
                      placeholder="nama@email.com"
                    />
                  </div>

                  <div className="sig-profile-field">
                    <label>Nomor Telepon / WhatsApp (Opsional)</label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="0812xxxxxxxx"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div key="step-2" className="sig-onboard-step-panel sig-onboard-anim-in">
                <div className="sig-profile-card">
                  <h3 className="sig-profile-card__title">
                    Pilih Kota / Kabupatenmu <span className="sig-form__req">*)</span>
                  </h3>
                  <div className="sig-city-cards">
                    {MUNICIPALITIES.map((mun) => (
                      <button
                        key={mun.code}
                        type="button"
                        className={`sig-city-card ${municipalityCode === mun.code ? 'is-selected' : ''}`}
                        onClick={() => {
                          setMunicipalityCode(mun.code);
                          setDistrictCode('');
                        }}
                      >
                        <span className="sig-city-card__badge">{mun.badge}</span>
                        <div className="sig-city-card__text">
                          <strong>{mun.name}</strong>
                          <small>{mun.subtitle}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sig-profile-card">
                  <h3 className="sig-profile-card__title">Kecamatan & Kelurahan (Opsional)</h3>
                  <div className="sig-chip-row">
                    {activeMunicipality.districts.map((dist) => (
                      <button
                        key={dist}
                        type="button"
                        className={`sig-quick-chip ${districtCode === dist ? 'is-selected' : ''}`}
                        onClick={() => setDistrictCode(dist)}
                      >
                        {dist}
                      </button>
                    ))}
                  </div>

                  <div className="sig-profile-field">
                    <label>Kecamatan</label>
                    <input
                      type="text"
                      value={districtCode}
                      onChange={(e) => setDistrictCode(e.target.value)}
                      placeholder="Pilih di atas atau ketik kecamatanmu"
                    />
                  </div>

                  <div className="sig-profile-field">
                    <label>Kelurahan / Desa</label>
                    <input
                      type="text"
                      value={subdistrictCode}
                      onChange={(e) => setSubdistrictCode(e.target.value)}
                      placeholder="Contoh: Poris Plawad"
                    />
                  </div>
                </div>

                <div className="sig-profile-card">
                  <h3 className="sig-profile-card__title">Bahasa Pilihan</h3>
                  <div className="sig-lang-toggle">
                    {[
                      { code: 'id', label: 'Bahasa Indonesia' },
                      { code: 'en', label: 'English' },
                    ].map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        className={`sig-lang-btn ${preferredLanguage === lang.code ? 'is-selected' : ''}`}
                        onClick={() => setPreferredLanguage(lang.code)}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div key="step-3" className="sig-onboard-step-panel sig-onboard-anim-in">
                <div className="sig-profile-card">
                  <h3 className="sig-profile-card__title">Atur Notifikasi Pintar</h3>
                  <div className="sig-pref-cards">
                    {PREF_ITEMS.map((item) => {
                      const active = Boolean(prefs[item.key]);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`sig-pref-toggle-card ${active ? 'is-active' : ''}`}
                          onClick={() => togglePref(item.key)}
                        >
                          <div className="sig-pref-toggle-card__text">
                            <strong>{item.title}</strong>
                            <small>{item.desc}</small>
                          </div>
                          <span className={`sig-switch ${active ? 'is-on' : ''}`} aria-hidden="true">
                            <span className="sig-switch__thumb" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sig-onboard-summary">
                  <div className="sig-onboard-summary__avatar">
                    {avatarUrl ? <img src={avatarUrl} alt={fullName} /> : <UserIcon size={22} color="#ffffff" />}
                  </div>
                  <div className="sig-onboard-summary__body">
                    <strong>{fullName}</strong>
                    <span>
                      {[districtCode, activeMunicipality.name].filter(Boolean).join(', ')} • Bahasa{' '}
                      {preferredLanguage.toUpperCase()}
                    </span>
                    <small>{enabledPrefCount} notifikasi aktif</small>
                  </div>
                </div>
              </div>
            )}

            {error && <p className="sig-onboard-error">{error}</p>}

            <div className="sig-onboard-actions">
              {step > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setError('');
                    setStep((prev) => prev - 1);
                  }}
                >
                  Kembali
                </Button>
              )}

              {step < 3 ? (
                <Button
                  key={`btn-next-${step}`}
                  type="button"
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleNextStep}
                >
                  {step === 1 ? 'Lanjut ke Wilayah' : 'Lanjut ke Notifikasi'}
                </Button>
              ) : (
                <Button
                  key="btn-finish-3"
                  type="button"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={saving || !stepReady}
                  onClick={handleSubmit}
                >
                  {saving ? 'Menyiapkan Akun...' : 'Selesaikan & Masuk ke Sigmata'}
                </Button>
              )}
            </div>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="sig-page sig-page--form">
      <Navbar
        type="form"
        title="Profil & Preferensi"
        onCloseClick={onBack}
        onMenuClick={onBack}
      />

      <main className="sig-page__content sig-form-content" style={{ paddingBottom: '48px' }}>
        <section className="sig-profile-hero">
          <div className="sig-profile-hero__badge">Status Akun: {existing?.accountStatus || 'active'}</div>
          <h2 className="sig-profile-hero__title">{fullName || 'Profil Warga'}</h2>
          <p className="sig-profile-hero__sub">
            Perbarui informasi kontak, wilayah domisili, dan preferensi notifikasi laporanmu.
          </p>
        </section>

        <section className="sig-track-metrics" aria-label="Statistik laporan">
          <div className="sig-track-metric">
            <strong>{stats.totalSubmitted ?? 0}</strong>
            <span>Laporan</span>
          </div>
          <div className="sig-track-metric">
            <strong>{stats.forwardedCount ?? 0}</strong>
            <span>Diteruskan</span>
          </div>
          <div className="sig-track-metric">
            <strong>{stats.totalUpvotesReceived ?? 0}</strong>
            <span>Total Upvote</span>
          </div>
        </section>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="sig-profile-card">
            <h3 className="sig-profile-card__title">Identitas & Kontak</h3>

            <div className="sig-profile-field">
              <label>
                Nama Lengkap <span className="sig-form__req">*)</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                required
              />
            </div>

            <div className="sig-profile-field">
              <label>
                Email <span className="sig-form__req">*)</span>{' '}
                {identity.emailVerified && <span className="sig-profile-chip">Terverifikasi</span>}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={Boolean(identity.email)}
                placeholder="nama@email.com"
                required
              />
            </div>

            <div className="sig-profile-field">
              <label>Nomor Telepon / WhatsApp (Opsional)</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0812xxxxxxxx"
              />
            </div>

            <div className="sig-profile-field">
              <label>Foto Avatar (JPG/PNG, maks 5 MB)</label>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                onChange={handleAvatarFileChange}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="sig-onboard-avatar-preview" style={{ width: '44px', height: '44px', animation: 'none' }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" />
                  ) : (
                    <UserIcon size={22} color="#ffffff" />
                  )}
                </div>
                <button
                  type="button"
                  className="sig-button sig-button--secondary sig-button--sm"
                  disabled={uploadingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {uploadingAvatar ? 'Mengunggah...' : 'Unggah Foto Baru'}
                </button>
              </div>
            </div>
          </div>

          <div className="sig-profile-card">
            <h3 className="sig-profile-card__title">Wilayah Domisili & Bahasa</h3>

            <div className="sig-profile-field">
              <label>
                Kota / Kabupaten <span className="sig-form__req">*)</span>
              </label>
              <select value={municipalityCode} onChange={(e) => setMunicipalityCode(e.target.value)}>
                {MUNICIPALITIES.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sig-profile-field">
              <label>Kecamatan (Opsional)</label>
              <input
                type="text"
                value={districtCode}
                onChange={(e) => setDistrictCode(e.target.value)}
                placeholder="Contoh: Cipondoh / Coblong"
              />
            </div>

            <div className="sig-profile-field">
              <label>Kelurahan / Desa (Opsional)</label>
              <input
                type="text"
                value={subdistrictCode}
                onChange={(e) => setSubdistrictCode(e.target.value)}
                placeholder="Contoh: Poris Plawad"
              />
            </div>

            <div className="sig-profile-field">
              <label>Bahasa Pilihan</label>
              <select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}>
                <option value="id">Bahasa Indonesia (id)</option>
                <option value="en">English (en)</option>
              </select>
            </div>
          </div>

          <div className="sig-profile-card">
            <h3 className="sig-profile-card__title">Preferensi Notifikasi</h3>
            <div className="sig-pref-list">
              {PREF_ITEMS.map((item) => (
                <label key={item.key} className="sig-pref-row">
                  <span>{item.title}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[item.key])}
                    onChange={() => togglePref(item.key)}
                  />
                </label>
              ))}
            </div>
          </div>

          {error && <p style={{ color: '#dc2626', fontSize: '12.5px', fontWeight: 600 }}>{error}</p>}

          <div style={{ display: 'flex', gap: '8px' }}>
            {onBack && (
              <Button type="button" variant="secondary" size="lg" fullWidth onClick={onBack}>
                Kembali
              </Button>
            )}
            <Button type="submit" variant="primary" size="lg" fullWidth disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
