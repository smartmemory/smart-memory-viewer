/** Track whether the current run has produced an element worth sharing. */
export function accumulateRunProgress(previous, event, replayRunId) {
  const newRun = !replayRunId && Boolean(event.run_id) && event.run_id !== previous.runId;
  const runId = replayRunId || event.run_id || previous.runId;
  const sawGraphElement = (
    (!newRun && previous.sawGraphElement)
    || event.kind === 'graph.node'
    || event.kind === 'graph.edge'
  );
  return { runId, sawGraphElement, newRun };
}
