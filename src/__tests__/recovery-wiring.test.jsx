// WEB-BLANK-AFTER-IDLE-1 smoke: the entry point wires the shared recovery module, and its boundary turns a
// render crash into a Reload card instead of an empty root (the blank tab).
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecoveryBoundary } from '@smartmemory/sdk-js/react/recovery';


describe('recovery wiring', () => {
  it('main.jsx wires the shared recovery module', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.jsx'), 'utf8');
    expect(main).toContain("from '@smartmemory/sdk-js/react/recovery'");
    expect(main).toContain('<RecoveryBoundary app="viewer">');
  });

  it('a render crash shows the Reload card, not an empty root', () => {
    // viewer tests run in node (no DOM): drive the boundary's own error path and render its output to HTML.
    const boundary = new RecoveryBoundary({ app: 'viewer', children: null });
    const err = new TypeError("Cannot read properties of undefined (reading 'toLocaleString')");
    boundary.state = { ...boundary.state, ...RecoveryBoundary.getDerivedStateFromError(err) };
    const html = renderToString(boundary.render());
    expect(html).toContain('Something went wrong on this page.');
    expect(html).toContain('Reload');
  });
});
