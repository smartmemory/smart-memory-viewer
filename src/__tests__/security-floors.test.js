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

// Range-aware floor check (DEPS-SEC-FLOOR-GUARD-CLASS-1). A declared range passes only when the LOWEST
// version it admits is at or above the floor, ordered by full semver precedence (a prerelease sorts below
// its release). Grammar: `||`-joined arms of space-separated `^ ~ = >= < <=` comparators or bare versions
// (partial versions and x/* wildcards allowed). Anything else (hyphen ranges, `>`, tags, URLs) throws, so an
// unmodelled range fails the test instead of passing it.
const FULL_VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const PARTIAL_VERSION = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(text) {
  const m = FULL_VERSION.exec(text);
  if (!m) throw new Error(`not a full x.y.z[-prerelease] version: ${JSON.stringify(text)}`);
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
}

function comparePrerelease(a, b) {
  if (!a.length || !b.length) return a.length === b.length ? 0 : a.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const [aNum, bNum] = [/^\d+$/.test(a[i]), /^\d+$/.test(b[i])];
    if (aNum && bNum && Number(a[i]) !== Number(b[i])) return Number(a[i]) < Number(b[i]) ? -1 : 1;
    if (aNum !== bNum) return aNum ? -1 : 1;
    if (!aNum && a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

// -1 / 0 / 1: is version a below, equal to, or above version b.
function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  }
  return comparePrerelease(x.pre, y.pre);
}

// The lowest version a range admits: the highest lower bound inside each arm, the lowest across arms.
// `<` and `<=` only cap an arm, so an arm with no lower bound admits 0.0.0.
function minVersion(range) {
  const arms = range.split('||').map((arm) => {
    const tokens = arm.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) throw new Error(`unsupported range syntax (empty arm): ${JSON.stringify(range)}`);
    let low = '0.0.0';
    for (const token of tokens) {
      const [, op = '', operand] = /^(\^|~|>=|<=|<|=)?(.+)$/.exec(token);
      const m = PARTIAL_VERSION.exec(operand);
      const nums = m ? [m[1], m[2], m[3]].map((p) => (p === undefined || /^[xX*]$/.test(p) ? null : Number(p))) : [];
      const gap = nums.indexOf(null);
      if (!m || (gap !== -1 && (nums.slice(gap).some((n) => n !== null) || m[4]))) {
        throw new Error(`unsupported range syntax ${JSON.stringify(token)} in ${JSON.stringify(range)}`);
      }
      if (op === '<' || op === '<=') continue;
      const version = `${nums.map((n) => n ?? 0).join('.')}${m[4] ? `-${m[4]}` : ''}`;
      if (compareVersions(version, low) > 0) low = version;
    }
    return low;
  });
  return arms.reduce((lowest, arm) => (compareVersions(arm, lowest) < 0 ? arm : lowest));
}

const rangeAtLeast = (range, floor) => compareVersions(minVersion(range), floor) >= 0;
const versionAtLeast = (version, floor) => compareVersions(version, floor) >= 0;

// One row per case: [range, floor, passes]. The first three are the reviewers' repros
// (B20261021 unit-49 F2, unit-48 L1); the rest cover each grammar form and each way a range can dip below.
const RANGE_ROWS = [
  ['<6.4.3', '6.4.3', false],
  ['^4.1.11-rc.0', '4.1.11', false],
  ['^4.1.12 || 4.0.18', '4.1.11', false],
  ['^4.1.11', '4.1.11', true],
  ['~4.1.11', '4.1.11', true],
  ['4.1.11', '4.1.11', true],
  ['=4.1.11', '4.1.11', true],
  ['>=4.1.11 <5', '4.1.11', true],
  ['^4.10.0', '4.1.11', true],
  ['^4.1.11 || ^5.0.0', '4.1.11', true],
  ['<=4.1.11', '4.1.11', false],
  ['^4.1.9', '4.1.11', false],
  ['4.1.x', '4.1.11', false],
  ['4.1.11-beta.0', '4.1.11', false],
  ['*', '4.1.11', false],
];

// [installed version, floor, passes]
const VERSION_ROWS = [
  ['6.4.3', '6.4.3', true],
  ['6.10.0', '6.4.3', true],
  ['6.4.2', '6.4.3', false],
  ['6.4.3-beta.0', '6.4.3', false],
  ['6.5.0-rc.1', '6.4.3', true],
  ['4.1.11-rc.2', '4.1.11-rc.10', false],
];

// Range forms the grammar does not model must throw, never pass.
const UNSUPPORTED_RANGES = ['>4.1.10', '4.1.0 - 4.2.0', '>= 4.1.11', 'latest', 'workspace:*', 'npm:vite@^6.4.3', '1.x.3', ''];

describe('security floors', () => {
  it.each(FLOORS)('$name declared range is at or above $floor', ({ name, section, floor }) => {
    const range = pkg[section][name];
    expect(range, `${name} missing from ${section}`).toBeDefined();
    expect(rangeAtLeast(range, floor), `${name} declared ${range}, admits below ${floor}`).toBe(true);
  });

  it.each(FLOORS)('$name installed version is at or above $floor', ({ name, floor }) => {
    const installed = readJson(new URL(`../../node_modules/${name}/package.json`, import.meta.url)).version;
    expect(versionAtLeast(installed, floor), `${name} installed ${installed}, floor ${floor}`).toBe(true);
  });
});

describe('range-aware floor comparison (DEPS-SEC-FLOOR-GUARD-CLASS-1)', () => {
  it.each(RANGE_ROWS)('range %s vs floor %s passes: %s', (range, floor, passes) => {
    expect(rangeAtLeast(range, floor)).toBe(passes);
  });

  it.each(VERSION_ROWS)('installed %s vs floor %s passes: %s', (version, floor, passes) => {
    expect(versionAtLeast(version, floor)).toBe(passes);
  });

  it.each(UNSUPPORTED_RANGES)('unsupported range %j throws instead of passing', (range) => {
    expect(() => minVersion(range)).toThrow(/unsupported range syntax/);
  });
});
