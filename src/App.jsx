import { useState, useEffect, useRef } from 'react';
import { GraphExplorer, createFetchAdapter, useConnectionStatus } from '@smartmemory/graph';
import { SignIn, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { CLERK_APPEARANCE, exchangeClerkSession } from '@smartmemory/sdk-js';
import { useSmartMemory } from '@smartmemory/sdk-js/react';
import '@smartmemory/graph/src/graph.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:9001' : 'https://api.smartmemory.ai');
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  import.meta.env.VITE_INSIGHTS_WS_URL ||
  (import.meta.env.DEV
    ? 'ws://localhost:9003/events'
    : 'wss://api.insights.smartmemory.ai/events');
const REDIRECT_LOCK_KEY = 'sm_sso_redirect_lock';
const REDIRECT_INFLIGHT_KEY = 'sm_sso_redirecting';
const CALLBACK_ERROR = (() => {
  const raw = new URLSearchParams(window.location.search).get('error');
  return raw ? `Authentication failed: ${raw}` : null;
})();

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(!CALLBACK_ERROR);
  const [error, setError] = useState(CALLBACK_ERROR);
  const initOnceRef = useRef(false);
  const client = useSmartMemory();
  const connection = useConnectionStatus({
    healthUrl: `${API_URL}/health`,
  });

  useEffect(() => {
    if (initOnceRef.current) return;
    initOnceRef.current = true;

    if (CALLBACK_ERROR) {
      return;
    }

    client.auth.bootstrapSession().then(ok => {
      setAuthenticated(ok);
    }).finally(() => setLoading(false));
  }, [client]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Connecting to SmartMemory...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPanel error={error} setAuthenticated={setAuthenticated} setError={setError} />;
  }

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // best effort
    }
    await client.auth.logout();
    window.location.replace('/?reset=1');
  };

  const adapter = createFetchAdapter({
    apiUrl: API_URL,
    getToken: () => client.auth.getCurrentToken(),
    getTeamId: () => client.auth.tokenManager.getTeamId(),
  });

  return (
    <>
      {!connection.connected && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 border-b border-red-700 px-4 py-1.5 flex items-center justify-center gap-2 text-red-200 text-xs">
          <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
          API unreachable — reconnecting{connection.checking ? '...' : ''}
        </div>
      )}
      <GraphExplorer
        adapter={adapter}
        wsUrl={WS_URL}
        wsToken={client.auth.getCurrentToken()}
        toolbarRightActions={(
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout"
            title="Logout"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 17l5-5-5-5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3" />
            </svg>
          </button>
        )}
        className="h-screen w-screen"
      />
    </>
  );
}

function LoginPanel({ error: initialError, setAuthenticated, setError }) {
  const [error, setLocalError] = useState(initialError || null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const client = useSmartMemory();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isLoaded && isSignedIn && params.get('reset') === '1') {
      void signOut({ redirectUrl: `${window.location.origin}/` });
    }
  }, [isLoaded, isSignedIn, signOut]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isLoaded || !isSignedIn) return;
      setBootstrapping(true);
      setLocalError(null);
      try {
        const { response: resp } = await exchangeClerkSession({
          apiBaseUrl: API_URL,
          getToken,
        });
        const token = resp.headers.get('x-sm-access-token');
        const teamId = resp.headers.get('x-sm-team-id');
        if (!token || !teamId) throw new Error('Missing SmartMemory session headers');
        client.auth.tokenManager.setAccessToken(token);
        client.auth.tokenManager.setTeamId(teamId);
        client.auth.currentToken = token;
        client.auth.notifyListeners();
        setAuthenticated(true);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          const msg = e?.message || 'Sign-in failed';
          setLocalError(msg);
          setError(msg);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken, setAuthenticated, setError, client]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl border border-slate-700">
          <h1 className="text-2xl font-bold text-slate-100 mb-2">SmartMemory Graph Viewer</h1>
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-red-300 text-sm">
            {error}
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem(REDIRECT_LOCK_KEY);
              sessionStorage.removeItem(REDIRECT_INFLIGHT_KEY);
              setLocalError(null);
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/20 bg-slate-900/80 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-lg bg-blue-500/10 p-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8a3 3 0 0 1 5-2 3 3 0 0 1 5 2v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2 3 3 0 0 1-5-2v-1a3 3 0 0 1 0-6V8z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to SmartMemory</h1>
          <p className="mt-2 text-gray-400">
            {bootstrapping ? 'Finalizing sign-in...' : 'Sign in to your cognitive architecture'}
          </p>
        </div>
        <SignIn path="/" routing="path" appearance={CLERK_APPEARANCE} />
      </div>
    </div>
  );
}

export default App;
