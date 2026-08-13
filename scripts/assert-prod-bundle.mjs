#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FOREIGN_POSTHOG_KEY = 'phc_BFsq5SG4DpCxhfW2YENClnfPzzyQE0JvKeMeRJpdGYv';
const DEV_CLERK_KEY = /pk_test_[A-Za-z0-9]{12,}/;
const SCANNED_EXTENSIONS = new Set(['.html', '.js']);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Values that must survive the build, checked positively.
 *
 * Blacklists only catch the wrong values someone already thought of. The
 * localhost regression that shipped before this check could not be written as
 * one: the bundle legitimately contains "localhost" several times over (the
 * Discord SDK's origin allowlist, posthog-js's own dev-hostname test), so a
 * substring ban is all false positives. What actually distinguishes a good
 * bundle is that the pinned production values are *present* — so read them
 * from .env.sanctuary and require each one.
 */
const REQUIRED_ENV_KEYS = [
  'VITE_API_URL',
  'VITE_CLERK_PUBLISHABLE_KEY',
  'VITE_PUBLIC_POSTHOG_KEY',
];

async function readPinnedValues() {
  const path = `${REPO_ROOT}/.env.sanctuary`;
  const content = await readFile(path, 'utf8');
  const pinned = new Map();

  for (const line of content.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (REQUIRED_ENV_KEYS.includes(key) && value !== '') pinned.set(key, value);
  }

  const missing = REQUIRED_ENV_KEYS.filter((key) => !pinned.has(key));
  if (missing.length > 0) {
    throw new Error(
      `${path} no longer pins ${missing.join(', ')}. Vite would fall back to the generic .env — the developer's localhost API and Clerk dev instance — so the build is unsafe to publish.`,
    );
  }

  return pinned;
}

function isScannedArtifact(path) {
  return [...SCANNED_EXTENSIONS].some((extension) => path.endsWith(extension));
}

async function findBuiltArtifacts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const artifacts = [];

  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      artifacts.push(...await findBuiltArtifacts(path));
    } else if (entry.isFile() && isScannedArtifact(entry.name)) {
      artifacts.push(path);
    }
  }

  return artifacts;
}

async function main() {
  const [distArgument] = process.argv.slice(2);
  if (!distArgument || process.argv.length !== 3) {
    throw new Error('Usage: node scripts/assert-prod-bundle.mjs <dist-directory>');
  }

  const distDirectory = resolve(distArgument);
  const pinned = await readPinnedValues();
  const artifacts = await findBuiltArtifacts(distDirectory);
  const clerkHits = [];
  const posthogHits = [];
  const absent = new Set(pinned.keys());

  for (const artifact of artifacts) {
    const content = await readFile(artifact, 'utf8');
    if (DEV_CLERK_KEY.test(content)) clerkHits.push(artifact);
    if (content.includes(FOREIGN_POSTHOG_KEY)) posthogHits.push(artifact);
    for (const [key, value] of pinned) {
      if (content.includes(value)) absent.delete(key);
    }
  }

  if (absent.size > 0) {
    const detail = [...absent].sort().map((key) => `${key}=${pinned.get(key)}`).join(', ');
    throw new Error(
      `Refusing to deploy ${distDirectory}: the production value(s) pinned in .env.sanctuary never reached the bundle (${detail}). Vite ranks the process environment above every .env file, so an exported VITE_* variable in the building shell silently wins — which is how production came to serve a localhost API URL and the Clerk dev key. Check that build:sanctuary still runs vite under \`env -u\` for these.`,
    );
  }

  if (clerkHits.length > 0) {
    throw new Error(
      `Refusing to deploy ${distDirectory}: dev Clerk key (pk_test) found in built bundle (${clerkHits.sort().join(', ')}). The production UI would use the Clerk dev instance and break SSO.`,
    );
  }

  if (posthogHits.length > 0) {
    throw new Error(
      `Refusing to deploy ${distDirectory}: foreign PostHog key (${FOREIGN_POSTHOG_KEY}) found in built bundle (${posthogHits.sort().join(', ')}). That token belongs to ScaleMate project 277558; SmartMemory events would pollute another product's analytics.`,
    );
  }

  console.log(`Production bundle check passed: scanned ${artifacts.length} JavaScript/HTML artifact(s) in ${distDirectory}.`);
}

main().catch((error) => {
  console.error(`Production bundle check failed: ${error.message}`);
  process.exitCode = 1;
});
