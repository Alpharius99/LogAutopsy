---
phase: 01-scaffold
plan: 01
subsystem: build-infrastructure
tags: [toolchain, vscode-extension, esbuild, typescript, scaffold]
dependency_graph:
  requires: []
  provides: [package.json, tsconfig.json, esbuild.js, .vscode-test.mjs, node_modules]
  affects: [01-02]
tech_stack:
  added: [typescript@5.4.5, esbuild@0.21.5, "@vscode/test-cli@0.0.9", "@vscode/vsce@3", mocha@10, npm-run-all@4.1.5]
  patterns: [commonjs-extension-host, esbuild-bundler, vscode-test-cli, extensionHost-launch]
key_files:
  created:
    - package.json
    - tsconfig.json
    - esbuild.js
    - .vscode-test.mjs
    - .vscodeignore
    - .vscode/launch.json
    - media/icon.svg
    - package-lock.json
  modified: []
decisions:
  - "esbuild outfile targets dist/extension.js; tsc outDir is out/ — two separate output dirs to avoid collision"
  - "activationEvents set to empty array (VS Code 1.74+ auto-infers from contributes)"
  - "esbuild entry point is src/extension/activate.ts per D-08"
metrics:
  duration_seconds: 356
  completed_date: "2026-04-19"
  tasks_completed: 2
  files_created: 8
---

# Phase 01 Plan 01: Build Infrastructure Summary

**One-liner:** VS Code extension build infrastructure with esbuild bundler, tsc type-checker, @vscode/test-cli test runner, and npm-run-all parallel watch scripts.

## What Was Built

Complete toolchain for the LogAutopsy VS Code extension. All 7 configuration files created from PATTERNS.md specifications and `npm install` completed with 509 packages installed. CLI tools verified: tsc 5.4.5, esbuild 0.21.5, vscode-test CLI.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create all project configuration files | 7f894be | package.json, tsconfig.json, esbuild.js, .vscode-test.mjs, .vscodeignore, .vscode/launch.json, media/icon.svg |
| 2 | Install dependencies and verify build toolchain | 692ca98 | package-lock.json |

## Decisions Made

1. **Output directory split:** esbuild writes to `dist/extension.js` (production bundle), tsc writes to `out/` (test compilation only). This prevents collisions between bundler and type-checker output.
2. **activationEvents empty array:** VS Code 1.74+ auto-infers activation from `contributes` entries. Explicit `[]` is cleaner than omitting the field.
3. **Entry point:** `src/extension/activate.ts` as sole esbuild entry point per decision D-08. Webview JS is a separate entry deferred to Phase 3.
4. **npm-run-all for watch:** Required for cross-platform parallel `npm run watch` (runs both esbuild watch and tsc watch simultaneously).

## Deviations from Plan

None - plan executed exactly as written.

The .gitignore already contained all required entries (`node_modules/`, `dist`, `out/`, `.vscode-test`, `*.vsix`) from the existing GitHub template. No modifications were needed.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. This plan is build tooling only — no extension host runtime in scope (as noted in plan threat model).

T-01-02 mitigation confirmed: `.vscodeignore` excludes `src/**`, `test/**`, `.planning/**`, `docs/**`, `examples/**` from the VSIX package.

## Known Stubs

None — this plan creates only configuration files and installs dependencies. No TypeScript source files were created (those are Plan 02).

## Self-Check: PASSED
---
Files verified:
- package.json: FOUND
- tsconfig.json: FOUND
- esbuild.js: FOUND
- .vscode-test.mjs: FOUND
- .vscodeignore: FOUND
- .vscode/launch.json: FOUND
- media/icon.svg: FOUND
- package-lock.json: FOUND

Commits verified:
- 7f894be: FOUND (feat(01-scaffold-01): create VS Code extension build infrastructure)
- 692ca98: FOUND (chore(01-scaffold-01): install devDependencies via npm install)
