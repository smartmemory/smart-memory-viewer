import { useRef, useEffect } from 'react';

const CATEGORY_ICONS = {
  node_added: { icon: '\u25CF', color: 'text-green-400' },    // ●
  edge_added: { icon: '\u2192', color: 'text-blue-400' },     // →
  node_removed: { icon: '\u25CB', color: 'text-red-400' },    // ○
  pipeline_stage: { icon: '\u25D0', color: 'text-yellow-400' }, // ◐
  search_highlight: { icon: '\uD83D\uDD0D', color: 'text-purple-400' }, // 🔍
  ingest_started: { icon: '\u2295', color: 'text-slate-400' }, // ⊕
};

const STATUS_COLORS = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-red-500',
};

function formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

export default function OperationsBar({ status, operations, opsPerSecond, isPaused, onPause, onResume, onOperationClick }) {
  const tickerRef = useRef(null);

  // Auto-scroll ticker to the left (newest entries appear on the left)
  useEffect(() => {
    if (tickerRef.current && !isPaused) {
      tickerRef.current.scrollLeft = 0;
    }
  }, [operations.length, isPaused]);

  return (
    <div className="h-10 bg-slate-800 border-t border-slate-700 flex items-center px-3 gap-3 shrink-0 text-xs">
      {/* Status indicator */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.disconnected}`} />
        <span className="text-slate-400 tabular-nums w-16">
          {status === 'connected' ? `${opsPerSecond} ops/s` : status}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-slate-700 shrink-0" />

      {/* Ticker */}
      <div ref={tickerRef} className="flex-1 overflow-x-auto whitespace-nowrap scrollbar-hide flex items-center gap-3">
        {operations.length === 0 && status === 'connected' && (
          <span className="text-slate-500 italic">Waiting for events...</span>
        )}
        {operations.length === 0 && status !== 'connected' && (
          <span className="text-slate-500 italic">
            {status === 'connecting' ? 'Connecting...' : 'Not connected to event stream'}
          </span>
        )}
        {operations.map((op, i) => {
          const config = CATEGORY_ICONS[op.category] || CATEGORY_ICONS.ingest_started;
          return (
            <button
              key={op.id || i}
              onClick={() => onOperationClick?.(op)}
              className="flex items-center gap-1.5 hover:bg-slate-700/50 rounded px-1.5 py-0.5 transition-colors shrink-0 cursor-pointer"
              title={`${op.label}\n${formatTime(op.timestamp)}\nTrace: ${op.traceId || 'none'}`}
            >
              <span className={config.color}>{config.icon}</span>
              <span className="text-slate-300 max-w-48 truncate">{op.label}</span>
              <span className="text-slate-500">{formatTime(op.timestamp)}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="shrink-0">
        <button
          onClick={isPaused ? onResume : onPause}
          className="text-slate-400 hover:text-slate-200 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-700"
          title={isPaused ? 'Resume live feed' : 'Pause live feed'}
        >
          {isPaused ? '\u25B6' : '\u23F8'}
        </button>
      </div>
    </div>
  );
}
