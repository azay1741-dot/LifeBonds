import { Download, Printer, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HospitalSnapshot, Patient, PatientStatus } from '../types';
import { PatientStatusText, PriorityText, formatClock, formatMinutesSince } from './PriorityBadge';

interface ReportsAuditViewProps {
  snapshot: HospitalSnapshot;
  onOpenTimeline: (patient: Patient) => void;
  onResetDemo: () => Promise<void>;
}

export function ReportsAuditView({
  snapshot,
  onOpenTimeline,
  onResetDemo,
}: ReportsAuditViewProps) {
  const [statusFilter, setStatusFilter] = useState<'All' | PatientStatus>('All');
  const [resetting, setResetting] = useState(false);

  const doctorNameById = useMemo(
    () => new Map(snapshot.doctors.map((d) => [d.id, d.name])),
    [snapshot.doctors]
  );

  const filteredPatients = useMemo(() => {
    if (statusFilter === 'All') return snapshot.allPatients;
    return snapshot.allPatients.filter((p) => p.status === statusFilter);
  }, [snapshot.allPatients, statusFilter]);

  async function handleReset() {
    setResetting(true);
    try {
      await onResetDemo();
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Patient Management Reports &amp; Audit Trail
          </h2>
          <p className="text-xs text-slate-500">
            Shift throughput breakdown by triage level, full patient registry, and Doubly Linked List event log
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <a
            href="/api/reports/export"
            download="pulsequeue-er-report.csv"
            className="px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
          <button
            type="button"
            disabled={resetting}
            onClick={handleReset}
            className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{resetting ? 'Resetting...' : 'Reset Demo Data'}</span>
          </button>
        </div>
      </div>

      {/* Priority Breakdown Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Triage Performance by Priority Tier</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 pl-5 pr-3">Priority Tier</th>
                <th className="py-2.5 px-3 text-right">Waiting</th>
                <th className="py-2.5 px-3 text-right">In Treatment</th>
                <th className="py-2.5 px-3 text-right">Completed</th>
                <th className="py-2.5 pl-3 pr-5 text-right">Avg Wait Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {snapshot.priorityStats.map((stat) => (
                <tr key={stat.priority}>
                  <td className="py-3 pl-5 pr-3">
                    <PriorityText priority={stat.priority} />
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                    {stat.waitingCount}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                    {stat.inTreatmentCount}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                    {stat.dischargedCount}
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right font-mono tabular-nums text-slate-900 font-medium">
                    {stat.avgWaitMinutes}m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Complete Patient Registry */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Complete Patient Registry ({filteredPatients.length})
          </h3>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg no-print">
            {(['All', 'Waiting', 'In Treatment', 'Discharged', 'Transferred'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 pl-5 pr-3">MRN</th>
                <th className="py-2.5 px-3">Patient</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Physician / Bay</th>
                <th className="py-2.5 px-3 text-right">Wait</th>
                <th className="py-2.5 pl-3 pr-5 text-right no-print">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredPatients.map((p) => {
                const waitEnd = p.treatmentStartedAt ?? snapshot.serverTime;
                const docName = p.assignedDoctorId
                  ? doctorNameById.get(p.assignedDoctorId) ?? p.assignedDoctorId
                  : 'Unassigned';
                return (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="py-3 pl-5 pr-3 font-mono tabular-nums text-slate-600">{p.mrn}</td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-900 text-sm">{p.name}</div>
                      <div className="text-slate-500 truncate max-w-[240px]">{p.complaint}</div>
                    </td>
                    <td className="py-3 px-3">
                      <PriorityText priority={p.priority} />
                    </td>
                    <td className="py-3 px-3">
                      <PatientStatusText status={p.status} />
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      <div>{docName}</div>
                      <div className="text-slate-500">{p.assignedBay ?? 'Waiting Room'}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                      {formatMinutesSince(p.arrivedAt, waitEnd)}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right no-print">
                      <button
                        type="button"
                        onClick={() => onOpenTimeline(p)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                      >
                        Timeline
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Doubly Linked List Audit Log */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Clinical Audit Log (Doubly Linked List Traversal)
          </h3>
        </div>
        <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto">
          {snapshot.recentEvents.map((evt) => (
            <div key={evt.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">
                  {evt.patientName}{' '}
                  <span className="font-mono tabular-nums text-slate-500">({evt.mrn})</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-mono text-teal-800">{evt.action}</span>
                </div>
                <p className="mt-0.5 text-slate-600">{evt.detail}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <PriorityText priority={evt.priorityAtEvent} />
                <span className="font-mono tabular-nums text-slate-500">
                  {formatClock(evt.timestamp)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
