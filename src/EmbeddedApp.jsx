/**
 * EmbeddedApp — Discord Activity boot path (discord-bot FEAT-6).
 *
 * Replaces the Clerk-SSO authentication flow with a server-side claim
 * handshake against discord-bot's /api/graph/claim. The claim handler
 * sets a SameSite=None; Secure; HttpOnly; Partitioned session cookie
 * on /api/sm/*, after which all subsequent fetch + SSE calls flow
 * natively cookie-auth'd.
 *
 * Why it's separate from App.jsx:
 *   - App.jsx assumes Clerk. This path deliberately has no Clerk dep.
 *   - Authentication happens once at boot, not via a user sign-in button.
 *   - Scope (channel vs guild) is dictated by discord-bot, not the user.
 *
 * Expected launch context (query params, supplied by Discord):
 *   guild_id    — Discord guild the Activity was launched in
 *   channel_id  — voice channel hosting the Activity
 *   instance_id — unique per Activity session (correlation only)
 *
 * Build flag:
 *   VITE_ALLOW_EMBEDDED=true  (set by the sanctuary deploy pipeline)
 */

import { useEffect, useMemo, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { GraphExplorer, createFetchAdapter, useConnectionStatus } from '@smartmemory/graph';
import '@smartmemory/graph/src/graph.css';

// Activity iframe is served behind <clientId>.discordsays.com; all fetches are same-origin.
// Absolute URLs are not needed — and leak the Hetzner host into the bundle.
const GRAPH_API = '/api/graph';
// SmartMemory API lives at the same origin (Caddy forwards /memory/*
// and /api/* to svc-api). The viewer adapter appends paths like
// '/memory/graph/full' — with an empty apiUrl they hit the origin root,
// which Caddy routes correctly. Matches studio.smartmemory.ai pattern.
const SM_API = '';

function readLaunchParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    guild_id: p.get('guild_id') ?? '',
    channel_id: p.get('channel_id') ?? '',
    instance_id: p.get('instance_id') ?? '',
  };
}

/**
 * Run the claim handshake against discord-bot.
 * On success, the session cookie is set and the envelope is returned.
 * On failure, throws an Error with a user-friendly message.
 */
async function claim({ accessToken, guildId, channelId, instanceId }) {
  const res = await fetch(`${GRAPH_API}/claim`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      discord_access_token: accessToken,
      guild_id: guildId,
      channel_id: channelId,
      instance_id: instanceId,
    }),
  });
  if (res.status === 404) {
    throw new Error("No pending launch found — re-run /graph in Discord.");
  }
  if (res.status === 401) {
    throw new Error("Authentication failed — re-run /graph in Discord.");
  }
  if (res.status === 503) {
    throw new Error("Discord is temporarily unavailable. Try again in a minute.");
  }
  if (!res.ok) {
    throw new Error(`Claim failed: ${res.status}`);
  }
  return res.json();
}

function EmbeddedApp() {
  const [state, setState] = useState({ kind: 'booting' });

  useEffect(() => {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) {
      setState({ kind: 'error', message: 'VITE_DISCORD_CLIENT_ID is not configured on the viewer build.' });
      return;
    }

    const launch = readLaunchParams();
    if (!launch.guild_id || !launch.channel_id) {
      setState({ kind: 'error', message: 'Missing Discord launch params. Launch this Activity through /graph in Discord.' });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const sdk = new DiscordSDK(clientId);
        await sdk.ready();

        // Three-step Activity OAuth:
        //   1. authorize()       → authorization code
        //   2. backend exchange  → access_token (using the app's client_secret)
        //   3. authenticate()    → completes the SDK handshake
        // RPC OAuth flow: Discord rejects redirect_uri in authorize (RPC
        // routes back via postMessage, not an HTTP redirect). The server
        // side of the token exchange also must NOT supply redirect_uri
        // because there was none in the authorize.
        const { code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify'],
        });
        if (cancelled) return;

        const exchangeRes = await fetch(`${GRAPH_API}/oauth-exchange`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (exchangeRes.status === 401) {
          throw new Error('Discord rejected the authorization code. Try /graph again.');
        }
        if (!exchangeRes.ok) {
          throw new Error(`OAuth exchange failed: ${exchangeRes.status}`);
        }
        const { access_token: accessToken } = await exchangeRes.json();

        await sdk.commands.authenticate({ access_token: accessToken });
        if (cancelled) return;

        const envelope = await claim({
          accessToken,
          guildId: launch.guild_id,
          channelId: launch.channel_id,
          instanceId: launch.instance_id,
        });
        if (cancelled) return;

        setState({ kind: 'ready', envelope, sdk });
      } catch (err) {
        if (cancelled) return;
        setState({ kind: 'error', message: err.message ?? 'Failed to initialize the Activity.' });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const connection = useConnectionStatus({ healthUrl: `${SM_API}/health` });

  // Cookie-auth'd adapter — sm_access_token cookie resolves the caller to
  // the sanctuary service account; X-Workspace-Id pins the shared workspace.
  const adapter = useMemo(() => createFetchAdapter({
    apiUrl: SM_API,
    getToken: () => null,
    getTeamId: () => 'sanctuary-default',
    credentials: 'include',
  }), []);

  if (state.kind === 'booting') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Opening the SmartMemory graph…</p>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 p-6">
        <div className="max-w-md bg-slate-800 border border-red-900 rounded-xl p-6 text-slate-200">
          <h1 className="text-lg font-semibold mb-2">Couldn't open the graph</h1>
          <p className="text-sm text-slate-400">{state.message}</p>
        </div>
      </div>
    );
  }

  const scopePrefixSearchParam = `scope_prefix=${encodeURIComponent(state.envelope.scope_prefix)}`;

  return (
    <>
      {!connection.connected && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 border-b border-red-700 px-4 py-1.5 flex items-center justify-center gap-2 text-red-200 text-xs">
          <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
          SmartMemory unreachable — reconnecting{connection.checking ? '…' : ''}
        </div>
      )}
      <GraphExplorer
        adapter={adapter}
        // The SmartMemory SSE stream is scope_prefix-filtered; focus is optional.
        sseBaseUrl={SM_API}
        extraQuery={scopePrefixSearchParam}
        focusNodeId={state.envelope.focus ?? undefined}
        // Discord viewport is cramped and Delete is too risky here — power tools
        // (Move/Isolate/Delete) stay in the full viewer.
        hideSelectionToolbar
        className="h-screen w-screen"
      />
    </>
  );
}

export default EmbeddedApp;
