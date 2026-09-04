/**
 * Turning a clicked ask row into a focused graph element (DIST-LITE-9).
 *
 * Kept out of GraphWithAsk.jsx so that file exports only a component (the viewer's
 * react-refresh lint rule), and so the mapping can be tested without a DOM.
 */

/**
 * Which graph element id a clicked ask row should focus.
 *
 * Evidence rows already name a node. Relation rows name an EDGE, which GraphExplorer's
 * hash-restore path cannot handle — it feeds whatever the hash names into the node-click
 * handler — so they resolve to the relation's source entity, or its target when the
 * server sent no source id. Returns null when there is nothing addressable, so nothing is
 * focused rather than the wrong thing.
 *
 * @param {string} id - The id AskPanel passed (item id, or `src->tgt:type` edge id).
 * @param {{kind?: string, sourceId?: string, targetId?: string}} [meta]
 * @returns {string|null}
 */
export function askSelectionTarget(id, meta) {
  if (meta?.kind === 'relation') return meta.sourceId || meta.targetId || null;
  return id || null;
}

/**
 * Set `selected=<target>` in an existing location hash, preserving the other view state
 * GraphExplorer stores there (layout, filters, zoom, pan, asof).
 *
 * @param {string} currentHash - `window.location.hash`, with or without the leading '#'.
 * @param {string} target - Graph element id to select.
 * @returns {string} The new hash, leading '#' included.
 */
export function applyFocusHash(currentHash, target) {
  const params = new URLSearchParams((currentHash || '').replace(/^#/, ''));
  params.set('selected', target);
  return `#${params.toString()}`;
}
