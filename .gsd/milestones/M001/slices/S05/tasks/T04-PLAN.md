---
estimated_steps: 4
estimated_files: 6
skills_used: []
---

# T04: Migrate warm/cold callers batch 2 — auto-prompts, auto-recovery, auto-direct-dispatch, auto-worktree, reactive-graph, markdown-renderer + final verification

**Slice:** S05 — Warm/cold callers + flag files + pre-M002 migration
**Milestone:** M001

## Description

Migrate the remaining 6 files with parseRoadmap/parsePlan imports. `auto-prompts.ts` is the most complex (6 parser calls across 1649 lines, all async functions — use dynamic `import()` pattern already established in that file). `markdown-renderer.ts` is special: its parser calls are intentional disk-vs-DB comparisons in `findStaleArtifacts()` — only move the import from module-level to lazy `createRequire`, don't replace parser usage. Final step: run the comprehensive grep to confirm zero module-level parser imports remain anywhere in the codebase (excluding tests, md-importer, files.ts).

**Pattern for async callers (already used in auto-prompts.ts for decisions/requirements):**
```typescript
try {
  const { isDbAvailable, getMilestoneSlices } = await import("./gsd-db.js");
  if (isDbAvailable()) {
    const slices = getMilestoneSlices(mid);
    // ... use DB data
    return result;
  }
} catch { /* fall through */ }
// Filesystem fallback
const roadmapContent = await loadFile(roadmapFile);
if (!roadmapContent) return null;
// lazy-load parser
const { createRequire } = await import("node:module");
const _require = createRequire(import.meta.url);
let parseRoadmap: Function;
try { parseRoadmap = _require("./files.ts").parseRoadmap; }
catch { parseRoadmap = _require("./files.js").parseRoadmap; }
const roadmap = parseRoadmap(roadmapContent);
```

**Key field mappings:**
- `roadmap.slices[].done` → `slice.status === 'complete'`
- `plan.tasks[].done` → `task.status === 'complete' || task.status === 'done'`
- `plan.tasks[].files` → `task.files` (already parsed `string[]` per KNOWLEDGE.md)
- `plan.filesLikelyTouched` → `tasks.flatMap(t => t.files)`
- Slice `depends` field: same on `SliceRow` (already parsed as `string[]`)

## Steps

1. **auto-prompts.ts** (5 parseRoadmap + 1 parsePlan — all in async functions):
   - Remove `parsePlan`, `parseRoadmap` from the module-level import on line 9. Keep `loadFile`, `parseContinue`, `parseSummary`, `extractUatType`, `loadActiveOverrides`, `formatOverridesSection`, `parseTaskPlanFile`.
   - **`inlineDependencySummaries()` (line ~184):** Uses `parseRoadmap(roadmapContent).slices.find(s => s.id === sid)?.depends`. Replace with DB: `const { isDbAvailable, getSlice } = await import("./gsd-db.js"); if (isDbAvailable()) { const slice = getSlice(mid, sid); if (!slice || slice.depends.length === 0) return "- (no dependencies)"; /* use slice.depends */ }`. Fallback: lazy-load parseRoadmap.
   - **`checkNeedsReassessment()` (line ~691):** Uses `parseRoadmap().slices` to find completed/incomplete slices. Replace with: `getMilestoneSlices(mid)`, filter by `s.status === 'complete'` vs not.
   - **`checkNeedsRunUat()` (line ~732):** Same pattern as checkNeedsReassessment — replace with `getMilestoneSlices(mid)`.
   - **`buildCompleteMilestonePrompt()` (line ~1221):** Iterates `roadmap.slices` to inline slice summaries. Replace with `getMilestoneSlices(mid)` to get slice IDs.
   - **`buildValidateMilestonePrompt()` (line ~1277):** Same as buildCompleteMilestonePrompt — iterate `getMilestoneSlices(mid)` for slice summary inlining.
   - **`buildResumeContextListing()` (line ~1603):** Uses `parsePlan(planContent).tasks` to find incomplete tasks for listing. Replace with `getSliceTasks(mid, sid)`, filter by `task.status !== 'complete' && task.status !== 'done'`.
   - Create a local helper `async function lazyParseRoadmap(content: string)` and `async function lazyParsePlan(content: string)` at top of file to centralize the createRequire fallback pattern.

2. **auto-recovery.ts** (1 parsePlan at line 370, 1 parseRoadmap at line 407):
   - Remove `parseRoadmap`, `parsePlan` from module-level import on line 14. Keep `clearParseCache`.
   - Line 370 `parsePlan`: Used in plan-slice completion check — gets task list to verify task plan files exist. Replace with `getSliceTasks(mid, sid)` to get task IDs, then check if task plan files exist on disk. Fallback: lazy-load parsePlan.
   - Line 407 `parseRoadmap`: Already inside `!isDbAvailable()` block — this IS the fallback path. Just move the import from module-level to lazy `createRequire` at that call site.
   - Add `import { isDbAvailable, getSliceTasks } from "./gsd-db.js";` to module-level imports.

3. **auto-direct-dispatch.ts, auto-worktree.ts, reactive-graph.ts:**
   - **auto-direct-dispatch.ts** (2 parseRoadmap at lines 160, 185): Remove `parseRoadmap` from import (keep `loadFile`). Add `isDbAvailable, getMilestoneSlices`. Replace both call sites with `getMilestoneSlices()` + fallback.
   - **auto-worktree.ts** (1 parseRoadmap at line 1002): Remove `parseRoadmap` from import. Add DB imports. Replace call site.
   - **reactive-graph.ts** (1 parsePlan at line 191): Remove `parsePlan` from import (keep `loadFile`, `parseTaskPlanIO`). Add `isDbAvailable, getSliceTasks`. Replace with `getSliceTasks()` + fallback. Note: `parseTaskPlanIO` is NOT a planning parser — it parses Inputs/Expected Output from task plan files for dependency graphing. Keep it as module-level import.

4. **markdown-renderer.ts** (2 parseRoadmap + 2 parsePlan in `findStaleArtifacts()`):
   - These parser calls are **intentional** — they compare disk content against DB state to detect staleness. Do NOT replace parser usage with DB queries.
   - Move `parseRoadmap`, `parsePlan` from module-level import (line 33) to lazy `createRequire` inside `findStaleArtifacts()`. Keep `saveFile`, `clearParseCache` as module-level.
   - At the top of `findStaleArtifacts()` (around line 775), add lazy loading:
   ```typescript
   const { createRequire } = await import("node:module");
   const _require = createRequire(import.meta.url);
   let parseRoadmap: Function, parsePlan: Function;
   try {
     const m = _require("./files.ts");
     parseRoadmap = m.parseRoadmap; parsePlan = m.parsePlan;
   } catch {
     const m = _require("./files.js");
     parseRoadmap = m.parseRoadmap; parsePlan = m.parsePlan;
   }
   ```
   - Note: `findStaleArtifacts()` is async, so dynamic import works too. Use whichever is simpler.

5. **Final verification grep:**
   - `grep -rn 'import.*parseRoadmap\|import.*parsePlan\|import.*parseRoadmapSlices' src/resources/extensions/gsd/*.ts | grep -v '/tests/' | grep -v 'md-importer' | grep -v 'files.ts'`
   - Expected: ZERO results. No module-level parser imports remain.
   - Run `auto-recovery.test.ts` and any other available test suites for modified files.

## Must-Haves

- [ ] Zero module-level `parseRoadmap`/`parsePlan` imports in all 6 files
- [ ] `auto-prompts.ts` uses DB queries as primary path for all 6 parser call sites
- [ ] `auto-recovery.ts` parsePlan at line 370 replaced with getSliceTasks() + fallback
- [ ] `markdown-renderer.ts` parser imports moved to lazy loading (parser usage kept)
- [ ] Final grep returns zero module-level parser imports across all non-test source files
- [ ] All existing test suites pass

## Verification

- `grep -rn 'import.*parseRoadmap\|import.*parsePlan\|import.*parseRoadmapSlices' src/resources/extensions/gsd/*.ts | grep -v '/tests/' | grep -v 'md-importer' | grep -v 'files.ts'` — returns zero results
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/auto-recovery.test.ts` — passes
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/markdown-renderer.test.ts` — passes
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/planning-crossval.test.ts` — passes

## Inputs

- `src/resources/extensions/gsd/auto-prompts.ts` — 5 parseRoadmap + 1 parsePlan calls to migrate (all async functions)
- `src/resources/extensions/gsd/auto-recovery.ts` — 1 parsePlan + 1 parseRoadmap (latter already in !isDbAvailable block)
- `src/resources/extensions/gsd/auto-direct-dispatch.ts` — 2 parseRoadmap calls
- `src/resources/extensions/gsd/auto-worktree.ts` — 1 parseRoadmap call
- `src/resources/extensions/gsd/reactive-graph.ts` — 1 parsePlan call
- `src/resources/extensions/gsd/markdown-renderer.ts` — 2 parseRoadmap + 2 parsePlan (intentional disk-vs-DB comparison)
- `src/resources/extensions/gsd/gsd-db.ts` — isDbAvailable(), getMilestoneSlices(), getSliceTasks(), getSlice(), getTask()
- `src/resources/extensions/gsd/dispatch-guard.ts` — reference for lazy createRequire pattern

## Expected Output

- `src/resources/extensions/gsd/auto-prompts.ts` — module-level parser imports removed, 6 call sites use DB queries with lazy fallback
- `src/resources/extensions/gsd/auto-recovery.ts` — module-level parser imports removed, DB + lazy fallback
- `src/resources/extensions/gsd/auto-direct-dispatch.ts` — module-level parseRoadmap removed, DB + fallback
- `src/resources/extensions/gsd/auto-worktree.ts` — module-level parseRoadmap removed, DB + fallback
- `src/resources/extensions/gsd/reactive-graph.ts` — module-level parsePlan removed, DB + fallback
- `src/resources/extensions/gsd/markdown-renderer.ts` — module-level parser imports moved to lazy loading inside findStaleArtifacts()
