import {
  AiChatMode,
  GroundingSource,
  HospitalSnapshot,
  Patient,
  PriorityLevel,
  TreatmentEvent,
  Vitals,
} from './types';

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

type TokenProvider = (() => Promise<string | null>) | null;
let authTokenProvider: TokenProvider = null;

export function setAuthTokenProvider(provider: TokenProvider): void {
  authTokenProvider = provider;
}

async function buildAuthHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const token = authTokenProvider ? await authTokenProvider() : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    Object.assign(headers, extra);
  }
  return headers;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = await buildAuthHeaders(options?.headers);
  const res = await fetch(url, {
    ...options,
    headers,
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

export function transferPatientApi(
  patientId: string,
  destination: string,
  reason: string
): Promise<{ patient: Patient; snapshot: HospitalSnapshot }> {
  return requestJson(`/api/patients/${encodeURIComponent(patientId)}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ destination, reason }),
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

export async function downloadCsvReportApi(): Promise<void> {
  const token = authTokenProvider ? await authTokenProvider() : null;
  const res = await fetch('/api/reports/export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lifebonds-er-report.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadQueueSnapshotCsvApi(): Promise<void> {
  const token = authTokenProvider ? await authTokenProvider() : null;
  const res = await fetch('/api/reports/queue-export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Queue snapshot export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lifebonds-queue-snapshot.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function sendAiChatApi(payload: {
  mode: AiChatMode;
  message: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  latLng?: { latitude: number; longitude: number } | null;
}): Promise<{ text: string; modelUsed: string; sources: GroundingSource[] }> {
  return requestJson('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
