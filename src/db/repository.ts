import { asc, count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { doctors, patients, treatmentEvents, users } from './schema.ts';
import type {
  Doctor,
  DoctorStatus,
  Patient,
  PatientStatus,
  PriorityLevel,
  QueueSource,
  TreatmentEvent,
} from '../types.ts';

function sanitizeDbError(error: unknown): Error {
  console.error('Database query failed:', error);
  return new Error('Database query failed. Please try again later.', { cause: error });
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string
) {
  try {
    const safeEmail = email || `${uid}@lifebonds.local`;
    const safeName = displayName || safeEmail.split('@')[0] || 'Clinical Staff';
    const result = await db
      .insert(users)
      .values({
        uid,
        email: safeEmail,
        displayName: safeName,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: safeEmail,
          displayName: safeName,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function getAllDoctorsFromDb(): Promise<Doctor[]> {
  try {
    const rows = await db.select().from(doctors).orderBy(asc(doctors.id));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      specialty: r.specialty,
      bay: r.bay,
      status: r.status as DoctorStatus,
      currentPatientId: r.currentPatientId,
      patientsHandledToday: r.patientsHandledToday,
    }));
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function getAllPatientsFromDb(): Promise<Patient[]> {
  try {
    const rows = await db.select().from(patients).orderBy(asc(patients.arrivedAt));
    return rows.map((r) => ({
      id: r.id,
      mrn: r.mrn,
      name: r.name,
      age: r.age,
      gender: r.gender as 'Male' | 'Female' | 'Other',
      bloodGroup: r.bloodGroup,
      contact: r.contact,
      complaint: r.complaint,
      priority: r.priority as PriorityLevel,
      status: r.status as PatientStatus,
      queueType: r.queueType as QueueSource,
      vitals: {
        heartRate: r.heartRate,
        spo2: r.spo2,
        systolicBp: r.systolicBp,
        diastolicBp: r.diastolicBp,
        temperature: r.temperature,
      },
      assignedDoctorId: r.assignedDoctorId,
      assignedBay: r.assignedBay,
      arrivedAt: r.arrivedAt,
      treatmentStartedAt: r.treatmentStartedAt,
      dischargedAt: r.dischargedAt,
      estimatedWaitMinutes: 0,
    }));
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function getAllEventsFromDb(): Promise<TreatmentEvent[]> {
  try {
    const rows = await db
      .select()
      .from(treatmentEvents)
      .orderBy(asc(treatmentEvents.timestamp));
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      patientName: r.patientName,
      mrn: r.mrn,
      action: r.action as TreatmentEvent['action'],
      detail: r.detail,
      priorityAtEvent: r.priorityAtEvent as PriorityLevel,
      timestamp: r.timestamp,
    }));
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function insertPatientInDb(p: Patient, createdByUid?: string): Promise<void> {
  try {
    await db.insert(patients).values({
      id: p.id,
      mrn: p.mrn,
      name: p.name,
      age: p.age,
      gender: p.gender,
      bloodGroup: p.bloodGroup,
      contact: p.contact,
      complaint: p.complaint,
      priority: p.priority,
      status: p.status,
      queueType: p.queueType,
      heartRate: p.vitals.heartRate,
      spo2: p.vitals.spo2,
      systolicBp: p.vitals.systolicBp,
      diastolicBp: p.vitals.diastolicBp,
      temperature: p.vitals.temperature,
      assignedDoctorId: p.assignedDoctorId,
      assignedBay: p.assignedBay,
      arrivedAt: p.arrivedAt,
      treatmentStartedAt: p.treatmentStartedAt,
      dischargedAt: p.dischargedAt,
      createdByUid: createdByUid ?? null,
    });
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function updatePatientInDb(p: Patient): Promise<void> {
  try {
    await db
      .update(patients)
      .set({
        priority: p.priority,
        status: p.status,
        queueType: p.queueType,
        assignedDoctorId: p.assignedDoctorId,
        assignedBay: p.assignedBay,
        treatmentStartedAt: p.treatmentStartedAt,
        dischargedAt: p.dischargedAt,
      })
      .where(eq(patients.id, p.id));
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function insertDoctorInDb(d: Doctor): Promise<void> {
  try {
    await db.insert(doctors).values({
      id: d.id,
      name: d.name,
      specialty: d.specialty,
      bay: d.bay,
      status: d.status,
      currentPatientId: d.currentPatientId,
      patientsHandledToday: d.patientsHandledToday,
    });
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function updateDoctorInDb(d: Doctor): Promise<void> {
  try {
    await db
      .update(doctors)
      .set({
        status: d.status,
        currentPatientId: d.currentPatientId,
        patientsHandledToday: d.patientsHandledToday,
      })
      .where(eq(doctors.id, d.id));
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function insertEventInDb(e: TreatmentEvent, actorUid?: string): Promise<void> {
  try {
    await db.insert(treatmentEvents).values({
      id: e.id,
      patientId: e.patientId,
      patientName: e.patientName,
      mrn: e.mrn,
      action: e.action,
      detail: e.detail,
      priorityAtEvent: e.priorityAtEvent,
      timestamp: e.timestamp,
      actorUid: actorUid ?? null,
    });
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function getSequenceCountsFromDb(): Promise<{
  patientSeq: number;
  mrnSeq: number;
  doctorSeq: number;
  eventSeq: number;
}> {
  try {
    const [pCountRow] = await db.select({ cnt: count() }).from(patients);
    const [dCountRow] = await db.select({ cnt: count() }).from(doctors);
    const [eCountRow] = await db.select({ cnt: count() }).from(treatmentEvents);

    const pCount = Number(pCountRow?.cnt ?? 0);
    const dCount = Number(dCountRow?.cnt ?? 0);
    const eCount = Number(eCountRow?.cnt ?? 0);

    return {
      patientSeq: 1001 + pCount,
      mrnSeq: 40 + pCount + 1,
      doctorSeq: 101 + dCount,
      eventSeq: 1001 + eCount,
    };
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

function buildSeedPayload() {
  const now = Date.now();
  const min = 60_000;
  const hour = 3_600_000;

  const seedDoctors: Doctor[] = [
    {
      id: 'DOC-101',
      name: 'Dr. Ananya Sharma',
      specialty: 'Emergency Medicine',
      bay: 'Trauma Bay 1',
      status: 'Busy',
      currentPatientId: 'PAT-1001',
      patientsHandledToday: 7,
    },
    {
      id: 'DOC-102',
      name: 'Dr. Vikram Nair',
      specialty: 'Cardiology & Critical Care',
      bay: 'Resus Bay 2',
      status: 'Available',
      currentPatientId: null,
      patientsHandledToday: 5,
    },
    {
      id: 'DOC-103',
      name: 'Dr. Priya Kulkarni',
      specialty: 'Trauma Surgery',
      bay: 'Trauma Bay 3',
      status: 'Busy',
      currentPatientId: 'PAT-1002',
      patientsHandledToday: 6,
    },
    {
      id: 'DOC-104',
      name: 'Dr. Rohan Deshmukh',
      specialty: 'Neurology ER',
      bay: 'Acute Bay 4',
      status: 'Available',
      currentPatientId: null,
      patientsHandledToday: 4,
    },
    {
      id: 'DOC-105',
      name: 'Dr. Meera Iyer',
      specialty: 'General & Fast-Track ER',
      bay: 'Fast-Track 5',
      status: 'Available',
      currentPatientId: null,
      patientsHandledToday: 9,
    },
    {
      id: 'DOC-106',
      name: 'Dr. Kabir Verma',
      specialty: 'Pediatrics Emergency',
      bay: 'Peds Bay 6',
      status: 'Off-Duty',
      currentPatientId: null,
      patientsHandledToday: 3,
    },
  ];

  const activePatients: Patient[] = [
    {
      id: 'PAT-1001',
      mrn: 'ER-2026-041',
      name: 'Rajeshwari Devi',
      age: 64,
      gender: 'Female',
      bloodGroup: 'O+',
      contact: '+91 98112 40219',
      complaint: 'Acute chest pain radiating to left arm, diaphoresis',
      priority: 1,
      status: 'In Treatment',
      queueType: 'none',
      vitals: { heartRate: 124, spo2: 89, systolicBp: 88, diastolicBp: 56, temperature: 37.1 },
      assignedDoctorId: 'DOC-101',
      assignedBay: 'Trauma Bay 1',
      arrivedAt: now - 26 * min,
      treatmentStartedAt: now - 22 * min,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    },
    {
      id: 'PAT-1002',
      mrn: 'ER-2026-042',
      name: 'Arjun Malhotra',
      age: 29,
      gender: 'Male',
      bloodGroup: 'B+',
      contact: '+91 98731 11904',
      complaint: 'Road traffic accident — suspected femur fracture & laceration',
      priority: 2,
      status: 'In Treatment',
      queueType: 'none',
      vitals: { heartRate: 108, spo2: 95, systolicBp: 104, diastolicBp: 68, temperature: 36.8 },
      assignedDoctorId: 'DOC-103',
      assignedBay: 'Trauma Bay 3',
      arrivedAt: now - 34 * min,
      treatmentStartedAt: now - 16 * min,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    },
    {
      id: 'PAT-1003',
      mrn: 'ER-2026-043',
      name: 'Harpreet Singh',
      age: 58,
      gender: 'Male',
      bloodGroup: 'A+',
      contact: '+91 99104 77812',
      complaint: 'Severe respiratory distress & wheezing (SpO2 dropping)',
      priority: 1,
      status: 'Waiting',
      queueType: 'emergency_heap',
      vitals: { heartRate: 130, spo2: 86, systolicBp: 146, diastolicBp: 92, temperature: 38.2 },
      assignedDoctorId: null,
      assignedBay: null,
      arrivedAt: now - 8 * min,
      treatmentStartedAt: null,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    },
    {
      id: 'PAT-1004',
      mrn: 'ER-2026-044',
      name: 'Neha Bansal',
      age: 41,
      gender: 'Female',
      bloodGroup: 'AB+',
      contact: '+91 97118 55023',
      complaint: 'Sudden-onset severe migraine with photophobia & slurred speech',
      priority: 2,
      status: 'Waiting',
      queueType: 'emergency_heap',
      vitals: { heartRate: 98, spo2: 97, systolicBp: 158, diastolicBp: 96, temperature: 37.0 },
      assignedDoctorId: null,
      assignedBay: null,
      arrivedAt: now - 14 * min,
      treatmentStartedAt: null,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    },
    {
      id: 'PAT-1005',
      mrn: 'ER-2026-045',
      name: 'Devansh Joshi',
      age: 19,
      gender: 'Male',
      bloodGroup: 'O-',
      contact: '+91 96502 33198',
      complaint: 'High-grade fever (39.6 C) with persistent vomiting',
      priority: 3,
      status: 'Waiting',
      queueType: 'emergency_heap',
      vitals: { heartRate: 104, spo2: 98, systolicBp: 112, diastolicBp: 74, temperature: 39.6 },
      assignedDoctorId: null,
      assignedBay: null,
      arrivedAt: now - 21 * min,
      treatmentStartedAt: null,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    },
    {
      id: 'PAT-1006',
      mrn: 'ER-2026-046',
      name: 'Sunita Tiwari',
      age: 34,
      gender: 'Female',
      bloodGroup: 'B-',
      contact: '+91 98201 66410',
      complaint: 'Acute abdominal pain in right lower quadrant',
      priority: 2,
      status: 'Waiting',
      queueType: 'emergency_heap',
      vitals: { heartRate: 110, spo2: 97, systolicBp: 118, diastolicBp: 78, temperature: 38.4 },
      assignedDoctorId: null,
      assignedBay: null,
      arrivedAt: now - 11 * min,
      treatmentStartedAt: null,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    },
    {
      id: 'PAT-1007',
      mrn: 'ER-2026-047',
      name: 'Mohit Agarwal',
      age: 25,
      gender: 'Male',
      bloodGroup: 'A-',
      contact: '+91 98990 12045',
      complaint: 'Minor ankle sprain after sports injury, stable vitals',
      priority: 4,
      status: 'Waiting',
      queueType: 'standard_fifo',
      vitals: { heartRate: 78, spo2: 99, systolicBp: 120, diastolicBp: 80, temperature: 36.7 },
      assignedDoctorId: null,
      assignedBay: null,
      arrivedAt: now - 19 * min,
      treatmentStartedAt: null,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    },
    {
      id: 'PAT-1008',
      mrn: 'ER-2026-048',
      name: 'Kavita Rao',
      age: 49,
      gender: 'Female',
      bloodGroup: 'O+',
      contact: '+91 99581 84320',
      complaint: 'Mild allergic rash, no airway compromise',
      priority: 4,
      status: 'Waiting',
      queueType: 'standard_fifo',
      vitals: { heartRate: 82, spo2: 99, systolicBp: 124, diastolicBp: 82, temperature: 36.9 },
      assignedDoctorId: null,
      assignedBay: null,
      arrivedAt: now - 12 * min,
      treatmentStartedAt: null,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    },
    {
      id: 'PAT-1009',
      mrn: 'ER-2026-040',
      name: 'Suresh Menon',
      age: 52,
      gender: 'Male',
      bloodGroup: 'B+',
      contact: '+91 98180 22741',
      complaint: 'Hypertensive urgency — stabilized & discharged',
      priority: 2,
      status: 'Discharged',
      queueType: 'none',
      vitals: { heartRate: 84, spo2: 98, systolicBp: 138, diastolicBp: 86, temperature: 36.8 },
      assignedDoctorId: 'DOC-102',
      assignedBay: 'Resus Bay 2',
      arrivedAt: now - 75 * min,
      treatmentStartedAt: now - 69 * min,
      dischargedAt: now - 30 * min,
      estimatedWaitMinutes: 0,
    },
  ];

  const historySpecs: Array<{
    hoursAgo: number;
    offsetMin: number;
    name: string;
    age: number;
    gender: 'Male' | 'Female';
    bloodGroup: string;
    complaint: string;
    priority: PriorityLevel;
    doctorId: string;
    bay: string;
  }> = [
    { hoursAgo: 23, offsetMin: 12, name: 'Raghavendra Kulkarni', age: 54, gender: 'Male', bloodGroup: 'O+', complaint: 'Atrial fibrillation with rapid ventricular response', priority: 2, doctorId: 'DOC-102', bay: 'Resus Bay 2' },
    { hoursAgo: 22, offsetMin: 35, name: 'Pooja Chawla', age: 31, gender: 'Female', bloodGroup: 'A+', complaint: 'Acute asthma exacerbation', priority: 3, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 21, offsetMin: 18, name: 'Imran Siddiqui', age: 44, gender: 'Male', bloodGroup: 'B+', complaint: 'Deep forearm laceration requiring sutures', priority: 3, doctorId: 'DOC-103', bay: 'Trauma Bay 3' },
    { hoursAgo: 20, offsetMin: 40, name: 'Lakshmi Narayanan', age: 71, gender: 'Female', bloodGroup: 'O-', complaint: 'Acute decompensated heart failure', priority: 1, doctorId: 'DOC-101', bay: 'Trauma Bay 1' },
    { hoursAgo: 19, offsetMin: 10, name: 'Gaurav Bhatia', age: 27, gender: 'Male', bloodGroup: 'AB+', complaint: 'Minor wrist contusion', priority: 4, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 19, offsetMin: 42, name: 'Nandini Sen', age: 38, gender: 'Female', bloodGroup: 'A-', complaint: 'Acute renal colic', priority: 2, doctorId: 'DOC-104', bay: 'Acute Bay 4' },
    { hoursAgo: 17, offsetMin: 20, name: 'Balwinder Gill', age: 62, gender: 'Male', bloodGroup: 'B+', complaint: 'Hypertensive crisis with epistaxis', priority: 2, doctorId: 'DOC-102', bay: 'Resus Bay 2' },
    { hoursAgo: 16, offsetMin: 15, name: 'Shreya Chatterjee', age: 24, gender: 'Female', bloodGroup: 'O+', complaint: 'Viral gastroenteritis & dehydration', priority: 4, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 15, offsetMin: 8, name: 'Deepak Deshpande', age: 48, gender: 'Male', bloodGroup: 'A+', complaint: 'Suspected transient ischemic attack', priority: 1, doctorId: 'DOC-104', bay: 'Acute Bay 4' },
    { hoursAgo: 14, offsetMin: 26, name: 'Anjali Verma', age: 33, gender: 'Female', bloodGroup: 'B-', complaint: 'Moderate allergic urticaria', priority: 3, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 14, offsetMin: 48, name: 'Karanvir Bedi', age: 40, gender: 'Male', bloodGroup: 'O+', complaint: 'Chest wall trauma from fall', priority: 2, doctorId: 'DOC-103', bay: 'Trauma Bay 3' },
    { hoursAgo: 12, offsetMin: 14, name: 'Farah Khan', age: 29, gender: 'Female', bloodGroup: 'A+', complaint: 'Migraine with nausea', priority: 4, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 12, offsetMin: 38, name: 'Prakash Hegde', age: 66, gender: 'Male', bloodGroup: 'B+', complaint: 'Hypoglycemic episode, altered sensorium', priority: 1, doctorId: 'DOC-101', bay: 'Trauma Bay 1' },
    { hoursAgo: 11, offsetMin: 22, name: 'Divya Krishnan', age: 36, gender: 'Female', bloodGroup: 'O+', complaint: 'Acute pyelonephritis with fever', priority: 3, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 10, offsetMin: 11, name: 'Manish Tandon', age: 51, gender: 'Male', bloodGroup: 'AB-', complaint: 'Unstable angina observation', priority: 2, doctorId: 'DOC-102', bay: 'Resus Bay 2' },
    { hoursAgo: 9, offsetMin: 17, name: 'Rituja Pawar', age: 21, gender: 'Female', bloodGroup: 'A+', complaint: 'Ankle sprain, weight-bearing pain', priority: 4, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 9, offsetMin: 44, name: 'Ashok Saxena', age: 57, gender: 'Male', bloodGroup: 'O+', complaint: 'COPD exacerbation with hypoxia', priority: 2, doctorId: 'DOC-101', bay: 'Trauma Bay 1' },
    { hoursAgo: 8, offsetMin: 12, name: 'Sonal Mehta', age: 45, gender: 'Female', bloodGroup: 'B+', complaint: 'Severe vertigo & vomiting', priority: 3, doctorId: 'DOC-104', bay: 'Acute Bay 4' },
    { hoursAgo: 7, offsetMin: 9, name: 'Vivek Nambiar', age: 39, gender: 'Male', bloodGroup: 'A+', complaint: 'Industrial crush injury to hand', priority: 2, doctorId: 'DOC-103', bay: 'Trauma Bay 3' },
    { hoursAgo: 7, offsetMin: 33, name: 'Pallavi Joshi', age: 28, gender: 'Female', bloodGroup: 'O-', complaint: 'Anaphylactic reaction to shellfish', priority: 1, doctorId: 'DOC-101', bay: 'Trauma Bay 1' },
    { hoursAgo: 6, offsetMin: 19, name: 'Tarun Bhardwaj', age: 35, gender: 'Male', bloodGroup: 'B+', complaint: 'High fever and rigors', priority: 3, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 5, offsetMin: 7, name: 'Geeta Subramanian', age: 63, gender: 'Female', bloodGroup: 'O+', complaint: 'Acute coronary syndrome rule-out', priority: 1, doctorId: 'DOC-102', bay: 'Resus Bay 2' },
    { hoursAgo: 5, offsetMin: 25, name: 'Nikhil Goyal', age: 26, gender: 'Male', bloodGroup: 'A+', complaint: 'Forehead laceration from cycling fall', priority: 3, doctorId: 'DOC-103', bay: 'Trauma Bay 3' },
    { hoursAgo: 5, offsetMin: 41, name: 'Komal Sharma', age: 32, gender: 'Female', bloodGroup: 'AB+', complaint: 'Mild epistaxis, resolved', priority: 4, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 4, offsetMin: 16, name: 'Sanjay Chauhan', age: 47, gender: 'Male', bloodGroup: 'O+', complaint: 'Supraventricular tachycardia', priority: 2, doctorId: 'DOC-102', bay: 'Resus Bay 2' },
    { hoursAgo: 4, offsetMin: 37, name: 'Rekha Pillai', age: 55, gender: 'Female', bloodGroup: 'B-', complaint: 'Acute cholecystitis pain', priority: 2, doctorId: 'DOC-103', bay: 'Trauma Bay 3' },
    { hoursAgo: 3, offsetMin: 21, name: 'Yashwant Rao', age: 30, gender: 'Male', bloodGroup: 'A-', complaint: 'Minor burn on forearm', priority: 4, doctorId: 'DOC-105', bay: 'Fast-Track 5' },
    { hoursAgo: 2, offsetMin: 14, name: 'Bhavna Trivedi', age: 42, gender: 'Female', bloodGroup: 'O+', complaint: 'Acute severe headache', priority: 3, doctorId: 'DOC-104', bay: 'Acute Bay 4' },
  ];

  const historicalPatients: Patient[] = historySpecs.map((h, idx) => {
    const arrivedAt = now - h.hoursAgo * hour - h.offsetMin * min;
    const waitGap = h.priority === 1 ? 3 : h.priority === 2 ? 7 : h.priority === 3 ? 13 : 18;
    const startedAt = arrivedAt + waitGap * min;
    const dischargedAt = startedAt + (18 + (idx % 12)) * min;
    return {
      id: `PAT-${2001 + idx}`,
      mrn: `ER-2026-0${10 + idx}`,
      name: h.name,
      age: h.age,
      gender: h.gender,
      bloodGroup: h.bloodGroup,
      contact: `+91 98100 ${String(10000 + idx * 137).slice(0, 5)}`,
      complaint: h.complaint,
      priority: h.priority,
      status: 'Discharged',
      queueType: 'none',
      vitals: {
        heartRate: h.priority === 1 ? 118 : 88,
        spo2: h.priority === 1 ? 91 : 98,
        systolicBp: h.priority === 1 ? 148 : 124,
        diastolicBp: 82,
        temperature: h.priority === 3 ? 38.4 : 36.9,
      },
      assignedDoctorId: h.doctorId,
      assignedBay: h.bay,
      arrivedAt,
      treatmentStartedAt: startedAt,
      dischargedAt,
      estimatedWaitMinutes: 0,
    };
  });

  const seedEvents: TreatmentEvent[] = [
    {
      id: 'EVT-1001',
      patientId: 'PAT-1009',
      patientName: 'Suresh Menon',
      mrn: 'ER-2026-040',
      action: 'DISCHARGED',
      detail: 'Stabilized by Dr. Vikram Nair in Resus Bay 2 and discharged with follow-up.',
      priorityAtEvent: 2,
      timestamp: now - 30 * min,
    },
    {
      id: 'EVT-1002',
      patientId: 'PAT-1001',
      patientName: 'Rajeshwari Devi',
      mrn: 'ER-2026-041',
      action: 'DOCTOR_ALLOCATED',
      detail: 'Extracted from Min-Heap root (P1) and assigned to Dr. Ananya Sharma (Trauma Bay 1).',
      priorityAtEvent: 1,
      timestamp: now - 22 * min,
    },
    {
      id: 'EVT-1003',
      patientId: 'PAT-1002',
      patientName: 'Arjun Malhotra',
      mrn: 'ER-2026-042',
      action: 'DOCTOR_ALLOCATED',
      detail: 'Assigned to Dr. Priya Kulkarni (Trauma Bay 3).',
      priorityAtEvent: 2,
      timestamp: now - 16 * min,
    },
    {
      id: 'EVT-1004',
      patientId: 'PAT-1006',
      patientName: 'Sunita Tiwari',
      mrn: 'ER-2026-046',
      action: 'REGISTERED',
      detail: 'Triaged as P2 Emergent and inserted into Emergency Min-Heap.',
      priorityAtEvent: 2,
      timestamp: now - 11 * min,
    },
    {
      id: 'EVT-1005',
      patientId: 'PAT-1003',
      patientName: 'Harpreet Singh',
      mrn: 'ER-2026-043',
      action: 'REGISTERED',
      detail: 'Triaged as P1 Critical (SpO2 86%) and heapified to root of Emergency Min-Heap.',
      priorityAtEvent: 1,
      timestamp: now - 8 * min,
    },
  ];

  return {
    seedDoctors,
    seedPatients: [...activePatients, ...historicalPatients],
    seedEvents,
  };
}

async function insertSeedRecords(): Promise<void> {
  const { seedDoctors, seedPatients, seedEvents } = buildSeedPayload();

  await db
    .insert(doctors)
    .values(
      seedDoctors.map((d) => ({
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        bay: d.bay,
        status: d.status,
        currentPatientId: d.currentPatientId,
        patientsHandledToday: d.patientsHandledToday,
      }))
    )
    .onConflictDoNothing();

  await db
    .insert(patients)
    .values(
      seedPatients.map((p) => ({
        id: p.id,
        mrn: p.mrn,
        name: p.name,
        age: p.age,
        gender: p.gender,
        bloodGroup: p.bloodGroup,
        contact: p.contact,
        complaint: p.complaint,
        priority: p.priority,
        status: p.status,
        queueType: p.queueType,
        heartRate: p.vitals.heartRate,
        spo2: p.vitals.spo2,
        systolicBp: p.vitals.systolicBp,
        diastolicBp: p.vitals.diastolicBp,
        temperature: p.vitals.temperature,
        assignedDoctorId: p.assignedDoctorId,
        assignedBay: p.assignedBay,
        arrivedAt: p.arrivedAt,
        treatmentStartedAt: p.treatmentStartedAt,
        dischargedAt: p.dischargedAt,
        createdByUid: null,
      }))
    )
    .onConflictDoNothing();

  await db
    .insert(treatmentEvents)
    .values(
      seedEvents.map((e) => ({
        id: e.id,
        patientId: e.patientId,
        patientName: e.patientName,
        mrn: e.mrn,
        action: e.action,
        detail: e.detail,
        priorityAtEvent: e.priorityAtEvent,
        timestamp: e.timestamp,
        actorUid: null,
      }))
    )
    .onConflictDoNothing();
}

export async function ensureSeededInDb(): Promise<void> {
  try {
    const [row] = await db.select({ cnt: count() }).from(doctors);
    if (Number(row?.cnt ?? 0) === 0) {
      await insertSeedRecords();
    }
  } catch (error) {
    throw sanitizeDbError(error);
  }
}

export async function resetDemoDataInDb(): Promise<void> {
  try {
    await db.delete(treatmentEvents);
    await db.delete(patients);
    await db.delete(doctors);
    await insertSeedRecords();
  } catch (error) {
    throw sanitizeDbError(error);
  }
}
