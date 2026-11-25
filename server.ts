import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { HospitalTriageEngine } from './server/engine.ts';
import { PriorityLevel } from './src/types.ts';

const PORT = 3000;
const VALID_GENDERS = new Set(['Male', 'Female', 'Other']);
const VALID_BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

function sanitizeCsvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  const formulaSafe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

function handleEngineError(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : 'Unexpected server error';
  if (msg.startsWith('NOT_FOUND:')) {
    res.status(404).json({ error: msg.slice('NOT_FOUND:'.length) });
    return;
  }
  if (msg.startsWith('CONFLICT:')) {
    res.status(409).json({ error: msg.slice('CONFLICT:'.length) });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

async function startServer(): Promise<void> {
  const app = express();
  const engine = new HospitalTriageEngine();

  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/state', (_req: Request, res: Response) => {
    res.json(engine.getSnapshot());
  });

  app.post('/api/patients', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const age = Number(body.age);
    const gender = body.gender;
    const bloodGroup = typeof body.bloodGroup === 'string' ? body.bloodGroup.trim() : 'O+';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
    const complaint = typeof body.complaint === 'string' ? body.complaint.trim() : '';
    const priority = Number(body.priority) as PriorityLevel;
    const vitals = body.vitals ?? {};

    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Patient name must be between 2 and 80 characters.' });
      return;
    }
    if (!Number.isInteger(age) || age < 0 || age > 120) {
      res.status(400).json({ error: 'Age must be an integer between 0 and 120.' });
      return;
    }
    if (!VALID_GENDERS.has(gender)) {
      res.status(400).json({ error: 'Invalid gender value.' });
      return;
    }
    if (!VALID_BLOOD_GROUPS.has(bloodGroup)) {
      res.status(400).json({ error: 'Invalid blood group.' });
      return;
    }
    if (contact.length < 5 || contact.length > 30) {
      res.status(400).json({ error: 'Contact number must be between 5 and 30 characters.' });
      return;
    }
    if (complaint.length < 3 || complaint.length > 300) {
      res.status(400).json({ error: 'Chief complaint must be between 3 and 300 characters.' });
      return;
    }
    if (![1, 2, 3, 4].includes(priority)) {
      res.status(400).json({ error: 'Priority must be 1, 2, 3, or 4.' });
      return;
    }

    const heartRate = Number(vitals.heartRate);
    const spo2 = Number(vitals.spo2);
    const systolicBp = Number(vitals.systolicBp);
    const diastolicBp = Number(vitals.diastolicBp);
    const temperature = Number(vitals.temperature);

    if (
      !Number.isFinite(heartRate) || heartRate < 20 || heartRate > 250 ||
      !Number.isFinite(spo2) || spo2 < 40 || spo2 > 100 ||
      !Number.isFinite(systolicBp) || systolicBp < 40 || systolicBp > 260 ||
      !Number.isFinite(diastolicBp) || diastolicBp < 20 || diastolicBp > 160 ||
      !Number.isFinite(temperature) || temperature < 30 || temperature > 44
    ) {
      res.status(400).json({ error: 'Vitals contain out-of-range clinical readings.' });
      return;
    }

    try {
      const patient = engine.registerPatient({
        name,
        age,
        gender,
        bloodGroup,
        contact,
        complaint,
        priority,
        vitals: {
          heartRate: Math.round(heartRate),
          spo2: Math.round(spo2),
          systolicBp: Math.round(systolicBp),
          diastolicBp: Math.round(diastolicBp),
          temperature: Number(temperature.toFixed(1)),
        },
      });
      res.status(201).json({ patient, snapshot: engine.getSnapshot() });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.patch('/api/patients/:id/priority', (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    const newPriority = Number(req.body?.priority) as PriorityLevel;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    if (![1, 2, 3, 4].includes(newPriority)) {
      res.status(400).json({ error: 'Priority must be 1, 2, 3, or 4.' });
      return;
    }
    if (reason.length < 3 || reason.length > 200) {
      res.status(400).json({ error: 'Please provide a clinical reason (3-200 characters).' });
      return;
    }

    try {
      const patient = engine.updatePatientPriority(id, newPriority, reason);
      res.json({ patient, snapshot: engine.getSnapshot() });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/doctors/:id/assign-next', (req: Request, res: Response) => {
    const doctorId = String(req.params.id ?? '');
    try {
      const result = engine.dispatchNextToDoctor(doctorId);
      res.json({ ...result, snapshot: engine.getSnapshot() });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/patients/:id/assign-doctor', (req: Request, res: Response) => {
    const patientId = String(req.params.id ?? '');
    const doctorId = typeof req.body?.doctorId === 'string' ? req.body.doctorId.trim() : '';
    if (!doctorId) {
      res.status(400).json({ error: 'doctorId is required.' });
      return;
    }
    try {
      const result = engine.assignDoctorToPatient(patientId, doctorId);
      res.json({ ...result, snapshot: engine.getSnapshot() });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.patch('/api/patients/:id/status', (req: Request, res: Response) => {
    const patientId = String(req.params.id ?? '');
    const outcome = req.body?.status;
    if (outcome !== 'Discharged' && outcome !== 'Transferred') {
      res.status(400).json({ error: 'Status must be Discharged or Transferred.' });
      return;
    }
    try {
      const patient = engine.completePatientTreatment(patientId, outcome);
      res.json({ patient, snapshot: engine.getSnapshot() });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/doctors', (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const specialty = typeof req.body?.specialty === 'string' ? req.body.specialty.trim() : '';
    const bay = typeof req.body?.bay === 'string' ? req.body.bay.trim() : '';

    if (name.length < 3 || name.length > 60 || specialty.length < 3 || bay.length < 2) {
      res.status(400).json({ error: 'Valid doctor name, specialty, and ER bay are required.' });
      return;
    }
    try {
      const doctor = engine.addDoctor(name, specialty, bay);
      res.status(201).json({ doctor, snapshot: engine.getSnapshot() });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.patch('/api/doctors/:id/status', (req: Request, res: Response) => {
    const doctorId = String(req.params.id ?? '');
    const status = req.body?.status;
    if (status !== 'Available' && status !== 'Off-Duty') {
      res.status(400).json({ error: 'Doctor status must be Available or Off-Duty.' });
      return;
    }
    try {
      const doctor = engine.toggleDoctorAvailability(doctorId, status);
      res.json({ doctor, snapshot: engine.getSnapshot() });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.get('/api/patients/:id/timeline', (req: Request, res: Response) => {
    const patientId = String(req.params.id ?? '');
    res.json({ events: engine.getPatientTimeline(patientId) });
  });

  app.get('/api/reports/export', (_req: Request, res: Response) => {
    const snapshot = engine.getSnapshot();
    const doctorById = new Map(snapshot.doctors.map((d) => [d.id, d.name]));

    const header = [
      'MRN',
      'Patient Name',
      'Age',
      'Gender',
      'Blood Group',
      'Priority',
      'Status',
      'Queue Type',
      'Chief Complaint',
      'HR (bpm)',
      'SpO2 (%)',
      'BP (mmHg)',
      'Temp (C)',
      'Assigned Doctor',
      'ER Bay',
      'Arrived At',
      'Wait Duration (min)',
    ].join(',');

    const rows = snapshot.allPatients.map((p) => {
      const endRef = p.treatmentStartedAt ?? snapshot.serverTime;
      const waitMin = Math.max(0, Math.round((endRef - p.arrivedAt) / 60_000));
      return [
        sanitizeCsvCell(p.mrn),
        sanitizeCsvCell(p.name),
        sanitizeCsvCell(p.age),
        sanitizeCsvCell(p.gender),
        sanitizeCsvCell(p.bloodGroup),
        sanitizeCsvCell(`P${p.priority}`),
        sanitizeCsvCell(p.status),
        sanitizeCsvCell(p.queueType),
        sanitizeCsvCell(p.complaint),
        sanitizeCsvCell(p.vitals.heartRate),
        sanitizeCsvCell(p.vitals.spo2),
        sanitizeCsvCell(`${p.vitals.systolicBp}/${p.vitals.diastolicBp}`),
        sanitizeCsvCell(p.vitals.temperature),
        sanitizeCsvCell(p.assignedDoctorId ? doctorById.get(p.assignedDoctorId) ?? p.assignedDoctorId : 'Unassigned'),
        sanitizeCsvCell(p.assignedBay ?? 'Waiting Area'),
        sanitizeCsvCell(new Date(p.arrivedAt).toISOString()),
        sanitizeCsvCell(waitMin),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pulsequeue-er-report.csv"');
    res.send(csv);
  });

  app.post('/api/reset-demo', (_req: Request, res: Response) => {
    engine.resetDemo();
    res.json({ snapshot: engine.getSnapshot() });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PulseQueue ER server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PulseQueue ER server:', err);
  process.exit(1);
});
