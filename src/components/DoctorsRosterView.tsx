import { AlertTriangle, Plus, UserPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { HospitalSnapshot, Patient } from '../types';
import { DoctorStatusText, PatientStatusText, PriorityText, formatMinutesSince } from './PriorityBadge';

const PATIENTS_PER_AVAILABLE_DOCTOR_THRESHOLD = 3;

interface DoctorsRosterViewProps {
  snapshot: HospitalSnapshot;
  busyAction: string | null;
  onDispatchNext: (doctorId: string) => void;
  onToggleDoctorStatus: (doctorId: string, status: 'Available' | 'Off-Duty') => void;
  onCompleteTreatment: (patientId: string, outcome: 'Discharged' | 'Transferred') => void;
  onOpenTransferModal: (patient: Patient) => void;
  onAddDoctor: (name: string, specialty: string, bay: string) => Promise<void>;
}

export function DoctorsRosterView({
  snapshot,
  busyAction,
  onDispatchNext,
  onToggleDoctorStatus,
  onCompleteTreatment,
  onOpenTransferModal,
  onAddDoctor,
}: DoctorsRosterViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [bay, setBay] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const patientMap = new Map<string, Patient>(snapshot.allPatients.map((p) => [p.id, p]));
  const totalWaiting = snapshot.summary.emergencyWaitingCount + snapshot.summary.standardWaitingCount;
  const inTreatmentCount = snapshot.summary.inTreatmentCount;
  const activePatientCount = totalWaiting + inTreatmentCount;
  const availableDoctorsCount = snapshot.summary.availableDoctorsCount;
  const requiredAvailableDoctors =
    activePatientCount === 0
      ? 0
      : Math.max(1, Math.ceil(activePatientCount / PATIENTS_PER_AVAILABLE_DOCTOR_THRESHOLD));
  const isStaffingLow =
    activePatientCount > 0 && availableDoctorsCount < requiredAvailableDoctors;
  const isCriticalShortage = isStaffingLow && availableDoctorsCount === 0;
  const firstOffDutyDoctor = snapshot.doctors.find((d) => d.status === 'Off-Duty');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (name.trim().length < 3 || specialty.trim().length < 3 || bay.trim().length < 2) {
      setFormError('Enter valid doctor name, specialty, and ER bay.');
      return;
    }
    setSubmitting(true);
    try {
      await onAddDoctor(name.trim(), specialty.trim(), bay.trim());
      setName('');
      setSpecialty('');
      setBay('');
      setShowAddForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to add doctor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">ER Physicians &amp; Treatment Bays</h2>
          <p className="text-xs text-slate-500">
            Manage doctor shift availability, allocate next Min-Heap priority patients, and release bays
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>{showAddForm ? 'Close Form' : 'Add On-Call Doctor'}</span>
        </button>
      </div>

      {isStaffingLow && (
        <div
          role="alert"
          className={`px-4 py-3.5 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
            isCriticalShortage
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                isCriticalShortage ? 'text-red-700' : 'text-amber-700'
              }`}
            />
            <div className="text-xs space-y-0.5">
              <div className="font-semibold">
                {isCriticalShortage
                  ? 'Critical Staffing Alert: Zero Physicians Available'
                  : 'Low Physician Coverage Warning'}
              </div>
              <p className={isCriticalShortage ? 'text-red-800' : 'text-amber-800'}>
                <span className="font-mono tabular-nums font-semibold">
                  {availableDoctorsCount}
                </span>{' '}
                available doctor{availableDoctorsCount === 1 ? '' : 's'} below the minimum threshold of{' '}
                <span className="font-mono tabular-nums font-semibold">
                  {requiredAvailableDoctors}
                </span>{' '}
                for{' '}
                <span className="font-mono tabular-nums font-semibold">{activePatientCount}</span>{' '}
                active patients ({totalWaiting} waiting, {inTreatmentCount} in bay · 1:
                {PATIENTS_PER_AVAILABLE_DOCTOR_THRESHOLD} target ratio).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {firstOffDutyDoctor && (
              <button
                type="button"
                onClick={() => onToggleDoctorStatus(firstOffDutyDoctor.id, 'Available')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  isCriticalShortage
                    ? 'bg-white border-red-300 text-red-800 hover:bg-red-100'
                    : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-100'
                }`}
              >
                Mark {firstOffDutyDoctor.name} Available
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className={`px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                isCriticalShortage
                  ? 'bg-red-700 hover:bg-red-800'
                  : 'bg-amber-700 hover:bg-amber-800'
              }`}
            >
              Add On-Call Doctor
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">Register On-Call ER Physician</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Siddharth Verma"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Specialty</label>
              <input
                type="text"
                required
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Orthopedic Trauma"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Bay</label>
              <input
                type="text"
                required
                value={bay}
                onChange={(e) => setBay(e.target.value)}
                placeholder="Trauma Bay 7"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-red-700 font-medium">{formError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{submitting ? 'Adding...' : 'Save Doctor'}</span>
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                <th className="py-3 pl-5 pr-3">Physician</th>
                <th className="py-3 px-3">Bay &amp; Specialty</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Current Patient</th>
                <th className="py-3 px-3 text-right">Handled Today</th>
                <th className="py-3 pl-3 pr-5 text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {snapshot.doctors.map((doc) => {
                const activePatient = doc.currentPatientId ? patientMap.get(doc.currentPatientId) : null;
                return (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 pl-5 pr-3 align-top">
                      <div className="font-medium text-slate-900">{doc.name}</div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">{doc.id}</div>
                    </td>
                    <td className="py-4 px-3 align-top">
                      <div className="text-slate-900 font-medium">{doc.bay}</div>
                      <div className="text-xs text-slate-500">{doc.specialty}</div>
                    </td>
                    <td className="py-4 px-3 align-top">
                      <DoctorStatusText status={doc.status} />
                    </td>
                    <td className="py-4 px-3 align-top">
                      {activePatient ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{activePatient.name}</span>
                            <PriorityText priority={activePatient.priority} pulseOnCritical />
                            <PatientStatusText
                              status={activePatient.status}
                              isCritical={activePatient.priority === 1}
                            />
                          </div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums">
                            {activePatient.mrn} ·{' '}
                            {activePatient.treatmentStartedAt
                              ? formatMinutesSince(activePatient.treatmentStartedAt, snapshot.serverTime)
                              : '0m'}{' '}
                            in bay
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No active patient</span>
                      )}
                    </td>
                    <td className="py-4 px-3 align-top text-right font-mono tabular-nums text-slate-900 font-medium">
                      {doc.patientsHandledToday}
                    </td>
                    <td className="py-4 pl-3 pr-5 align-top text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {doc.status === 'Available' && (
                          <>
                            <button
                              type="button"
                              disabled={totalWaiting === 0 || busyAction === `dispatch-${doc.id}`}
                              onClick={() => onDispatchNext(doc.id)}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                            >
                              Dispatch Next
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleDoctorStatus(doc.id, 'Off-Duty')}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              Set Off-Duty
                            </button>
                          </>
                        )}
                        {doc.status === 'Off-Duty' && (
                          <button
                            type="button"
                            onClick={() => onToggleDoctorStatus(doc.id, 'Available')}
                            className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Mark Available
                          </button>
                        )}
                        {doc.status === 'Busy' && activePatient && (
                          <>
                            <button
                              type="button"
                              disabled={busyAction === `complete-${activePatient.id}`}
                              onClick={() => onCompleteTreatment(activePatient.id, 'Discharged')}
                              className="px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              {busyAction === `complete-${activePatient.id}` ? 'Discharging...' : 'Discharge'}
                            </button>
                            <button
                              type="button"
                              disabled={busyAction === `transfer-${activePatient.id}`}
                              onClick={() => onOpenTransferModal(activePatient)}
                              className="px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap cursor-pointer"
                            >
                              Transfer
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
