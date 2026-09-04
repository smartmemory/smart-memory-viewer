/**
 * DIST-LITE-9 — how a clicked ask row becomes a focused graph element.
 *
 * The viewer has no jsdom, so the click itself is not simulated here; what is pinned is
 * the mapping the click performs, which is the part that can silently focus the wrong
 * element. Rendering and the callback firing are covered in @smartmemory/graph's
 * askPanel.test.js.
 */

import { describe, expect, it } from 'vitest';
import { applyFocusHash, askSelectionTarget } from '../lib/askFocus.js';

describe('askSelectionTarget', () => {
  it('an evidence row focuses the memory item itself', () => {
    expect(askSelectionTarget('mem_amulet', { kind: 'evidence' })).toBe('mem_amulet');
  });

  it('a relation row focuses the source entity, not the edge id', () => {
    const target = askSelectionTarget('ent_zed->ent_xavier:distrusts', {
      kind: 'relation',
      sourceId: 'ent_zed',
      targetId: 'ent_xavier',
    });

    // GraphExplorer's hash-restore path feeds whatever the hash names into the
    // node-click handler, so an edge id there would open a detail panel on an edge.
    expect(target).toBe('ent_zed');
  });

  it('falls back to the target entity when no source id came back', () => {
    expect(askSelectionTarget('e', { kind: 'relation', targetId: 'ent_yara' })).toBe('ent_yara');
  });

  it('focuses nothing rather than something wrong when there is no addressable id', () => {
    expect(askSelectionTarget('e', { kind: 'relation' })).toBeNull();
    expect(askSelectionTarget('', { kind: 'evidence' })).toBeNull();
  });
});

describe('applyFocusHash', () => {
  it('sets selected on an empty hash', () => {
    expect(applyFocusHash('', 'mem_1')).toBe('#selected=mem_1');
  });

  it('preserves the other view state already in the hash', () => {
    const next = applyFocusHash('#layout=cola&zoom=1.20', 'mem_1');
    const params = new URLSearchParams(next.slice(1));

    expect(params.get('layout')).toBe('cola');
    expect(params.get('zoom')).toBe('1.20');
    expect(params.get('selected')).toBe('mem_1');
  });

  it('replaces a previous selection instead of appending a second one', () => {
    const next = applyFocusHash('#selected=old', 'new');
    expect(new URLSearchParams(next.slice(1)).getAll('selected')).toEqual(['new']);
  });
});
