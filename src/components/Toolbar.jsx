import { useState, useCallback, useEffect, useRef } from 'react';
import { exportPNG, exportSVG } from '../lib/export';

const LAYOUTS = [
  { id: 'cose-bilkent', label: 'Force Directed' },
  { id: 'dagre', label: 'Hierarchical' },
  { id: 'circle', label: 'Circle' },
  { id: 'concentric', label: 'Concentric' },
  { id: 'grid', label: 'Grid' },
];

export default function Toolbar({
  layout,
  onLayoutChange,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onRefresh,
  onToggleFilters,
  onPathMode,
  pathMode,
  stats,
  cy,
  onLogout,
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const toolbarRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setExportOpen(false);
        setLayoutOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = useCallback((format) => {
    const cyInstance = cy?.current;
    if (!cyInstance) return;
    if (format === 'png') exportPNG(cyInstance);
    if (format === 'svg') exportSVG(cyInstance);
    setExportOpen(false);
  }, [cy]);

  return (
    <div ref={toolbarRef} className="h-12 bg-slate-800 border-b border-slate-700 flex items-center px-4 gap-2 shrink-0 z-40">
      {/* App title */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-xs font-bold text-white">G</div>
        <span className="text-slate-200 font-medium text-sm hidden sm:inline">Graph Viewer</span>
      </div>

      <div className="w-px h-6 bg-slate-700" />

      {/* Filter toggle */}
      <button
        onClick={onToggleFilters}
        className="px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
        title="Toggle filters"
      >
        Filters
      </button>

      {/* Layout selector */}
      <div className="relative">
        <button
          onClick={() => { setLayoutOpen(!layoutOpen); setExportOpen(false); }}
          className="px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors flex items-center gap-1"
        >
          Layout
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {layoutOpen && (
          <div className="absolute top-full left-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[160px] z-50">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => { onLayoutChange(l.id); setLayoutOpen(false); }}
                className={`block w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  layout === l.id ? 'text-blue-400 bg-slate-600' : 'text-slate-300 hover:text-white hover:bg-slate-600'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-slate-700" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button onClick={onZoomOut} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Zoom out">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
        </button>
        <button onClick={onFitToScreen} className="px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Fit to screen">
          Fit
        </button>
        <button onClick={onZoomIn} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors" title="Zoom in">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>

      <div className="w-px h-6 bg-slate-700" />

      {/* Path finder */}
      <button
        onClick={onPathMode}
        className={`px-3 py-1.5 text-sm rounded transition-colors ${
          pathMode ? 'bg-amber-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
        }`}
        title="Find shortest path between two nodes"
      >
        Path
      </button>

      {/* Export */}
      <div className="relative">
        <button
          onClick={() => { setExportOpen(!exportOpen); setLayoutOpen(false); }}
          className="px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors flex items-center gap-1"
        >
          Export
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {exportOpen && (
          <div className="absolute top-full left-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[120px] z-50">
            <button onClick={() => handleExport('png')} className="block w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">
              PNG (2x)
            </button>
            <button onClick={() => handleExport('svg')} className="block w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-slate-600 transition-colors">
              SVG
            </button>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>{stats.nodes} nodes</span>
        <span>{stats.edges} edges</span>
      </div>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
        title="Refresh graph"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>

      {/* Logout */}
      {onLogout && (
        <button
          onClick={onLogout}
          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
          title="Sign out"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        </button>
      )}
    </div>
  );
}
