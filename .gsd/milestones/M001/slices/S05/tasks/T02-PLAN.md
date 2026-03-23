---
estimated_steps: 4
estimated_files: 2
skills_used: []
---

# T02: Extend migrateHierarchyToDb with v8 column population

**Slice:** S05 — Warm/cold callers + flag files + pre-M002 migration
**Milestone:** M001

## Description

Extend `migrateHierarchyToDb()` in `md-importer.ts` to populate v8 planning columns from parsed ROADMAP and PLAN files. This ensures pre-M002 projects get meaningful data in the DB planning columns when migrating. Per D004, tool-only fields (risks, requirementCoverage, proofLevel) are not populated — only fields the parsers can extract. Extend `gsd-recover.test.ts` to verify the v8 columns are populated after recovery.

## Steps

1. **Extend milestone insertion in `migrateHierarchyToDb()`:**
   - The `parseRoadmap(roadmapContent)` call already returns `{ title, vision, successCriteria, slices, boundaryMap }`.
   - The `insertMilestone()` call (around line 558) currently passes only `id`, `title`, `status`, `depends_on`.
   - Add `planning: { vision: roadmap.vision, successCriteria: roadmap.successCriteria, boundaryMapMarkdown: boundaryMapSection }`.
   - For `boundaryMapMarkdown`: extract the raw `## Boundary Map` section from `roadmapContent` using string operations (find `## Boundary Map` heading, take content until next `##` or EOF). The `extractSection()` function from `files.ts` can do this but is not exported — use a simple inline extraction: `const bmIdx = roadmapContent.indexOf('## Boundary Map'); const bmSection = bmIdx >= 0 ? roadmapContent.slice(bmIdx) ... : ''`.
   - Note: `successCriteria` from `parseRoadmap()` is already a `string[]` — `insertMilestone()` expects it as `string[]` in the planning object and `JSON.stringify`s it internally. Verify this matches the `MilestonePlanningRecord.successCriteria` type.

2. **Extend slice insertion:**
   - The `insertSlice()` call (around line 574) currently passes `id`, `milestoneId`, `title`, `status`, `risk`, `depends`, `demo`.
   - Parse the plan content (which already happens at line ~592: `parsePlan(planContent)`) and add `planning: { goal: plan.goal }` to the `insertSlice()` call.
   - The plan parsing happens AFTER slice insertion currently. Restructure: read and parse the plan file BEFORE `insertSlice()`, so the goal is available. Or call `upsertSlicePlanning()` after parsing. The simpler approach: move the plan parse earlier, pass goal into insertSlice. If no plan exists, goal stays empty (the default).

3. **Extend task insertion:**
   - The `insertTask()` call (around line 612) currently passes `id`, `sliceId`, `milestoneId`, `title`, `status`.
   - Add `planning: { files: taskEntry.files ?? [], verify: taskEntry.verify ?? '' }`.
   - `TaskPlanEntry` from `parsePlan()` has optional `files?: string[]` and `verify?: string` fields. These are populated when the plan markdown has `- Files:` and `- Verify:` lines in task entries.

4. **Extend `gsd-recover.test.ts`:**
   - The existing test writes a ROADMAP.md and PLAN.md, runs `migrateHierarchyToDb()`, then checks counts and status.
   - Add assertions after recovery:
     - `getMilestonePlanning(mid)` returns non-empty `vision` matching what was in the fixture ROADMAP
     - Slice row has non-empty `goal` matching what was in the fixture PLAN
     - Task row has populated `files` array and non-empty `verify` string matching fixture data
   - The fixture ROADMAP.md must include a `**Vision:**` field and `## Success Criteria` section for this to work. Check the existing fixture — if it doesn't have these, add them.
   - The fixture PLAN.md must include `- Files:` and `- Verify:` in task entries. Check and extend if needed.

## Must-Haves

- [ ] `insertMilestone()` call in migrateHierarchyToDb passes `planning: { vision, successCriteria, boundaryMapMarkdown }`
- [ ] `insertSlice()` call passes `planning: { goal }` from parsed plan
- [ ] `insertTask()` call passes `planning: { files, verify }` from TaskPlanEntry
- [ ] `gsd-recover.test.ts` asserts v8 columns are populated after recovery
- [ ] Tool-only fields (risks, requirementCoverage, proofLevel) left empty per D004

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/gsd-recover.test.ts` — all tests pass including new v8 column assertions
- No regressions in other tests that use migrateHierarchyToDb (check `integration-mixed-milestones.test.ts`)

## Inputs

- `src/resources/extensions/gsd/md-importer.ts` — migrateHierarchyToDb() with existing insertMilestone/insertSlice/insertTask calls
- `src/resources/extensions/gsd/gsd-db.ts` — insertMilestone(planning), insertSlice(planning), insertTask(planning) signatures, getMilestonePlanning(), SliceRow, TaskRow interfaces
- `src/resources/extensions/gsd/tests/gsd-recover.test.ts` — existing recovery test to extend
- `src/resources/extensions/gsd/files.ts` — parseRoadmap() return type (vision, successCriteria, boundaryMap), parsePlan() return type (goal, tasks with files/verify)

## Expected Output

- `src/resources/extensions/gsd/md-importer.ts` — migrateHierarchyToDb() populates v8 planning columns
- `src/resources/extensions/gsd/tests/gsd-recover.test.ts` — extended with v8 column population assertions
