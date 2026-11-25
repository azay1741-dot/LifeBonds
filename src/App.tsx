import {
  Activity,
  AlertTriangle,
  Binary,
  Box,
  ClipboardList,
  ExternalLink,
  FileBarChart2,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RegisterPatientPayload,
  addDoctorApi,
  assignDoctorToPatientApi,
  completeTreatmentApi,
  dispatchNextPatientApi,
  fetchHospitalState,
  fetchPatientTimelineApi,
  registerPatientApi,
  resetDemoApi,
  toggleDoctorStatusApi,
  transferPatientApi,
  updatePriorityApi,
} from './api';
import { ClinicalAiPanel } from './components/ClinicalAiPanel';
import { DoctorsRosterView } from './components/DoctorsRosterView';
import { DsaInspectorView } from './components/DsaInspectorView';
import { EmergencyMapView } from './components/EmergencyMapView';
import { Er3DSceneView } from './components/Er3DSceneView';
import {
  AssignDoctorModal,
  PatientTimelineDrawer,
  RegisterPatientModal,
  TransferPatientModal,
  UpdatePriorityModal,
} from './components/Modals';
import { ReportsAuditView } from './components/ReportsAuditView';
import { TriageQueueView } from './components/TriageQueueView';
import { useAuth } from './context/AuthContext';
import { playDiscreetCriticalChime, unlockCriticalAlertAudio } from './lib/audioAlert';
import { HospitalSnapshot, Patient, PriorityLevel, TreatmentEvent } from './types';

const AUDIO_ALERT_STORAGE_KEY = 'lifebonds_critical_audio_alert';

type NavTab = 'triage' | 'doctors' | 'twin3d' | 'referrals' | 'copilot' | 'dsa' | 'reports';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof ClipboardList }> = [
  { id: 'triage', label: 'Triage Queue', icon: ClipboardList },
  { id: 'doctors', label: 'Doctors & Bays', icon: Stethoscope },
  { id: 'twin3d', label: '3D ER Twin', icon: Box },
  { id: 'referrals', label: 'Campus & Referrals', icon: MapPin },
  { id: 'copilot', label: 'Clinical Copilot', icon: Sparkles },
  { id: 'dsa', label: 'DSA Inspector', icon: Binary },
  { id: 'reports', label: 'Reports & Audit', icon: FileBarChart2 },
];

export default function App() {
  const { user, authReady, signingIn, authError, signInWithGoogle, signOutUser } = useAuth();

  const [activeTab, setActiveTab] = useState<NavTab>('triage');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<HospitalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [priorityPatient, setPriorityPatient] = useState<Patient | null>(null);
  const [assignPatient, setAssignPatient] = useState<Patient | null>(null);
  const [transferPatient, setTransferPatient] = useState<Patient | null>(null);
  const [timelinePatient, setTimelinePatient] = useState<Patient | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TreatmentEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [audioAlertEnabled, setAudioAlertEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(AUDIO_ALERT_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const knownQueueIdsRef = useRef<Set<string> | null>(null);
  const skipNextAlertRef = useRef(false);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const loadState = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchHospitalState();
      setSnapshot(data);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to reach hospital server.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setSnapshot(null);
      return;
    }
    setLoading(true);
    void loadState();
    const timer = setInterval(() => {
      void loadState();
    }, 15_000);
    return () => clearInterval(timer);
  }, [user, loadState]);

  useEffect(() => {
    const unlockOnce = () => {
      void unlockCriticalAlertAudio();
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, []);

  useEffect(() => {
    if (!snapshot) {
      knownQueueIdsRef.current = null;
      return;
    }

    const currentQueueIds = new Set<string>([
      ...snapshot.emergencyQueue.map((p) => p.id),
      ...snapshot.standardQueue.map((p) => p.id),
    ]);

    if (knownQueueIdsRef.current === null || skipNextAlertRef.current) {
      knownQueueIdsRef.current = currentQueueIds;
      skipNextAlertRef.current = false;
      return;
    }

    const hasNewCriticalArrival = snapshot.emergencyQueue.some(
      (p) => p.priority === 1 && !knownQueueIdsRef.current!.has(p.id)
    );

    knownQueueIdsRef.current = currentQueueIds;

    if (hasNewCriticalArrival && audioAlertEnabled) {
      void playDiscreetCriticalChime();
    }
  }, [snapshot, audioAlertEnabled]);

  function handleToggleAudioAlert() {
    setAudioAlertEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUDIO_ALERT_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      if (next) {
        void playDiscreetCriticalChime();
      }
      return next;
    });
  }

  async function handleRegister(payload: RegisterPatientPayload) {
    const res = await registerPatientApi(payload);
    setSnapshot(res.snapshot);
    setErrorBanner(null);
  }

  async function handleUpdatePriority(
    patientId: string,
    newPriority: PriorityLevel,
    reason: string
  ) {
    const res = await updatePriorityApi(patientId, newPriority, reason);
    setSnapshot(res.snapshot);
    setErrorBanner(null);
  }

  async function handleDispatchNext(doctorId: string) {
    setBusyAction(`dispatch-${doctorId}`);
    try {
      const res = await dispatchNextPatientApi(doctorId);
      setSnapshot(res.snapshot);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Dispatch failed.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAssignDoctor(patientId: string, doctorId: string) {
    const res = await assignDoctorToPatientApi(patientId, doctorId);
    setSnapshot(res.snapshot);
    setErrorBanner(null);
  }

  async function handleCompleteTreatment(
    patientId: string,
    outcome: 'Discharged' | 'Transferred'
  ) {
    setBusyAction(`complete-${patientId}`);
    try {
      const res = await completeTreatmentApi(patientId, outcome);
      setSnapshot(res.snapshot);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to complete treatment.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTransferPatient(
    patientId: string,
    destination: string,
    reason: string
  ) {
    setBusyAction(`transfer-${patientId}`);
    try {
      const res = await transferPatientApi(patientId, destination, reason);
      setSnapshot(res.snapshot);
      setErrorBanner(null);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleDoctor(doctorId: string, status: 'Available' | 'Off-Duty') {
    try {
      const res = await toggleDoctorStatusApi(doctorId, status);
      setSnapshot(res.snapshot);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to update doctor status.');
    }
  }

  async function handleAddDoctor(name: string, specialty: string, bay: string) {
    const res = await addDoctorApi(name, specialty, bay);
    setSnapshot(res.snapshot);
    setErrorBanner(null);
  }

  async function handleOpenTimeline(patient: Patient) {
    setTimelinePatient(patient);
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const res = await fetchPatientTimelineApi(patient.id);
      setTimelineEvents(res.events);
    } catch (err) {
      setTimelineEvents([]);
      setTimelineError(err instanceof Error ? err.message : 'Unable to load patient timeline.');
    } finally {
      setTimelineLoading(false);
    }
  }

  async function handleResetDemo() {
    skipNextAlertRef.current = true;
    const res = await resetDemoApi();
    setSnapshot(res.snapshot);
    setErrorBanner(null);
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-xs text-slate-500 font-medium">Initializing clinical workspace...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 space-y-6 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Lifebonds</h1>
              <p className="text-xs text-slate-500">Hospital Emergency &amp; Priority Management</p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <p>
              Sign in with your Google staff account to access live triage queues, Cloud SQL PostgreSQL patient records, 3D ER Bay Floor Twin, Outpatient Referral Maps, and Clinical AI Copilot.
            </p>
          </div>

          {authError && (
            <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {authError}
            </div>
          )}

          <button
            type="button"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
            className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <LogIn className="w-4 h-4" />
            <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>
        </div>
      </div>
    );
  }

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (248px) */}
      <aside className="hidden lg:flex lg:w-[248px] lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 no-print">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200">
          <Activity className="w-5 h-5 text-teal-700 shrink-0" />
          <span className="font-semibold text-base tracking-tight text-slate-900 whitespace-nowrap">
            Lifebonds
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Workspace Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-teal-50 text-teal-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-800 truncate">
              {user.displayName || 'Clinical Staff'}
            </div>
            <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="w-full px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white border-r border-slate-200 flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-teal-700" />
                <span className="font-semibold text-sm text-slate-900">Lifebonds</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-500 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      isActive ? 'bg-teal-50 text-teal-900' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg inline-flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[248px] print:pl-0 flex flex-col min-w-0">
        {/* Sticky Google Maps Demo Quota Warning Banner */}
        {mapsQuotaExceeded && (
          <div
            role="alert"
            className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm sticky top-0 z-50 shadow-sm flex flex-wrap items-center justify-between gap-3 no-print"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Google Maps Platform quota reached. If you are the app owner, visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-amber-950 hover:text-amber-800 inline-flex items-center gap-1"
                >
                  <span>maps developer site</span>
                  <ExternalLink className="w-3 h-3" />
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMapsQuotaExceeded(false)}
              className="font-medium underline cursor-pointer text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top Workspace Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-400 hidden sm:inline">Emergency Dept</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{currentNav.label}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Register Patient</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {errorBanner && (
            <div
              role="alert"
              className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3 text-xs text-red-800"
            >
              <span>{errorBanner}</span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="font-medium underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading || !snapshot ? (
            <div className="space-y-6" aria-busy="true">
              <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} className="p-5 space-y-2">
                    <div className="h-3 w-24 bg-slate-200 rounded" />
                    <div className="h-7 w-16 bg-slate-200 rounded" />
                    <div className="h-3 w-32 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
              <div className="h-80 bg-white border border-slate-200 rounded-lg p-5 space-y-3">
                <div className="h-4 w-48 bg-slate-200 rounded" />
                <div className="h-10 w-full bg-slate-100 rounded" />
                <div className="h-10 w-full bg-slate-100 rounded" />
                <div className="h-10 w-full bg-slate-100 rounded" />
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'triage' && (
                <TriageQueueView
                  snapshot={snapshot}
                  busyAction={busyAction}
                  audioAlertEnabled={audioAlertEnabled}
                  onToggleAudioAlert={handleToggleAudioAlert}
                  onDispatchNext={handleDispatchNext}
                  onOpenPriorityModal={(p) => setPriorityPatient(p)}
                  onOpenAssignModal={(p) => setAssignPatient(p)}
                  onOpenTransferModal={(p) => setTransferPatient(p)}
                  onOpenTimeline={handleOpenTimeline}
                  onCompleteTreatment={handleCompleteTreatment}
                  onOpenRegister={() => setRegisterOpen(true)}
                />
              )}

              {activeTab === 'doctors' && (
                <DoctorsRosterView
                  snapshot={snapshot}
                  busyAction={busyAction}
                  onDispatchNext={handleDispatchNext}
                  onToggleDoctorStatus={handleToggleDoctor}
                  onCompleteTreatment={handleCompleteTreatment}
                  onOpenTransferModal={(p) => setTransferPatient(p)}
                  onAddDoctor={handleAddDoctor}
                />
              )}

              {activeTab === 'twin3d' && (
                <Er3DSceneView
                  snapshot={snapshot}
                  busyAction={busyAction}
                  onDispatchNext={handleDispatchNext}
                  onCompleteTreatment={handleCompleteTreatment}
                />
              )}

              {activeTab === 'referrals' && <EmergencyMapView />}

              {activeTab === 'copilot' && <ClinicalAiPanel />}

              {activeTab === 'dsa' && <DsaInspectorView snapshot={snapshot} />}

              {activeTab === 'reports' && (
                <ReportsAuditView
                  snapshot={snapshot}
                  onOpenTimeline={handleOpenTimeline}
                  onResetDemo={handleResetDemo}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      <RegisterPatientModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSubmit={handleRegister}
      />
      <UpdatePriorityModal
        patient={priorityPatient}
        onClose={() => setPriorityPatient(null)}
        onSubmit={handleUpdatePriority}
      />
      <AssignDoctorModal
        patient={assignPatient}
        doctors={snapshot?.doctors ?? []}
        onClose={() => setAssignPatient(null)}
        onAssign={handleAssignDoctor}
      />
      <TransferPatientModal
        patient={transferPatient}
        onClose={() => setTransferPatient(null)}
        onTransfer={handleTransferPatient}
      />
      <PatientTimelineDrawer
        patient={timelinePatient}
        events={timelineEvents}
        loading={timelineLoading}
        error={timelineError}
        onClose={() => setTimelinePatient(null)}
      />
    </div>
  );
}
