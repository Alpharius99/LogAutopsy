# LogAutopsy

## What This Is

A VS Code extension for Test Analysts that automates the painful mechanical work of analyzing failed automated test runs. It ingests test artifacts (log4net combined logs + Gherkin feature files), identifies which ERROR is the root cause vs a downstream side effect, uses AI (via the Continue extension) to generate a root cause hypothesis and fix suggestion, and assembles a fully populated GitLab issue description — ready to submit with minimal analyst effort.

## Core Value

Given a failed test run, produce a ranked root cause diagnosis with a fix suggestion and a ready-to-submit GitLab issue description, so the analyst spends minutes instead of hours on the investigation and write-up.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Phase 1 — Deterministic Analysis**
- [ ] Load test artifact folder/ZIP (BatchRun structure with multiple test cases)
- [ ] Discover and parse combined log files (log4net format, up to 10k lines each)
- [ ] Extract step boundaries and metadata from GherkinExecutor markers in the log
- [ ] Assign steps to phases (Precondition / TestCase / PostCondition) via feature file correlation
- [ ] Detect all ERROR-level anomalies and associate each to its step context
- [ ] Aggregate anomalies by signature (dedup repeated errors in the same step)
- [ ] Rank anomalies: earliest = likely root cause, later = likely side effects

**Phase 2 — AI-Assisted Root Cause Analysis**
- [ ] Resolve the primary anomaly's class+method to a C# source file in the open workspace
- [ ] Extract the resolved method body and send to Continue with structured context
- [ ] Generate root cause hypothesis + fix suggestion via Continue
- [ ] Graceful fallback: show resolved source location even if Continue is unavailable

**Results UI**
- [ ] Display aggregated anomalies in VS Code sidebar (TreeView)
- [ ] Detail webview: anomaly summary, step context, root cause, fix suggestion, confidence
- [ ] Code navigation: click to jump to resolved source file at the right line
- [ ] Assemble GitLab issue content (title + full Markdown description) for analyst review

**GitLab Integration (nice-to-have v1)**
- [ ] Create GitLab issue via REST API using Personal Access Token
- [ ] One issue per explicit user confirmation (no batch creation)

### Out of Scope

- Modifying source code or auto-applying suggested fixes — read-only; suggestions are advisory
- Parsing per-phase subfolder logs — only the combined log at the test case root is analyzed
- WARN-level anomaly detection — only ERROR level is in scope
- Caching or persistence between analysis sessions — stateless per run
- Batch issue creation or auto-submission — each issue requires analyst confirmation
- Deduplication against existing GitLab issues — analyst checks for duplicates manually
- Message normalization for aggregation keys — using raw message; revisit if dynamic content causes grouping problems

## Context

- **Input artifacts**: `BatchRun_YYMMDD_HHMMSS/` folder structure. Each test case folder contains one combined log (`*_YYMMDD_HHMMSS.log`) and one `.feature` file. Per-phase subfolders, `.html` reports, and `appsettings.json` are ignored.
- **Log format**: log4net with fixed-format prefix. Standard lines: `YYYY-MM-DD HH:MM:SS,mmm [THREAD] LEVEL ClassName\MethodName:Line - Message`. Exception lines use `|ExceptionType in ` syntax. Continuation lines (stack traces) have no timestamp prefix.
- **Step markers**: Steps are delimited by `GherkinExecutor\ExecuteStep:187` "Next test step" log entries. Step failure metadata comes from `KeywordTranslator` entries.
- **Target codebase**: C# automotive testing framework (XIL/CANoe adapters). Symbol resolution has no namespace in logs — matches on simple class name only.
- **AI backend**: Continue VS Code extension (hard requirement — teams already use it). Integration mechanism is abstracted; spec defines request/response contract only.
- **Users**: Small team of Test Analysts (2–10). The primary pain points are (a) deciding which error is the root cause vs a cascade effect, and (b) writing up the diagnosis for documentation/ticketing.
- **Example artifacts** available in `examples/` for development and testing.
- **Detailed spec** in `docs/test_analysis_agent_spec_v2.md` — defines all data contracts, parsing regexes, phase rules, and Continue API payload.

## Constraints

- **Tech stack**: TypeScript VS Code extension (runs in extension host) — no server process
- **AI backend**: Continue extension API — must not replace or bypass Continue
- **Code access**: Read-only workspace access for symbol resolution; extension never writes to source
- **Scale**: Combined logs up to 10,000 lines; batch may contain multiple test cases, each analyzed independently
- **Stateless**: No database or cross-session cache — every analysis run is independent

## Key Decisions

| Decision                                  | Rationale                                                                | Outcome   |
|-------------------------------------------|--------------------------------------------------------------------------|-----------|
| Continue as AI backend (not direct API)   | Teams already have Continue deployed; avoids new dependencies            | — Pending |
| Only ERROR level triggers anomalies       | WARN lines are noise in this log format; all exceptions use ERROR        | — Pending |
| Earliest anomaly = primary root cause     | Cascade effects appear later; primary is the first thing that went wrong | — Pending |
| Read-only code access                     | Safety constraint — extension never modifies production source files     | — Pending |
| GitLab issue creation is manual/confirmed | Prevents accidental issue flood; analyst reviews before submitting       | — Pending |
| Stateless per run                         | Simplifies implementation; log files are the source of truth             | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-19 after initialization*
