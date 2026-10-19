import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// DEPS-SEC-VIEWER-1: one row per package whose advisories are only cleared at
// or above the floor version. Both the declared range and the resolved install
// must sit at or above it.
const FLOORS = [
  { name: 'vitest', section: 'devDependencies', floor: '4.1.11' },
  { name: 'vite', section: 'devDependencies', floor: '7.3.5' },
  { name: '@clerk/clerk-react', section: 'dependencies', floor: '5.61.6' },
];

const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'));
const pkg = readJson(new URL('../../package.json', import.meta.url));

const parse = (v) => v.replace(/^[\^~>=\s]+/, '').split('-')[0].split('.').map(Number);
const atLeast = (have, floor) => {
  const [a, b] = [parse(have), parse(floor)];
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
};

describe('security floors', () => {
  it.each(FLOORS)('$name declared range is at or above $floor', ({ name, section, floor }) => {
    const range = pkg[section][name];
    expect(range, `${name} missing from ${section}`).toBeDefined();
    expect(atLeast(range, floor), `${name} declared ${range}, floor ${floor}`).toBe(true);
  });

  it.each(FLOORS)('$name installed version is at or above $floor', ({ name, floor }) => {
    const installed = readJson(new URL(`../../node_modules/${name}/package.json`, import.meta.url)).version;
    expect(atLeast(installed, floor), `${name} installed ${installed}, floor ${floor}`).toBe(true);
  });
});
