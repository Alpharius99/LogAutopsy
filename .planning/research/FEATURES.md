# Features Research — LogAutopsy

**Confidence:** MEDIUM-HIGH (domain understanding HIGH from spec + example artifacts; comparable tool patterns MEDIUM)

---

## Key Findings

1. **The VS Code log extension field is empty at the semantic level.** Log File Highlighter and all comparable extensions do only visual highlighting — zero semantic understanding of log4net format, step markers, phase correlation, or error ranking. LogAutopsy has no direct competition in VS Code.

2. **Analysts expect a verdict before they read the evidence.** ReportPortal's "defect type" classification and Sentry's issue grouping both lead with a label/verdict. LogAutopsy must lead with "Primary root cause" prominently — not a flat list of errors.

3. **Table stakes hinge on completeness and correctness, not features.** If a single ERROR is missed, the tool cannot be trusted. Correctness requirements: complete anomaly coverage, aggregation with occurrence count, step-aware display, phase classification, temporal ranking with a visible "Primary" label.

4. **The GitLab issue template is a product differentiator in itself.** An issue that a developer can act on without asking follow-up questions is rare. The three-part hypothesis (cause/mechanism/trigger), secondary effects list, occurrence count, and labeled confidence elevate it from noise to signal. The anti-pattern is including the full log dump.

5. **Sidebar TreeView + single updating Webview panel is the right UX pattern.** The TreeView gives persistent ranked context. The webview panel updates on selection — one panel for all detail, avoiding tab proliferation. This matches Allure and ReportPortal navigation patterns.

---

## Table Stakes (must have or users won't trust the tool)

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Load artifact as folder or ZIP | Analysts have both on-disk runs and archives | Low |
| Complete ERROR anomaly coverage — none missed | Missing any error = tool is untrustworthy | Low |
| Group duplicate errors with occurrence count | Same error in a retry loop is noise without aggregation | Low |
| Show which Gherkin step each error occurred in | Analysts think in steps, not log line numbers | Medium |
| Phase classification (Precondition / TestCase / PostCondition) | A Precondition error means setup failed, not a product bug | Low |
| Ranked list — earliest error labeled "Primary" | The cascade problem is the core pain; ranking without labeling is invisible | Low |
| Error message + stack trace per anomaly | Analysts cannot evaluate without full context | Low |
| Click-to-navigate to resolved source file | If tool says `WaitForTask:31`, analyst must be able to jump there | Medium |
| Confidence score shown at same level as hypothesis | AI output without confidence indicator breeds mistrust | Low |
| "Create GitLab Issue" with explicit review + confirmation | Auto-submit causes issue spam; analysts will disable the tool | Low |
| GitLab issue pre-populated with all meaningful fields | Partial template defeats the purpose | Low |
| Graceful degradation when Continue is unavailable | Tool must not go dark during Continue updates | Low |
| Analysis progress feedback | Frozen UI during 10k-line parse is alarming | Low |
| Distinct "parse failed" vs "no errors found" states | Silent failure is catastrophic for trust | Low |

## Differentiators (what would make this tool stand out)

| Feature | Value Proposition | Complexity |
|---------|-------------------|------------|
| Phase-aware classification | No other VS Code tool maps log errors to Gherkin phases; analyst immediately knows if setup vs product failure | Medium |
| "Secondary effect" labeling | Tells analyst which errors NOT to investigate — saves as much time as identifying the primary | Medium |
| Structured hypothesis (cause / mechanism / trigger) | Falsifiable, actionable — analyst can agree/disagree with each part | Medium |
| C# method body shown next to hypothesis | Analyst evaluates plausibility without leaving VS Code | Medium |
| Secondary effects list in issue template | Reduces duplicate issue creation; developer sees the cascade | Low |
| Phase 1 always runs independently of AI | High value even with Continue offline; uniquely reliable | Low |
| Symbol resolution confidence shown explicitly | "exact class+method match (1.0)" vs "method name only (0.3)" signals how much to trust navigation | Low |
| Batch run: multiple test cases in one load | Real runs contain several test cases; per-run analysis in one operation | Medium |

## Anti-Features (things that would actively harm adoption)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Auto-submit GitLab issues | Creates issue spam; analysts lose trust and their team gets angry | Per-issue confirmation with preview, always |
| "No errors found" when parsing silently fails | Analyst concludes run was clean — catastrophic misdiagnosis | Distinct "parse error" state with clear message |
| Raw log line numbers as primary navigation | Line 3,241 means nothing; analysts need step name + class | Lead with step name and class; line number is secondary |
| Sending full log or workspace to AI | Privacy risk + context overflow + confuses the model | Send method body only |
| Aggregating errors across different steps | Same exception in step A and step B are different failures | Step name is part of aggregation key |
| Confidence score hidden or buried | AI suggestion without visible confidence creates false certainty | Confidence always co-located with hypothesis |
| Batch issue creation ("create all") | Bypasses review; creates noise | Per-issue confirmation only |
| Only generic GitLab labels ("bug") | Analyst cannot filter auto-analyzed issues | Always apply `test-failure` + `automated-analysis` |
| Requiring Continue for Phase 1 | Blocks core value during Continue downtime | Phase 1 must run independently |
| Showing WARN-level lines as anomalies | This log format uses WARN for verbose adapter output; would flood the list | ERROR only |
| Flat unranked anomaly list | Without ranking, analyst must do manually what the tool claims to do | Ranked list, "Primary" label required |
| New editor tab per anomaly | Tab proliferation + wrong mental model (editor = source) | Single updating webview panel |

---

## What Makes Root Cause Credible to Analysts

1. **Evidence, not just verdict.** "Primary because it occurred first (13:52:41, 2.3s before next error)" is more trusted than just "primary."
2. **Verified source location.** Clickable link opening the exact method at the correct line. If workspace doesn't have the file, say so — never silently omit.
3. **Confidence contextualized.** Tier label helps: "high — exact class + method match" beats a raw `0.73`.
4. **Secondary effects explained.** "The following 2 errors likely occurred because of the above failure" tells the analyst they don't need to investigate those separately.
5. **Falsifiable hypothesis structure.** Cause / mechanism / trigger can each be verified. A prose paragraph cannot be checked.
6. **Fix suggestion bounded.** "Verify before applying" framing. Suggestions are advisory — the UI must reinforce this.

---

## GitLab Issue Content: Useful vs Noise

**Useful:** Title with step name + exception type, one-sentence summary, failing step + phase, 3-part hypothesis, C# fix snippet (conditional on high confidence), evidence (error message + source reference), stack trace as code block, occurrence count + first timestamp, secondary effects list, confidence score + analysis date, labels `test-failure` + `automated-analysis`.

**Noise:** Full log dump (10k lines unusable in an issue), DEBUG/INFO context lines, all anomalies as full expanded sections, raw SHA-256 aggregation key, local file paths to log artifacts (won't resolve on another developer's machine).

---

## Feature Dependencies

```
Artifact loading
  └── Log parsing (Phase 1)
        └── Step extraction (requires feature file)
              └── Anomaly detection
                    └── Aggregation + ranking
                          ├── Sidebar TreeView
                          ├── Symbol resolution (Phase 2)
                          │     └── Code snippet extraction
                          │           └── Continue AI call
                          │                 └── Hypothesis + fix
                          └── GitLab issue assembly
                                └── GitLab issue creation (PAT required)
```

Phase 1 is fully AI-independent. Phase 2 depends on Phase 1 + VS Code workspace. GitLab creation depends on both + network + settings.

---

## MVP Recommendation

1. Artifact loading + Phase 1 deterministic pipeline — trust-establishing foundation
2. Sidebar TreeView with ranked anomaly display ("Primary" / "Secondary effect" labels)
3. Detail webview with step context, error, stack trace
4. GitLab issue assembly + manual creation (full loop without AI)
5. Phase 2: symbol resolution + code navigation (high value, no AI dependency)
6. Phase 2: Continue AI hypothesis (highest value, highest dependency — add last)

**Defer:** Aggregation key normalization (revisit with real data), GitLab deduplication (manual check adequate for 2–10 users), confidence threshold tuning (post-launch).

---

## Open Questions

- **Message normalization for aggregation keys:** Dynamic values (timestamps, IDs) in error messages will cause the same error to appear as separate entries. Needs real-world data to decide how aggressively to normalize. Highest-risk correctness gap for Phase 1.
- **Confidence tier labels:** Exact thresholds for "high / medium / low" display need UX decisions (e.g., >0.8 = high, 0.5–0.8 = medium, <0.5 = low).
