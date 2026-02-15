import { describe, it, expect } from 'vitest';
import { classifyEvent, eventToNodeElement, eventToEdgeElement } from '../useGraphStream';

// --- Event Classification ---

describe('classifyEvent', () => {
  const makeEvent = (overrides = {}) => ({
    type: 'new_event',
    event_id: 'evt-1',
    timestamp: '2026-02-15T10:00:00Z',
    event_type: 'span',
    component: 'graph',
    operation: 'add_node',
    name: 'graph.add_node',
    data: { memory_id: 'node-1', label: 'Test Node' },
    trace_id: 'trace-1',
    span_id: 'span-1',
    duration_ms: 5,
    ...overrides,
  });

  it('classifies graph/add_node as node_added', () => {
    const result = classifyEvent(makeEvent());
    expect(result).not.toBeNull();
    expect(result.category).toBe('node_added');
    expect(result.nodeId).toBe('node-1');
    expect(result.label).toContain('Test Node');
  });

  it('classifies graph/add_edge as edge_added', () => {
    const result = classifyEvent(makeEvent({
      operation: 'add_edge',
      name: 'graph.add_edge',
      data: { source_id: 'a', target_id: 'b', edge_type: 'RELATES_TO' },
    }));
    expect(result.category).toBe('edge_added');
    expect(result.nodeId).toBe('a');
  });

  it('classifies graph/add_edges_bulk as edge_added', () => {
    const result = classifyEvent(makeEvent({
      operation: 'add_edges_bulk',
      data: { source_id: 'x', target_id: 'y' },
    }));
    expect(result.category).toBe('edge_added');
  });

  it('classifies graph/delete_node as node_removed', () => {
    const result = classifyEvent(makeEvent({ operation: 'delete_node' }));
    expect(result.category).toBe('node_removed');
  });

  it('classifies pipeline events as pipeline_stage', () => {
    const result = classifyEvent(makeEvent({
      component: 'pipeline',
      operation: 'classify',
      name: 'pipeline.classify',
      data: { memory_id: 'mem-1' },
      duration_ms: 12,
    }));
    expect(result.category).toBe('pipeline_stage');
    expect(result.label).toContain('classify');
    expect(result.label).toContain('12ms');
  });

  it('classifies pipeline events by name prefix when component differs', () => {
    const result = classifyEvent(makeEvent({
      component: 'other',
      operation: 'extract',
      name: 'pipeline.extract',
    }));
    expect(result.category).toBe('pipeline_stage');
  });

  it('classifies memory/search as search_highlight', () => {
    const result = classifyEvent(makeEvent({
      component: 'memory',
      operation: 'search',
      name: 'memory.search',
      data: { query: 'AI ethics', result_count: 3, result_ids: ['a', 'b', 'c'] },
    }));
    expect(result.category).toBe('search_highlight');
    expect(result.matchIds).toEqual(['a', 'b', 'c']);
    expect(result.label).toContain('3 results');
  });

  it('classifies memory/ingest as ingest_started', () => {
    const result = classifyEvent(makeEvent({
      component: 'memory',
      operation: 'ingest',
      name: 'memory.ingest',
      data: { content: 'Some content here', memory_id: 'mem-2' },
    }));
    expect(result.category).toBe('ingest_started');
    expect(result.nodeId).toBe('mem-2');
  });

  it('returns null for system_health events (unknown component)', () => {
    const result = classifyEvent(makeEvent({
      component: 'system',
      operation: 'health_check',
      name: 'system.health_check',
    }));
    expect(result).toBeNull();
  });

  it('returns null for non new_event messages', () => {
    expect(classifyEvent({ type: 'connection_ack' })).toBeNull();
    expect(classifyEvent(null)).toBeNull();
    expect(classifyEvent(undefined)).toBeNull();
  });

  it('preserves traceId and meta from raw event', () => {
    const raw = makeEvent();
    const result = classifyEvent(raw);
    expect(result.traceId).toBe('trace-1');
    expect(result.meta).toBe(raw);
  });

  it('generates fallback timestamp when raw.timestamp is missing', () => {
    const result = classifyEvent(makeEvent({ timestamp: undefined }));
    expect(result.timestamp).toBeTruthy();
    // Should be a valid ISO string
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  it('generates fallback id when event_id is missing', () => {
    const result = classifyEvent(makeEvent({ event_id: undefined }));
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe('string');
    expect(result.id.startsWith('evt-')).toBe(true);
  });

  it('generates unique fallback ids for consecutive events', () => {
    const a = classifyEvent(makeEvent({ event_id: undefined }));
    const b = classifyEvent(makeEvent({ event_id: undefined }));
    expect(a.id).not.toBe(b.id);
  });
});

// --- Element Builders ---

describe('eventToNodeElement', () => {
  it('builds a Cytoscape node from event data', () => {
    const el = eventToNodeElement({ memory_id: 'n1', memory_type: 'semantic', label: 'Test' });
    expect(el.group).toBe('nodes');
    expect(el.data.id).toBe('n1');
    expect(el.data.type).toBe('semantic');
    expect(el.data.category).toBe('memory');
    expect(el.data.label).toBe('Test');
  });

  it('classifies entity types correctly', () => {
    const el = eventToNodeElement({ memory_id: 'n2', type: 'concept', label: 'AI' });
    expect(el.data.category).toBe('entity');
  });

  it('falls back to item_id and truncated content for label', () => {
    const el = eventToNodeElement({ item_id: 'abc123456789012345', content: 'Long content that exceeds forty characters for testing' });
    expect(el.data.id).toBe('abc123456789012345');
    expect(el.data.label).toBe('Long content that exceeds forty characte');
  });

  it('returns null for missing id', () => {
    expect(eventToNodeElement({ label: 'no id' })).toBeNull();
    expect(eventToNodeElement(null)).toBeNull();
  });
});

describe('eventToEdgeElement', () => {
  it('builds a Cytoscape edge from event data', () => {
    const el = eventToEdgeElement({ source_id: 'a', target_id: 'b', edge_type: 'MENTIONS' });
    expect(el.group).toBe('edges');
    expect(el.data.source).toBe('a');
    expect(el.data.target).toBe('b');
    expect(el.data.type).toBe('MENTIONS');
    expect(el.data.id).toBe('a->b:MENTIONS');
  });

  it('defaults edge type to RELATES_TO', () => {
    const el = eventToEdgeElement({ source_id: 'x', target_id: 'y' });
    expect(el.data.type).toBe('RELATES_TO');
  });

  it('returns null for missing source or target', () => {
    expect(eventToEdgeElement({ source_id: 'a' })).toBeNull();
    expect(eventToEdgeElement({ target_id: 'b' })).toBeNull();
    expect(eventToEdgeElement(null)).toBeNull();
  });
});
