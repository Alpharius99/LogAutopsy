# test-analysis-agent

`test-analysis-agent` is a VS Code extension for investigating automated test failures from log files. It performs deterministic anomaly analysis first, then runs a bounded AI-assisted root cause workflow, and can turn the result into a GitLab issue.

## Overview

The extension is built around a two-phase pipeline:

1. `Phase 1` is deterministic and local.
   It parses the log, builds step context from the log stream, detects anomalies, and aggregates repeated failures.
2. `Phase 2` is AI-assisted.
   It resolves likely C# source locations in the open workspace, extracts bounded method context, runs a structured multi-step Continue workflow through the VS Code language model API, validates strict JSON responses, and produces a final root cause result.

The extension is stateless per run. It does not cache prior analyses.

## Main Capabilities

- Parse log4net-style combined logs into structured events
- Detect anomalies from:
  - all `ERROR` log entries
  - messages containing `Exception`
- Extract and maintain active step context from `GherkinExecutor\\ExecuteStep`
- Assign anomalies to:
  - `Precondition`
  - `TestCase`
  - `PostCondition`
- Aggregate anomalies by `(type + message + top stack frame + step)`
- Run a multi-step AI root cause analysis with strict JSON validation
- Create GitLab issues from analyzed results

## UI

The extension contributes a `Test Analysis` activity bar container with two views:

- `Controls`
  - large action buttons
  - current status summary
- `Analysis Results`
  - steps
  - aggregated anomalies
  - root cause results

The results view also shows welcome-style quick actions when no analysis output exists yet, and both views expose title-bar command buttons.

## Commands

- `Test Analysis Agent: Load Log Only`
- `Test Analysis Agent: Run Phase 1 Analysis`
- `Test Analysis Agent: Run Root Cause Analysis`
- `Test Analysis Agent: Create GitLab Issues`

## Expected Input

The engine expects a `.log` file selected directly from the file picker.

## Analysis Flow

### Phase 1: Deterministic

Input:

- log file

Behavior:

- parse log entries and continuation lines
- detect anomalies
- build step contexts from the log
- assign each anomaly to the active step
- aggregate recurring anomalies

Outputs:

- parsed events
- step contexts
- anomaly list
- aggregated anomaly list

### Phase 2: AI Root Cause Analysis

For each aggregated anomaly:

- extract source hints from the log
- resolve likely C# symbols in the open workspace
- extract bounded method code context
- run the workflow steps:
  - `extract_context`
  - `identify_failure_point`
  - `analyze_code`
  - `correlate_logs`
  - `validate_hypothesis`
  - `final_output`
- validate every model response as strict JSON
- retry hypothesis validation when required

Final output shape:

```json
{
  "root_cause": "...",
  "hypothesis": {
    "cause": "...",
    "mechanism": "...",
    "trigger": "..."
  },
  "fix_suggestion": "...",
  "confidence": 0.0,
  "issue_description": "...",
  "issue_fields": {
    "step": "...",
    "class": "...",
    "method": "...",
    "file": "...",
    "line": 123
  }
}
```

## Installation

### From Source

1. Open this repository in VS Code.
2. Install dependencies:

```bash
npm install
```

3. Launch an Extension Development Host:

```text
Press F5
```

4. In the new VS Code window, open the `Test Analysis` activity bar icon.

### From VSIX

The project can be packaged as a VSIX:

```bash
npm run package
npx @vscode/vsce package
```

This produces a file like:

```text
test-analysis-agent-0.1.0.vsix
```

Install it with:

```bash
code --install-extension test-analysis-agent-0.1.0.vsix
```

## How To Use

Typical workflow:

1. Open the `Test Analysis` view container.
2. Click `Load Log Only`.
3. Select the `.log` file to analyze.
4. Run `Phase 1 Analysis`.
5. Review steps and grouped anomalies in `Analysis Results`.
6. Run `Root Cause Analysis`.
7. Review the AI result set.
8. Run `Create GitLab Issues` and choose the root cause result to publish.

You can use either:

- the `Controls` webview buttons
- the command palette
- the title-bar buttons on the extension views

## Configuration

Configure the extension in VS Code `settings.json`.

### GitLab Settings

```json
{
  "testAnalysisAgent.gitlab.baseUrl": "https://gitlab.example.com",
  "testAnalysisAgent.gitlab.projectId": "group%2Fproject",
  "testAnalysisAgent.gitlab.token": "your_pat"
}
```

Settings:

- `testAnalysisAgent.gitlab.baseUrl`
- `testAnalysisAgent.gitlab.projectId`
- `testAnalysisAgent.gitlab.token`

### Continue / Model Selection

These selectors are optional. Use them only if you need to narrow which VS Code language model is selected.

```json
{
  "testAnalysisAgent.continue.vendor": "",
  "testAnalysisAgent.continue.family": "",
  "testAnalysisAgent.continue.modelId": ""
}
```

Settings:

- `testAnalysisAgent.continue.vendor`
- `testAnalysisAgent.continue.family`
- `testAnalysisAgent.continue.modelId`

## Development

Useful scripts:

- `npm run check-types`
- `npm run compile`
- `npm run compile-tests`
- `npm test`

Build notes:

- extension bundle output: `dist/extension.js`
- compiled tests output: `out/`
- VSIX packaging uses `@vscode/vsce`

## Verification Status

Verified locally:

- `npm run check-types`
- `npm run compile`
- `npm run compile-tests`
- `./node_modules/.bin/mocha --ui tdd out/test/suite/phase1.test.js`
- `npx @vscode/vsce package`

Known limitation in this environment:

- `npm test` can still fail in the VS Code extension-host harness due to runtime launch issues unrelated to the core TypeScript build and VSIX packaging

## Safety Constraints

- full logs are not sent to the model
- the full repository is not sent to the model
- code context is limited to bounded method extraction
- AI output is validated before use
- GitLab issue descriptions are validated and fall back to a deterministic template if required sections are missing

## Repository Structure

```text
src/
  ai/
  commands/
  core/
  extension/
  gitlab/
  models/
  ui/
  utils/
test/
docs/
examples/
media/
```

## Notes

- Continue integration in this project uses the VS Code language model API path
- sample artifacts in `examples/` are useful for folder structure reference; end-to-end analysis can run from a combined log alone, with richer step/phase mapping when a matching feature file is present
