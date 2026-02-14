import { useState, useEffect } from 'react';
import GraphExplorer from './components/GraphExplorer';
import { setAuth } from './lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.smartmemory.ai';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check URL params for SSO callback token
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('token');
    const callbackWorkspace = params.get('workspace_id');

    if (callbackToken) {
      localStorage.setItem('sm_token', callbackToken);
      if (callbackWorkspace) localStorage.setItem('sm_workspace_id', callbackWorkspace);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    const token = localStorage.getItem('sm_token');
    const workspaceId = localStorage.getItem('sm_workspace_id');

    if (token && workspaceId) {
      setAuth(token, workspaceId);
      // Verify token with a health check
      fetch(`${API_URL}/health`)
        .then((res) => {
          if (res.ok) {
            setAuthenticated(true);
          } else {
            setError('API unavailable');
          }
        })
        .catch(() => setError('Cannot reach SmartMemory API'))
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

  return <GraphExplorer />;
}

function LoginScreen({ error }) {
  const [token, setToken] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (token && workspaceId) {
      localStorage.setItem('sm_token', token);
      localStorage.setItem('sm_workspace_id', workspaceId);
      window.location.reload();
    }
  };

  const handleSSO = () => {
    const returnUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${import.meta.env.VITE_WEB_URL || 'https://app.smartmemory.ai'}/auth/sso?redirect=${returnUrl}`;
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

        <button
          onClick={handleSSO}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-lg mb-6 transition-colors"
        >
          Sign in with SmartMemory
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-slate-800 text-slate-500">or use API key</span>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">API Key or JWT Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk_... or eyJ..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Workspace ID</label>
            <input
              type="text"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="ws_..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={!token || !workspaceId}
            className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
