import { X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { RegisterPatientPayload } from '../api';
import { Doctor, Patient, PriorityLevel, TreatmentEvent } from '../types';
import { PRIORITY_META, PatientStatusText, PriorityText, formatClock } from './PriorityBadge';

/* 1. Register Patient Modal */
interface RegisterModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: RegisterPatientPayload) => Promise<void>;
}

const CLINICAL_PRESETS: Array<{ label: string; data: RegisterPatientPayload }> = [
  {
    label: 'Cardiac Arrest (P1)',
    data: {
      name: 'Ramesh Choudhary',
      age: 67,
      gender: 'Male',
      bloodGroup: 'O+',
      contact: '+91 98100 44210',
      complaint: 'Severe crushing chest pain, hypotension, diaphoresis',
      priority: 1,
      vitals: { heartRate: 138, spo2: 84, systolicBp: 82, diastolicBp: 52, temperature: 36.9 },
    },
  },
  {
    label: 'Stroke Alert (P2)',
    data: {
      name: 'Meenakshi Kapoor',
      age: 59,
      gender: 'Female',
      bloodGroup: 'A+',
      contact: '+91 98711 22905',
      complaint: 'Sudden facial droop and left-sided arm weakness',
      priority: 2,
      vitals: { heartRate: 96, spo2: 96, systolicBp: 174, diastolicBp: 102, temperature: 37.0 },
    },
  },
  {
    label: 'Minor Sprain (P4)',
    data: {
      name: 'Aarav Khanna',
      age: 22,
      gender: 'Male',
      bloodGroup: 'B+',
      contact: '+91 99110 88743',
      complaint: 'Mild wrist sprain after gym workout, neurovascular intact',
      priority: 4,
      vitals: { heartRate: 76, spo2: 99, systolicBp: 118, diastolicBp: 78, temperature: 36.6 },
    },
  },
];

export function RegisterPatientModal({ open, onClose, onSubmit }: RegisterModalProps) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('35');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [contact, setContact] = useState('+91 98');
  const [complaint, setComplaint] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>(2);
  const [heartRate, setHeartRate] = useState('92');
  const [spo2, setSpo2] = useState('97');
  const [systolicBp, setSystolicBp] = useState('124');
  const [diastolicBp, setDiastolicBp] = useState('80');
  const [temperature, setTemperature] = useState('37.1');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  function applyPreset(preset: RegisterPatientPayload) {
    setName(preset.name);
    setAge(String(preset.age));
    setGender(preset.gender);
    setBloodGroup(preset.bloodGroup);
    setContact(preset.contact);
    setComplaint(preset.complaint);
    setPriority(preset.priority);
    setHeartRate(String(preset.vitals.heartRate));
    setSpo2(String(preset.vitals.spo2));
    setSystolicBp(String(preset.vitals.systolicBp));
    setDiastolicBp(String(preset.vitals.diastolicBp));
    setTemperature(String(preset.vitals.temperature));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        age: Number(age),
        gender,
        bloodGroup,
        contact: contact.trim(),
        complaint: complaint.trim(),
        priority,
        vitals: {
          heartRate: Number(heartRate),
          spo2: Number(spo2),
          systolicBp: Number(systolicBp),
          diastolicBp: Number(diastolicBp),
          temperature: Number(temperature),
        },
      });
      setName('');
      setComplaint('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Emergency Patient Intake</h2>
            <p className="text-xs text-slate-500">
              P1–P3 cases route to Emergency Min-Heap · P4 cases route to Walk-In FIFO Queue
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close registration modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Quick fill case:</span>
            {CLINICAL_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.data)}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-6">
              <label className="block text-xs font-medium text-slate-700 mb-1">Patient Full Name</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Age</label>
              <input
                type="number"
                min={0}
                max={120}
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-600"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Blood</label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full px-2.5 py-2 text-sm font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-600"
              >
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number</label>
              <input
                type="text"
                required
                minLength={5}
                maxLength={30}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>
            <div className="sm:col-span-8">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Chief Complaint / Presenting Symptoms
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={300}
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder="e.g., Acute dyspnea, trauma laceration, high fever..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">
              Triage Priority Assignment
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {([1, 2, 3, 4] as PriorityLevel[]).map((lvl) => {
                const selected = priority === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setPriority(lvl)}
                    className={`p-3 text-left rounded-lg border transition-colors cursor-pointer ${
                      selected
                        ? 'border-teal-600 bg-teal-50/50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <PriorityText priority={lvl} />
                    <div className="mt-1 text-[11px] text-slate-500">
                      {PRIORITY_META[lvl].slaTarget}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">
              Initial Triage Vitals
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <span className="block text-[11px] text-slate-500 mb-1">HR (bpm)</span>
                <input
                  type="number"
                  required
                  min={20}
                  max={250}
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <span className="block text-[11px] text-slate-500 mb-1">SpO2 (%)</span>
                <input
                  type="number"
                  required
                  min={40}
                  max={100}
                  value={spo2}
                  onChange={(e) => setSpo2(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <span className="block text-[11px] text-slate-500 mb-1">Sys BP</span>
                <input
                  type="number"
                  required
                  min={40}
                  max={260}
                  value={systolicBp}
                  onChange={(e) => setSystolicBp(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <span className="block text-[11px] text-slate-500 mb-1">Dia BP</span>
                <input
                  type="number"
                  required
                  min={20}
                  max={160}
                  value={diastolicBp}
                  onChange={(e) => setDiastolicBp(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <span className="block text-[11px] text-slate-500 mb-1">Temp (°C)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  min={30}
                  max={44}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? 'Registering...' : 'Register & Enqueue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* 2. Dynamic Priority Escalation / Update Modal */
interface PriorityModalProps {
  patient: Patient | null;
  onClose: () => void;
  onSubmit: (patientId: string, priority: PriorityLevel, reason: string) => Promise<void>;
}

export function UpdatePriorityModal({ patient, onClose, onSubmit }: PriorityModalProps) {
  const [priority, setPriority] = useState<PriorityLevel>(1);
  const [reason, setReason] = useState('SpO2 dropped / clinical deterioration observed');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (patient) {
      setPriority(patient.priority > 1 ? ((patient.priority - 1) as PriorityLevel) : 1);
      setReason('Clinical reassessment — vitals updated');
      setError(null);
    }
  }, [patient]);

  if (!patient) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!patient) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(patient.id, priority, reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update priority.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Dynamic Priority Update</h2>
            <p className="text-xs text-slate-500">
              {patient.name} ({patient.mrn}) · Currently P{patient.priority}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {([1, 2, 3, 4] as PriorityLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setPriority(lvl)}
                className={`p-2.5 text-left rounded-lg border transition-colors cursor-pointer ${
                  priority === lvl
                    ? 'border-teal-600 bg-teal-50/50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <PriorityText priority={lvl} />
              </button>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            {patient.queueType === 'standard_fifo' && priority <= 3
              ? 'Promotes patient out of FIFO Queue and inserts into Emergency Min-Heap in O(log N).'
              : priority < patient.priority
                ? 'Triggers heapifyUp() in O(log N) via HashMap index lookup.'
                : priority > patient.priority
                  ? 'Triggers heapifyDown() in O(log N) via HashMap index lookup.'
                  : 'Select a different priority level to reorder.'}
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Clinical Reason</label>
            <input
              type="text"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>

          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || priority === patient.priority}
              className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? 'Updating Heap...' : 'Apply Priority'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* 3. Assign Specific Doctor Modal */
interface AssignDoctorModalProps {
  patient: Patient | null;
  doctors: Doctor[];
  onClose: () => void;
  onAssign: (patientId: string, doctorId: string) => Promise<void>;
}

export function AssignDoctorModal({
  patient,
  doctors,
  onClose,
  onAssign,
}: AssignDoctorModalProps) {
  const available = doctors.filter((d) => d.status === 'Available');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patient) return;
    setError(null);
    if (available.length === 0) {
      setSelectedDoctorId('');
    } else if (!available.some((d) => d.id === selectedDoctorId)) {
      setSelectedDoctorId(available[0].id);
    }
  }, [patient, doctors]);

  if (!patient) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!patient || !selectedDoctorId) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAssign(patient.id, selectedDoctorId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Allocate ER Physician</h2>
            <p className="text-xs text-slate-500">
              {patient.name} ({patient.mrn})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {available.length === 0 ? (
            <p className="text-xs text-slate-600">
              No doctors are currently marked Available. Discharge an active bay first.
            </p>
          ) : (
            <div className="space-y-2">
              {available.map((doc) => (
                <label
                  key={doc.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer ${
                    selectedDoctorId === doc.id
                      ? 'border-teal-600 bg-teal-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="doctor"
                      value={doc.id}
                      checked={selectedDoctorId === doc.id}
                      onChange={() => setSelectedDoctorId(doc.id)}
                      className="accent-teal-700"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{doc.name}</div>
                      <div className="text-xs text-slate-500">
                        {doc.specialty} · {doc.bay}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || available.length === 0}
              className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? 'Allocating...' : 'Confirm Allocation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* 4. Patient Timeline Drawer */
interface TimelineDrawerProps {
  patient: Patient | null;
  events: TreatmentEvent[];
  loading: boolean;
  error?: string | null;
  onClose: () => void;
}

export function PatientTimelineDrawer({
  patient,
  events,
  loading,
  error,
  onClose,
}: TimelineDrawerProps) {
  if (!patient) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="bg-white border-l border-slate-200 w-full max-w-md h-full flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{patient.name}</h2>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {patient.mrn} · {patient.age}y {patient.gender} · {patient.bloodGroup}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 border-b border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <PriorityText priority={patient.priority} />
            <PatientStatusText status={patient.status} />
          </div>
          <p className="text-slate-700 pt-1">{patient.complaint}</p>
          <div className="font-mono tabular-nums text-slate-500 pt-1">
            HR {patient.vitals.heartRate} bpm · SpO2 {patient.vitals.spo2}% · BP{' '}
            {patient.vitals.systolicBp}/{patient.vitals.diastolicBp} · {patient.vitals.temperature}°C
          </div>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          <h3 className="text-xs font-semibold text-slate-900 mb-3">
            Treatment History (Doubly Linked List)
          </h3>
          {loading ? (
            <p className="text-xs text-slate-500">Loading patient timeline...</p>
          ) : error ? (
            <p className="text-xs text-red-700">{error}</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-500">No recorded events for this patient yet.</p>
          ) : (
            <div className="space-y-3">
              {events.map((evt) => (
                <div key={evt.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div className="flex items-center justify-between font-mono text-slate-500">
                    <span className="font-semibold text-teal-800">{evt.action}</span>
                    <span className="tabular-nums">{formatClock(evt.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-slate-800">{evt.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* 5. Patient Transfer Workflow Modal */
const TRANSFER_DESTINATIONS = [
  'Cardiology / Cath Lab',
  'Surgical ICU',
  'Neurology / Stroke Unit',
  'Specialty Ward',
  'External Trauma Center',
];

interface TransferModalProps {
  patient: Patient | null;
  onClose: () => void;
  onTransfer: (patientId: string, destination: string, reason: string) => Promise<void>;
}

export function TransferPatientModal({ patient, onClose, onTransfer }: TransferModalProps) {
  const [destination, setDestination] = useState(TRANSFER_DESTINATIONS[0]);
  const [reason, setReason] = useState('Specialty care transfer from triage');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (patient) {
      const lower = patient.complaint.toLowerCase();
      if (lower.includes('stroke') || lower.includes('speech') || lower.includes('headache')) {
        setDestination('Neurology / Stroke Unit');
      } else if (lower.includes('chest') || lower.includes('cardiac')) {
        setDestination('Cardiology / Cath Lab');
      } else if (patient.priority === 1) {
        setDestination('Surgical ICU');
      } else {
        setDestination('Specialty Ward');
      }
      setReason('Requires specialty unit bed & clinical handoff');
      setError(null);
    }
  }, [patient]);

  if (!patient) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!patient) return;
    setError(null);
    setSubmitting(true);
    try {
      await onTransfer(patient.id, destination.trim(), reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to transfer patient.');
    } finally {
      setSubmitting(false);
    }
  }

  const originText =
    patient.status === 'In Treatment'
      ? `In Treatment (${patient.assignedBay ?? 'ER Bay'})`
      : patient.queueType === 'emergency_heap'
        ? 'Emergency Min-Heap'
        : 'Standard Walk-In FIFO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Patient Transfer Workflow</h2>
            <p className="text-xs text-slate-500">
              {patient.name} ({patient.mrn}) · {originText}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transfer modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <PriorityText priority={patient.priority} pulseOnCritical />
            <PatientStatusText status={patient.status} isCritical={patient.priority === 1} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Receiving Unit / Facility
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TRANSFER_DESTINATIONS.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setDestination(unit)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                    destination === unit
                      ? 'border-amber-600 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {unit}
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Enter destination unit or receiving hospital"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Transfer Reason / Clinical Handoff Note
            </label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={250}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>

          <p className="text-xs text-slate-500">
            Removes patient from {originText}, marks status as Transferred, and logs a TRANSFERRED audit event.
          </p>

          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || destination.trim().length < 2}
              className="px-4 py-2 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? 'Transferring...' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

