import { useMemo } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { localAuthFromEnv } from './localAuth';

// WEB-LOCAL-AUTH-BYPASS-FU-1: one decision per page load. The literal DEV check lets a production bundle drop the
// local branch; the bypass bearer itself lives only in ./LocalAuthRoot (lazy, dev server only).
export const LOCAL_AUTH = import.meta.env.DEV ? localAuthFromEnv() : { enabled: false, refused: null };

// Shape of the Clerk hook App.jsx reads. Local mode is signed in from the start and has no Clerk token to exchange:
// App.jsx skips the Clerk exchange when LOCAL_AUTH.enabled.
function useLocalIdentity() {
  return useMemo(() => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: async () => null,
    // Nothing to sign out of: a reload bootstraps the same identity again.
    signOut: async () => { window.location.assign('/'); },
  }), []);
}

/** Clerk's useAuth, or the local identity. LOCAL_AUTH is fixed for the page's life, so the hook order never changes. */
export function useIdentityAuth() {
  return LOCAL_AUTH.enabled ? useLocalIdentity() : useClerkAuth();
}
