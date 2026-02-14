import { getNodeColor } from '../lib/graphColors';

export default function DetailPanel({ node, edges = [], onClose, onExpand, expanding }) {
  if (!node) return null;

  const color = getNodeColor(node.type, node.category);
  const created = node.created_at ? new Date(node.created_at).toLocaleString() : null;
  const updated = node.updated_at ? new Date(node.updated_at).toLocaleString() : null;

  return (
    <div className="w-72 bg-slate-800 border-l border-slate-700 overflow-y-auto shrink-0 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <span className="text-sm font-medium text-slate-200">Node Details</span>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-3 space-y-4 flex-1 overflow-y-auto">
        {/* Header with type badge */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
              style={{ backgroundColor: color + '20', color }}
            >
              {node.type}
            </span>
            {node.category && node.category !== node.type && (
              <span className="text-xs text-slate-500">({node.category})</span>
            )}
          </div>
          <h2 className="text-sm font-medium text-slate-100 break-words">{node.label}</h2>
        </div>

        {/* Expand neighbors button */}
        {onExpand && (
          <button
            onClick={() => onExpand(node.id)}
            disabled={expanding}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {expanding ? (
              <>
                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Expanding...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                Expand Neighbors
              </>
            )}
          </button>
        )}

        {/* Content */}
        {node.content && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Content</h3>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto bg-slate-900/50 rounded p-2">
              {node.content}
            </p>
          </section>
        )}

        {/* Connected Edges */}
        {edges.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Connections ({edges.length})
            </h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {edges.map((edge) => {
                // edge.source/target may be string IDs or node references depending on Cytoscape state
                const srcId = typeof edge.source === 'string' ? edge.source : edge.source?.toString?.() || edge.source;
                const tgtId = typeof edge.target === 'string' ? edge.target : edge.target?.toString?.() || edge.target;
                const isSource = srcId === node.id;
                const otherId = isSource ? tgtId : srcId;
                const direction = isSource ? '\u2192' : '\u2190';
                return (
                  <div
                    key={edge.id}
                    className="flex items-center gap-1.5 text-xs py-1 px-2 bg-slate-900/50 rounded"
                  >
                    <span className="text-slate-500">{direction}</span>
                    <span className="text-blue-400 font-medium truncate">{edge.label}</span>
                    <span className="text-slate-500 truncate ml-auto" title={otherId}>
                      {otherId.length > 16 ? otherId.substring(0, 16) + '...' : otherId}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ID */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">ID</h3>
          <p className="text-xs text-slate-500 font-mono break-all select-all">{node.id}</p>
        </section>

        {/* Confidence */}
        {node.confidence != null && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Confidence</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(node.confidence * 100).toFixed(0)}%`,
                    backgroundColor: node.confidence > 0.7 ? '#10b981' : node.confidence > 0.4 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              <span className="text-xs text-slate-400">{(node.confidence * 100).toFixed(0)}%</span>
            </div>
          </section>
        )}

        {/* Timestamps */}
        {(created || updated) && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Timestamps</h3>
            <div className="space-y-1 text-xs text-slate-400">
              {created && <p>Created: {created}</p>}
              {updated && <p>Updated: {updated}</p>}
            </div>
          </section>
        )}

        {/* Metadata */}
        {node.metadata && Object.keys(node.metadata).length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Metadata</h3>
            <div className="bg-slate-900/50 rounded p-2 text-xs text-slate-300 font-mono overflow-x-auto max-h-48 overflow-y-auto">
              <pre>{JSON.stringify(node.metadata, null, 2)}</pre>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
