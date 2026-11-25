/**
 * Phase 0 Payload-First Security TDD Suite for Lifebonds Firestore Rules.
 * Verifies that all "Dirty Dozen" attack vectors fail with PERMISSION_DENIED.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actorUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Profile Read',
    operation: 'get',
    path: '/users/userA',
    actorUid: null,
    emailVerified: false,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-User PII Read',
    operation: 'get',
    path: '/users/userA',
    actorUid: 'userB',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Email Profile Create',
    operation: 'create',
    path: '/users/userA',
    actorUid: 'userA',
    emailVerified: false,
    payload: {
      uid: 'userA',
      email: 'spoof@example.com',
      displayName: 'Spoofer',
      departmentUnit: 'ER',
      createdAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow / Ghost Field Privilege Escalation',
    operation: 'create',
    path: '/users/userA',
    actorUid: 'userA',
    emailVerified: true,
    payload: {
      uid: 'userA',
      email: 'nurse@hospital.org',
      displayName: 'Nurse A',
      departmentUnit: 'ER',
      isAdmin: true,
      createdAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'User Collection List Enumeration',
    operation: 'list',
    path: '/users',
    actorUid: 'userA',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Profile UID Spoofing',
    operation: 'create',
    path: '/users/userA',
    actorUid: 'userA',
    emailVerified: true,
    payload: {
      uid: 'userB',
      email: 'nurse@hospital.org',
      displayName: 'Nurse A',
      departmentUnit: 'ER',
      createdAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Client-Forged createdAt Timestamp',
    operation: 'create',
    path: '/users/userA/triageNotes/note_1',
    actorUid: 'userA',
    emailVerified: true,
    payload: {
      ownerId: 'userA',
      title: 'Shift Handover',
      body: 'Bay 2 sanitized',
      category: 'Shift Handoff',
      pinned: false,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: 'SERVER_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned Subcollection Write Without Parent User Doc',
    operation: 'create',
    path: '/users/orphanUser/bookmarks/clinic_1',
    actorUid: 'orphanUser',
    emailVerified: true,
    payload: {
      ownerId: 'orphanUser',
      facilityId: 'clinic_1',
      name: 'City Clinic',
      category: 'Outpatient Clinic',
      address: '101 Main St',
      placeUri: 'https://maps.google.com/?q=1',
      notes: '24h clinic',
      createdAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable ownerId Mutation on Update',
    operation: 'update',
    path: '/users/userA/triageNotes/note_1',
    actorUid: 'userA',
    emailVerified: true,
    payload: {
      ownerId: 'userB',
      updatedAt: 'SERVER_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Oversized / Invalid Path ID Poisoning',
    operation: 'create',
    path: `/users/userA/triageNotes/${'x'.repeat(256)}`,
    actorUid: 'userA',
    emailVerified: true,
    payload: {
      ownerId: 'userA',
      title: 'Test',
      body: 'Body',
      category: 'Surge Protocol',
      pinned: false,
      createdAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning With Oversized Body on Whitelisted Update Key',
    operation: 'update',
    path: '/users/userA/triageNotes/note_1',
    actorUid: 'userA',
    emailVerified: true,
    payload: {
      body: 'A'.repeat(2500),
      updatedAt: 'SERVER_TIME',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Cross-User Subcollection List Scraping',
    operation: 'list',
    path: '/users/userA/bookmarks',
    actorUid: 'userB',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
];
