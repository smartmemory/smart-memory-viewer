import { describe, expect, it } from 'vitest';
import { accumulateRunProgress } from '../lib/runProgress.js';

describe('share replay progress state', () => {
  it('keeps a graph element seen when later events belong to the same run', () => {
    const initial = { runId: null, sawGraphElement: false };
    const node = accumulateRunProgress(initial, { run_id: 'run-1', kind: 'graph.node' });
    const completed = accumulateRunProgress(node, { run_id: 'run-1', kind: 'pipeline.completed' });

    expect(node).toMatchObject({ runId: 'run-1', sawGraphElement: true, newRun: true });
    expect(completed).toMatchObject({ runId: 'run-1', sawGraphElement: true, newRun: false });
  });

  it('clears the graph marker only when a different run starts', () => {
    const prior = { runId: 'run-1', sawGraphElement: true };
    const next = accumulateRunProgress(prior, { run_id: 'run-2', kind: 'pipeline.started' });
    expect(next).toMatchObject({ runId: 'run-2', sawGraphElement: false, newRun: true });
  });
});
