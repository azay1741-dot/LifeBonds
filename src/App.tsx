import {
  Activity,
  Binary,
  ClipboardList,
  FileBarChart2,
  Menu,
  Plus,
  Stethoscope,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  updatePriorityApi,
} from './api';
import { DoctorsRosterView } from './components/DoctorsRosterView';
import { DsaInspectorView } from './components/DsaInspectorView';
import {
  AssignDoctorModal,
  PatientTimelineDrawer,
  RegisterPatientModal,
  UpdatePriorityModal,
} from './components/Modals';
import { ReportsAuditView } from './components/ReportsAuditView';
import { TriageQueueView } from './components/TriageQueueView';
import { HospitalSnapshot, Patient, PriorityLevel, TreatmentEvent } from './types';

type NavTab = 'triage' | 'doctors' | 'dsa' | 'reports';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof ClipboardList }> = [
  { id: 'triage', label: 'Triage Queue', icon: ClipboardList },
  { id: 'doctors', label: 'Doctors & Bays', icon: Stethoscope },
  { id: 'dsa', label: 'DSA Inspector', icon: Binary },
  { id: 'reports', label: 'Reports & Audit', icon: FileBarChart2 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('triage');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<HospitalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [priorityPatient, setPriorityPatient] = useState<Patient | null>(null);
  const [assignPatient, setAssignPatient] = useState<Patient | null>(null);
  const [timelinePatient, setTimelinePatient] = useState<Patient | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TreatmentEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const data = await fetchHospitalState();
      setSnapshot(data);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to reach hospital server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
    const timer = setInterval(() => {
      void loadState();
    }, 15_000);
    return () => clearInterval(timer);
  }, [loadState]);

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
    try {
      const res = await fetchPatientTimelineApi(patient.id);
      setTimelineEvents(res.events);
    } catch {
      setTimelineEvents([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  async function handleResetDemo() {
    const res = await resetDemoApi();
    setSnapshot(res.snapshot);
    setErrorBanner(null);
  }

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (248px) */}
      <aside className="hidden lg:flex lg:w-[248px] lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 no-print">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200">
          <Activity className="w-5 h-5 text-teal-700 shrink-0" />
          <span className="font-semibold text-base tracking-tight text-slate-900 whitespace-nowrap">
            PulseQueue ER
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-1" aria-label="Workspace Navigation">
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

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <div className="font-medium text-slate-700">Emergency Triage Unit</div>
          <div>Min-Heap · FIFO · HashMap · LinkedList</div>
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
                <span className="font-semibold text-sm text-slate-900">PulseQueue ER</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-500 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
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
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[248px] flex flex-col min-w-0">
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
                  onDispatchNext={handleDispatchNext}
                  onOpenPriorityModal={(p) => setPriorityPatient(p)}
                  onOpenAssignModal={(p) => setAssignPatient(p)}
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
                  onAddDoctor={handleAddDoctor}
                />
              )}

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
      <PatientTimelineDrawer
        patient={timelinePatient}
        events={timelineEvents}
        loading={timelineLoading}
        onClose={() => setTimelinePatient(null)}
      />
    </div>
  );
}
