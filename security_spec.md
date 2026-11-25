# Lifebonds — Firestore Security Specification

## 1. Data Invariants
1. **Identity Isolation (`/users/{userId}`)**: A staff profile contains PII (`email`) and may only be `get`, `create`, or `update`d by the authenticated, email-verified user whose `request.auth.uid == userId`. Collection-level `list` and `delete` on `/users` are strictly denied.
2. **Master Gate Sync (`/users/{userId}/bookmarks/{facilityId}`, `/users/{userId}/triageNotes/{noteId}`)**: Every subcollection document requires the parent `/users/{userId}` document to exist (`exists(...)`), and `ownerId` inside the document must strictly equal `request.auth.uid == userId`.
3. **Strict Keys & No Ghost Fields**: Every `create` checks both `keys().hasAll(...)` and `keys().hasOnly(...)`; every `update` uses action-based `incoming().diff(existing()).affectedKeys().hasOnly(...)` wrapped inside `isValid[Entity](incoming())`.
4. **Immutable Ownership & Temporal Integrity**: `uid`, `ownerId`, `facilityId`, and `createdAt` cannot be modified after creation. `createdAt` (on create) and `updatedAt` (on create/update) must strictly equal `request.time`.
5. **Path ID & Payload Size Hardening**: All document IDs (`userId`, `facilityId`, `noteId`) match `^[a-zA-Z0-9_\-]+$` with `.size() <= 128`, and every string field enforces explicit `.size()` upper bounds.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Profile Read**: `GET /users/userA` with `auth == null`.
2. **Cross-User PII Read**: `GET /users/userA` signed in as `userB`.
3. **Unverified Email Create**: `CREATE /users/userA` with `token.email_verified == false`.
4. **Self-Assigned Privilege / Ghost Field on Profile**: `CREATE /users/userA` containing extra key `{"role": "superadmin"}` or `{"isAdmin": true}`.
5. **User Collection Enumeration**: `LIST /users` signed in as `userA`.
6. **Profile UID Spoofing**: `CREATE /users/userA` where payload `uid == "userB"`.
7. **Forged `createdAt` Timestamp**: `CREATE /users/userA/triageNotes/note1` with client-supplied `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
8. **Orphaned Subcollection Write**: `CREATE /users/userA/bookmarks/fac1` when parent `/users/userA` does not exist.
9. **OwnerId Mutation on Update**: `UPDATE /users/userA/triageNotes/note1` attempting to mutate `ownerId` to `"userB"`.
10. **Oversized ID Poisoning**: `CREATE /users/userA/triageNotes/<1500-char-id>` exceeding 128 chars or containing invalid symbols (`../`).
11. **Value Type / Size Poisoning in Whitelisted Update Key**: `UPDATE /users/userA/triageNotes/note1` changing `body` to a boolean or a 10KB string.
12. **Cross-User Subcollection List Query**: `LIST /users/userA/bookmarks` signed in as `userB`.
