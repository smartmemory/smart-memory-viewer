// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT = readFileSync(join(ROOT, 'scripts/deploy-sanctuary.sh'), 'utf8');
const made = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'deploy-sanctuary-test-')); made.push(d); return d; };
afterEach(() => { while (made.length) rmSync(made.pop(), { recursive: true, force: true }); });

describe('deploy-sanctuary.sh static contract', () => {
  it('targets us1 and never the old Hetzner host', () => {
    expect(SCRIPT).toContain('HOST=root@40.160.38.143');
    expect(SCRIPT).not.toMatch(/hetzner|135\.181/i);
  });

  it('runs the bundle guard and dirty-tree check before the first remote call', () => {
    const firstRemote = SCRIPT.indexOf('rssh mkdir');
    expect(SCRIPT.indexOf('git status --porcelain')).toBeGreaterThan(-1);
    expect(SCRIPT.indexOf('git status --porcelain')).toBeLessThan(SCRIPT.indexOf('assert-prod-bundle.mjs'));
    expect(SCRIPT.indexOf('assert-prod-bundle.mjs')).toBeLessThan(firstRemote);
  });

  it('rsyncs only into the unique stage, never onto the live dir', () => {
    const dests = [...SCRIPT.matchAll(/dist-sanctuary\/ "\$HOST:([^"]+)"/g)].map((m) => m[1]);
    expect(dests).toEqual(['$STAGE/', '$STAGE/']);
    expect(SCRIPT).not.toMatch(/\/var\/www\/sanctuary\/?["\s]/);
  });
});

// Run the real script against a fake ssh/rsync/node on PATH. No network, no host.
function harness({ dirty = false, diffOut = '', pruneFails = false } = {}) {
  const dir = tmp();
  const repo = join(dir, 'repo');
  const bin = join(dir, 'bin');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(join(repo, 'dist-sanctuary'));
  mkdirSync(bin);
  for (const f of ['deploy-sanctuary.sh', 'static_ui_swap.py', 'prune_sanctuary_backups.py']) {
    copyFileSync(join(ROOT, 'scripts', f), join(repo, 'scripts', f));
  }
  writeFileSync(join(repo, 'dist-sanctuary/index.html'), '<script type="module" src="/assets/a.js"></script>');
  const log = join(dir, 'calls.log');
  const fake = (name, body) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  fake('node', 'echo "node $*" >> "$CALLS"');
  fake('ssh', 'echo "ssh $*" >> "$CALLS"; cat >/dev/null; case "$*" in *"python3 - 5"*) [ -z "$PRUNE_FAIL" ] || exit 7;; esac');
  fake('rsync', `echo "rsync $*" >> "$CALLS"\ncase "$*" in *--dry-run*) printf '%s' "$DIFF_OUT";; esac`);
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(repo, '.gitignore'), 'dist-sanctuary\n');
  git('add', '.'); git('commit', '-q', '-m', 'x');
  if (dirty) writeFileSync(join(repo, 'scripts/extra.txt'), 'edit');
  const r = spawnSync('bash', ['scripts/deploy-sanctuary.sh'], {
    cwd: repo, encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: dir, CALLS: log, DIFF_OUT: diffOut, PRUNE_FAIL: pruneFails ? '1' : '' },
  });
  return { r, calls: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

describe('deploy-sanctuary.sh behaviour (fake host)', () => {
  it('refuses a dirty tree before any node or remote call', () => {
    const { r, calls } = harness({ dirty: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('working tree is dirty');
    expect(calls).toBe('');
  });

  it('prints only the first 20 itemized lines on stage mismatch, then fails without swapping', () => {
    const diffOut = Array.from({ length: 30 }, (_, i) => `>f+++++++++ file${i}`).join('\n');
    const { r, calls } = harness({ diffOut });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('file19');
    expect(r.stderr).not.toContain('file20');
    expect(calls).not.toContain('swap sanctuary');
  });

  it('on success swaps, then prunes with the keep count', () => {
    const { r, calls } = harness();
    expect(r.status).toBe(0);
    expect(calls.indexOf('swap sanctuary')).toBeGreaterThan(-1);
    expect(calls).toMatch(/swap sanctuary[\s\S]*ssh root@40\.160\.38\.143 python3 - 5/);
  });
});

describe('prune failure arm', () => {
  it('warns but keeps the deploy successful when the prune step fails', () => {
    const { r } = harness({ pruneFails: true });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('WARN: rollback prune failed');
  });
});

describe('prune_sanctuary_backups.py', () => {
  const name = (ts, n = 1) => `sanctuary.bak-abcdef123456-${ts}-${n}-deadbeef`;
  const run = (www, keep) => spawnSync('python3', ['-I', join(ROOT, 'scripts/prune_sanctuary_backups.py'), keep], {
    encoding: 'utf8', env: { PATH: process.env.PATH, SANCTUARY_WWW: www },
  });

  it('keeps the newest N by timestamp and leaves other names alone', () => {
    const www = tmp();
    const old = ['20261001000000', '20261002000000', '20261003000000', '20261004000000'];
    for (const ts of old) mkdirSync(join(www, name(ts)));
    for (const other of ['sanctuary', 'sanctuary.bak-notours', 'other.bak-x']) mkdirSync(join(www, other));
    const r = run(www, '2');
    expect(r.status).toBe(0);
    expect(readdirSync(www).sort()).toEqual(
      ['other.bak-x', 'sanctuary', 'sanctuary.bak-notours', name(old[2]), name(old[3])].sort());
  });

  it.each([['0'], ['x'], ['-1']])('rejects keep=%s without deleting', (keep) => {
    const www = tmp();
    mkdirSync(join(www, name('20261001000000')));
    const r = run(www, keep);
    expect(r.status).not.toBe(0);
    expect(readdirSync(www)).toHaveLength(1);
  });
});
