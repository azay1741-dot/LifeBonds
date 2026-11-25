export type PriorityLevel = 1 | 2 | 3 | 4;

export type PatientStatus = 'Waiting' | 'In Treatment' | 'Discharged' | 'Transferred';

export type DoctorStatus = 'Available' | 'Busy' | 'Off-Duty';

export type QueueSource = 'emergency_heap' | 'standard_fifo' | 'none';

export interface Vitals {
  heartRate: number;      // bpm
  spo2: number;           // %
  systolicBp: number;     // mmHg
  diastolicBp: number;    // mmHg
  temperature: number;    // Celsius
}

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup: string;
  contact: string;
  complaint: string;
  priority: PriorityLevel;
  status: PatientStatus;
  queueType: QueueSource;
  vitals: Vitals;
  assignedDoctorId: string | null;
  assignedBay: string | null;
  arrivedAt: number;
  treatmentStartedAt: number | null;
  dischargedAt: number | null;
  estimatedWaitMinutes: number;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  bay: string;
  status: DoctorStatus;
  currentPatientId: string | null;
  patientsHandledToday: number;
}

export interface TreatmentEvent {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  action:
    | 'REGISTERED'
    | 'PRIORITY_ESCALATED'
    | 'PRIORITY_DOWNGRADED'
    | 'DOCTOR_ALLOCATED'
    | 'DISCHARGED'
    | 'TRANSFERRED';
  detail: string;
  priorityAtEvent: PriorityLevel;
  timestamp: number;
}

export interface HeapSwapStep {
  fromIndex: number;
  toIndex: number;
  direction: 'up' | 'down' | 'extract';
  description: string;
}

export interface HeapOperationTrace {
  operation: 'INSERT' | 'EXTRACT_MIN' | 'UPDATE_PRIORITY' | 'REMOVE' | 'INIT';
  targetLabel: string;
  timestamp: number;
  comparisons: number;
  swaps: HeapSwapStep[];
  complexity: string;
}

export interface HeapNodeView {
  index: number;
  patientId: string;
  mrn: string;
  name: string;
  priority: PriorityLevel;
  arrivedAt: number;
  parentIndex: number | null;
  leftChildIndex: number | null;
  rightChildIndex: number | null;
}

export interface HashBucketEntryView {
  key: string;
  summary: string;
}

export interface HashMapBucketView {
  bucketIndex: number;
  chain: HashBucketEntryView[];
}

export interface PriorityStat {
  priority: PriorityLevel;
  label: string;
  waitingCount: number;
  inTreatmentCount: number;
  dischargedCount: number;
  avgWaitMinutes: number;
}

export interface HospitalSnapshot {
  serverTime: number;
  summary: {
    emergencyWaitingCount: number;
    standardWaitingCount: number;
    inTreatmentCount: number;
    dischargedCount: number;
    availableDoctorsCount: number;
    totalDoctorsCount: number;
    avgWaitMinutes: number;
    criticalWaitingCount: number;
  };
  emergencyQueue: Patient[];
  standardQueue: Patient[];
  allPatients: Patient[];
  doctors: Doctor[];
  recentEvents: TreatmentEvent[];
  priorityStats: PriorityStat[];
  dsaInspection: {
    heapArray: HeapNodeView[];
    lastHeapTrace: HeapOperationTrace | null;
    fifoOrder: Array<{ position: number; patientId: string; mrn: string; name: string; arrivedAt: number }>;
    patientHashMap: {
      size: number;
      capacity: number;
      loadFactor: number;
      collisions: number;
      nonEmptyBuckets: HashMapBucketView[];
    };
    linkedListLength: number;
  };
}
