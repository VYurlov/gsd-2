---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T01: Schema v10 + flag-file DB migration in deriveStateFromDb

**Slice:** S05 — Warm/cold callers + flag files + pre-M002 migration
**Milestone:** M001

## Description

Add `replan_triggered_at TEXT DEFAULT NULL` column to the slices table (schema v10), then replace the disk-based REPLAN.md and REPLAN-TRIGGER.md detection in `deriveStateFromDb()` with DB queries. Update `triage-resolution.ts` to write the new column when creating a replan trigger. Write a test file proving flag-file phase detection works from DB-only data.

**Critical semantic note:** In `deriveStateFromDb()`, REPLAN.md detection is **loop protection** — if a replan has already been done (REPLAN.md exists / replan_history has entries), the system should NOT re-enter replanning phase. REPLAN-TRIGGER.md detection triggers replanning when triage creates it. These are distinct checks with different semantics:
- `resolveSliceFile(... "REPLAN")` → checks if replan was already completed → DB equivalent: `getReplanHistory(mid, sid).length > 0`
- `resolveSliceFile(... "REPLAN-TRIGGER")` → checks if triage triggered a replan → DB equivalent: `getSlice(mid, sid)?.replan_triggered_at` is non-null

**D003 constraint:** Do NOT touch CONTINUE.md detection. It stays as disk-based per locked decision D003.

## Steps

1. **Schema v10 migration + DDL update in `gsd-db.ts`:**
   - Bump `SCHEMA_VERSION` from 9 to 10
   - Add `replan_triggered_at TEXT DEFAULT NULL` to the CREATE TABLE DDL for `slices` (after the `sequence` column)
   - Add a `if (currentVersion < 10)` migration block using `ensureColumn()` to add the column to existing DBs
   - Update `SliceRow` interface to include `replan_triggered_at: string | null`
   - Update `rowToSlice()` to read the column: `replan_triggered_at: (row["replan_triggered_at"] as string) ?? null`

2. **Update `deriveStateFromDb()` in `state.ts`:**
   - The blocker detection block (around line 640) checks `resolveSliceFile(basePath, activeMilestone.id, activeSlice.id, "REPLAN")` for loop protection. Replace with: import and call `getReplanHistory` from `gsd-db.js`, check if `getReplanHistory(activeMilestone.id, activeSlice.id).length > 0`. If replan history exists, it means replan was already done — don't return `replanning-slice`.
   - The REPLAN-TRIGGER detection block (around line 659) checks `resolveSliceFile(basePath, activeMilestone.id, activeSlice.id, "REPLAN-TRIGGER")`. Replace with: import `getSlice` from `gsd-db.js`, check if `getSlice(activeMilestone.id, activeSlice.id)?.replan_triggered_at` is non-null. If set, check loop protection (replan_history) before returning `replanning-slice`.
   - Do NOT touch the `_deriveStateImpl()` fallback path (line ~1266+) — that's the disk-based fallback and stays as-is.
   - Do NOT touch CONTINUE.md detection (line ~679) — per D003.

3. **Update `triage-resolution.ts` `executeReplan()`:**
   - After writing the disk file (keep the disk write for `_deriveStateImpl()` fallback), also write the DB column:
   ```typescript
   try {
     const { isDbAvailable, _getAdapter } = await import("./gsd-db.js");
     // ... or use a synchronous approach since executeReplan is sync
   }
   ```
   - Since `executeReplan` is synchronous and `gsd-db.ts` exports are module-level, use a direct import if possible, or use `createRequire` for lazy loading. Check if `gsd-db.ts` is already imported in the file. If not, use the lazy pattern. Write: `UPDATE slices SET replan_triggered_at = :ts WHERE milestone_id = :mid AND id = :sid`
   - Note: `_getAdapter()` returns the raw adapter. Or use `isDbAvailable()` check + direct SQL. Follow the pattern used by other callers.

4. **Write `flag-file-db.test.ts`:**
   Test cases:
   - "blocker_discovered + no replan_history → phase is replanning-slice" — seed DB with a completed task that has `blocker_discovered=1`, no replan_history entries. Confirm `deriveStateFromDb()` returns `phase: 'replanning-slice'`.
   - "blocker_discovered + replan_history exists → loop protection, phase is executing" — seed DB with blocker task AND a replan_history entry for that slice. Confirm `deriveStateFromDb()` returns `phase: 'executing'` (loop protection).
   - "replan_triggered_at set + no replan_history → phase is replanning-slice" — seed DB with `replan_triggered_at` on the active slice, no replan_history. Confirm replanning phase.
   - "replan_triggered_at set + replan_history exists → loop protection" — seed with both. Confirm executing phase.
   - "no blocker, no trigger → phase is executing" — baseline test confirming normal execution.
   - Use the test harness pattern from `derive-state-db.test.ts` — create temp dirs, seed DB, call `deriveStateFromDb()`.

5. **Run verification:**
   - Run `flag-file-db.test.ts`
   - Run `derive-state-db.test.ts` and `derive-state-crossval.test.ts` for regressions
   - Run `schema-v9-sequence.test.ts` (now schema v10 — confirm v9 migration still works)

## Must-Haves

- [ ] SCHEMA_VERSION bumped to 10
- [ ] `replan_triggered_at` column in both CREATE TABLE DDL and v10 migration block
- [ ] `SliceRow` interface and `rowToSlice()` updated
- [ ] `deriveStateFromDb()` uses `getReplanHistory()` for REPLAN loop protection
- [ ] `deriveStateFromDb()` uses `getSlice().replan_triggered_at` for REPLAN-TRIGGER detection
- [ ] `triage-resolution.ts` `executeReplan()` writes `replan_triggered_at` column
- [ ] CONTINUE.md detection untouched per D003
- [ ] `_deriveStateImpl()` fallback path untouched
- [ ] `flag-file-db.test.ts` with 5 test cases passing

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/flag-file-db.test.ts` — all 5 tests pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/derive-state-db.test.ts` — no regressions
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/derive-state-crossval.test.ts` — no regressions

## Observability Impact

- Signals added: `replan_triggered_at` column on slices — queryable indicator of triage-initiated replan triggers
- How a future agent inspects this: `SELECT id, replan_triggered_at FROM slices WHERE milestone_id = :mid`
- Failure state exposed: If `deriveStateFromDb()` returns wrong phase, inspect `replan_history` table and `replan_triggered_at` column to diagnose

## Inputs

- `src/resources/extensions/gsd/gsd-db.ts` — schema, SliceRow interface, getReplanHistory(), getSlice(), _getAdapter()
- `src/resources/extensions/gsd/state.ts` — deriveStateFromDb() with existing REPLAN/REPLAN-TRIGGER disk checks
- `src/resources/extensions/gsd/triage-resolution.ts` — executeReplan() that writes REPLAN-TRIGGER.md
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` — test pattern reference for DB-seeded state tests

## Expected Output

- `src/resources/extensions/gsd/gsd-db.ts` — schema v10, updated SliceRow, rowToSlice
- `src/resources/extensions/gsd/state.ts` — deriveStateFromDb() using DB queries for flag-file detection
- `src/resources/extensions/gsd/triage-resolution.ts` — executeReplan() also writing replan_triggered_at column
- `src/resources/extensions/gsd/tests/flag-file-db.test.ts` — new test file with 5 flag-file DB migration tests
