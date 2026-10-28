// WEB-LOCAL-AUTH-BYPASS-FU-1: sign in on a local stack without Clerk, through the backend's EXISTING dev bypass
// (smart-memory-common service_common/auth/middleware.py `_maybe_dev_bypass_user`: SMARTMEMORY_AUTH_BYPASS=true plus
// `Authorization: Bearer dev-bypass-<id>`, refused outside a dev ENVIRONMENT). The identity's rows come from
// smart-memory-ops units/STAGE-2.0-LOCAL-1/seed_local_auth.py.
//
// Four locks keep it out of production:
// 1. scripts/localAuthGuard.mjs fails every `vite build` that sets VITE_AUTH_MODE=local, and fails any build whose
//    dist carries the bypass token prefix.
// 2. Every call site sits behind a literal `import.meta.env.DEV`, so a production bundle constant-folds the branch
//    away and drops this module and LocalAuthRoot entirely.
// 3. resolveLocalAuth below also requires a dev-server env and a localhost origin.
// 4. Nothing fetched can select it: the viewer reads the mode only from the build-time env (src/auth/identity.js), never from a server config.

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const DEFAULT_USER_ID = 'localdev';
// Same pattern as seed_local_auth.py: the id becomes part of a bearer token and of tenant/workspace ids.
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Pure decision, so tests can hand it a production env. `refused` names why a requested local mode was not honored.
 * @returns {{ enabled: boolean, refused: string | null, userId?: string }}
 */
export function resolveLocalAuth(env = {}, hostname = '') {
  if (env.VITE_AUTH_MODE !== 'local') return { enabled: false, refused: null };
  if (env.DEV !== true || env.PROD === true) {
    return { enabled: false, refused: 'this is not a dev-server build' };
  }
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    return { enabled: false, refused: `origin host ${JSON.stringify(hostname)} is not localhost` };
  }
  const userId = env.VITE_LOCAL_AUTH_USER_ID || DEFAULT_USER_ID;
  if (!USER_ID_PATTERN.test(userId)) {
    return { enabled: false, refused: `VITE_LOCAL_AUTH_USER_ID must match ${USER_ID_PATTERN}` };
  }
  return { enabled: true, refused: null, userId };
}

/**
 * The running app's decision; logs a refused request. Call only behind a literal `import.meta.env.DEV` so production
 * drops it, and keep the result in one module constant (no module-level mutable state: studio's scope-reset guard G4).
 */
export function localAuthFromEnv() {
  const result = resolveLocalAuth(import.meta.env, globalThis.location?.hostname ?? '');
  if (result.refused) {
    console.error(`[local-auth] VITE_AUTH_MODE=local refused: ${result.refused}. Using the configured sign-in instead.`);
  }
  return result;
}
