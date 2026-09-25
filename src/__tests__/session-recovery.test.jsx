import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from '../../../smart-memory-sdk-js/node_modules/jsdom/lib/api.js';
import { AuthCore } from '@smartmemory/sdk-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ client: null, props: null, subscriptions: [] }));
vi.mock('@smartmemory/sdk-js/react', () => ({ useSmartMemory: () => state.client }));
vi.mock('@clerk/clerk-react', () => ({ SignIn: () => null, useAuth: () => ({ isLoaded: true, isSignedIn: false }) }));
vi.mock('../components/GraphWithAsk', () => ({ default: (props) => { state.props = props; return <div>Graph</div>; } }));
vi.mock('@smartmemory/sdk-js/progress', () => ({ subscribeProgress: (options) => {
  const sub = { options, close: vi.fn() }; state.subscriptions.push(sub); return sub;
} }));
let dom, root, App;
beforeEach(async () => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:9001');
  dom = new JSDOM('<div id="root"></div>', { url: 'https://viewer.test' });
  for (const name of ['window', 'document', 'sessionStorage', 'localStorage']) vi.stubGlobal(name, dom.window[name]);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'http://localhost:9001' });
  auth.bootstrapSession = vi.fn(async () => {
    auth.currentUser = { id: 'user' }; auth.tokenManager.setWorkspaceId('ws'); auth.notifyListeners(); return true;
  });
  state.client = { auth, connection: auth.connection }; state.subscriptions = []; state.props = null;
  App = (await import('../App.jsx')).default;
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(createElement(App)));
});
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('wires cookie-only auth to main graph and side stream; rebuilds scope and closes on sign-out', async () => {
  expect(state.props.explorerProps.auth).toBe(state.client.auth);
  expect(state.props.explorerProps.sseBaseUrl).toBe('http://localhost:9001');
  expect(state.props.explorerProps.workspaceId).toBe('ws');
  expect(state.props.explorerProps).not.toHaveProperty('sseToken');
  const first = state.subscriptions.at(-1);
  expect(first.options.auth).toBe(state.client.auth);
  await act(async () => { state.client.auth.tokenManager.setWorkspaceId('other'); state.client.auth.notifyListeners(); });
  expect(first.close).toHaveBeenCalledOnce();
  expect(state.props.explorerProps.workspaceId).toBe('other');
  const last = state.subscriptions.at(-1);
  await act(async () => state.client.auth.clearLocalAuth());
  expect(last.close).toHaveBeenCalledOnce();
  expect(document.body.textContent).not.toContain('Graph');
});
it('injects SDK request recovery into the actual graph adapter', async () => {
  const fetchFn = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(new Response('{"access_token":"fresh"}'))
    .mockResolvedValueOnce(new Response('{"nodes":[]}'));
  // createAuthFetch resolves global fetch at invocation; refresh uses the same raw transport.
  vi.stubGlobal('fetch', fetchFn);
  await act(async () => { expect(await state.props.adapter.getFullGraph()).toEqual({ nodes: [] }); });
  expect(fetchFn).toHaveBeenCalledTimes(3);
  expect(String(fetchFn.mock.calls[1][0])).toContain('/auth/refresh');
  expect(new Headers(fetchFn.mock.calls[2][1].headers).get('Authorization')).toBe('Bearer fresh');
});
it('shows SDK reconnecting until that source recovers and preserves terminal stream errors', async () => {
  await act(async () => state.client.connection.report('stream', 'offline'));
  expect(document.querySelector('[role="status"]').textContent).toContain('Reconnecting');
  await act(async () => state.client.connection.report('/health', null));
  expect(document.querySelector('[role="status"]').textContent).toContain('Reconnecting');
  await act(async () => state.client.connection.report('stream', null));
  expect(document.querySelector('[role="status"]')).toBeNull();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => state.subscriptions.at(-1).options.onError(new Error('HTTP 403')));
  expect(document.querySelector('[role="status"]').textContent).toBe('HTTP 403');
});
