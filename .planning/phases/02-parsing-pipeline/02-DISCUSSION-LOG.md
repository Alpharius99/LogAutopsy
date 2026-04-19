# Phase 2: Parsing Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 02-parsing-pipeline
**Areas discussed:** Type contract alignment

---

## Type Contract Alignment

### Gray area selection

| Option | Selected |
|--------|----------|
| Type contract alignment | ✓ |
| Test coverage strategy | |
| Batch error handling | |
| Pipeline orchestration | |

---

## LogEvent Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Align to spec §5 exactly | Rewrite src/types.ts: sourceClass, sourceMethod, raw, fileLineNumber. One-time fix before any real implementation. | ✓ |
| Keep current types, adapt parser | Leave src/types.ts as-is. Parser maps spec fields to current names. | |

**User's choice:** Align to spec §5 exactly
**Notes:** User accepted the spec §5 shape without modification. Full field list: `timestamp`, `thread: number`, `level`, `sourceClass`, `sourceMethod`, `sourceLine`, `exceptionType?`, `message`, `raw: string`, `fileLineNumber: number`.

---

## GherkinStep / StepContext Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Spec §5 shape: phase on StepContext | GherkinStep holds step-level data only. StepContext wraps it and adds phase + log line range. | ✓ |
| Current shape: phase on GherkinStep | Keep phase/scenario directly on GherkinStep. | |

**User's choice:** Spec §5 shape — phase on StepContext
**Notes:** Clean separation of parsing vs contextualisation. StepContext gains `startLine`, `endLine`, `result?`, `failedByKeywordTranslator`.

---

## Follow-up: Full Types Scope

Presented the full scope of the type rewrite (Anomaly, AggregatedAnomaly, CodeCandidate) with divergences from current types. User confirmed they understood the scope and were ready for context without further questions.

Key divergences noted:
- `Anomaly`: current nested `logEvent/stepContext` → flat DTO in spec
- `AggregatedAnomaly`: current keeps full `occurrences: Anomaly[]` → spec keeps only count + firstOccurrence summary
- `CodeCandidate`: spec removes `methodBody` (Phase 4 concern)

---

## Claude's Discretion

The following areas were not discussed by the user and are delegated to Claude:
- **Test coverage strategy** — Unit tests for regex parsing + integration test against examples/
- **Batch error handling** — Collect-and-surface per test case (never fail entire batch silently)
- **Pipeline orchestration** — New `src/core/engine.ts` as thin orchestrator; commands.ts delegates

## Deferred Ideas

None — discussion stayed within phase scope.
