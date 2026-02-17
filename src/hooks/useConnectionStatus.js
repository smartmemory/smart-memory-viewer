import { useState, useEffect, useRef, useCallback } from 'react';
import { onConnectionChange } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:9001' : 'https://api.smartmemory.ai');

/**
 * Tracks API connection state via two signals:
 * 1. api.js request() reports success/failure on every call
 * 2. When disconnected, polls /health every 5s until recovered
 *
 * Returns { connected, checking } — bar auto-shows/hides.
 */
export function useConnectionStatus() {
  const [connected, setConnected] = useState(true);
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (mountedRef.current) setConnected(res.ok);
    } catch {
      if (mountedRef.current) setConnected(false);
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  }, []);

  // Mark disconnected externally (e.g., from App startup check)
  const markDisconnected = useCallback(() => setConnected(false), []);

  // Subscribe to connection events from api.js request()
  useEffect(() => {
    onConnectionChange((isConnected) => {
      if (mountedRef.current) setConnected(isConnected);
    });
    return () => onConnectionChange(null);
  }, []);

  // When disconnected, poll /health every 5s. When reconnected, stop.
  useEffect(() => {
    if (connected) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (!intervalRef.current) {
      intervalRef.current = setInterval(checkHealth, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [connected, checkHealth]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return { connected, checking, markDisconnected, checkHealth };
}
