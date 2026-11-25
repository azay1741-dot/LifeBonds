import { ArrowRightLeft, ArrowUpDown, CheckCircle2, Clock, History, Printer, Search, Stethoscope, UserCheck, Volume2, VolumeX, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Doctor, HospitalSnapshot, Patient, PriorityLevel } from '../types';
import {
  DoctorStatusText,
  PatientStatusText,
  PriorityText,
  formatClock,
  formatMinutesSince,
} from './PriorityBadge';

interface TriageQueueViewProps {
  snapshot: HospitalSnapshot;
  busyAction: string | null;
  audioAlertEnabled: boolean;
  onToggleAudioAlert: () => void;
  onDispatchNext: (doctorId: string) => void;
  onOpenPriorityModal: (patient: Patient) => void;
  onOpenAssignModal: (patient: Patient) => void;
  onOpenTransferModal: (patient: Patient) => void;
  onOpenTimeline: (patient: Patient) => void;
  onCompleteTreatment: (patientId: string, outcome: 'Discharged' | 'Transferred') => void;
  onOpenRegister: () => void;
}

export function TriageQueueView({
  snapshot,
  busyAction,
  audioAlertEnabled,
  onToggleAudioAlert,
  onDispatchNext,
  onOpenPriorityModal,
  onOpenAssignModal,
  onOpenTransferModal,
  onOpenTimeline,
  onCompleteTreatment,
  onOpenRegister,
}: TriageQueueViewProps) {
  const [queueTab, setQueueTab] = useState<'emergency' | 'standard'>('emergency');
  const [priorityFilter, setPriorityFilter] = useState<'all' | PriorityLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const doctorsById = useMemo(() => {
    const map = new Map<string, Doctor>();
    for (const d of snapshot.doctors) map.set(d.id, d);
    return map;
  }, [snapshot.doctors]);

  const activePatients = useMemo(
    () => snapshot.allPatients.filter((p) => p.status === 'In Treatment'),
    [snapshot.allPatients]
  );

  const displayedQueue = useMemo(() => {
    const source = queueTab === 'emergency' ? snapshot.emergencyQueue : snapshot.standardQueue;
    const q = searchQuery.trim().toLowerCase();

    return source.filter((p) => {
      if (queueTab === 'emergency' && priorityFilter !== 'all' && p.priority !== priorityFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.complaint.toLowerCase().includes(q)
      );
    });
  }, [queueTab, snapshot.emergencyQueue, snapshot.standardQueue, priorityFilter, searchQuery]);

  const totalWaiting = snapshot.summary.emergencyWaitingCount + snapshot.summary.standardWaitingCount;
  const availableDoctors = snapshot.doctors.filter((d) => d.status === 'Available');

  const { activeEmergencyCount, activeStandardCount, emergencyPct, standardPct } = useMemo(() => {
    let emergency = 0;
    let standard = 0;
    for (const p of snapshot.allPatients) {
      if (p.status === 'Waiting' || p.status === 'In Treatment') {
        if (p.priority <= 3) emergency += 1;
        else standard += 1;
      }
    }
    const total = emergency + standard;
    if (total === 0) {
      return { activeEmergencyCount: 0, activeStandardCount: 0, emergencyPct: 0, standardPct: 0 };
    }
    const ePct = Math.round((emergency / total) * 100);
    return {
      activeEmergencyCount: emergency,
      activeStandardCount: standard,
      emergencyPct: ePct,
      standardPct: 100 - ePct,
    };
  }, [snapshot.allPatients]);

  return (
    <div className="space-y-6">
      {/* Printer-friendly summary header (visible only when printing) */}
      <div className="hidden print:flex items-baseline justify-between border-b border-slate-300 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Lifebonds — Triage Queue Summary</h1>
          <p className="text-xs text-slate-600">
            Active View: {queueTab === 'emergency' ? 'Emergency Min-Heap (P1–P3)' : 'Standard Walk-In FIFO (P4)'}
            {queueTab === 'emergency' && priorityFilter !== 'all' ? ` · Filter: P${priorityFilter}` : ''}
            {searchQuery.trim() ? ` · Search: "${searchQuery.trim()}"` : ''}
            {' · '}
            {displayedQueue.length} {displayedQueue.length === 1 ? 'patient' : 'patients'} listed
          </p>
        </div>
        <div className="text-right text-xs text-slate-600 font-mono tabular-nums">
          <div>Snapshot: {new Date(snapshot.serverTime).toLocaleString()}</div>
          <div>Emergency/Standard Active: {activeEmergencyCount}/{activeStandardCount}</div>
        </div>
      </div>

      {/* 4-column operational KPI strip with hairline dividers */}
      <section
        aria-label="Emergency Department Metrics"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200"
      >
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Emergency Min-Heap</p>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {snapshot.summary.emergencyWaitingCount}
            </span>
            <span className="text-xs text-red-700 font-medium tabular-nums">
              {snapshot.summary.criticalWaitingCount} P1 critical
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Plus {snapshot.summary.standardWaitingCount} in FIFO walk-in queue
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Average Waiting Time</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {snapshot.summary.avgWaitMinutes}m
            </span>
            <span className="text-xs text-slate-500">across {totalWaiting} waiting</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Dynamic wait adjusted by bay capacity</p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Available Doctors</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {snapshot.summary.availableDoctorsCount}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              / {snapshot.summary.totalDoctorsCount} on roster
            </span>
          </div>
          <p className="mt-1 text-xs text-emerald-700 font-medium">
            {availableDoctors.length > 0 ? 'Ready for immediate dispatch' : 'All active bays occupied'}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Active Treatments</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {snapshot.summary.inTreatmentCount}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {snapshot.summary.dischargedCount} completed today
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Tracked via Doubly Linked List log</p>
        </div>
      </section>

      {/* Main Workspace Grid: Waiting Queues (Left) + Doctor Dispatch & Active Bays (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Waiting Queue Table */}
        <section className="xl:col-span-8 print:col-span-12 bg-white border border-slate-200 rounded-lg overflow-hidden print:overflow-visible">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setQueueTab('emergency')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    queueTab === 'emergency'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Emergency Min-Heap ({snapshot.emergencyQueue.length})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueTab('standard')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    queueTab === 'standard'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Standard Walk-In FIFO ({snapshot.standardQueue.length})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Filter patients by name or ID"
                    placeholder="Search by name, ID, MRN..."
                    className="w-full pl-9 pr-8 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear patient search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onToggleAudioAlert}
                  aria-pressed={audioAlertEnabled}
                  title={
                    audioAlertEnabled
                      ? 'Critical arrival chime is active (click to mute)'
                      : 'Critical arrival chime is muted (click to enable)'
                  }
                  className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${
                    audioAlertEnabled
                      ? 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {audioAlertEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 text-teal-700" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{audioAlertEnabled ? 'Critical Chime On' : 'Critical Chime Off'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  title="Print a clean summary of the current triage queue"
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print Queue</span>
                </button>
              </div>
            </div>

            {/* Emergency vs Standard System Ratio Bar */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg px-3.5 py-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-700">
                  Active System Ratio (Emergency vs. Standard)
                </span>
                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold">
                    <span className="h-2 w-2 rounded-xs bg-red-600 shrink-0" aria-hidden="true" />
                    Emergency {activeEmergencyCount} ({emergencyPct}%)
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-teal-800 font-semibold">
                    <span className="h-2 w-2 rounded-xs bg-teal-600 shrink-0" aria-hidden="true" />
                    Standard {activeStandardCount} ({standardPct}%)
                  </span>
                </div>
              </div>
              <svg
                className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden block"
                role="img"
                aria-label={`Emergency to standard patient ratio: ${activeEmergencyCount} emergency (${emergencyPct}%) vs ${activeStandardCount} standard (${standardPct}%)`}
                preserveAspectRatio="none"
              >
                {activeEmergencyCount + activeStandardCount > 0 ? (
                  <>
                    {emergencyPct > 0 && (
                      <rect x="0" y="0" width={`${emergencyPct}%`} height="100%" fill="#dc2626" />
                    )}
                    {standardPct > 0 && (
                      <rect
                        x={`${emergencyPct}%`}
                        y="0"
                        width={`${standardPct}%`}
                        height="100%"
                        fill="#0d9488"
                      />
                    )}
                  </>
                ) : (
                  <rect x="0" y="0" width="100%" height="100%" fill="#e2e8f0" />
                )}
              </svg>
            </div>

            {queueTab === 'emergency' && (
              <div className="flex flex-wrap items-center justify-between gap-3 no-print">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['all', 1, 2, 3] as const).map((lvl) => (
                    <button
                      key={String(lvl)}
                      type="button"
                      onClick={() => setPriorityFilter(lvl)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        priorityFilter === lvl
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lvl === 'all' ? 'All Urgencies' : `P${lvl}`}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Ordered by severity (P1 &lt; P2 &lt; P3) then arrival time
                </p>
              </div>
            )}
          </div>

          {displayedQueue.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-900">
                {searchQuery.trim() || (queueTab === 'emergency' && priorityFilter !== 'all')
                  ? 'No waiting patients match the active filter.'
                  : queueTab === 'emergency'
                    ? 'Emergency Min-Heap is currently clear.'
                    : 'Standard Walk-In FIFO queue is empty.'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {searchQuery.trim() || (queueTab === 'emergency' && priorityFilter !== 'all')
                  ? 'Adjust your search term or reset the priority filter to view all queued patients.'
                  : 'Register an incoming patient to observe real-time priority scheduling.'}
              </p>
              {searchQuery.trim() || (queueTab === 'emergency' && priorityFilter !== 'all') ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPriorityFilter('all');
                  }}
                  className="mt-4 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenRegister}
                  className="mt-4 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Register Patient
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 pl-5 pr-3">Order</th>
                    <th className="py-2.5 px-3">Patient &amp; Complaint</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Vitals</th>
                    <th className="py-2.5 px-3 text-right">Wait / Est.</th>
                    <th className="py-2.5 pl-3 pr-5 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {displayedQueue.map((patient, idx) => {
                    const elapsed = formatMinutesSince(patient.arrivedAt, snapshot.serverTime);
                    const lowSpo2 = patient.vitals.spo2 < 92;
                    return (
                      <tr key={patient.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 pl-5 pr-3 align-top">
                          <span className="font-mono tabular-nums text-xs font-semibold text-slate-700">
                            #{idx + 1}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 align-top min-w-[220px]">
                          <div className="font-medium text-slate-900">{patient.name}</div>
                          <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono tabular-nums">{patient.mrn}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {patient.age}y {patient.gender[0]}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{patient.bloodGroup}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">Arrived {formatClock(patient.arrivedAt)}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-700 line-clamp-2">{patient.complaint}</p>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <div className="space-y-1">
                            <PriorityText priority={patient.priority} pulseOnCritical />
                            <div>
                              <PatientStatusText
                                status={patient.status}
                                isCritical={patient.priority === 1}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <div className="font-mono tabular-nums text-xs text-slate-700 space-y-0.5 whitespace-nowrap">
                            <div>
                              HR {patient.vitals.heartRate} ·{' '}
                              <span className={lowSpo2 ? 'text-red-700 font-semibold' : ''}>
                                SpO2 {patient.vitals.spo2}%
                              </span>
                            </div>
                            <div className="text-slate-500">
                              BP {patient.vitals.systolicBp}/{patient.vitals.diastolicBp} ·{' '}
                              {patient.vitals.temperature}°C
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 align-top text-right whitespace-nowrap">
                          <div className="font-mono tabular-nums text-xs font-medium text-slate-900">
                            {elapsed} waited
                          </div>
                          <div className="font-mono tabular-nums text-xs text-slate-500">
                            {patient.estimatedWaitMinutes === 0
                              ? 'Next up'
                              : `~${patient.estimatedWaitMinutes}m est`}
                          </div>
                        </td>
                        <td className="py-3.5 pl-3 pr-5 align-top text-right no-print">
                          <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-[205px]">
                            <button
                              type="button"
                              onClick={() => onOpenPriorityModal(patient)}
                              title="Escalate or adjust priority"
                              className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                            >
                              <ArrowUpDown className="w-3 h-3" />
                              <span>Priority</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenAssignModal(patient)}
                              disabled={availableDoctors.length === 0}
                              title={
                                availableDoctors.length === 0
                                  ? 'No doctors currently available'
                                  : 'Assign available doctor'
                              }
                              className="px-2 py-1 text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Assign</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenTransferModal(patient)}
                              disabled={busyAction === `transfer-${patient.id}`}
                              title="Trigger patient transfer workflow"
                              className="px-2 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              <span>Transfer</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onCompleteTreatment(patient.id, 'Discharged')}
                              disabled={busyAction === `complete-${patient.id}`}
                              title="Mark patient as discharged"
                              className="px-2 py-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{busyAction === `complete-${patient.id}` ? 'Discharging...' : 'Discharge'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenTimeline(patient)}
                              title="View treatment timeline"
                              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right Column: Doctor Dispatch + Active Treatment Bays */}
        <div className="xl:col-span-4 space-y-6 no-print">
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Doctor Dispatch</h2>
                <p className="text-xs text-slate-500">
                  Pulls root from Emergency Min-Heap first, then FIFO
                </p>
              </div>
              <Stethoscope className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="divide-y divide-slate-200">
              {snapshot.doctors.filter((d) => d.status !== 'Off-Duty').map((doc) => {
                const isBusy = doc.status === 'Busy';
                const currentPatient = doc.currentPatientId
                  ? snapshot.allPatients.find((p) => p.id === doc.currentPatientId)
                  : null;
                const isWorking = busyAction === `dispatch-${doc.id}`;

                return (
                  <div key={doc.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{doc.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500 flex items-center gap-1.5 truncate">
                        <span>{doc.bay}</span>
                        <span aria-hidden="true">·</span>
                        <DoctorStatusText status={doc.status} />
                      </div>
                      {isBusy && currentPatient && (
                        <div className="mt-1 text-xs text-slate-600 flex items-center gap-1.5 truncate">
                          <span className="truncate">
                            Treating <span className="font-medium">{currentPatient.name}</span>
                          </span>
                          <PriorityText priority={currentPatient.priority} pulseOnCritical />
                        </div>
                      )}
                    </div>

                    {doc.status === 'Available' ? (
                      <button
                        type="button"
                        disabled={totalWaiting === 0 || isWorking}
                        onClick={() => onDispatchNext(doc.id)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isWorking ? 'Dispatching...' : 'Dispatch Next'}
                      </button>
                    ) : currentPatient ? (
                      <button
                        type="button"
                        onClick={() => onCompleteTreatment(currentPatient.id, 'Discharged')}
                        disabled={busyAction === `complete-${currentPatient.id}`}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Discharge
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Active Treatment Bays</h2>
                <p className="text-xs text-slate-500">Patients currently under clinical care</p>
              </div>
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            {activePatients.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                No patients currently in active ER bays.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {activePatients.map((pat) => {
                  const doc = pat.assignedDoctorId ? doctorsById.get(pat.assignedDoctorId) : null;
                  const treatDuration = pat.treatmentStartedAt
                    ? formatMinutesSince(pat.treatmentStartedAt, snapshot.serverTime)
                    : '0m';
                  return (
                    <div key={pat.id} className="px-5 py-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{pat.name}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5">
                            <span className="font-mono tabular-nums">{pat.mrn}</span>
                            <span aria-hidden="true">·</span>
                            <span>{pat.assignedBay ?? 'ER Bay'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{treatDuration} in bay</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <PriorityText priority={pat.priority} pulseOnCritical />
                          <PatientStatusText
                            status={pat.status}
                            isCritical={pat.priority === 1}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-xs text-slate-600 truncate">
                          {doc ? doc.name : 'Assigned Physician'}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenTimeline(pat)}
                            className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            Timeline
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenTransferModal(pat)}
                            disabled={busyAction === `transfer-${pat.id}`}
                            className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Transfer
                          </button>
                          <button
                            type="button"
                            onClick={() => onCompleteTreatment(pat.id, 'Discharged')}
                            disabled={busyAction === `complete-${pat.id}`}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Discharge
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
