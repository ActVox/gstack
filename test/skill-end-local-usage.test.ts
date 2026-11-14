/** ActVox fork: local usage log without remote telemetry.
 * Every write goes to a disposable state root; nothing touches ~/.gstack. */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const BIN = path.resolve(import.meta.dir, '..', 'bin');
let fixture: string, state: string;
let env: Record<string, string>;

function run(bin: string, args: string[], extra: Record<string, string> = {}) {
  const r = spawnSync(path.join(BIN, bin), args, {
    cwd: fixture, env: { ...env, ...extra }, encoding: 'utf-8', timeout: 30_000,
  });
  expect(r.error).toBeUndefined();
  return r;
}
const usage = () => {
  const file = path.join(state, 'analytics', 'skill-usage.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
};
const end = (args: string[] = [], extra: Record<string, string> = {}) =>
  run('gstack-skill-end', ['--skill', 'qa', '--outcome', 'success', '--session-id', 'local-fixture', ...args], extra);

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gstack-local-usage-'));
  state = path.join(fixture, 'state');
  fs.mkdirSync(state);
  env = { PATH: process.env.PATH!, HOME: fixture, GSTACK_HOME: state, GSTACK_STATE_ROOT: state,
    GSTACK_PROJECT_SLUG: 'local-usage', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
    GSTACK_SESSION_KIND: 'interactive' };
  expect(run('gstack-config', ['set', 'telemetry', 'off']).status).toBe(0);
});
afterEach(() => { fs.rmSync(fixture, { recursive: true, force: true }); });

describe('skill-end local usage log (ActVox fork)', () => {
  test('telemetry off and local_usage unset: the normal path writes nothing', () => {
    expect(end().status).toBe(0);
    expect(usage()).toEqual([]);
  });

  test('telemetry off and local_usage on: the normal path writes one line', () => {
    expect(run('gstack-config', ['set', 'local_usage', 'on']).status).toBe(0);
    expect(end().status).toBe(0);
    const rows = usage();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ skill: 'qa', outcome: 'success', session: 'local-fixture' });
  });

  test('--local-only writes one line with telemetry off and local_usage unset', () => {
    const r = end(['--local-only']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('SKILL_END: recorded locally');
    expect(usage()).toHaveLength(1);
    // Local-only does not open a timeline or a sync queue.
    expect(fs.existsSync(path.join(state, 'projects'))).toBe(false);
    expect(fs.existsSync(path.join(state, '.brain-queue.d'))).toBe(false);
  });

  test('--local-only sanitizes the skill name and outcome into valid JSON', () => {
    expect(run('gstack-skill-end', ['--local-only', '--skill', 'qa"}x', '--outcome', 'su"ccess']).status).toBe(0);
    expect(usage()[0]).toMatchObject({ skill: 'qax', outcome: 'success' });
  });

  test('an unattended session writes nothing, in either mode', () => {
    expect(run('gstack-config', ['set', 'local_usage', 'on']).status).toBe(0);
    expect(end([], { GSTACK_SESSION_KIND: 'unattended' }).status).toBe(0);
    expect(end(['--local-only'], { GSTACK_SESSION_KIND: 'unattended' }).status).toBe(0);
    expect(usage()).toEqual([]);
  });

  test('--help records nothing', () => {
    expect(run('gstack-skill-end', ['--local-only', '--help']).status).toBe(0);
    expect(usage()).toEqual([]);
  });

  test('gstack-config rejects a value outside on|off for local_usage', () => {
    const r = run('gstack-config', ['set', 'local_usage', 'yes']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('local_usage');
    expect(run('gstack-config', ['get', 'local_usage']).stdout.trim()).toBe('off');
  });
});
