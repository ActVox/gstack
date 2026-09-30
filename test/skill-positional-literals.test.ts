import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runGeneration } from '../scripts/gen-skill-docs';

const root = mkdtempSync(join(tmpdir(), 'skill-positional-'));
const rendered = join(root, 'rendered');
const tenArguments = Array.from({ length: 10 }, (_, n) => `argument${n}`);
const windowsShasumShim = `shasum() {
  if [ "$#" -ne 2 ] || [ "$1" != "-a" ] || [ "$2" != "256" ]; then
    printf 'fixture shasum requires exactly -a 256\\n' >&2
    return 2
  fi
  sha256sum
}`;
const literals = {
  checksum: `actual_sha=$(sha256sum < "$tmpfile" | awk '{print $(1)}')`,
  snoozeVersion: `_SNOOZED_VER=$(awk '{print $(1)}' "$_SNOOZE_FILE")`,
  snoozeLevel: `_CUR_LEVEL=$(awk '{print $(2)}' "$_SNOOZE_FILE")`,
  capture: `printf 'ERROR:typecheck CAPTURE:%s\\n' "\${1}" >&2`,
  preview: `_PORT=$(lsof -i -P -n | grep "$_SERVER_PID" | grep LISTEN | awk '{print $(9)}' | cut -d: -f2 | head -1)`,
  title: '# Bash-side title sanitize. Pass the raw title via TITLE_RAW when running this block.',
  cost: '- A) Enable judge (adds about USD 0.05). Completeness: 10/10.',
};

beforeAll(async () => {
  for (const host of ['claude', 'codex'] as const) {
    expect((await runGeneration({ host, outputRoot: rendered })).exitCode).toBe(0);
  }
}, 120000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

function substitute(text: string, args: string[]) {
  const numbered = args.length ? text.replace(/\$(\d+)/g, (_, n) => args[Number(n)] ?? '') : text;
  return numbered.replace(/\$ARGUMENTS\b/g, () => args.join(' '));
}

function run(code: string, env: Record<string, string> = {}) {
  return spawnSync('bash', ['-c', code], {
    encoding: 'utf8', timeout: 5000, env: { ...process.env, HOME: root, ...env },
  });
}

function skill(host: string, name: string) {
  return readFileSync(join(rendered, host === 'claude' ? name : `.agents/skills/${name.startsWith('gstack-') ? name : `gstack-${name}`}`, 'SKILL.md'), 'utf8');
}

function exerciseInstaller(snippet: string) {
  const installerUrl = 'https://raw.githubusercontent.com/oven-sh/bun/744846f844374847c902b5e7fd59b4342a51ef99/src/runtime/cli/install.sh';
  const installerHash = '04882bf41679d49d9af108657a1e5515bf04fdf2940d12c0d0b1e5d79dc53be8';
  expect(snippet).toContain(installerUrl);
  expect(snippet).toContain(`BUN_INSTALL_SHA="${installerHash}"`);
  const seed = '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$FIXTURE_ARGS"\n[ "$FIXTURE_MODE" != installer-failure ] || exit 29\n';
  const seedHash = createHash('sha256').update(seed).digest('hex');
  for (const hashTool of ['sha256sum', 'shasum']) for (const mode of ['success', 'mismatch', 'download-failure', 'installer-failure']) {
    const directory = mkdtempSync(join(root, 'installer-'));
    const seedPath = join(directory, 'seed');
    const argsPath = join(directory, 'args');
    const tempPath = join(directory, 'download');
    writeFileSync(seedPath, seed + (mode === 'mismatch' ? '# corrupted download\n' : ''));
    const prelude = `${process.platform === 'win32' ? windowsShasumShim : ''}
command() {
  if [ "$*" = '-v bun' ]; then return 1; fi
  if [ "$*" = '-v sha256sum' ] && [ "$FIXTURE_HASH_TOOL" = shasum ]; then return 1; fi
  builtin command "$@"
}
mktemp() { printf '%s' "$FIXTURE_TEMP"; }
curl() {
  [ "$*" = "-fsSL ${installerUrl} -o $FIXTURE_TEMP" ] || return 98
  [ "$FIXTURE_MODE" != download-failure ] || return 22
  cp "$FIXTURE_SEED" "$FIXTURE_TEMP"
}
`;
    const result = run(prelude + snippet.replace(installerHash, seedHash), {
      FIXTURE_SEED: seedPath.replaceAll('\\', '/'), FIXTURE_ARGS: argsPath.replaceAll('\\', '/'),
      FIXTURE_TEMP: tempPath.replaceAll('\\', '/'), FIXTURE_MODE: mode, FIXTURE_HASH_TOOL: hashTool,
    });
    expect(result.status, `${hashTool}/${mode}: ${result.stderr}`).toBe(
      mode === 'success' ? 0 : mode === 'mismatch' ? 1 : mode === 'download-failure' ? 22 : 29);
    expect(existsSync(tempPath)).toBe(false);
    if (mode === 'success' || mode === 'installer-failure') {
      expect(readFileSync(argsPath, 'utf8')).toBe('bun-v1.4.2\n');
    } else {
      expect(existsSync(argsPath)).toBe(false);
      if (mode === 'mismatch') expect(result.stderr).toContain('checksum mismatch');
    }
  }
}

test('setup emits a pinned, checksum-enforced installer with cleanup and failure propagation', () => {
  const result = run('command() { return 1; }; source "$SETUP_SCRIPT"', {
    SETUP_SCRIPT: join(import.meta.dir, '..', 'setup').replaceAll('\\', '/'),
  });
  expect(result.status).toBe(1);
  const snippet = result.stderr.split('Install with checksum verification:\n')[1];
  expect(snippet).toBeDefined();
  exerciseInstaller(snippet);
});

for (const host of ['claude', 'codex'] as const) for (const args of [[], tenArguments]) {
  const apply = (s: string) => host === 'claude' ? substitute(s, args) : s;
  const label = `${host}/${args.length} arguments`;
  test(`${label}: rendered installer pins the runtime and fails closed before execution`, () => {
    const snippet = skill(host, 'open-gstack-browser').match(/```bash\n(\s*if ! command -v bun[\s\S]*?)```/)![1];
    exerciseInstaller(apply(snippet));
  });
  test(`${label}: exact rendered literals survive host expansion`, () => {
    const setup = skill(host, 'open-gstack-browser');
    const actual = {
      checksum: setup.match(/actual_sha=\$\(sha256sum[^\n]+/)![0],
      snoozeVersion: skill(host, 'gstack-upgrade').match(/_SNOOZED_VER=\$[^\n]+/)![0],
      snoozeLevel: skill(host, 'gstack-upgrade').match(/_CUR_LEVEL=\$\(awk[^\n]+/)![0],
      capture: skill(host, 'health').match(/printf 'ERROR:typecheck[^\n]+/)![0],
      preview: skill(host, 'design-html').match(/_PORT=\$[^\n]+/)![0],
      title: skill(host, 'context-save').match(/# Bash-side title sanitize\.[^\n]+/)![0],
      cost: skill(host, 'benchmark-models').match(/- A\) Enable judge[^\n]+/)![0],
    };
    expect(actual).toEqual(literals);
    expect(Object.fromEntries(Object.entries(actual).map(([key, value]) => [key, apply(value)]))).toEqual(literals);
    for (const name of ['gstack-upgrade', 'health', 'design-html', 'context-save', 'benchmark-models']) {
      const text = skill(host, name);
      expect(text.match(/\$\d+/g), name).toBeNull();
      expect(apply(text)).toBe(text);
    }
    expect(skill(host, 'benchmark-models')).toContain('Adds about USD 0.05/run.');
  });
  for (const backslashPath of [false, true]) test(`${label}: both checksum tools ${backslashPath ? 'handle backslash paths' : 'retain the digest field'}`, () => {
    const file = backslashPath ? join(root, 'checksum\\path', 'install-script') : join(root, 'install-script');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'synthetic installer bytes\n');
    for (const name of ['open-gstack-browser', 'pair-agent', 'setup-browser-cookies']) {
      const lines = apply(skill(host, name)).split('\n').filter(line => line.includes('actual_sha=$('));
      expect(lines.map(line => line.trim())).toEqual([
        literals.checksum,
        `actual_sha=$(shasum -a 256 < "$tmpfile" | awk '{print $(1)}')`,
      ]);
      for (const line of lines) {
        const prelude = process.platform === 'win32' ? windowsShasumShim : '';
        const result = run(`${prelude}\n${line}\nprintf '%s' "$actual_sha"`, { tmpfile: process.platform === 'win32' ? file.replaceAll('\\', '/') : file });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toBe(createHash('sha256').update(readFileSync(file)).digest('hex'));
      }
    }
  });
  test(`${label}: upgrade snooze advances the same-version level`, () => {
    mkdirSync(join(root, '.gstack'), { recursive: true });
    writeFileSync(join(root, '.gstack/update-snoozed'), '{new} 1 0\n');
    const block = skill(host, 'gstack-upgrade').match(/```bash\n(_SNOOZE_FILE=[\s\S]*?)```/)![1];
    expect(run(apply(block)).status).toBe(0);
    expect(readFileSync(join(root, '.gstack/update-snoozed'), 'utf8')).toMatch(/^\{new\} 2 \d+\n$/);
  });
  test(`${label}: health error preserves its diagnostic argument`, () => {
    const helper = skill(host, 'health').match(/health_capture_error\(\) \{[\s\S]*?\n  \}/)![0];
    const result = run(apply(helper) + '\nhealth_capture_error log_creation');
    expect(result.status).toBe(125);
    expect(result.stderr).toBe('ERROR:typecheck CAPTURE:log_creation\n');
  });
  test(`${label}: preview port extracts the address column`, () => {
    const line = skill(host, 'design-html').split('\n').find(line => line.startsWith('_PORT=$('))!;
    const result = run(`lsof() { echo 'python3 4242 user 3u IPv4 1 0t0 TCP 127.0.0.1:3456 (LISTEN)'; }\n_SERVER_PID=4242\n${apply(line)}\nprintf '%s' "$_PORT"`);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('3456');
  });
}

test('Windows shasum fixture validates its algorithm arguments and hashes stdin', () => {
  const valid = run(`${windowsShasumShim}\nprintf fixture | shasum -a 256`);
  expect(valid.status).toBe(0);
  expect(valid.stderr).toBe('');
  expect(valid.stdout.trim().split(/\s+/)[0]).toBe(createHash('sha256').update('fixture').digest('hex'));
  for (const args of ['', '-a', '-a 1', '-x 256', '-a 256 extra']) {
    const invalid = run(`${windowsShasumShim}\nshasum ${args}`);
    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toBe('');
    expect(invalid.stderr).toBe('fixture shasum requires exactly -a 256\n');
  }
});

test('pinned Linux CLI zero-argument observation preserves bare numbered literals', () => {
  expect(substitute('$1 | $2 | $9 | ~$0.05 | $ARGUMENTS', [])).toBe('$1 | $2 | $9 | ~$0.05 | ');
});

test('pinned Linux CLI ten-argument negative control corrupts unsafe literals', () => {
  expect(substitute(`awk '{print $1}' | "$1" | $2 | $9 | ~$0.05`, tenArguments))
    .toBe(`awk '{print argument1}' | "argument1" | argument2 | argument9 | ~argument0.05`);
});

test('intentional placeholders retain zero- and ten-argument expansion', () => {
  expect(substitute('$ARGUMENTS', [])).toBe('');
  expect(substitute('$ARGUMENTS / $0 / $1 / $9', tenArguments))
    .toBe(`${tenArguments.join(' ')} / argument0 / argument1 / argument9`);
});
