import { useCallback, useState } from 'react';
import { AskPanel, GraphExplorer } from '@smartmemory/graph';
import { applyFocusHash, askSelectionTarget } from '../lib/askFocus';

/**
 * The viewer's two-pane layout: an ask panel on the left, the graph on the right
 * (DIST-LITE-9). Shared by the Clerk build (App.jsx) and the lite build (LocalApp.jsx)
 * so both get the same wiring.
 *
 * HOW SELECTION REACHES THE GRAPH — worth reading before changing it.
 *
 * `GraphExplorer` takes no "focus this element" prop. Its one public focus surface is the
 * `#selected=<id>` URL hash: `useUrlState` decodes the hash when the component mounts, and
 * `useGraphInteraction`'s restore effect then selects that node, opens the detail panel and
 * centers the viewport on it. That restore runs once per mount, so this writes the hash and
 * bumps a `key` to replay it.
 *
 * The cost is honest: a remount refetches the graph. The right fix is a `focusElementId`
 * prop on GraphExplorer, which is deliberately not made here — PLAT-PUSH-SSE-1 is editing
 * that file concurrently. Filed as the DIST-LITE-9 follow-up.
 *
 * Relations focus their SOURCE entity node, not the edge. The restore path feeds whatever
 * the hash names into the node-click handler, so handing it an edge id would open a detail
 * panel on an edge — the source node is the nearest thing that actually works today. The
 * edge id is still passed to `onSelect` by the panel, so a host with a richer graph API can
 * use it.
 *
 * @param {Object} props
 * @param {import('@smartmemory/graph').GraphAPIAdapter} props.adapter - Shared by both panes.
 * @param {Object} [props.explorerProps] - Forwarded verbatim to GraphExplorer.
 * @param {number} [props.askLimit=5] - Evidence budget for each question.
 */
export default function GraphWithAsk({ adapter, explorerProps = {}, askLimit = 5 }) {
  const [focusKey, setFocusKey] = useState(0);

  const handleSelect = useCallback((id, meta) => {
    const target = askSelectionTarget(id, meta);
    if (!target) return;
    window.history.replaceState(null, '', applyFocusHash(window.location.hash, target));
    setFocusKey((n) => n + 1);
  }, []);

  return (
    <div className="flex h-screen w-screen">
      <aside className="w-80 shrink-0 border-r border-slate-800 overflow-hidden flex flex-col">
        <AskPanel adapter={adapter} onSelect={handleSelect} limit={askLimit} className="flex-1" />
      </aside>
      <div className="flex-1 min-w-0">
        <GraphExplorer key={focusKey} adapter={adapter} {...explorerProps} className="h-screen w-full" />
      </div>
    </div>
  );
}
