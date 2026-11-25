import {
  Doctor,
  DoctorStatus,
  HospitalSnapshot,
  Patient,
  PriorityLevel,
  PriorityStat,
  TreatmentEvent,
  Vitals,
} from '../src/types.ts';
import { HospitalDatabase } from './db.ts';
import { FifoQueue } from './dsa/FifoQueue.ts';
import { CustomHashMap } from './dsa/HashMap.ts';
import { DoublyLinkedList } from './dsa/LinkedList.ts';
import { MinHeapPriorityQueue, TriageHeapEntry } from './dsa/MinHeapPriorityQueue.ts';

interface FifoEntry {
  patientId: string;
  mrn: string;
  name: string;
  arrivedAt: number;
}

const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  1: 'P1 Critical',
  2: 'P2 Emergent',
  3: 'P3 Urgent',
  4: 'P4 Standard',
};

const AVG_TREATMENT_MINUTES: Record<PriorityLevel, number> = {
  1: 18,
  2: 14,
  3: 11,
  4: 9,
};

export interface RegisterPatientInput {
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bloodGroup: string;
  contact: string;
  complaint: string;
  priority: PriorityLevel;
  vitals: Vitals;
}

export class HospitalTriageEngine {
  private db: HospitalDatabase;
  private patientMap = new CustomHashMap<Patient>(32);
  private doctorMap = new CustomHashMap<Doctor>(16);
  private emergencyHeap = new MinHeapPriorityQueue();
  private standardQueue = new FifoQueue<FifoEntry>();
  private eventLog = new DoublyLinkedList<TreatmentEvent>();
  private mrnToIdMap = new CustomHashMap<string>(32);

  constructor() {
    this.db = new HospitalDatabase();
    this.hydrateFromDatabase();
  }

  private hydrateFromDatabase(): void {
    this.patientMap.clear();
    this.doctorMap.clear();
    this.emergencyHeap.clear();
    this.standardQueue.clear();
    this.eventLog.clear();
    this.mrnToIdMap.clear();

    const doctors = this.db.getAllDoctors();
    for (const d of doctors) {
      this.doctorMap.set(d.id, d);
    }

    const patients = this.db.getAllPatients();
    for (const p of patients) {
      this.patientMap.set(p.id, p);
      this.mrnToIdMap.set(p.mrn, p.id);

      if (p.status === 'Waiting') {
        if (p.queueType === 'emergency_heap') {
          this.emergencyHeap.insert(
            {
              patientId: p.id,
              mrn: p.mrn,
              name: p.name,
              priority: p.priority,
              arrivedAt: p.arrivedAt,
            },
            false
          );
        } else if (p.queueType === 'standard_fifo') {
          this.standardQueue.enqueue({
            patientId: p.id,
            mrn: p.mrn,
            name: p.name,
            arrivedAt: p.arrivedAt,
          });
        }
      }
    }

    const events = this.db.getAllEvents();
    for (const e of events) {
      this.eventLog.append(e);
    }
  }

  private createEvent(
    patient: Patient,
    action: TreatmentEvent['action'],
    detail: string
  ): TreatmentEvent {
    const seq = this.db.getNextSequenceNumbers().eventSeq;
    const evt: TreatmentEvent = {
      id: `EVT-${seq}-${Math.floor(Math.random() * 900 + 100)}`,
      patientId: patient.id,
      patientName: patient.name,
      mrn: patient.mrn,
      action,
      detail,
      priorityAtEvent: patient.priority,
      timestamp: Date.now(),
    };
    this.db.insertEvent(evt);
    this.eventLog.append(evt);
    return evt;
  }

  registerPatient(input: RegisterPatientInput): Patient {
    const seq = this.db.getNextSequenceNumbers();
    const id = `PAT-${seq.patientSeq}-${Math.floor(Math.random() * 90 + 10)}`;
    const mrn = `ER-2026-${String(seq.mrnSeq).padStart(3, '0')}${Math.floor(Math.random() * 9)}`;
    const now = Date.now();
    const queueType = input.priority <= 3 ? 'emergency_heap' : 'standard_fifo';

    const patient: Patient = {
      id,
      mrn,
      name: input.name,
      age: input.age,
      gender: input.gender,
      bloodGroup: input.bloodGroup,
      contact: input.contact,
      complaint: input.complaint,
      priority: input.priority,
      status: 'Waiting',
      queueType,
      vitals: input.vitals,
      assignedDoctorId: null,
      assignedBay: null,
      arrivedAt: now,
      treatmentStartedAt: null,
      dischargedAt: null,
      estimatedWaitMinutes: 0,
    };

    this.db.insertPatient(patient);
    this.patientMap.set(patient.id, patient);
    this.mrnToIdMap.set(patient.mrn, patient.id);

    if (queueType === 'emergency_heap') {
      this.emergencyHeap.insert({
        patientId: patient.id,
        mrn: patient.mrn,
        name: patient.name,
        priority: patient.priority,
        arrivedAt: patient.arrivedAt,
      });
      this.createEvent(
        patient,
        'REGISTERED',
        `Triaged as ${PRIORITY_LABELS[patient.priority]} and inserted into Emergency Min-Heap.`
      );
    } else {
      this.standardQueue.enqueue({
        patientId: patient.id,
        mrn: patient.mrn,
        name: patient.name,
        arrivedAt: patient.arrivedAt,
      });
      this.createEvent(
        patient,
        'REGISTERED',
        'Registered as P4 Standard and appended to Walk-In FIFO Queue.'
      );
    }

    return patient;
  }

  updatePatientPriority(patientId: string, newPriority: PriorityLevel, reason: string): Patient {
    const patient = this.patientMap.get(patientId);
    if (!patient) {
      throw new Error('NOT_FOUND:Patient not found');
    }
    if (patient.status !== 'Waiting') {
      throw new Error('CONFLICT:Priority can only be changed while patient is Waiting');
    }

    const oldPriority = patient.priority;
    if (oldPriority === newPriority) {
      return patient;
    }

    patient.priority = newPriority;

    if (patient.queueType === 'standard_fifo' && newPriority <= 3) {
      this.standardQueue.removeById(patient.id);
      patient.queueType = 'emergency_heap';
      this.emergencyHeap.insert({
        patientId: patient.id,
        mrn: patient.mrn,
        name: patient.name,
        priority: newPriority,
        arrivedAt: patient.arrivedAt,
      });
    } else if (patient.queueType === 'emergency_heap') {
      this.emergencyHeap.updatePriority(patient.id, newPriority);
    }

    this.db.updatePatient(patient);
    this.patientMap.set(patient.id, patient);

    const isEscalation = newPriority < oldPriority;
    this.createEvent(
      patient,
      isEscalation ? 'PRIORITY_ESCALATED' : 'PRIORITY_DOWNGRADED',
      `Priority changed P${oldPriority} -> P${newPriority}. Reason: ${reason}`
    );

    return patient;
  }

  dispatchNextToDoctor(doctorId: string): { patient: Patient; doctor: Doctor } {
    const doctor = this.doctorMap.get(doctorId);
    if (!doctor) {
      throw new Error('NOT_FOUND:Doctor not found');
    }
    if (doctor.status !== 'Available') {
      throw new Error('CONFLICT:Selected doctor is not currently available');
    }

    let nextPatientId: string | null = null;
    let sourceLabel = 'Emergency Min-Heap';

    const heapMin = this.emergencyHeap.extractMin();
    if (heapMin) {
      nextPatientId = heapMin.patientId;
    } else {
      const fifoNext = this.standardQueue.dequeue();
      if (fifoNext) {
        nextPatientId = fifoNext.patientId;
        sourceLabel = 'Standard FIFO Queue';
      }
    }

    if (!nextPatientId) {
      throw new Error('CONFLICT:Both Emergency Min-Heap and Standard FIFO Queue are empty');
    }

    const patient = this.patientMap.get(nextPatientId);
    if (!patient) {
      throw new Error('NOT_FOUND:Queued patient record missing');
    }

    return this.bindPatientToDoctor(patient, doctor, `Extracted from ${sourceLabel}`);
  }

  assignDoctorToPatient(patientId: string, doctorId: string): { patient: Patient; doctor: Doctor } {
    const patient = this.patientMap.get(patientId);
    if (!patient) {
      throw new Error('NOT_FOUND:Patient not found');
    }
    if (patient.status !== 'Waiting') {
      throw new Error('CONFLICT:Patient is not in a Waiting state');
    }

    const doctor = this.doctorMap.get(doctorId);
    if (!doctor) {
      throw new Error('NOT_FOUND:Doctor not found');
    }
    if (doctor.status !== 'Available') {
      throw new Error('CONFLICT:Doctor is not available');
    }

    if (patient.queueType === 'emergency_heap') {
      this.emergencyHeap.removeById(patient.id);
    } else if (patient.queueType === 'standard_fifo') {
      this.standardQueue.removeById(patient.id);
    }

    return this.bindPatientToDoctor(patient, doctor, 'Direct triage allocation');
  }

  private bindPatientToDoctor(
    patient: Patient,
    doctor: Doctor,
    methodNote: string
  ): { patient: Patient; doctor: Doctor } {
    const now = Date.now();
    patient.status = 'In Treatment';
    patient.queueType = 'none';
    patient.assignedDoctorId = doctor.id;
    patient.assignedBay = doctor.bay;
    patient.treatmentStartedAt = now;

    doctor.status = 'Busy';
    doctor.currentPatientId = patient.id;

    this.db.updatePatient(patient);
    this.db.updateDoctor(doctor);
    this.patientMap.set(patient.id, patient);
    this.doctorMap.set(doctor.id, doctor);

    this.createEvent(
      patient,
      'DOCTOR_ALLOCATED',
      `${methodNote}: assigned to ${doctor.name} (${doctor.bay}).`
    );

    return { patient, doctor };
  }

  completePatientTreatment(patientId: string, outcome: 'Discharged' | 'Transferred'): Patient {
    const patient = this.patientMap.get(patientId);
    if (!patient) {
      throw new Error('NOT_FOUND:Patient not found');
    }
    if (patient.status !== 'In Treatment') {
      throw new Error('CONFLICT:Only patients currently In Treatment can be discharged or transferred');
    }

    const now = Date.now();
    patient.status = outcome;
    patient.dischargedAt = now;
    this.db.updatePatient(patient);
    this.patientMap.set(patient.id, patient);

    if (patient.assignedDoctorId) {
      const doctor = this.doctorMap.get(patient.assignedDoctorId);
      if (doctor) {
        doctor.status = 'Available';
        doctor.currentPatientId = null;
        doctor.patientsHandledToday += 1;
        this.db.updateDoctor(doctor);
        this.doctorMap.set(doctor.id, doctor);
      }
    }

    this.createEvent(
      patient,
      outcome === 'Discharged' ? 'DISCHARGED' : 'TRANSFERRED',
      `Treatment completed; patient marked ${outcome} from ${patient.assignedBay ?? 'ER Bay'}.`
    );

    return patient;
  }

  toggleDoctorAvailability(doctorId: string, status: 'Available' | 'Off-Duty'): Doctor {
    const doctor = this.doctorMap.get(doctorId);
    if (!doctor) {
      throw new Error('NOT_FOUND:Doctor not found');
    }
    if (doctor.status === 'Busy' && doctor.currentPatientId) {
      throw new Error('CONFLICT:Cannot change shift status while doctor is treating an active patient');
    }

    doctor.status = status;
    this.db.updateDoctor(doctor);
    this.doctorMap.set(doctor.id, doctor);
    return doctor;
  }

  addDoctor(name: string, specialty: string, bay: string): Doctor {
    const seq = this.db.getNextSequenceNumbers().doctorSeq;
    const doctor: Doctor = {
      id: `DOC-${seq}-${Math.floor(Math.random() * 90 + 10)}`,
      name,
      specialty,
      bay,
      status: 'Available' as DoctorStatus,
      currentPatientId: null,
      patientsHandledToday: 0,
    };
    this.db.insertDoctor(doctor);
    this.doctorMap.set(doctor.id, doctor);
    return doctor;
  }

  getPatientTimeline(patientId: string): TreatmentEvent[] {
    return this.eventLog.filterByPatient(patientId);
  }

  resetDemo(): void {
    this.db.resetDemoData();
    this.hydrateFromDatabase();
  }

  getSnapshot(): HospitalSnapshot {
    const now = Date.now();
    const doctors = this.doctorMap.values().sort((a, b) => a.id.localeCompare(b.id));
    const availableDoctors = doctors.filter((d) => d.status === 'Available').length;
    const activeCapacity = Math.max(1, doctors.filter((d) => d.status !== 'Off-Duty').length);

    const sortedHeapEntries = this.emergencyHeap.toSortedArray();
    const emergencyQueue: Patient[] = [];
    let cumulativeLoadMinutes = 0;

    for (let i = 0; i < sortedHeapEntries.length; i++) {
      const entry = sortedHeapEntries[i];
      const pat = this.patientMap.get(entry.patientId);
      if (pat) {
        const estWait =
          availableDoctors > 0 && i < availableDoctors
            ? 0
            : Math.max(2, Math.round(cumulativeLoadMinutes / activeCapacity));
        const enriched = { ...pat, estimatedWaitMinutes: estWait };
        emergencyQueue.push(enriched);
        cumulativeLoadMinutes += AVG_TREATMENT_MINUTES[pat.priority];
      }
    }

    const fifoEntries = this.standardQueue.toArray();
    const standardQueue: Patient[] = [];
    for (let i = 0; i < fifoEntries.length; i++) {
      const pat = this.patientMap.get(fifoEntries[i].patientId);
      if (pat) {
        const estWait = Math.max(5, Math.round(cumulativeLoadMinutes / activeCapacity));
        standardQueue.push({ ...pat, estimatedWaitMinutes: estWait });
        cumulativeLoadMinutes += AVG_TREATMENT_MINUTES[4];
      }
    }

    const allPatientsRaw = this.patientMap.values();
    const waitLookup = new Map<string, number>();
    for (const p of emergencyQueue) waitLookup.set(p.id, p.estimatedWaitMinutes);
    for (const p of standardQueue) waitLookup.set(p.id, p.estimatedWaitMinutes);

    const allPatients = allPatientsRaw
      .map((p) => ({
        ...p,
        estimatedWaitMinutes: waitLookup.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.arrivedAt - a.arrivedAt);

    const waitingPatients = [...emergencyQueue, ...standardQueue];
    const inTreatmentPatients = allPatients.filter((p) => p.status === 'In Treatment');
    const dischargedPatients = allPatients.filter(
      (p) => p.status === 'Discharged' || p.status === 'Transferred'
    );

    const avgWaitMinutes =
      waitingPatients.length === 0
        ? 0
        : Math.round(
            waitingPatients.reduce((acc, p) => acc + Math.max(0, (now - p.arrivedAt) / 60_000), 0) /
              waitingPatients.length
          );

    const priorityStats: PriorityStat[] = ([1, 2, 3, 4] as PriorityLevel[]).map((prio) => {
      const group = allPatients.filter((p) => p.priority === prio);
      const waiting = group.filter((p) => p.status === 'Waiting');
      const inTreat = group.filter((p) => p.status === 'In Treatment');
      const done = group.filter((p) => p.status === 'Discharged' || p.status === 'Transferred');

      const completedOrStarted = group.filter((p) => p.treatmentStartedAt !== null);
      const waitSamples: number[] = [
        ...waiting.map((p) => Math.max(0, (now - p.arrivedAt) / 60_000)),
        ...completedOrStarted.map((p) => Math.max(0, ((p.treatmentStartedAt ?? now) - p.arrivedAt) / 60_000)),
      ];
      const avgPrioWait =
        waitSamples.length === 0
          ? 0
          : Math.round(waitSamples.reduce((s, v) => s + v, 0) / waitSamples.length);

      return {
        priority: prio,
        label: PRIORITY_LABELS[prio],
        waitingCount: waiting.length,
        inTreatmentCount: inTreat.length,
        dischargedCount: done.length,
        avgWaitMinutes: avgPrioWait,
      };
    });

    return {
      serverTime: now,
      summary: {
        emergencyWaitingCount: emergencyQueue.length,
        standardWaitingCount: standardQueue.length,
        inTreatmentCount: inTreatmentPatients.length,
        dischargedCount: dischargedPatients.length,
        availableDoctorsCount: availableDoctors,
        totalDoctorsCount: doctors.length,
        avgWaitMinutes,
        criticalWaitingCount: emergencyQueue.filter((p) => p.priority === 1).length,
      },
      emergencyQueue,
      standardQueue,
      allPatients,
      doctors,
      recentEvents: this.eventLog.toArrayNewestFirst(60),
      priorityStats,
      dsaInspection: {
        heapArray: this.emergencyHeap.getHeapArrayView(),
        lastHeapTrace: this.emergencyHeap.getLastTrace(),
        fifoOrder: fifoEntries.map((entry, idx) => ({
          position: idx + 1,
          patientId: entry.patientId,
          mrn: entry.mrn,
          name: entry.name,
          arrivedAt: entry.arrivedAt,
        })),
        patientHashMap: this.patientMap.getStats((p) => `${p.mrn} · ${p.name} (P${p.priority})`),
        linkedListLength: this.eventLog.size(),
      },
    };
  }
}
