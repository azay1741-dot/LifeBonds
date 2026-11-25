import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { Doctor, Patient, PriorityLevel, TreatmentEvent } from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'hospital_er.db');

export interface DbRowPatient {
  id: string;
  mrn: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  blood_group: string;
  contact: string;
  complaint: string;
  priority: number;
  status: 'Waiting' | 'In Treatment' | 'Discharged' | 'Transferred';
  queue_type: 'emergency_heap' | 'standard_fifo' | 'none';
  heart_rate: number;
  spo2: number;
  systolic_bp: number;
  diastolic_bp: number;
  temperature: number;
  assigned_doctor_id: string | null;
  assigned_bay: string | null;
  arrived_at: number;
  treatment_started_at: number | null;
  discharged_at: number | null;
}

export interface DbRowDoctor {
  id: string;
  name: string;
  specialty: string;
  bay: string;
  status: 'Available' | 'Busy' | 'Off-Duty';
  current_patient_id: string | null;
  patients_handled_today: number;
}

export interface DbRowEvent {
  id: string;
  patient_id: string;
  patient_name: string;
  mrn: string;
  action: TreatmentEvent['action'];
  detail: string;
  priority_at_event: number;
  timestamp: number;
}

export class HospitalDatabase {
  private db: DatabaseSync;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
    this.seedIfEmpty();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doctors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        specialty TEXT NOT NULL,
        bay TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('Available', 'Busy', 'Off-Duty')),
        current_patient_id TEXT,
        patients_handled_today INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY,
        mrn TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female', 'Other')),
        blood_group TEXT NOT NULL,
        contact TEXT NOT NULL,
        complaint TEXT NOT NULL,
        priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 4),
        status TEXT NOT NULL CHECK(status IN ('Waiting', 'In Treatment', 'Discharged', 'Transferred')),
        queue_type TEXT NOT NULL CHECK(queue_type IN ('emergency_heap', 'standard_fifo', 'none')),
        heart_rate INTEGER NOT NULL,
        spo2 INTEGER NOT NULL,
        systolic_bp INTEGER NOT NULL,
        diastolic_bp INTEGER NOT NULL,
        temperature REAL NOT NULL,
        assigned_doctor_id TEXT,
        assigned_bay TEXT,
        arrived_at INTEGER NOT NULL,
        treatment_started_at INTEGER,
        discharged_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS treatment_events (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        mrn TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL,
        priority_at_event INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  private seedIfEmpty(): void {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM doctors').get() as { cnt: number };
    if (row.cnt === 0) {
      this.seedDemoData();
    }
  }

  resetDemoData(): void {
    this.db.exec('DELETE FROM treatment_events; DELETE FROM patients; DELETE FROM doctors;');
    this.seedDemoData();
  }

  private seedDemoData(): void {
    const now = Date.now();
    const min = 60_000;

    const doctors: Doctor[] = [
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

    const patients: Patient[] = [
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

    const events: TreatmentEvent[] = [
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

    const insertDoc = this.db.prepare(`
      INSERT INTO doctors (id, name, specialty, bay, status, current_patient_id, patients_handled_today)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of doctors) {
      insertDoc.run(d.id, d.name, d.specialty, d.bay, d.status, d.currentPatientId, d.patientsHandledToday);
    }

    const insertPat = this.db.prepare(`
      INSERT INTO patients (
        id, mrn, name, age, gender, blood_group, contact, complaint,
        priority, status, queue_type,
        heart_rate, spo2, systolic_bp, diastolic_bp, temperature,
        assigned_doctor_id, assigned_bay, arrived_at, treatment_started_at, discharged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of patients) {
      insertPat.run(
        p.id,
        p.mrn,
        p.name,
        p.age,
        p.gender,
        p.bloodGroup,
        p.contact,
        p.complaint,
        p.priority,
        p.status,
        p.queueType,
        p.vitals.heartRate,
        p.vitals.spo2,
        p.vitals.systolicBp,
        p.vitals.diastolicBp,
        p.vitals.temperature,
        p.assignedDoctorId,
        p.assignedBay,
        p.arrivedAt,
        p.treatmentStartedAt,
        p.dischargedAt
      );
    }

    const insertEvt = this.db.prepare(`
      INSERT INTO treatment_events (id, patient_id, patient_name, mrn, action, detail, priority_at_event, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of events) {
      insertEvt.run(e.id, e.patientId, e.patientName, e.mrn, e.action, e.detail, e.priorityAtEvent, e.timestamp);
    }
  }

  getAllDoctors(): Doctor[] {
    const rows = this.db.prepare('SELECT * FROM doctors ORDER BY id ASC').all() as unknown as DbRowDoctor[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      specialty: r.specialty,
      bay: r.bay,
      status: r.status,
      currentPatientId: r.current_patient_id,
      patientsHandledToday: r.patients_handled_today,
    }));
  }

  getAllPatients(): Patient[] {
    const rows = this.db.prepare('SELECT * FROM patients ORDER BY arrived_at ASC').all() as unknown as DbRowPatient[];
    return rows.map((r) => ({
      id: r.id,
      mrn: r.mrn,
      name: r.name,
      age: r.age,
      gender: r.gender,
      bloodGroup: r.blood_group,
      contact: r.contact,
      complaint: r.complaint,
      priority: r.priority as PriorityLevel,
      status: r.status,
      queueType: r.queue_type,
      vitals: {
        heartRate: r.heart_rate,
        spo2: r.spo2,
        systolicBp: r.systolic_bp,
        diastolicBp: r.diastolic_bp,
        temperature: r.temperature,
      },
      assignedDoctorId: r.assigned_doctor_id,
      assignedBay: r.assigned_bay,
      arrivedAt: r.arrived_at,
      treatmentStartedAt: r.treatment_started_at,
      dischargedAt: r.discharged_at,
      estimatedWaitMinutes: 0,
    }));
  }

  getAllEvents(): TreatmentEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM treatment_events ORDER BY timestamp ASC')
      .all() as unknown as DbRowEvent[];
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      patientName: r.patient_name,
      mrn: r.mrn,
      action: r.action,
      detail: r.detail,
      priorityAtEvent: r.priority_at_event as PriorityLevel,
      timestamp: r.timestamp,
    }));
  }

  insertPatient(p: Patient): void {
    this.db
      .prepare(`
      INSERT INTO patients (
        id, mrn, name, age, gender, blood_group, contact, complaint,
        priority, status, queue_type,
        heart_rate, spo2, systolic_bp, diastolic_bp, temperature,
        assigned_doctor_id, assigned_bay, arrived_at, treatment_started_at, discharged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        p.id,
        p.mrn,
        p.name,
        p.age,
        p.gender,
        p.bloodGroup,
        p.contact,
        p.complaint,
        p.priority,
        p.status,
        p.queueType,
        p.vitals.heartRate,
        p.vitals.spo2,
        p.vitals.systolicBp,
        p.vitals.diastolicBp,
        p.vitals.temperature,
        p.assignedDoctorId,
        p.assignedBay,
        p.arrivedAt,
        p.treatmentStartedAt,
        p.dischargedAt
      );
  }

  updatePatient(p: Patient): void {
    this.db
      .prepare(`
      UPDATE patients SET
        priority = ?,
        status = ?,
        queue_type = ?,
        assigned_doctor_id = ?,
        assigned_bay = ?,
        treatment_started_at = ?,
        discharged_at = ?
      WHERE id = ?
    `)
      .run(
        p.priority,
        p.status,
        p.queueType,
        p.assignedDoctorId,
        p.assignedBay,
        p.treatmentStartedAt,
        p.dischargedAt,
        p.id
      );
  }

  insertDoctor(d: Doctor): void {
    this.db
      .prepare(`
      INSERT INTO doctors (id, name, specialty, bay, status, current_patient_id, patients_handled_today)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .run(d.id, d.name, d.specialty, d.bay, d.status, d.currentPatientId, d.patientsHandledToday);
  }

  updateDoctor(d: Doctor): void {
    this.db
      .prepare(`
      UPDATE doctors SET
        status = ?,
        current_patient_id = ?,
        patients_handled_today = ?
      WHERE id = ?
    `)
      .run(d.status, d.currentPatientId, d.patientsHandledToday, d.id);
  }

  insertEvent(e: TreatmentEvent): void {
    this.db
      .prepare(`
      INSERT INTO treatment_events (id, patient_id, patient_name, mrn, action, detail, priority_at_event, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(e.id, e.patientId, e.patientName, e.mrn, e.action, e.detail, e.priorityAtEvent, e.timestamp);
  }

  getNextSequenceNumbers(): { patientSeq: number; mrnSeq: number; doctorSeq: number; eventSeq: number } {
    const pCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM patients').get() as { cnt: number }).cnt;
    const dCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM doctors').get() as { cnt: number }).cnt;
    const eCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM treatment_events').get() as { cnt: number }).cnt;
    return {
      patientSeq: 1001 + pCount,
      mrnSeq: 40 + pCount + 1,
      doctorSeq: 101 + dCount,
      eventSeq: 1001 + eCount,
    };
  }
}
