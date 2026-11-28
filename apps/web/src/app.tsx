import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

type Session = {
  subject: string
  roles: string[] | null
  email?: string
  emailVerified?: boolean
  name?: string
  preferredUsername?: string
}
type SessionStatus = 'loading' | 'signedIn' | 'signedOut' | 'error'

type Agency = { id: string; label: string }
type Department = { id: string; agencyId: string; code: string; name: string }
type Municipality = { code: string; name: string; municipalityId: string }

type OperatorProfile = {
  id: string
  identitySubject: string
  fullName: string
  email: string
  employeeNumber: string | null
  agencyId: string
  agencyLabel: string | null
  municipalityCode: string
  departmentId: string | null
  departmentName: string | null
  position: string | null
  officialPhoneNumber: string | null
  avatarUrl: string | null
  accountStatus: string
  createdAt: string
  updatedAt: string
}

type OperatorStats = {
  awaitingReviewCount: number
  agencyAssignedCount: number
  decisionsMadeByOperator: number
  overdueSlaCount: number
}

type ProfileResponse = {
  onboarded: boolean
  identity: {
    subject: string
    email: string
    emailVerified: boolean
    name: string
    preferredUsername: string
    roles: string[] | null
  }
  profile: OperatorProfile | null
  statistics: OperatorStats
  sourceOfTruth: Record<string, string>
}

const authPath = '/api/auth/internal'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [profileRes, setProfileRes] = useState<ProfileResponse | null>(null)
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [municipalities, setMunicipalities] = useState<Municipality[]>([
    { code: '36.71', name: 'Kota Tangerang', municipalityId: '00000000-0000-0000-0000-000000000001' },
    { code: '34.71', name: 'Kota Yogyakarta', municipalityId: '00000000-0000-0000-0000-000000000002' },
  ])

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [municipalityCode, setMunicipalityCode] = useState('36.71')
  const [agencyId, setAgencyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [position, setPosition] = useState('')
  const [officialPhoneNumber, setOfficialPhoneNumber] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const loadOperatorContext = useCallback(async (signal?: AbortSignal) => {
    const [profResp, orgResp] = await Promise.all([
      fetch('/api/internal/profile', { credentials: 'same-origin', cache: 'no-store', signal }),
      fetch('/api/internal/organizations', { credentials: 'same-origin', cache: 'no-store', signal }),
    ])
    if (orgResp.ok) {
      const orgData = await orgResp.json()
      setAgencies(orgData.agencies || [])
      setDepartments(orgData.departments || [])
      if (orgData.municipalities?.length) setMunicipalities(orgData.municipalities)
      if (!agencyId && orgData.agencies?.length) {
        setAgencyId(orgData.agencies[0].id)
      }
    }
    if (profResp.ok) {
      const data: ProfileResponse = await profResp.json()
      setProfileRes(data)
      const p = data.profile
      setFullName(p?.fullName || data.identity.name || '')
      setEmail(p?.email || data.identity.email || '')
      setEmployeeNumber(p?.employeeNumber || '')
      setMunicipalityCode(p?.municipalityCode || '36.71')
      if (p?.agencyId) setAgencyId(p.agencyId)
      setDepartmentId(p?.departmentId || '')
      setPosition(p?.position || '')
      setOfficialPhoneNumber(p?.officialPhoneNumber || '')
      setAvatarUrl(p?.avatarUrl || '')
    }
  }, [agencyId])

  const checkSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${authPath}/session`, { credentials: 'same-origin', cache: 'no-store', signal })
      if (response.status === 401) {
        setSession(null)
        setStatus('signedOut')
        return
      }
      if (!response.ok) throw new Error('Session request failed')
      const data: Session = await response.json()
      setSession(data)
      setStatus('signedIn')
      await loadOperatorContext(signal)
    } catch {
      if (signal?.aborted) return
      setSession(null)
      setStatus('error')
    }
  }, [loadOperatorContext])

  useEffect(() => {
    const controller = new AbortController()
    void checkSession(controller.signal)
    return () => controller.abort()
  }, [checkSession])

  const filteredDepartments = useMemo(
    () => departments.filter((d) => d.agencyId === agencyId),
    [departments, agencyId]
  )

  const requiresEmployeeNumber = Boolean(
    session?.roles?.some((r) => r === 'operator' || r === 'opdStaff')
  )

  const handleAvatarUpload = async (file: File | undefined) => {
    if (!file) return
    setUploadingAvatar(true)
    setFeedback(null)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const resp = await fetch('/api/internal/profile/avatar', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      if (!resp.ok) {
        const msg = (await resp.text()).trim()
        throw new Error(msg || 'Gagal mengunggah avatar')
      }
      const data = await resp.json()
      if (data.avatarUrl) setAvatarUrl(data.avatarUrl)
      setFeedback({ type: 'ok', text: 'Foto avatar berhasil diunggah ke Garage.' })
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mengunggah avatar' })
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setFeedback(null)
    try {
      const resp = await fetch('/api/internal/profile', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          employeeNumber: employeeNumber.trim() || null,
          agencyId,
          municipalityCode,
          departmentId: departmentId || null,
          position: position.trim() || null,
          officialPhoneNumber: officialPhoneNumber.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          accountStatus: 'active',
        }),
      })
      if (!resp.ok) {
        const msg = (await resp.text()).trim()
        throw new Error(msg || 'Gagal menyimpan profil petugas')
      }
      const saved: ProfileResponse = await resp.json()
      setProfileRes(saved)
      setFeedback({ type: 'ok', text: 'Profil petugas pemerintah berhasil disimpan ke PostgreSQL.' })
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan profil' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-neutral-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">SIGMATA-LAKSA • Portal Petugas Pemerintah</p>
          <h1 className="text-2xl font-bold">
            {status === 'signedIn' && profileRes && !profileRes.onboarded
              ? 'Onboarding Profil Petugas Pemerintah'
              : 'Profil & Afiliasi Instansi Pemerintah'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {status !== 'signedIn' ? (
            <a href={`${authPath}/login`} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
              Masuk dengan Keycloak
            </a>
          ) : (
            <form action={`${authPath}/logout`} method="post">
              <button type="submit" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100">
                Keluar
              </button>
            </form>
          )}
        </div>
      </header>

      {status === 'loading' && <p className="mt-8 text-sm text-neutral-600">Memeriksa sesi Keycloak...</p>}
      {status === 'signedOut' && (
        <section className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
          <h2 className="text-lg font-semibold">Autentikasi Diperlukan</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Masuk menggunakan akun staf Keycloak (peran <code>operator</code>, <code>opdStaff</code>, atau <code>admin</code>) untuk melengkapi onboarding profil instansi Anda.
          </p>
        </section>
      )}
      {status === 'error' && (
        <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Tidak dapat terhubung ke Go API (`/api/auth/internal/session`). Pastikan `api` dan `redis` berjalan.
        </section>
      )}

      {status === 'signedIn' && session && (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="space-y-4 md:col-span-2">
            {profileRes && !profileRes.onboarded && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <strong>Onboarding Diperlukan:</strong> Lengkapi afiliasi OPD/instansi dan identitas pegawai Anda sebelum memproses antrean pengaduan.
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Data Profil Petugas Pemerintah</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-neutral-700">
                  Nama Lengkap *
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    placeholder="Nama beserta gelar"
                  />
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  Email Dinas * {session.emailVerified && <span className="ml-1 text-emerald-700">(Keycloak Verified)</span>}
                  <input
                    type="email"
                    required
                    value={email}
                    readOnly={Boolean(session.email)}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm"
                    placeholder="petugas@pemda.go.id"
                  />
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  NIP / ID Pegawai {requiresEmployeeNumber ? '*' : '(Opsional untuk Admin)'}
                  <input
                    type="text"
                    required={requiresEmployeeNumber}
                    value={employeeNumber}
                    onChange={(e) => setEmployeeNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    placeholder="Contoh: 199001012020121001"
                  />
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  Kode Wilayah Pemerintah Daerah *
                  <select
                    value={municipalityCode}
                    onChange={(e) => setMunicipalityCode(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  >
                    {municipalities.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} — {m.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-neutral-700 sm:col-span-2">
                  Instansi / Perangkat Daerah (OPD) *
                  <select
                    required
                    value={agencyId}
                    onChange={(e) => {
                      setAgencyId(e.target.value)
                      setDepartmentId('')
                    }}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  >
                    <option value="">-- Pilih OPD --</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  Bidang / Unit Kerja (Opsional)
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  >
                    <option value="">-- Umum / Tidak Ditentukan --</option>
                    {filteredDepartments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  Jabatan (Opsional)
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    placeholder="Contoh: Pejabat Penghubung OPD"
                  />
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  Telepon Resmi Dinas (Opsional)
                  <input
                    type="tel"
                    value={officialPhoneNumber}
                    onChange={(e) => setOfficialPhoneNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    placeholder="(021) 555-xxxx"
                  />
                </label>

                <div className="block text-xs font-semibold text-neutral-700 sm:col-span-2">
                  Foto Avatar (JPG/PNG, maks 5 MB — disimpan di Garage)
                  <div className="mt-2 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-neutral-300 bg-neutral-100 text-xs font-bold text-neutral-500">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar petugas" className="h-full w-full object-cover" />
                      ) : (
                        'OPD'
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg"
                      disabled={uploadingAvatar}
                      onChange={(e) => void handleAvatarUpload(e.target.files?.[0])}
                      className="text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-teal-700 hover:file:bg-teal-100"
                    />
                    {uploadingAvatar && <span className="text-xs text-teal-700">Mengunggah...</span>}
                  </div>
                </div>
              </div>

              {feedback && (
                <p className={`text-sm font-medium ${feedback.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {feedback.text}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : profileRes?.onboarded ? 'Simpan Perubahan Profil' : 'Selesaikan Onboarding'}
              </button>
            </form>
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Statistik Pengaduan (SQL)</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-neutral-50 p-3">
                  <div className="text-xl font-bold text-teal-700">{profileRes?.statistics?.awaitingReviewCount ?? 0}</div>
                  <div className="text-xs text-neutral-600">Antrean Tinjauan</div>
                </div>
                <div className="rounded-lg bg-neutral-50 p-3">
                  <div className="text-xl font-bold text-teal-700">{profileRes?.statistics?.agencyAssignedCount ?? 0}</div>
                  <div className="text-xs text-neutral-600">Laporan OPD</div>
                </div>
                <div className="rounded-lg bg-neutral-50 p-3">
                  <div className="text-xl font-bold text-teal-700">{profileRes?.statistics?.decisionsMadeByOperator ?? 0}</div>
                  <div className="text-xs text-neutral-600">Disposisi Saya</div>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <div className="text-xl font-bold text-red-700">{profileRes?.statistics?.overdueSlaCount ?? 0}</div>
                  <div className="text-xs text-red-700">SLA Terlewat</div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-5 text-xs text-neutral-700 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Batas Sumber Kebenaran</h2>
              <dl className="mt-3 space-y-1.5">
                <div className="flex justify-between gap-2"><dt>Keycloak Subject</dt><dd className="truncate font-mono">{session.subject}</dd></div>
                <div className="flex justify-between gap-2"><dt>Roles (Keycloak)</dt><dd className="font-semibold">{session.roles?.join(', ') || '-'}</dd></div>
                <div className="flex justify-between gap-2"><dt>Account Status</dt><dd className="font-semibold">{profileRes?.profile?.accountStatus || 'pending_onboarding'}</dd></div>
                <div className="flex justify-between gap-2"><dt>Profil & Afiliasi</dt><dd>PostgreSQL</dd></div>
                <div className="flex justify-between gap-2"><dt>Lokasi Insiden</dt><dd>PostGIS</dd></div>
                <div className="flex justify-between gap-2"><dt>Otorisasi</dt><dd>Go BFF</dd></div>
              </dl>
            </section>
          </aside>
        </div>
      )}
    </main>
  )
}

export default App
