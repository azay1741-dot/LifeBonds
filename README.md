# Lifebonds — Hospital Emergency & Patient Priority Management System

**Lifebonds** is an end-to-end full-stack clinical triage and emergency department queue management platform built with **TypeScript, React, Express, Cloud SQL (PostgreSQL + Drizzle ORM), Firebase Auth & Firestore, Three.js, Google Maps Platform, Gemini AI, and custom from-scratch Data Structures & Algorithms**.

---

## Key Features

1. **Patient Registration & Clinical Triage**
   - Captures patient demographics, MRN generation, blood group, chief complaint, and initial vitals (HR, SpO2, BP, Temperature).
   - Automatically routes **P1 (Critical)**, **P2 (Emergent)**, and **P3 (Urgent)** cases into the **Emergency Min-Heap**, and **P4 (Standard)** walk-ins into the **FIFO Queue**.
   - Includes a real-time **Triage Queue** search bar (by patient name, ID, MRN, or symptom), Emergency vs. Standard ratio indicator, discreet Web Audio critical arrival chimes, and printer-friendly queue summaries.
2. **Dynamic Priority Escalation, Transfer & Discharge**
   - Updates a waiting patient's priority in **$O(\log N)$** using a Hash Map index lookup + `heapifyUp` / `heapifyDown`.
   - Escalating a P4 walk-in patient automatically promotes them out of the FIFO Queue and inserts them into the Emergency Min-Heap.
   - Supports one-click **Transfer** workflows and direct **Discharge** actions from the Triage Queue and active bays.
3. **Doctor Allocation, Staffing Coverage & 3D ER Digital Twin**
   - Available physicians dispatch the highest-priority patient via `extractMin()` from the Emergency Min-Heap (falling back to FIFO `dequeue()` when emergency cases are clear), or via direct allocation.
   - Displays dynamic staffing coverage warnings when available doctors fall below safe patient-to-doctor thresholds.
   - Interactive Three.js **3D ER Twin** visualizes live bay occupancy, vitals monitors, and waiting queue priority pillars.
4. **Campus & Referrals Map + Clinical AI Copilot**
   - Google Maps Platform outpatient referral discovery and driving route visualization synced with owner-isolated Firestore bookmarks.
   - Gemini-powered Clinical Copilot with multi-turn chat, Google Search & Maps grounding, hands-free Live Voice over WebSocket, and persistent Firestore Shift Notes.
5. **Interactive DSA Inspector**
   - Visualizes the live Binary Min-Heap tree, parent/child array indices, and step-by-step swap trace (`heapifyUp` / `heapifyDown`) of the latest operation.
   - Displays Custom Hash Map bucket chains, load factor, collisions, FIFO Queue chain, and Doubly Linked List audit nodes.
6. **Patient Management Reports, Analytics & CSV Exports**
   - Generates 24-hour arrival heat maps, 24-hour arrivals vs. completions line charts, priority-tier throughput analytics, printable clinical shift reports, and sanitized CSV exports for both full patient registries and live waiting queue snapshots.

---

## Core DSA Implementation & Complexity Analysis

| Data Structure | File | Clinical Role | Time Complexity | Space |
| :--- | :--- | :--- | :--- | :--- |
| **Min-Heap Priority Queue** | `server/dsa/MinHeapPriorityQueue.ts` | Orders P1–P3 emergency patients by severity & arrival | `insert`: $O(\log N)$<br>`extractMin`: $O(\log N)$<br>`updatePriority`: $O(\log N)$<br>`peek`: $O(1)$ | $O(N)$ |
| **Custom Hash Map (Separate Chaining)** | `server/dsa/HashMap.ts` | Stores patients & doctors by ID + tracks heap array indices for $O(\log N)$ updates | `set` / `get` / `delete`: $O(1)$ average | $O(N + B)$ |
| **Singly-Linked FIFO Queue** | `server/dsa/FifoQueue.ts` | Fair first-come, first-served queue for P4 standard walk-ins | `enqueue`: $O(1)$<br>`dequeue`: $O(1)$<br>`peek`: $O(1)$ | $O(N)$ |
| **Doubly Linked List** | `server/dsa/LinkedList.ts` | Chronological patient treatment & triage audit timeline | `append`: $O(1)$<br>`reverseTraverse`: $O(N)$ | $O(N)$ |

---

## Architecture & Database

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Recharts, Three.js, Google Maps, Lucide Icons
- **Backend:** Express (`server.ts`) + `HospitalTriageEngine` (`server/engine.ts`)
- **Databases:** Cloud SQL PostgreSQL via Drizzle ORM (`users`, `doctors`, `patients`, `treatment_events`) + Firebase Auth & Firestore (staff profiles, referral bookmarks, shift notes)

### REST API Endpoints
- `GET /api/state` — Full hospital snapshot (queues, doctors, analytics, DSA inspection state)
- `POST /api/patients` — Register & enqueue patient
- `PATCH /api/patients/:id/priority` — Dynamic priority escalation/downgrade
- `POST /api/doctors/:id/assign-next` — Extract next highest-priority patient and allocate doctor
- `POST /api/patients/:id/assign-doctor` — Direct doctor allocation
- `POST /api/patients/:id/transfer` — Transfer patient to specialty unit/facility and log audit event
- `PATCH /api/patients/:id/status` — Mark patient `Discharged` or `Transferred`
- `POST /api/doctors` & `PATCH /api/doctors/:id/status` — Manage ER physician roster
- `GET /api/patients/:id/timeline` — Fetch patient treatment events from Doubly Linked List
- `GET /api/reports/export` — Download full clinical CSV report
- `GET /api/reports/queue-export` — Download current patient queue snapshot CSV
- `POST /api/ai/chat` & `WS /api/live-voice` — Clinical AI Copilot & hands-free voice assistant

---

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
