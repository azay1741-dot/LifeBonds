import 'dotenv/config';
import express, { Response } from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { HospitalTriageEngine } from './server/engine.ts';
import { attachLiveVoiceWebSocket, ChatTurnInput, runClinicalChat } from './server/gemini.ts';
import { getOrCreateUser } from './src/db/repository.ts';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';
import { AiChatMode, PriorityLevel } from './src/types.ts';

const PORT = 3000;
const VALID_GENDERS = new Set(['Male', 'Female', 'Other']);
const VALID_BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const VALID_AI_MODES = new Set<AiChatMode>(['general', 'reasoning', 'fast', 'search', 'maps']);

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
  res.status(500).json({ error: msg || 'Internal server error' });
}

async function syncAuthenticatedUser(req: AuthRequest): Promise<string | undefined> {
  if (!req.user) return undefined;
  await getOrCreateUser(req.user.uid, req.user.email ?? '', req.user.name);
  return req.user.uid;
}

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);
  const engine = new HospitalTriageEngine();

  app.use(express.json({ limit: '128kb' }));

  app.get('/api/health', (_req, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/state', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await syncAuthenticatedUser(req);
      const snapshot = await engine.getSnapshot();
      res.json(snapshot);
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/patients', requireAuth, async (req: AuthRequest, res: Response) => {
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
      const actorUid = await syncAuthenticatedUser(req);
      const patient = await engine.registerPatient(
        {
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
        },
        actorUid
      );
      const snapshot = await engine.getSnapshot();
      res.status(201).json({ patient, snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.patch('/api/patients/:id/priority', requireAuth, async (req: AuthRequest, res: Response) => {
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
      const actorUid = await syncAuthenticatedUser(req);
      const patient = await engine.updatePatientPriority(id, newPriority, reason, actorUid);
      const snapshot = await engine.getSnapshot();
      res.json({ patient, snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/doctors/:id/assign-next', requireAuth, async (req: AuthRequest, res: Response) => {
    const doctorId = String(req.params.id ?? '');
    try {
      const actorUid = await syncAuthenticatedUser(req);
      const result = await engine.dispatchNextToDoctor(doctorId, actorUid);
      const snapshot = await engine.getSnapshot();
      res.json({ ...result, snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/patients/:id/assign-doctor', requireAuth, async (req: AuthRequest, res: Response) => {
    const patientId = String(req.params.id ?? '');
    const doctorId = typeof req.body?.doctorId === 'string' ? req.body.doctorId.trim() : '';
    if (!doctorId) {
      res.status(400).json({ error: 'doctorId is required.' });
      return;
    }
    try {
      const actorUid = await syncAuthenticatedUser(req);
      const result = await engine.assignDoctorToPatient(patientId, doctorId, actorUid);
      const snapshot = await engine.getSnapshot();
      res.json({ ...result, snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.patch('/api/patients/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
    const patientId = String(req.params.id ?? '');
    const outcome = req.body?.status;
    if (outcome !== 'Discharged' && outcome !== 'Transferred') {
      res.status(400).json({ error: 'Status must be Discharged or Transferred.' });
      return;
    }
    try {
      const actorUid = await syncAuthenticatedUser(req);
      const patient = await engine.completePatientTreatment(patientId, outcome, actorUid);
      const snapshot = await engine.getSnapshot();
      res.json({ patient, snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/patients/:id/transfer', requireAuth, async (req: AuthRequest, res: Response) => {
    const patientId = String(req.params.id ?? '');
    const destination =
      typeof req.body?.destination === 'string' ? req.body.destination.trim() : '';
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
        ? req.body.reason.trim()
        : 'Specialty care transfer initiated from triage';

    if (destination.length < 2 || destination.length > 120) {
      res.status(400).json({ error: 'Transfer destination must be between 2 and 120 characters.' });
      return;
    }
    if (reason.length > 250) {
      res.status(400).json({ error: 'Transfer reason must be 250 characters or fewer.' });
      return;
    }

    try {
      const actorUid = await syncAuthenticatedUser(req);
      const patient = await engine.transferPatient(patientId, destination, reason, actorUid);
      const snapshot = await engine.getSnapshot();
      res.json({ patient, snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/doctors', requireAuth, async (req: AuthRequest, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const specialty = typeof req.body?.specialty === 'string' ? req.body.specialty.trim() : '';
    const bay = typeof req.body?.bay === 'string' ? req.body.bay.trim() : '';

    if (name.length < 3 || name.length > 60 || specialty.length < 3 || bay.length < 2) {
      res.status(400).json({ error: 'Valid doctor name, specialty, and ER bay are required.' });
      return;
    }
    try {
      await syncAuthenticatedUser(req);
      const doctor = await engine.addDoctor(name, specialty, bay);
      const snapshot = await engine.getSnapshot();
      res.status(201).json({ doctor, snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.patch('/api/doctors/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
    const doctorId = String(req.params.id ?? '');
    const status = req.body?.status;
    if (status !== 'Available' && status !== 'Off-Duty') {
      res.status(400).json({ error: 'Doctor status must be Available or Off-Duty.' });
      return;
    }
    try {
      await syncAuthenticatedUser(req);
      const doctor = await engine.toggleDoctorAvailability(doctorId, status);
      const snapshot = await engine.getSnapshot();
      res.json({ doctor, snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.get('/api/patients/:id/timeline', requireAuth, async (req: AuthRequest, res: Response) => {
    const patientId = String(req.params.id ?? '');
    try {
      await syncAuthenticatedUser(req);
      const events = await engine.getPatientTimeline(patientId);
      res.json({ events });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.get('/api/reports/export', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await syncAuthenticatedUser(req);
      const snapshot = await engine.getSnapshot();
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
      res.setHeader('Content-Disposition', 'attachment; filename="lifebonds-er-report.csv"');
      res.send(csv);
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.get('/api/reports/queue-export', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await syncAuthenticatedUser(req);
      const snapshot = await engine.getSnapshot();
      const snapshotIso = new Date(snapshot.serverTime).toISOString();

      const header = [
        'Queue Type',
        'Queue Order',
        'MRN',
        'Patient Name',
        'Age',
        'Gender',
        'Blood Group',
        'Priority',
        'Status',
        'Chief Complaint',
        'HR (bpm)',
        'SpO2 (%)',
        'BP (mmHg)',
        'Temp (C)',
        'Arrived At',
        'Minutes Waited',
        'Est. Wait (min)',
        'Snapshot Time',
      ].join(',');

      const queuedRows = [
        ...snapshot.emergencyQueue.map((p, idx) => ({
          queueLabel: 'Emergency Min-Heap (P1-P3)',
          order: idx + 1,
          patient: p,
        })),
        ...snapshot.standardQueue.map((p, idx) => ({
          queueLabel: 'Standard Walk-In FIFO (P4)',
          order: idx + 1,
          patient: p,
        })),
      ].map(({ queueLabel, order, patient: p }) => {
        const waitedMin = Math.max(0, Math.round((snapshot.serverTime - p.arrivedAt) / 60_000));
        return [
          sanitizeCsvCell(queueLabel),
          sanitizeCsvCell(`#${order}`),
          sanitizeCsvCell(p.mrn),
          sanitizeCsvCell(p.name),
          sanitizeCsvCell(p.age),
          sanitizeCsvCell(p.gender),
          sanitizeCsvCell(p.bloodGroup),
          sanitizeCsvCell(`P${p.priority}`),
          sanitizeCsvCell(p.status),
          sanitizeCsvCell(p.complaint),
          sanitizeCsvCell(p.vitals.heartRate),
          sanitizeCsvCell(p.vitals.spo2),
          sanitizeCsvCell(`${p.vitals.systolicBp}/${p.vitals.diastolicBp}`),
          sanitizeCsvCell(p.vitals.temperature),
          sanitizeCsvCell(new Date(p.arrivedAt).toISOString()),
          sanitizeCsvCell(waitedMin),
          sanitizeCsvCell(p.estimatedWaitMinutes),
          sanitizeCsvCell(snapshotIso),
        ].join(',');
      });

      const csv = [header, ...queuedRows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="lifebonds-queue-snapshot.csv"'
      );
      res.send(csv);
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/reset-demo', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await syncAuthenticatedUser(req);
      await engine.resetDemo();
      const snapshot = await engine.getSnapshot();
      res.json({ snapshot });
    } catch (err) {
      handleEngineError(res, err);
    }
  });

  app.post('/api/ai/chat', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await syncAuthenticatedUser(req);
      const modeRaw = req.body?.mode as AiChatMode;
      const mode: AiChatMode = VALID_AI_MODES.has(modeRaw) ? modeRaw : 'general';
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

      if (message.length < 1 || message.length > 2000) {
        res.status(400).json({ error: 'Prompt message must be between 1 and 2000 characters.' });
        return;
      }

      const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
      const history: ChatTurnInput[] = rawHistory
        .filter(
          (item: unknown): item is ChatTurnInput =>
            Boolean(item) &&
            typeof item === 'object' &&
            ((item as ChatTurnInput).role === 'user' || (item as ChatTurnInput).role === 'model') &&
            typeof (item as ChatTurnInput).text === 'string' &&
            (item as ChatTurnInput).text.trim().length > 0
        )
        .map((item: ChatTurnInput) => ({
          role: item.role,
          text: item.text.slice(0, 2000),
        }));

      const latLngRaw = req.body?.latLng;
      const latLng =
        latLngRaw &&
        typeof latLngRaw.latitude === 'number' &&
        typeof latLngRaw.longitude === 'number'
          ? { latitude: latLngRaw.latitude, longitude: latLngRaw.longitude }
          : null;

      const snapshotSummary =
        mode === 'maps' || mode === 'search'
          ? undefined
          : (await engine.getSnapshot().catch(() => undefined))?.summary;

      const reply = await runClinicalChat({
        mode,
        message,
        history,
        latLng,
        snapshotSummary,
      });

      res.json(reply);
    } catch (err) {
      console.error('Gemini chat error:', err);
      const msg = err instanceof Error ? err.message : 'AI assistant request failed.';
      res.status(500).json({ error: msg });
    }
  });

  attachLiveVoiceWebSocket(httpServer, async () => {
    const snap = await engine.getSnapshot().catch(() => undefined);
    return snap?.summary;
  });

  app.use('/api/*', (_req, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
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
    app.get('*', (_req, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Lifebonds server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Lifebonds server:', err);
  process.exit(1);
});
