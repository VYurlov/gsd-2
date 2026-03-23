---
id: T02
parent: S02
milestone: M001
key_files:
  - .gsd/milestones/M001/slices/S02/S02-PLAN.md
  - src/resources/extensions/gsd/tools/plan-slice.ts
  - src/resources/extensions/gsd/tools/plan-task.ts
  - src/resources/extensions/gsd/bootstrap/db-tools.ts
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/tests/plan-slice.test.ts
  - src/resources/extensions/gsd/tests/plan-task.test.ts
key_decisions:
  - Slice/task planning writes use dedicated `upsertTaskPlanning()` updates layered on top of `insertTask()` seed rows so rerunning planning does not erase execution/completion fields stored on existing tasks.
  - `handlePlanSlice()` follows a DB-first flow that writes slice/task planning rows transactionally, then renders the slice plan plus all task-plan files; cache invalidation remains post-render only, and observability is proven through parse-visible file state rather than internal spies.
  - `handlePlanTask()` creates a pending task row only when absent, then updates planning fields and renders the task plan artifact, preserving idempotence for reruns against existing tasks.
duration: ""
verification_result: passed
completed_at: 2026-03-23T16:05:04.223Z
blocker_discovered: false
---

# T02: Implement DB-backed gsd_plan_slice and gsd_plan_task handlers with registrations and regression tests

**Implement DB-backed gsd_plan_slice and gsd_plan_task handlers with registrations and regression tests**

## What Happened

Implemented the DB-backed slice/task planning write path for S02. I first verified the local contracts in `plan-milestone.ts`, `db-tools.ts`, `gsd-db.ts`, `markdown-renderer.ts`, and the existing renderer/handler tests, then patched the slice plan’s verification section with an explicit diagnostic check because the pre-flight called that gap out. Added `src/resources/extensions/gsd/tools/plan-slice.ts` and `src/resources/extensions/gsd/tools/plan-task.ts`, each mirroring the S01 pattern: flat validation, parent-slice existence checks, DB writes, renderer invocation, and cache invalidation only after successful render. In `gsd-db.ts` I added `upsertTaskPlanning()` and extended the planning record shape with optional title support so planning reruns update task planning fields without overwriting completion metadata. In `src/resources/extensions/gsd/bootstrap/db-tools.ts` I registered canonical `gsd_plan_slice` and `gsd_plan_task` tools plus aliases `gsd_slice_plan` and `gsd_task_plan`, with DB-availability checks and structured handler result payloads. Finally, I added focused regression suites in `src/resources/extensions/gsd/tests/plan-slice.test.ts` and `src/resources/extensions/gsd/tests/plan-task.test.ts` covering validation failures, missing-parent rejection, successful DB-backed renders, render-failure behavior, idempotent reruns, and parse-visible cache refresh behavior via reparsed plan artifacts.

## Verification

Verified the new handlers with the task’s targeted resolver-harness command for `plan-slice.test.ts` and `plan-task.test.ts`; all validation, parent-check, render-failure, idempotence, and parse-visible cache refresh assertions passed. Then ran the task’s second verification command against `plan-slice.test.ts`, `plan-task.test.ts`, and `markdown-renderer.test.ts` filtered to cache/idempotence/render-failure coverage; it passed and preserved truthful stale-render diagnostics on stderr. Finally ran the broader slice-level verification command including `markdown-renderer.test.ts`, `auto-recovery.test.ts`, and `prompt-contracts.test.ts` filtered to plan-slice/plan-task and DB-backed planning coverage; it passed, confirming the new handlers coexist with existing renderer/recovery/prompt contracts.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts` | 0 | ✅ pass | 180ms |
| 2 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts src/resources/extensions/gsd/tests/markdown-renderer.test.ts --test-name-pattern="cache|idempotent|render failed|validation failed|plan-slice|plan-task"` | 0 | ✅ pass | 228ms |
| 3 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/plan-slice.test.ts src/resources/extensions/gsd/tests/plan-task.test.ts src/resources/extensions/gsd/tests/markdown-renderer.test.ts src/resources/extensions/gsd/tests/auto-recovery.test.ts src/resources/extensions/gsd/tests/prompt-contracts.test.ts --test-name-pattern="plan-slice|plan-task|renderPlanFromDb|renderTaskPlanFromDb|task plan|DB-backed planning"` | 0 | ✅ pass | 731ms |


## Deviations

Updated `.gsd/milestones/M001/slices/S02/S02-PLAN.md` with an explicit diagnostic verification command to satisfy the task pre-flight requirement. The implementation reused the existing DB schema and renderer contracts already present locally, so no broader replan was needed. I also added a narrow `upsertTaskPlanning()` DB helper instead of changing `insertTask()` semantics, because planning reruns must not clobber completion-state fields.

## Known Issues

None.

## Files Created/Modified

- `.gsd/milestones/M001/slices/S02/S02-PLAN.md`
- `src/resources/extensions/gsd/tools/plan-slice.ts`
- `src/resources/extensions/gsd/tools/plan-task.ts`
- `src/resources/extensions/gsd/bootstrap/db-tools.ts`
- `src/resources/extensions/gsd/gsd-db.ts`
- `src/resources/extensions/gsd/tests/plan-slice.test.ts`
- `src/resources/extensions/gsd/tests/plan-task.test.ts`
