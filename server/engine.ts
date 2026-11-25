import {
  ensureSeededInDb,
  getAllDoctorsFromDb,
  getAllEventsFromDb,
  getAllPatientsFromDb,
  getSequenceCountsFromDb,
  insertDoctorInDb,
  insertEventInDb,
  insertPatientInDb,
  resetDemoDataInDb,
  updateDoctorInDb,
  updatePatientInDb,
} from '../src/db/repository.ts';
import {
  Doctor,
  DoctorStatus,
  HospitalSnapshot,
  HourlyInflowBucket,
  Patient,
  PriorityLevel,
  PriorityStat,
  TreatmentEvent,
  Vitals,
} from '../src/types.ts';
import { FifoQueue } from './dsa/FifoQueue.ts';
import { CustomHashMap } from './dsa/HashMap.ts';
import { DoublyLinkedList } from './dsa/LinkedList.ts';
import { MinHeapPriorityQueue } from './dsa/MinHeapPriorityQueue.ts';

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
  private patientMap = new CustomHashMap<Patient>(32);
  private doctorMap = new CustomHashMap<Doctor>(16);
  private emergencyHeap = new MinHeapPriorityQueue();
  private standardQueue = new FifoQueue<FifoEntry>();
  private eventLog = new DoublyLinkedList<TreatmentEvent>();
  private mrnToIdMap = new CustomHashMap<string>(32);

  private ready = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  async ensureReady(): Promise<void> {
    if (this.ready) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await ensureSeededInDb();
        await this.hydrateFromDatabase();
        this.ready = true;
      })().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    await this.initPromise;
  }

  private runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(fn, fn);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private async hydrateFromDatabase(): Promise<void> {
    const [doctors, patients, events] = await Promise.all([
      getAllDoctorsFromDb(),
      getAllPatientsFromDb(),
      getAllEventsFromDb(),
    ]);

    this.patientMap.clear();
    this.doctorMap.clear();
    this.emergencyHeap.clear();
    this.standardQueue.clear();
    this.eventLog.clear();
    this.mrnToIdMap.clear();

    for (const d of doctors) {
      this.doctorMap.set(d.id, d);
    }

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

    for (const e of events) {
      this.eventLog.append(e);
    }
  }

  private async createEvent(
    patient: Patient,
    action: TreatmentEvent['action'],
    detail: string,
    actorUid?: string
  ): Promise<TreatmentEvent> {
    const seq = (await getSequenceCountsFromDb()).eventSeq;
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
    await insertEventInDb(evt, actorUid);
    this.eventLog.append(evt);
    return evt;
  }

  async registerPatient(input: RegisterPatientInput, actorUid?: string): Promise<Patient> {
    await this.ensureReady();
    return this.runSerialized(async () => {
      const seq = await getSequenceCountsFromDb();
      let id = `PAT-${seq.patientSeq}-${Math.floor(Math.random() * 90 + 10)}`;
      while (this.patientMap.has(id)) {
        id = `PAT-${seq.patientSeq}-${Math.floor(Math.random() * 900 + 100)}`;
      }
      let mrn = `ER-2026-${String(seq.mrnSeq).padStart(3, '0')}${Math.floor(Math.random() * 10)}`;
      let mrnOffset = 1;
      while (this.mrnToIdMap.has(mrn)) {
        mrn = `ER-2026-${String(seq.mrnSeq + mrnOffset).padStart(3, '0')}${Math.floor(Math.random() * 10)}`;
        mrnOffset++;
      }
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

      await insertPatientInDb(patient, actorUid);
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
        await this.createEvent(
          patient,
          'REGISTERED',
          `Triaged as ${PRIORITY_LABELS[patient.priority]} and inserted into Emergency Min-Heap.`,
          actorUid
        );
      } else {
        this.standardQueue.enqueue({
          patientId: patient.id,
          mrn: patient.mrn,
          name: patient.name,
          arrivedAt: patient.arrivedAt,
        });
        await this.createEvent(
          patient,
          'REGISTERED',
          'Registered as P4 Standard and appended to Walk-In FIFO Queue.',
          actorUid
        );
      }

      return patient;
    });
  }

  async updatePatientPriority(
    patientId: string,
    newPriority: PriorityLevel,
    reason: string,
    actorUid?: string
  ): Promise<Patient> {
    await this.ensureReady();
    return this.runSerialized(async () => {
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

      const updated: Patient = { ...patient, priority: newPriority };
      if (updated.queueType === 'standard_fifo' && newPriority <= 3) {
        updated.queueType = 'emergency_heap';
      }

      await updatePatientInDb(updated);

      if (patient.queueType === 'standard_fifo' && newPriority <= 3) {
        this.standardQueue.removeById(updated.id);
        this.emergencyHeap.insert({
          patientId: updated.id,
          mrn: updated.mrn,
          name: updated.name,
          priority: newPriority,
          arrivedAt: updated.arrivedAt,
        });
      } else if (updated.queueType === 'emergency_heap') {
        this.emergencyHeap.updatePriority(updated.id, newPriority);
      }

      this.patientMap.set(updated.id, updated);

      const isEscalation = newPriority < oldPriority;
      await this.createEvent(
        updated,
        isEscalation ? 'PRIORITY_ESCALATED' : 'PRIORITY_DOWNGRADED',
        `Priority changed P${oldPriority} -> P${newPriority}. Reason: ${reason}`,
        actorUid
      );

      return updated;
    });
  }

  async dispatchNextToDoctor(
    doctorId: string,
    actorUid?: string
  ): Promise<{ patient: Patient; doctor: Doctor }> {
    await this.ensureReady();
    return this.runSerialized(async () => {
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

      return this.bindPatientToDoctor(patient, doctor, `Extracted from ${sourceLabel}`, actorUid);
    });
  }

  async assignDoctorToPatient(
    patientId: string,
    doctorId: string,
    actorUid?: string
  ): Promise<{ patient: Patient; doctor: Doctor }> {
    await this.ensureReady();
    return this.runSerialized(async () => {
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

      return this.bindPatientToDoctor(patient, doctor, 'Direct triage allocation', actorUid);
    });
  }

  private async bindPatientToDoctor(
    patient: Patient,
    doctor: Doctor,
    methodNote: string,
    actorUid?: string
  ): Promise<{ patient: Patient; doctor: Doctor }> {
    const now = Date.now();
    patient.status = 'In Treatment';
    patient.queueType = 'none';
    patient.assignedDoctorId = doctor.id;
    patient.assignedBay = doctor.bay;
    patient.treatmentStartedAt = now;

    doctor.status = 'Busy';
    doctor.currentPatientId = patient.id;

    await updatePatientInDb(patient);
    await updateDoctorInDb(doctor);
    this.patientMap.set(patient.id, patient);
    this.doctorMap.set(doctor.id, doctor);

    await this.createEvent(
      patient,
      'DOCTOR_ALLOCATED',
      `${methodNote}: assigned to ${doctor.name} (${doctor.bay}).`,
      actorUid
    );

    return { patient, doctor };
  }

  async transferPatient(
    patientId: string,
    destination: string,
    reason: string,
    actorUid?: string
  ): Promise<Patient> {
    await this.ensureReady();
    return this.runSerialized(async () => {
      const patient = this.patientMap.get(patientId);
      if (!patient) {
        throw new Error('NOT_FOUND:Patient not found');
      }
      if (patient.status === 'Discharged' || patient.status === 'Transferred') {
        throw new Error(`CONFLICT:Patient has already been marked ${patient.status}`);
      }

      const previousStatus = patient.status;
      const originQueue = patient.queueType;
      const originBay = patient.assignedBay;
      let originLabel = 'Triage Queue';

      if (previousStatus === 'Waiting') {
        if (originQueue === 'emergency_heap') {
          this.emergencyHeap.removeById(patient.id);
          originLabel = 'Emergency Min-Heap';
        } else if (originQueue === 'standard_fifo') {
          this.standardQueue.removeById(patient.id);
          originLabel = 'Standard Walk-In FIFO';
        }
      } else if (previousStatus === 'In Treatment') {
        originLabel = originBay ?? 'ER Bay';
        if (patient.assignedDoctorId) {
          const doctor = this.doctorMap.get(patient.assignedDoctorId);
          if (doctor) {
            doctor.status = 'Available';
            doctor.currentPatientId = null;
            doctor.patientsHandledToday += 1;
            await updateDoctorInDb(doctor);
            this.doctorMap.set(doctor.id, doctor);
          }
        }
      }

      const now = Date.now();
      patient.status = 'Transferred';
      patient.queueType = 'none';
      patient.dischargedAt = now;
      await updatePatientInDb(patient);
      this.patientMap.set(patient.id, patient);

      await this.createEvent(
        patient,
        'TRANSFERRED',
        `Transferred from ${originLabel} to ${destination}. Reason: ${reason}`,
        actorUid
      );

      return patient;
    });
  }

  async completePatientTreatment(
    patientId: string,
    outcome: 'Discharged' | 'Transferred',
    actorUid?: string
  ): Promise<Patient> {
    if (outcome === 'Transferred') {
      return this.transferPatient(
        patientId,
        'Receiving Specialty Unit',
        'Clinical transfer initiated',
        actorUid
      );
    }

    await this.ensureReady();
    return this.runSerialized(async () => {
      const patient = this.patientMap.get(patientId);
      if (!patient) {
        throw new Error('NOT_FOUND:Patient not found');
      }
      if (patient.status === 'Discharged' || patient.status === 'Transferred') {
        throw new Error(`CONFLICT:Patient has already been marked ${patient.status}`);
      }

      const previousStatus = patient.status;
      const originQueue = patient.queueType;
      const originBay = patient.assignedBay;
      let originLabel = 'Triage Queue';

      if (previousStatus === 'Waiting') {
        if (originQueue === 'emergency_heap') {
          this.emergencyHeap.removeById(patient.id);
          originLabel = 'Emergency Min-Heap';
        } else if (originQueue === 'standard_fifo') {
          this.standardQueue.removeById(patient.id);
          originLabel = 'Standard Walk-In FIFO';
        }
      } else if (previousStatus === 'In Treatment') {
        originLabel = originBay ?? 'ER Bay';
        if (patient.assignedDoctorId) {
          const doctor = this.doctorMap.get(patient.assignedDoctorId);
          if (doctor) {
            doctor.status = 'Available';
            doctor.currentPatientId = null;
            doctor.patientsHandledToday += 1;
            await updateDoctorInDb(doctor);
            this.doctorMap.set(doctor.id, doctor);
          }
        }
      }

      const now = Date.now();
      patient.status = 'Discharged';
      patient.queueType = 'none';
      patient.dischargedAt = now;
      await updatePatientInDb(patient);
      this.patientMap.set(patient.id, patient);

      await this.createEvent(
        patient,
        'DISCHARGED',
        previousStatus === 'Waiting'
          ? `Discharged directly from ${originLabel} after triage clearance.`
          : `Treatment completed; patient marked Discharged from ${originLabel}.`,
        actorUid
      );

      return patient;
    });
  }

  async toggleDoctorAvailability(
    doctorId: string,
    status: 'Available' | 'Off-Duty'
  ): Promise<Doctor> {
    await this.ensureReady();
    return this.runSerialized(async () => {
      const doctor = this.doctorMap.get(doctorId);
      if (!doctor) {
        throw new Error('NOT_FOUND:Doctor not found');
      }
      if (doctor.status === 'Busy' && doctor.currentPatientId) {
        throw new Error('CONFLICT:Cannot change shift status while doctor is treating an active patient');
      }

      doctor.status = status;
      await updateDoctorInDb(doctor);
      this.doctorMap.set(doctor.id, doctor);
      return doctor;
    });
  }

  async addDoctor(name: string, specialty: string, bay: string): Promise<Doctor> {
    await this.ensureReady();
    return this.runSerialized(async () => {
      const seq = (await getSequenceCountsFromDb()).doctorSeq;
      const doctor: Doctor = {
        id: `DOC-${seq}-${Math.floor(Math.random() * 90 + 10)}`,
        name,
        specialty,
        bay,
        status: 'Available' as DoctorStatus,
        currentPatientId: null,
        patientsHandledToday: 0,
      };
      await insertDoctorInDb(doctor);
      this.doctorMap.set(doctor.id, doctor);
      return doctor;
    });
  }

  async getPatientTimeline(patientId: string): Promise<TreatmentEvent[]> {
    await this.ensureReady();
    return this.eventLog.filterByPatient(patientId);
  }

  async resetDemo(): Promise<void> {
    await this.ensureReady();
    await this.runSerialized(async () => {
      await resetDemoDataInDb();
      await this.hydrateFromDatabase();
    });
  }

  async getSnapshot(): Promise<HospitalSnapshot> {
    await this.ensureReady();
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

    const hourMs = 3_600_000;
    const currentHourStart = Math.floor(now / hourMs) * hourMs;
    const windowStart = currentHourStart - 23 * hourMs;
    const hourlyInflow24h: HourlyInflowBucket[] = Array.from({ length: 24 }, (_, hourIndex) => {
      const hourStart = windowStart + hourIndex * hourMs;
      const d = new Date(hourStart);
      const label = `${String(d.getHours()).padStart(2, '0')}:00`;
      return {
        hourIndex,
        hourStart,
        label,
        total: 0,
        completed: 0,
        p1: 0,
        p2: 0,
        p3: 0,
        p4: 0,
      };
    });

    for (const p of allPatients) {
      if (p.arrivedAt >= windowStart && p.arrivedAt < currentHourStart + hourMs) {
        const idx = Math.floor((p.arrivedAt - windowStart) / hourMs);
        if (idx >= 0 && idx < 24) {
          const bucket = hourlyInflow24h[idx];
          bucket.total += 1;
          if (p.priority === 1) bucket.p1 += 1;
          else if (p.priority === 2) bucket.p2 += 1;
          else if (p.priority === 3) bucket.p3 += 1;
          else bucket.p4 += 1;
        }
      }
      if (
        (p.status === 'Discharged' || p.status === 'Transferred') &&
        p.dischargedAt !== null &&
        p.dischargedAt >= windowStart &&
        p.dischargedAt < currentHourStart + hourMs
      ) {
        const compIdx = Math.floor((p.dischargedAt - windowStart) / hourMs);
        if (compIdx >= 0 && compIdx < 24) {
          hourlyInflow24h[compIdx].completed += 1;
        }
      }
    }

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
      hourlyInflow24h,
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
