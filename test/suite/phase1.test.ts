import * as assert from 'assert';
import { aggregateAnomalies } from '../../src/core/aggregator';
import { detectAnomalies } from '../../src/core/anomalyEngine';
import { parseLog } from '../../src/core/logParser';
import { buildStepContexts } from '../../src/core/stepBuilder';

suite('Phase 1 deterministic pipeline', () => {
  const feature = [
    'Feature: Sample',
    '',
    '  Scenario: Precondition',
    '    When BootSystem',
    '',
    '  Scenario: TestCase',
    '    When RunCheck',
    '',
    '  Scenario: PostCondition',
    '    When Cleanup',
  ].join('\n');

  const log = [
    "2025-07-03 13:52:29,433 [14] INFO  GherkinExecutor\\ExecuteStep:187 - Next test step 'BootSystem' (location '4:5', keyword 'When ', keyword type 'Action', argument '').",
    "2025-07-03 13:52:29,500 [14] INFO  GherkinExecutor\\ExecuteStep:221 - Result of test step 'Pass'.",
    "2025-07-03 13:52:30,000 [14] INFO  GherkinExecutor\\ExecuteStep:187 - Next test step 'RunCheck' (location '7:5', keyword 'When ', keyword type 'Action', argument '').",
    "2025-07-03 13:52:30,100 [14] ERROR AdapterXil.WebApiCalls|MethodException in WaitForTask:31 - Failed with the message 'boom'.",
    'System.Exception: boom',
    '   at AdapterXil.WebApiCalls.WaitForTask()',
    "2025-07-03 13:52:30,200 [14] INFO  KeywordTranslator\\ExecuteTestStep:51 - The test action 'RunCheck' is failed.",
    "2025-07-03 13:52:30,210 [14] INFO  GherkinExecutor\\ExecuteStep:221 - Result of test step 'TestRunError'.",
    "2025-07-03 13:52:31,000 [14] INFO  GherkinExecutor\\ExecuteStep:187 - Next test step 'Cleanup' (location '10:5', keyword 'When ', keyword type 'Action', argument '').",
    "2025-07-03 13:52:31,200 [14] INFO  ConnectorFacade\\Shutdown:45 - Cleanup completed.",
  ].join('\n');

  test('parses events, builds contexts, detects anomalies, and aggregates deterministically', () => {
    const events = parseLog(log);
    const steps = buildStepContexts(events, feature);
    const anomalies = detectAnomalies(events, steps, '/tmp/sample.log');
    const aggregated = aggregateAnomalies(anomalies);

    assert.strictEqual(events.length, 8);
    assert.strictEqual(steps.length, 3);
    assert.strictEqual(steps[1].phase, 'TestCase');
    assert.strictEqual(steps[1].failedByKeywordTranslator, true);
    assert.strictEqual(steps[1].result, 'TestRunError');

    assert.strictEqual(anomalies.length, 1);
    assert.strictEqual(anomalies[0].type, 'ERROR');
    assert.strictEqual(anomalies[0].step, 'RunCheck');
    assert.ok(anomalies[0].stacktrace?.includes('System.Exception: boom'));

    assert.strictEqual(aggregated.length, 1);
    assert.strictEqual(aggregated[0].occurrences, 1);
    assert.strictEqual(aggregated[0].step, 'RunCheck');
    assert.strictEqual(aggregated[0].sourceHint.method, 'WaitForTask');
  });

  test('builds step contexts from the log when no feature file is available', () => {
    const events = parseLog(log);
    const steps = buildStepContexts(events, '');
    const anomalies = detectAnomalies(events, steps, '/tmp/sample.log');
    const aggregated = aggregateAnomalies(anomalies);

    assert.strictEqual(steps.length, 3);
    assert.strictEqual(steps[0].step === '_init_', false);
    assert.strictEqual(steps[0].step === '_init_' ? '' : steps[0].step.name, 'BootSystem');
    assert.strictEqual(steps[0].phase, 'TestCase');
    assert.strictEqual(steps[1].step === '_init_' ? '' : steps[1].step.name, 'RunCheck');
    assert.strictEqual(steps[1].result, 'TestRunError');

    assert.strictEqual(anomalies.length, 1);
    assert.strictEqual(anomalies[0].step, 'RunCheck');
    assert.strictEqual(aggregated.length, 1);
    assert.strictEqual(aggregated[0].step, 'RunCheck');
  });
});
