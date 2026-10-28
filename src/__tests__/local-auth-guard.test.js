// WEB-LOCAL-AUTH-BYPASS-FU-1: a production build or a production-mode config can never select local auth.
// One explicit row table per check, no stacked each.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveLocalAuth } from '../auth/localAuth';
import { BYPASS_MARKERS, checkDistLocalAuth, checkLocalAuthMode, localAuthGuardPlugin } from '../../scripts/localAuthGuard.mjs';

const DEV_ENV = { DEV: true, PROD: false, VITE_AUTH_MODE: 'local' };
const PROD_ENV = { DEV: false, PROD: true, VITE_AUTH_MODE: 'local' };

// [case, env, hostname, enabled, refused contains, userId]
const RESOLVE_ROWS = [
  ['R1 production env on localhost is refused', PROD_ENV, 'localhost', false, 'not a dev-server build', undefined],
  ['R2 production env on a real host is refused', PROD_ENV, 'app.smartmemory.ai', false, 'not a dev-server build', undefined],
  ['R3 DEV and PROD both true is refused', { ...DEV_ENV, PROD: true }, 'localhost', false, 'not a dev-server build', undefined],
  ['R4 DEV as the string "true" is refused', { ...DEV_ENV, DEV: 'true' }, 'localhost', false, 'not a dev-server build', undefined],
  ['R5 dev server on a LAN host is refused', DEV_ENV, '192.168.1.20', false, 'not localhost', undefined],
  ['R6 dev server on a lookalike host is refused', DEV_ENV, 'localhost.evil.com', false, 'not localhost', undefined],
  ['R7 dev server on localhost is enabled', DEV_ENV, 'localhost', true, null, 'localdev'],
  ['R8 dev server on 127.0.0.1 is enabled', DEV_ENV, '127.0.0.1', true, null, 'localdev'],
  ['R9 dev server on [::1] is enabled', DEV_ENV, '[::1]', true, null, 'localdev'],
  ['R10 mode unset is off and not a refusal', { DEV: true, PROD: false }, 'localhost', false, null, undefined],
  ['R11 mode clerk is off', { ...DEV_ENV, VITE_AUTH_MODE: 'clerk' }, 'localhost', false, null, undefined],
  ['R12 custom user id is used', { ...DEV_ENV, VITE_LOCAL_AUTH_USER_ID: 'alice_2' }, 'localhost', true, null, 'alice_2'],
  ['R13 user id with a space is refused', { ...DEV_ENV, VITE_LOCAL_AUTH_USER_ID: 'a b' }, 'localhost', false, 'must match', undefined],
];

describe('resolveLocalAuth', () => {
  it.each(RESOLVE_ROWS)('%s', (_, env, hostname, enabled, refused, userId) => {
    const result = resolveLocalAuth(env, hostname);
    expect(result.enabled).toBe(enabled);
    if (refused === null) expect(result.refused).toBeNull();
    else expect(result.refused).toContain(refused);
    expect(result.userId).toBe(userId);
  });
});

// [case, command, env, throws]
const BUILD_ROWS = [
  ['B1 build with local throws', 'build', { VITE_AUTH_MODE: 'local' }, true],
  ['B2 build with padded local throws', 'build', { VITE_AUTH_MODE: ' local ' }, true],
  ['B3 dev server with local passes', 'serve', { VITE_AUTH_MODE: 'local' }, false],
  ['B4 build with clerk passes', 'build', { VITE_AUTH_MODE: 'clerk' }, false],
  ['B5 build with nothing set passes', 'build', {}, false],
];

describe('checkLocalAuthMode', () => {
  it.each(BUILD_ROWS)('%s', (_, command, env, throws) => {
    const run = () => checkLocalAuthMode({ command, env });
    if (throws) expect(run).toThrow(/VITE_AUTH_MODE=local/);
    else expect(run).not.toThrow();
  });

  it('the vite plugin refuses a local-auth build before it starts', () => {
    const plugin = localAuthGuardPlugin();
    const resolved = { command: 'build', mode: 'production', env: { VITE_AUTH_MODE: 'local' }, root: '/x', build: { outDir: 'dist' } };
    expect(() => plugin.configResolved(resolved)).toThrow(/local auth guard/);
  });
});

describe('checkDistLocalAuth', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(__dirname, 'local-auth-dist-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  // [case, file name, content, ok]
  const DIST_ROWS = [
    ['D1 clean bundle passes', 'assets/index.js', 'const a = "Bearer " + t;', true],
    ['D2 bypass prefix fails', 'assets/index.js', `const t = "${BYPASS_MARKERS[0]}x";`, false],
    ['D3 badge text fails', 'assets/chunk.mjs', `h("div", null, "${BYPASS_MARKERS[1]}")`, false],
    ['D4 marker in html fails', 'index.html', `<script>${BYPASS_MARKERS[0]}</script>`, false],
  ];

  it.each(DIST_ROWS)('%s', (_, name, content, ok) => {
    fs.mkdirSync(path.join(dir, path.dirname(name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
    expect(checkDistLocalAuth({ distDir: dir }).ok).toBe(ok);
  });
});
