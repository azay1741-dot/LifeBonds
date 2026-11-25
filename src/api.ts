import { HospitalSnapshot, Patient, PriorityLevel, TreatmentEvent, Vitals } from './types';

export interface RegisterPatientPayload {
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup: string;
  contact: string;
  complaint: string;
  priority: PriorityLevel;
  vitals: Vitals;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function fetchHospitalState(): Promise<HospitalSnapshot> {
  return requestJson<HospitalSnapshot>('/api/state');
}

export function registerPatientApi(
  payload: RegisterPatientPayload
): Promise<{ patient: Patient; snapshot: HospitalSnapshot }> {
  return requestJson('/api/patients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePriorityApi(
  patientId: string,
  priority: PriorityLevel,
  reason: string
): Promise<{ patient: Patient; snapshot: HospitalSnapshot }> {
  return requestJson(`/api/patients/${encodeURIComponent(patientId)}/priority`, {
    method: 'PATCH',
    body: JSON.stringify({ priority, reason }),
  });
}

export function dispatchNextPatientApi(
  doctorId: string
): Promise<{ snapshot: HospitalSnapshot }> {
  return requestJson(`/api/doctors/${encodeURIComponent(doctorId)}/assign-next`, {
    method: 'POST',
  });
}

export function assignDoctorToPatientApi(
  patientId: string,
  doctorId: string
): Promise<{ snapshot: HospitalSnapshot }> {
  return requestJson(`/api/patients/${encodeURIComponent(patientId)}/assign-doctor`, {
    method: 'POST',
    body: JSON.stringify({ doctorId }),
  });
}

export function completeTreatmentApi(
  patientId: string,
  status: 'Discharged' | 'Transferred'
): Promise<{ snapshot: HospitalSnapshot }> {
  return requestJson(`/api/patients/${encodeURIComponent(patientId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function toggleDoctorStatusApi(
  doctorId: string,
  status: 'Available' | 'Off-Duty'
): Promise<{ snapshot: HospitalSnapshot }> {
  return requestJson(`/api/doctors/${encodeURIComponent(doctorId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function addDoctorApi(
  name: string,
  specialty: string,
  bay: string
): Promise<{ snapshot: HospitalSnapshot }> {
  return requestJson('/api/doctors', {
    method: 'POST',
    body: JSON.stringify({ name, specialty, bay }),
  });
}

export function fetchPatientTimelineApi(
  patientId: string
): Promise<{ events: TreatmentEvent[] }> {
  return requestJson(`/api/patients/${encodeURIComponent(patientId)}/timeline`);
}

export function resetDemoApi(): Promise<{ snapshot: HospitalSnapshot }> {
  return requestJson('/api/reset-demo', { method: 'POST' });
}
