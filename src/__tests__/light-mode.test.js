/**
 * UI-LIGHT-MODE-LM10-1 — the viewer's light-mode wiring.
 *
 * The viewer has no jsdom, so these read the sources as text and run the two pure pieces
 * (theme.js, the index.html embed script) directly. Pixel and contrast checks live in the
 * report's probe set (probe/shoot.mjs), not here.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appliedScheme, graphTheme } from '../lib/theme.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const css = read('src/index.css');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Declarations inside the first block whose selector line contains `selector`. */
function blockVars(selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  return [...css.slice(open, close).matchAll(/(--vw-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

describe('literal -> semantic class mapping', () => {
  // One row per mapping rule in the brief; `file` is a representative site for the rule.
  const rows = [
    { old: 'bg-slate-900', now: 'bg-vw-page', file: 'src/App.jsx' },
    { old: 'bg-slate-800', now: 'bg-vw-panel', file: 'src/components/ShareReplayButton.jsx' },
    { old: 'border-slate-700', now: 'border-vw-edge', file: 'src/components/GraphWithAsk.jsx' },
    { old: 'text-slate-100', now: 'text-vw-ink', file: 'src/App.jsx' },
    { old: 'text-slate-400', now: 'text-vw-ink-muted', file: 'src/App.jsx' },
    { old: 'text-white', now: 'text-vw-ink-strong', file: 'src/components/ShareReplayButton.jsx' },
    { old: 'from-slate-950', now: 'from-vw-hero-from', file: 'src/App.jsx' },
    { old: 'border-white/20', now: 'border-vw-edge-card', file: 'src/App.jsx' },
    { old: 'text-blue-400', now: 'text-vw-accent-ink', file: 'src/App.jsx' },
    { old: 'bg-blue-500/10', now: 'bg-vw-accent-tint', file: 'src/App.jsx' },
  ];
  it.each(rows)('$file uses $now and not $old', ({ old, now, file }) => {
    const src = read(file);
    expect(src).toContain(now);
    expect(src).not.toMatch(new RegExp(`(^|[\\s"'\`])${old.replace(/[/]/g, '\\/')}([\\s"'\`]|$)`));
  });
});

describe('--vw-* token layer in index.css', () => {
  const dark = blockVars(':root, .dark');
  const light = blockVars('.light {');
  const bridged = [...css.matchAll(/--color-(vw-[a-z0-9-]+)\s*:\s*var\((--vw-[a-z0-9-]+)\)/g)];

  it('defines tokens in both schemes', () => {
    expect(dark.length).toBeGreaterThan(20);
  });
  it('light defines exactly the tokens dark does', () => {
    expect([...light].sort()).toEqual([...dark].sort());
  });
  it('every token has a --color-vw-* utility bridge, and no bridge is orphaned', () => {
    // scrollbar vars are read directly by the ::-webkit-scrollbar rules, so they have no utility
    const direct = dark.filter((v) => v.startsWith('--vw-scroll-'));
    expect(bridged.map((m) => m[2]).sort()).toEqual(dark.filter((v) => !direct.includes(v)).sort());
    for (const v of direct) expect(css).toContain(`var(${v})`);
    for (const [, name, target] of bridged) expect(target).toBe(`--${name}`);
  });
});

describe('graph switch (theme.js)', () => {
  const rows = [
    { follows: false, scheme: 'light', out: undefined },
    { follows: false, scheme: 'dark', out: undefined },
    { follows: true, scheme: 'light', out: { mode: 'light' } },
    { follows: true, scheme: 'dark', out: { mode: 'dark' } },
  ];
  it.each(rows)('graphTheme(follows=$follows, $scheme)', ({ follows, scheme, out }) => {
    expect(graphTheme(scheme, follows)).toEqual(out);
  });

  const classRows = [
    { classes: ['light'], out: 'light' },
    { classes: ['dark'], out: 'dark' },
    { classes: [], out: 'dark' },
    { classes: ['light', 'foo'], out: 'light' },
  ];
  it.each(classRows)('appliedScheme(<html class=$classes>) is $out', ({ classes, out }) => {
    expect(appliedScheme({ classList: { contains: (c) => classes.includes(c) } })).toBe(out);
  });
});

describe('index.html embed ?theme= script', () => {
  const html = read('index.html');
  const src = html.match(/<script>(\(function\(\)\{try\{var q=[\s\S]*?)<\/script>/)[1];

  function run(search) {
    const classes = new Set(['dark']);
    const style = {};
    const documentElement = {
      style,
      classList: {
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        add: (...c) => c.forEach((x) => classes.add(x)),
      },
    };
    new Function('location', 'document', 'URLSearchParams', src)({ search }, { documentElement }, URLSearchParams);
    return { cls: [...classes], scheme: style.colorScheme };
  }

  const rows = [
    { q: '?guild_id=1&channel_id=2&theme=light', cls: ['light'], scheme: 'light' },
    { q: '?guild_id=1&channel_id=2&theme=dark', cls: ['dark'], scheme: 'dark' },
    { q: '?guild_id=1&channel_id=2&theme=pink', cls: ['dark'], scheme: undefined },
    { q: '?guild_id=1&channel_id=2', cls: ['dark'], scheme: undefined },
    // standalone launches ignore the param: the user's own choice wins
    { q: '?theme=light', cls: ['dark'], scheme: undefined },
    { q: '?guild_id=1&theme=light', cls: ['dark'], scheme: undefined },
    { q: '?channel_id=2&theme=light', cls: ['dark'], scheme: undefined },
  ];
  it.each(rows)('search "$q"', ({ q, cls, scheme }) => {
    expect(run(q)).toEqual({ cls, scheme });
  });
});

describe('palette-literal census over src', () => {
  // Coloured fills that are brand-blue on purpose (white text on blue-600 passes AA in both schemes).
  const allow = [
    { file: 'src/App.jsx', literal: 'bg-blue-600 hover:bg-blue-500 text-white' },
    { file: 'src/App.jsx', literal: 'border-blue-500' },
  ];
  const pattern =
    /\b(?:bg|text|border|from|via|to|ring|fill|stroke|shadow|divide|outline)-(?:slate|gray|zinc|neutral|stone|red|emerald|green|amber|yellow|orange|rose)-\d{2,3}|\b(?:bg|text|border)-(?:white|black)\b|border-white\/|#[0-9a-fA-F]{3,8}\b/g;
  const files = walk(join(root, 'src')).filter((f) => /\.(jsx?|css)$/.test(f) && !f.includes('__tests__'));

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(5);
  });
  it('finds no stray palette literal outside the allowlist', () => {
    const hits = [];
    for (const f of files) {
      if (f.endsWith('index.css')) continue; // the token layer is where literals live
      let text = readFileSync(f, 'utf8');
      const rel = f.slice(root.length);
      for (const a of allow) if (a.file === rel) text = text.split(a.literal).join('');
      for (const m of text.matchAll(pattern)) hits.push(`${rel}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });
});
