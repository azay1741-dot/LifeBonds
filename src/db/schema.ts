import { relations } from 'drizzle-orm';
import {
  bigint,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('Clinical Staff'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const doctors = pgTable('doctors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  specialty: text('specialty').notNull(),
  bay: text('bay').notNull(),
  status: text('status').notNull(),
  currentPatientId: text('current_patient_id'),
  patientsHandledToday: integer('patients_handled_today').notNull().default(0),
});

export const patients = pgTable('patients', {
  id: text('id').primaryKey(),
  mrn: text('mrn').notNull().unique(),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  gender: text('gender').notNull(),
  bloodGroup: text('blood_group').notNull(),
  contact: text('contact').notNull(),
  complaint: text('complaint').notNull(),
  priority: integer('priority').notNull(),
  status: text('status').notNull(),
  queueType: text('queue_type').notNull(),
  heartRate: integer('heart_rate').notNull(),
  spo2: integer('spo2').notNull(),
  systolicBp: integer('systolic_bp').notNull(),
  diastolicBp: integer('diastolic_bp').notNull(),
  temperature: doublePrecision('temperature').notNull(),
  assignedDoctorId: text('assigned_doctor_id'),
  assignedBay: text('assigned_bay'),
  arrivedAt: bigint('arrived_at', { mode: 'number' }).notNull(),
  treatmentStartedAt: bigint('treatment_started_at', { mode: 'number' }),
  dischargedAt: bigint('discharged_at', { mode: 'number' }),
  createdByUid: text('created_by_uid').references(() => users.uid),
});

export const treatmentEvents = pgTable('treatment_events', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull(),
  patientName: text('patient_name').notNull(),
  mrn: text('mrn').notNull(),
  action: text('action').notNull(),
  detail: text('detail').notNull(),
  priorityAtEvent: integer('priority_at_event').notNull(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  actorUid: text('actor_uid').references(() => users.uid),
});

export const usersRelations = relations(users, ({ many }) => ({
  registeredPatients: many(patients),
  events: many(treatmentEvents),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [patients.createdByUid],
    references: [users.uid],
  }),
  events: many(treatmentEvents),
}));

export const treatmentEventsRelations = relations(treatmentEvents, ({ one }) => ({
  patient: one(patients, {
    fields: [treatmentEvents.patientId],
    references: [patients.id],
  }),
  actor: one(users, {
    fields: [treatmentEvents.actorUid],
    references: [users.uid],
  }),
}));
