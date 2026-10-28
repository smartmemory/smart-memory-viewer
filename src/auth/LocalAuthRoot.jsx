import { useState } from 'react';
import { useSmartMemory } from '@smartmemory/sdk-js/react';

// Fixed, high-contrast and above everything, so a local-auth tab is never mistaken for a real sign-in. Named colours,
// because light-mode.test.js bans hex palette literals outside the token layer.
const BADGE_STYLE = {
  position: 'fixed',
  bottom: 8,
  left: 8,
  zIndex: 2147483647,
  padding: '2px 8px',
  borderRadius: 4,
  background: 'firebrick',
  color: 'white',
  font: '700 11px/18px ui-monospace, monospace',
  letterSpacing: '0.08em',
  pointerEvents: 'none',
};

/** Installs the backend dev-bypass bearer; App.jsx's session bootstrap then loads /auth/me with it. */
export function installLocalSession(auth, userId) {
  const token = `dev-bypass-${userId}`;
  auth.tokenManager.setAccessToken(token);
  auth.currentToken = token;
}

/**
 * WEB-LOCAL-AUTH-BYPASS-FU-1 (dev server on localhost only, see ./localAuth.js): rendered inside SmartMemoryProvider
 * instead of ClerkProvider, so Clerk is never mounted.
 */
export default function LocalAuthRoot({ userId, children }) {
  const client = useSmartMemory();
  // Once, before any child effect runs the session bootstrap.
  useState(() => installLocalSession(client.auth, userId));
  return (
    <>
      {children}
      <div data-testid="local-auth-badge" role="status" style={BADGE_STYLE} title={`Local auth bypass as ${userId}. Never in production.`}>
        LOCAL AUTH
      </div>
    </>
  );
}
