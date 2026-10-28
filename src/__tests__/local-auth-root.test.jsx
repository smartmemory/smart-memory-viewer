// WEB-LOCAL-AUTH-BYPASS-FU-1: local mode never mounts Clerk, installs the dev-bypass bearer, shows the badge and
// skips the Clerk exchange. One explicit row table per check, no stacked each.
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom is not a viewer dependency: take the copy the sibling SDK checkout ships (as session-recovery.test.jsx does,
// but resolved through the installed symlink so it also works from a worktree).
const sdkDir = realpathSync(fileURLToPath(new URL('../../node_modules/@smartmemory/sdk-js', import.meta.url)));
const { JSDOM } = createRequire(`${sdkDir}/`)('jsdom');

const state = vi.hoisted(() => ({
  clerkHook: vi.fn(),
  render: vi.fn(),
  stubRoot: false,
  client: null,
  ClerkProvider: ({ children }) => children,
  SmartMemoryProvider: ({ children }) => children,
}));
vi.mock('@clerk/clerk-react', () => ({
  ClerkProvider: state.ClerkProvider,
  SignIn: () => null,
  useAuth: (...args) => { state.clerkHook(...args); return { isLoaded: true, isSignedIn: false, getToken: async () => null, signOut: async () => {} }; },
}));
vi.mock('@smartmemory/sdk-js/react', () => ({ useSmartMemory: () => state.client, SmartMemoryProvider: state.SmartMemoryProvider }));
vi.mock('react-dom/client', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, createRoot: (el) => (state.stubRoot ? { render: state.render } : original.createRoot(el)) };
});
vi.mock('../App', () => ({ default: () => null }));
vi.mock('../EmbeddedApp', () => ({ default: () => null }));

let dom;
// resetModules gives every test one fresh React; the tree and the modules under test must share it.
async function fresh() {
  vi.resetModules();
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { AuthCore } = await import('@smartmemory/sdk-js');
  state.client = { auth: new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'http://localhost:9001' }) };
  return { React, createRoot };
}

function elementTypes(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((child) => elementTypes(child, out)); return out; }
  if (node.type) out.push(node.type);
  elementTypes(node.props?.children, out);
  return out;
}

beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5178' });
  for (const name of ['window', 'document', 'location', 'sessionStorage', 'localStorage']) vi.stubGlobal(name, dom.window[name]);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.clerkHook.mockClear();
  state.render.mockClear();
  state.stubRoot = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  dom.window.close();
});

async function mount(createRoot, element) {
  const { act } = await import('react');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return { container, unmount: () => act(() => root.unmount()) };
}

// [case, VITE_AUTH_MODE, local enabled, Clerk hook called, signed in]
const IDENTITY_ROWS = [
  ['I1 local mode: signed in with no Clerk hook call', 'local', true, false, true],
  ['I2 mode unset: the Clerk hook is the identity', undefined, false, true, false],
  ['I3 mode clerk: the Clerk hook is the identity', 'clerk', false, true, false],
];

describe('useIdentityAuth', () => {
  it.each(IDENTITY_ROWS)('%s', async (_, mode, enabled, clerkCalled, signedIn) => {
    vi.stubEnv('VITE_AUTH_MODE', mode ?? '');
    const { React, createRoot } = await fresh();
    const { LOCAL_AUTH, useIdentityAuth } = await import('../auth/identity');
    let seen;
    function Probe() { seen = useIdentityAuth(); return null; }
    const { unmount } = await mount(createRoot, React.createElement(Probe));
    expect(LOCAL_AUTH.enabled).toBe(enabled);
    expect(state.clerkHook.mock.calls.length > 0).toBe(clerkCalled);
    expect(seen.isSignedIn).toBe(signedIn);
    unmount();
  });
});

// [case, user id, installed bearer]
const ROOT_ROWS = [
  ['R1 default identity', 'localdev', 'dev-bypass-localdev'],
  ['R2 custom identity', 'alice_2', 'dev-bypass-alice_2'],
];

describe('LocalAuthRoot', () => {
  it.each(ROOT_ROWS)('%s', async (_, userId, bearer) => {
    const { React, createRoot } = await fresh();
    const { default: LocalAuthRoot } = await import('../auth/LocalAuthRoot');
    const { container, unmount } = await mount(createRoot, React.createElement(LocalAuthRoot, { userId },
      React.createElement('span', { 'data-testid': 'app' })));
    expect(container.querySelector('[data-testid="app"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="local-auth-badge"]')).not.toBeNull();
    expect(state.client.auth.currentToken).toBe(bearer);
    expect(state.client.auth.getAuthHeaders().Authorization).toBe(`Bearer ${bearer}`);
    unmount();
  });
});

// The real entry point: the element tree handed to React has no ClerkProvider in local mode.
// [case, VITE_AUTH_MODE, ClerkProvider in the tree, lazy LocalAuthRoot in the tree]
const ENTRY_ROWS = [
  ['E1 local mode: no ClerkProvider, local root present', 'local', false, true],
  ['E2 mode unset: ClerkProvider, no local root', undefined, true, false],
];

describe('main.jsx entry', () => {
  it.each(ENTRY_ROWS)('%s', async (_, mode, clerk, local) => {
    vi.stubEnv('VITE_AUTH_MODE', mode ?? '');
    vi.stubEnv('VITE_ALLOW_EMBEDDED', 'false');
    await fresh();
    state.stubRoot = true;
    await import('../main.jsx');
    expect(state.render).toHaveBeenCalledOnce();
    const types = elementTypes(state.render.mock.calls[0][0]);
    expect(types.includes(state.ClerkProvider)).toBe(clerk);
    expect(types.some((type) => type?.$$typeof === Symbol.for('react.lazy'))).toBe(local);
  });
});
