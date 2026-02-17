import { useState, useEffect } from 'react';
import { GraphExplorer, createFetchAdapter, useConnectionStatus } from '@smartmemory/graph';
import '@smartmemory/graph/src/graph.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:9001' : 'https://api.smartmemory.ai');
const WS_URL = import.meta.env.VITE_WS_URL || (import.meta.env.DEV ? 'ws://localhost:9003/events' : 'wss://api.smartmemory.ai/ws/insights');

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authState, setAuthState] = useState({ token: null, teamId: null });
  const connection = useConnectionStatus({
    healthUrl: `${API_URL}/health`,
  });

  useEffect(() => {
    // Check URL params for OAuth callback (token + team from API's /auth/google/callback)
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('token');

    if (callbackToken) {
      localStorage.setItem('sm_token', callbackToken);
      const callbackTeam = params.get('team');
      if (callbackTeam) {
        localStorage.setItem('sm_team_id', callbackTeam);
      } else {
        try {
          const payload = JSON.parse(atob(callbackToken.split('.')[1]));
          if (payload.tenant_id) {
            const suffix = payload.tenant_id.split('_')[1] || payload.tenant_id;
            localStorage.setItem('sm_team_id', `team_${suffix}`);
          }
        } catch { /* JWT decode failed */ }
      }
      window.history.replaceState({}, '', window.location.pathname);
    }

    const token = localStorage.getItem('sm_token');
    let teamId = localStorage.getItem('sm_team_id');
    if (!teamId) {
      const legacy = localStorage.getItem('sm_workspace_id');
      if (legacy) {
        teamId = legacy;
        localStorage.setItem('sm_team_id', legacy);
        localStorage.removeItem('sm_workspace_id');
      }
    }

    if (token && teamId) {
      fetch(`${API_URL}/memory/list?limit=1`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
      })
        .then((res) => {
          if (res.ok) {
            setAuthenticated(true);
            setAuthState({ token, teamId });
          } else if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('sm_token');
            localStorage.removeItem('sm_team_id');
            setError('Session expired — please sign in again');
          } else {
            setAuthenticated(true);
            setAuthState({ token, teamId });
            connection.markDisconnected();
          }
        })
        .catch(() => {
          setAuthenticated(true);
          setAuthState({ token, teamId });
          connection.markDisconnected();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

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
    return <LoginScreen error={error} />;
  }

  const handleLogout = () => {
    localStorage.removeItem('sm_token');
    localStorage.removeItem('sm_team_id');
    window.location.reload();
  };

  // Create the fetch adapter with current auth credentials
  const adapter = createFetchAdapter({
    apiUrl: API_URL,
    getToken: () => authState.token,
    getTeamId: () => authState.teamId,
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
        wsToken={authState.token}
      />
    </>
  );
}

function LoginScreen({ error: initialError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initialError || null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail || 'Sign in failed');
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      const token = data.tokens?.access_token;
      const teamId = data.user?.default_team_id;

      if (!token || !teamId) {
        setError('Unexpected response — missing token or team');
        setSubmitting(false);
        return;
      }

      localStorage.setItem('sm_token', token);
      localStorage.setItem('sm_team_id', teamId);
      if (data.tokens?.refresh_token) {
        localStorage.setItem('sm_refresh_token', data.tokens.refresh_token);
      }
      window.location.reload();
    } catch {
      setError('Cannot reach SmartMemory API');
      setSubmitting(false);
    }
  };

  const handleGoogle = () => {
    const callbackUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${API_URL}/auth/google/login?frontend_callback=${callbackUrl}`;
  };

  return (
    <div className="flex items-center justify-center h-screen bg-slate-900">
      <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl border border-slate-700">
        <h1 className="text-2xl font-bold text-slate-100 mb-2">SmartMemory Graph Viewer</h1>
        <p className="text-slate-400 mb-6">Explore your knowledge graph</p>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={!email || !password || submitting}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            {submitting ? 'Signing in...' : 'Continue'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          New here? Just enter your email and password — we'll create your free account automatically.
        </p>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-slate-800 text-slate-500">or</span>
          </div>
        </div>

        <button
          onClick={handleGoogle}
          className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}

export default App;
