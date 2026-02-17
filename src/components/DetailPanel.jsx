import { useState, useEffect, useRef } from 'react';
import { getNodeColor } from '../lib/graphColors';
import { createOntologyPattern, updateEntityNode, getGroundingStatus, searchWikipedia, removeGrounding } from '../lib/api';
import WikipediaOverlay from './WikipediaOverlay';

const EDGES_PAGE_SIZE = 10;

const ENTITY_TYPES = [
  'person', 'organization', 'location', 'event', 'product',
  'work_of_art', 'temporal', 'concept', 'technology', 'award',
  'nationality', 'language',
];

export default function DetailPanel({ node, edges = [], onClose, onExpand, expanding, onNodeUpdate }) {
  const [edgesShown, setEdgesShown] = useState(EDGES_PAGE_SIZE);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [customType, setCustomType] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState('');
  const [typeSaved, setTypeSaved] = useState(false);
  const [labelSaved, setLabelSaved] = useState(false);

  // Grounding state
  const [grounding, setGrounding] = useState(null); // { grounded, wikipedia }
  const [groundingLoading, setGroundingLoading] = useState(false);
  const [wikiResults, setWikiResults] = useState(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [showWikiOverlay, setShowWikiOverlay] = useState(false);

  const labelInputRef = useRef(null);
  const isEntity = node?.category === 'entity';

  // Reset state when the selected node changes
  const nodeId = node?.id;
  useEffect(() => {
    setEdgesShown(EDGES_PAGE_SIZE);
    setTypeDropdownOpen(false);
    setEditingLabel(false);
    setTypeSaved(false);
    setLabelSaved(false);
    setGrounding(null);
    setShowWikiOverlay(false);
    setWikiResults(null);
  }, [nodeId]);

  // Fetch grounding status for all nodes
  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    setGroundingLoading(true);
    getGroundingStatus(nodeId)
      .then((data) => { if (!cancelled) setGrounding(data); })
      .catch(() => { if (!cancelled) setGrounding({ grounded: false, wikipedia: null }); })
      .finally(() => { if (!cancelled) setGroundingLoading(false); });
    return () => { cancelled = true; };
  }, [nodeId]);

  // Focus label input when editing starts
  useEffect(() => {
    if (editingLabel && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [editingLabel]);

  if (!node) return null;

  const color = getNodeColor(node.type, node.category);
  const created = node.created_at ? new Date(node.created_at).toLocaleString() : null;
  const updated = node.updated_at ? new Date(node.updated_at).toLocaleString() : null;
  const paginatedEdges = edges.slice(0, edgesShown);
  const hasMore = edges.length > edgesShown;

  // --- Entity correction handlers ---

  async function handleTypeChange(newType) {
    setTypeDropdownOpen(false);
    setCustomType('');
    if (!newType || newType === node.type) return;
    const oldType = node.type;
    // Optimistic update
    onNodeUpdate?.(node.id, { type: newType, entity_type: newType });
    setTypeSaved(true);
    setTimeout(() => setTypeSaved(false), 1500);
    try {
      await Promise.all([
        updateEntityNode(node.id, { entity_type: newType }),
        createOntologyPattern(node.label, newType, 1.0),
      ]);
    } catch (err) {
      console.error('Type update failed:', err);
      // Revert on failure
      onNodeUpdate?.(node.id, { type: oldType, entity_type: oldType });
    }
  }

  async function handleLabelSave() {
    setEditingLabel(false);
    const newLabel = labelValue.trim();
    if (!newLabel || newLabel === node.label) return;
    // Optimistic update — show new label immediately
    onNodeUpdate?.(node.id, { label: newLabel });
    setLabelSaved(true);
    setTimeout(() => setLabelSaved(false), 1500);
    try {
      await updateEntityNode(node.id, { label: newLabel });
      // Create ontology pattern mapping new name to current type
      await createOntologyPattern(newLabel, node.type, 1.0);
    } catch (err) {
      console.error('Label rename failed:', err);
      // Revert on failure
      onNodeUpdate?.(node.id, { label: node.label });
    }
  }

  async function handleGround() {
    setWikiLoading(true);
    setShowWikiOverlay(true);
    try {
      const results = await searchWikipedia(node.label);
      setWikiResults(Array.isArray(results) ? results : []);
    } catch (err) {
      console.error('Wikipedia search failed:', err);
      setWikiResults([]);
    } finally {
      setWikiLoading(false);
    }
  }

  async function handleUnground() {
    try {
      await removeGrounding(node.id);
      setGrounding({ grounded: false, wikipedia: null });
    } catch (err) {
      console.error('Unground failed:', err);
    }
  }

  async function handleGroundAccept(article) {
    setShowWikiOverlay(false);
    // Update grounding status locally
    setGrounding({ grounded: true, wikipedia: article });
    // If Wikipedia suggests a different type, apply it
    if (article.suggested_type && article.suggested_type !== node.type) {
      await handleTypeChange(article.suggested_type);
    }
  }

  return (
    <div className="w-72 h-full bg-slate-800 border-l border-slate-700 overflow-y-auto shrink-0 flex flex-col shadow-2xl">
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
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: color }} />

            {/* Type badge — clickable for entities */}
            {isEntity ? (
              <div className="relative">
                <button
                  onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                  className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize cursor-pointer hover:ring-1 hover:ring-white/20 transition-all ${typeSaved ? 'ring-2 ring-green-500' : ''}`}
                  style={{ backgroundColor: color + '20', color }}
                  title="Click to change entity type"
                >
                  {node.type}
                  <svg className="w-2.5 h-2.5 inline ml-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Type dropdown */}
                {typeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 w-40 bg-slate-900 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {ENTITY_TYPES.map((t) => (
                        <button
                          key={t}
                          onClick={() => handleTypeChange(t)}
                          className={`w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-slate-700 transition-colors ${t === node.type ? 'text-blue-400 font-medium' : 'text-slate-300'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    {/* Custom type input */}
                    <div className="border-t border-slate-700 p-2">
                      <input
                        type="text"
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && customType.trim()) handleTypeChange(customType.trim().toLowerCase()); }}
                        placeholder="Custom type..."
                        className="w-full text-xs px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
                style={{ backgroundColor: color + '20', color }}
              >
                {node.type}
              </span>
            )}

            {node.category && node.category !== node.type && (
              <span className="text-xs text-slate-500">({node.category})</span>
            )}
          </div>

          {/* Label — editable for entities */}
          {isEntity && editingLabel ? (
            <input
              ref={labelInputRef}
              type="text"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={handleLabelSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLabelSave(); if (e.key === 'Escape') setEditingLabel(false); }}
              className="text-sm font-medium text-slate-100 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 w-full focus:outline-none focus:border-blue-500"
            />
          ) : (
            <h2
              className={`text-sm font-medium text-slate-100 break-words ${isEntity ? 'cursor-pointer hover:bg-slate-700/50 rounded px-1 -mx-1 transition-colors' : ''} ${labelSaved ? 'ring-1 ring-green-500 rounded' : ''}`}
              onClick={() => {
                if (isEntity) {
                  setLabelValue(node.label);
                  setEditingLabel(true);
                }
              }}
              title={isEntity ? 'Click to rename' : undefined}
            >
              {node.label}
            </h2>
          )}
        </div>

        {/* Grounding status */}
        {!groundingLoading && grounding && (
          <div>
            {grounding.grounded ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-green-400 font-medium">Grounded</span>
                {grounding.wikipedia?.url && (
                  <div className="flex items-center gap-1 ml-auto">
                    <a
                      href={grounding.wikipedia.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                      title={grounding.wikipedia.title || 'Wikipedia'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    <button
                      onClick={handleUnground}
                      className="text-red-400/60 hover:text-red-400 transition-colors"
                      title="Remove grounding"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ) : isEntity ? (
              <button
                onClick={handleGround}
                disabled={wikiLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-purple-600/20 text-purple-400 border border-purple-600/30 rounded hover:bg-purple-600/30 disabled:opacity-40 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Ground
              </button>
            ) : null}
          </div>
        )}

        {/* Wikipedia overlay */}
        {showWikiOverlay && (
          <WikipediaOverlay
            results={wikiResults}
            loading={wikiLoading}
            onAccept={handleGroundAccept}
            onCancel={() => setShowWikiOverlay(false)}
          />
        )}

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
            <div className="flex items-center gap-1.5 mb-1">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Content</h3>
              {grounding?.grounded && grounding.wikipedia?.url && (
                <a
                  href={grounding.wikipedia.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors ml-auto"
                  title={`Wikipedia: ${grounding.wikipedia.title || ''}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
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
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {paginatedEdges.map((edge) => {
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
              {hasMore && (
                <button
                  onClick={() => setEdgesShown((prev) => prev + EDGES_PAGE_SIZE)}
                  className="w-full text-center text-xs text-blue-400 hover:text-blue-300 py-1 transition-colors"
                >
                  Show more ({edges.length - edgesShown} remaining)
                </button>
              )}
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
