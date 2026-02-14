export const MEMORY_COLORS = {
  memory: '#f59e0b',
  semantic: '#f59e0b',
  episodic: '#f97316',
  procedural: '#ef4444',
  working: '#fb923c',
  zettel: '#eab308',
  decision: '#f59e0b',
  reasoning: '#d97706',
  opinion: '#ea580c',
  observation: '#dc2626',
};

export const ENTITY_COLORS = {
  concept: '#3b82f6',
  person: '#f472b6',
  organization: '#8b5cf6',
  location: '#10b981',
  event: '#6366f1',
  tool: '#06b6d4',
  skill: '#14b8a6',
  technology: '#0ea5e9',
  temporal: '#a855f7',
  activity: '#84cc16',
  category: '#8b5cf6',
  work_of_art: '#d946ef',
  product: '#06b6d4',
};

export const SPECIAL_COLORS = {
  grounding: '#9ca3af',
  default: '#94a3b8',
};

export const NODE_SIZES = { memory: 14, entity: 8, grounding: 8 };

export function getNodeColor(type, category) {
  // category is 'memory', 'entity', or 'grounding'
  // type is the specific subtype
  if (category === 'memory' || MEMORY_COLORS[type]) return MEMORY_COLORS[type] || MEMORY_COLORS.memory;
  if (ENTITY_COLORS[type]) return ENTITY_COLORS[type];
  if (SPECIAL_COLORS[type]) return SPECIAL_COLORS[type];
  return SPECIAL_COLORS.default;
}

export function getNodeSize(category) {
  return NODE_SIZES[category] || NODE_SIZES.entity;
}

// Export all known types for filter panels
export const ALL_MEMORY_TYPES = Object.keys(MEMORY_COLORS);
export const ALL_ENTITY_TYPES = Object.keys(ENTITY_COLORS);

// Set of actual memory types (excludes 'memory' which is just a fallback color key)
export const MEMORY_TYPE_SET = new Set(ALL_MEMORY_TYPES.filter((t) => t !== 'memory'));
