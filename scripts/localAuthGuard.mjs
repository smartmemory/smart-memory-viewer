// WEB-LOCAL-AUTH-BYPASS-FU-1: the local sign-in bypass (src/auth/localAuth.js) must never reach a built bundle.
// Two checks, both fatal: (1) any `vite build` whose resolved env sets VITE_AUTH_MODE=local is refused before it
// starts (process.env wins over .env files in the resolved env, so a shell variable counts); (2) after every build the
// emitted JS is scanned for the bypass bearer prefix, so a future edit that leaks the branch past the literal
// `import.meta.env.DEV` gates fails the build instead of shipping. Pure functions, so tests call them directly.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Assembled, so this file itself never contains the literal it hunts for.
export const BYPASS_MARKERS = ['dev-' + 'bypass-', 'LOCAL' + ' AUTH'];

/** Throws when a build would select local auth. Serving (the dev server) is the only place it may run. */
export function checkLocalAuthMode({ command, env = {} } = {}) {
  if (command !== 'build') return;
  const requested = typeof env.VITE_AUTH_MODE === 'string' ? env.VITE_AUTH_MODE.trim() : '';
  if (requested !== 'local') return;
  throw new Error(
    'local auth guard: VITE_AUTH_MODE=local is set for a `vite build`. Local auth is a dev-server-only bypass and must '
      + 'never be built. Unset it: `env -u VITE_AUTH_MODE npm run build`.',
  );
}

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (/\.(m?js|html)$/.test(name)) out.push(full);
  }
  return out;
}

/** Scans built JS/HTML for the bypass markers. Returns { ok, problems }. */
export function checkDistLocalAuth({ distDir }) {
  const problems = [];
  for (const file of jsFiles(distDir)) {
    const text = readFileSync(file, 'utf8');
    for (const marker of BYPASS_MARKERS) {
      if (text.includes(marker)) problems.push(`${path.relative(distDir, file)} contains ${JSON.stringify(marker)}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Vite plugin: refuses a local-auth build up front, then checks the emitted dist. */
export function localAuthGuardPlugin() {
  let config;
  let outDir = '';
  return {
    name: 'local-auth-guard',
    configResolved(resolved) {
      config = resolved;
      checkLocalAuthMode({ command: config.command, env: config.env });
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!config || config.command !== 'build') return;
      // Rollup also calls closeBundle after a failed build: stay quiet so the real build error is the one shown.
      if (!existsSync(outDir)) return;
      const { ok, problems } = checkDistLocalAuth({ distDir: outDir });
      if (!ok) throw new Error(`local auth dist check FAILED: ${problems.join('; ')}`);
      console.log('local auth dist check ok (no bypass markers in the bundle)');
    },
  };
}
