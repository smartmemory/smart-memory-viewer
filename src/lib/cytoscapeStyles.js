import { MEMORY_COLORS, ENTITY_COLORS, SPECIAL_COLORS } from './graphColors';

export function getCytoscapeStyles() {
  const styles = [
    // Base node style
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'font-size': '10px',
        color: '#cbd5e1', // slate-300
        'text-outline-width': 2,
        'text-outline-color': '#0f172a', // slate-900
        'background-color': '#94a3b8', // default
        width: 16,
        height: 16,
        'border-width': 0,
        'text-max-width': '100px',
        'text-wrap': 'ellipsis',
      },
    },
    // Selected node
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': '#f8fafc', // slate-50
        'border-opacity': 1,
        width: 24,
        height: 24,
        'font-size': '12px',
        'font-weight': 'bold',
        'z-index': 999,
      },
    },
    // Highlighted node (search match, path node)
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 3,
        'border-color': '#fbbf24', // amber-400
        width: 22,
        height: 22,
      },
    },
    // Dimmed node (filtered out visually)
    {
      selector: 'node.dimmed',
      style: {
        opacity: 0.15,
      },
    },
    // Neighbor of selected
    {
      selector: 'node.neighbor',
      style: {
        'border-width': 2,
        'border-color': '#60a5fa', // blue-400
        opacity: 1,
      },
    },
    // Base edge style
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': '#475569', // slate-600
        'target-arrow-color': '#475569',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        opacity: 0.6,
        label: 'data(label)',
        'font-size': '8px',
        color: '#64748b', // slate-500
        'text-outline-width': 1,
        'text-outline-color': '#0f172a',
        'text-rotation': 'autorotate',
      },
    },
    // Selected edge
    {
      selector: 'edge:selected',
      style: {
        width: 2,
        'line-color': '#f8fafc',
        'target-arrow-color': '#f8fafc',
        opacity: 1,
      },
    },
    // Highlighted edge (path)
    {
      selector: 'edge.highlighted',
      style: {
        width: 3,
        'line-color': '#fbbf24',
        'target-arrow-color': '#fbbf24',
        opacity: 1,
        'z-index': 999,
      },
    },
    // Dimmed edge
    {
      selector: 'edge.dimmed',
      style: {
        opacity: 0.08,
      },
    },
  ];

  // Add per-type node color styles for memory types
  for (const [type, color] of Object.entries(MEMORY_COLORS)) {
    styles.push({
      selector: `node[type="${type}"]`,
      style: { 'background-color': color, width: 28, height: 28 },
    });
  }

  // Add per-type node color styles for entity types
  for (const [type, color] of Object.entries(ENTITY_COLORS)) {
    styles.push({
      selector: `node[type="${type}"]`,
      style: { 'background-color': color, width: 16, height: 16 },
    });
  }

  // Grounding nodes
  styles.push({
    selector: 'node[category="grounding"]',
    style: { 'background-color': SPECIAL_COLORS.grounding, width: 16, height: 16 },
  });

  return styles;
}
