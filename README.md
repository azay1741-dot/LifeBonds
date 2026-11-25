# PulseQueue ER — Hospital Emergency & Patient Priority Management System

An end-to-end full-stack clinical triage and emergency department queue management platform built with **TypeScript, React, Express, SQLite (`node:sqlite`), and custom from-scratch Data Structures & Algorithms**.

---

## Key Features

1. **Patient Registration & Clinical Triage**
   - Captures patient demographics, MRN generation, blood group, chief complaint, and initial vitals (HR, SpO2, BP, Temperature).
   - Automatically routes **P1 (Critical)**, **P2 (Emergent)**, and **P3 (Urgent)** cases into the **Emergency Min-Heap**, and **P4 (Standard)** walk-ins into the **FIFO Queue**.
2. **Dynamic Priority Escalation & Downgrade**
   - Updates a waiting patient's priority in **$O(\log N)$** using a Hash Map index lookup + `heapifyUp` / `heapifyDown`.
   - Escalating a P4 walk-in patient automatically promotes them out of the FIFO Queue and inserts them into the Emergency Min-Heap.
3. **Doctor Allocation & Treatment Bay Management**
   - Available physicians dispatch the highest-priority patient via `extractMin()` from the Emergency Min-Heap (falling back to FIFO `dequeue()` when emergency cases are clear), or via direct allocation.
   - Tracks active treatment durations, bay occupancy, and handles **Discharge** / **Transfer** workflows.
4. **Live Waiting Time & Queue Ordering**
   - Fair tie-breaking comparator `(priority ASC, arrivalTimestamp ASC)` guarantees strict FIFO ordering within the same urgency level.
   - Real-time elapsed wait tracking and capacity-adjusted estimated wait times.
5. **Interactive DSA Inspector (Phase 1 & Phase 2 Ready)**
   - Visualizes the live Binary Min-Heap tree, parent/child array indices, and step-by-step swap trace (`heapifyUp` / `heapifyDown`) of the latest operation.
   - Displays Custom Hash Map bucket chains, load factor, collisions, FIFO Queue chain, and Doubly Linked List audit nodes.
6. **Patient Management Reports & CSV Export**
   - Generates priority-tier throughput analytics, printable clinical shift reports, and downloadable sanitized CSV exports.

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

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Backend:** Express (`server.ts`) + `HospitalTriageEngine` (`server/engine.ts`)
- **Database:** SQLite (`data/hospital_er.db` via Node 22 built-in `node:sqlite` with parameterized prepared statements)
  - Tables: `doctors`, `patients`, `treatment_events`

### REST API Endpoints
- `GET /api/state` — Full hospital snapshot (queues, doctors, analytics, DSA inspection state)
- `POST /api/patients` — Register & enqueue patient
- `PATCH /api/patients/:id/priority` — Dynamic priority escalation/downgrade
- `POST /api/doctors/:id/assign-next` — Extract next highest-priority patient and allocate doctor
- `POST /api/patients/:id/assign-doctor` — Direct doctor allocation
- `PATCH /api/patients/:id/status` — Mark patient `Discharged` or `Transferred`
- `POST /api/doctors` & `PATCH /api/doctors/:id/status` — Manage ER physician roster
- `GET /api/patients/:id/timeline` — Fetch patient treatment events from Doubly Linked List
- `GET /api/reports/export` — Download clinical CSV report

---

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
