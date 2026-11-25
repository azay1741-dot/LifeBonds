import { DoctorStatus, PatientStatus, PriorityLevel } from '../types';

export const PRIORITY_META: Record<
  PriorityLevel,
  { code: string; label: string; textClass: string; markerClass: string; slaTarget: string }
> = {
  1: {
    code: 'P1',
    label: 'Critical',
    textClass: 'text-red-700',
    markerClass: 'bg-red-600',
    slaTarget: 'Immediate (0 min)',
  },
  2: {
    code: 'P2',
    label: 'Emergent',
    textClass: 'text-orange-700',
    markerClass: 'bg-orange-600',
    slaTarget: '< 10 min',
  },
  3: {
    code: 'P3',
    label: 'Urgent',
    textClass: 'text-amber-700',
    markerClass: 'bg-amber-600',
    slaTarget: '< 30 min',
  },
  4: {
    code: 'P4',
    label: 'Standard',
    textClass: 'text-teal-700',
    markerClass: 'bg-teal-600',
    slaTarget: 'FIFO Queue',
  },
};

export function PriorityText({ priority }: { priority: PriorityLevel }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-semibold whitespace-nowrap ${meta.textClass}`}>
      <span className={`h-2 w-2 rounded-xs shrink-0 ${meta.markerClass}`} aria-hidden="true" />
      <span className="font-mono tabular-nums">{meta.code}</span>
      <span>{meta.label}</span>
    </span>
  );
}

export function PatientStatusText({ status }: { status: PatientStatus }) {
  const styles: Record<PatientStatus, { text: string; marker: string }> = {
    Waiting: { text: 'text-amber-700', marker: 'bg-amber-600' },
    'In Treatment': { text: 'text-teal-700', marker: 'bg-teal-600' },
    Discharged: { text: 'text-emerald-700', marker: 'bg-emerald-600' },
    Transferred: { text: 'text-slate-600', marker: 'bg-slate-500' },
  };
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-xs shrink-0 ${s.marker}`} aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

export function DoctorStatusText({ status }: { status: DoctorStatus }) {
  const styles: Record<DoctorStatus, { text: string; marker: string }> = {
    Available: { text: 'text-emerald-700', marker: 'bg-emerald-600' },
    Busy: { text: 'text-amber-700', marker: 'bg-amber-600' },
    'Off-Duty': { text: 'text-slate-500', marker: 'bg-slate-400' },
  };
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-xs shrink-0 ${s.marker}`} aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

export function formatMinutesSince(timestamp: number, now: number): string {
  const diffMin = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (diffMin < 60) return `${diffMin}m`;
  const hrs = Math.floor(diffMin / 60);
  const rem = diffMin % 60;
  return `${hrs}h ${rem}m`;
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
