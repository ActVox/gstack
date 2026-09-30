import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectEndpointHash } from '../bin/gstack-brain-cache';
import { hasRemoteOnlyGbrainMcp } from '../lib/gbrain-local-status';

const REMOTE = { type: 'http', url: 'https://brain.example.invalid/mcp' };
const LOCAL = { type: 'stdio', command: 'gbrain' };
const start = readFileSync(join(import.meta.dir, '../bin/gstack-skill-start'), 'utf8');
// Exercise the shipped jq resolver, rather than a test copy of its boundary logic.
const filter = start.match(/_GBRAIN_MCP_ENTRY=\$\(jq -c --arg cwd "\$PWD" '([^']+)'/)?.[1];

describe('GBrain project path boundaries agree across resolvers', () => {
  const cases = [
    { name: 'POSIX root', key: '/', cwd: '/work', remote: true },
    { name: 'POSIX root below an unrelated nearer project', key: '/', cwd: '/work', remote: true, nearer: true },
    { name: 'Windows drive root', key: 'C:\\', cwd: 'C:\\work', remote: true },
    { name: 'Windows drive boundary', key: 'C:\\', cwd: 'D:\\work', remote: false },
    { name: 'ordinary ancestor', key: '/work', cwd: '/work/src', remote: true },
    { name: 'sibling prefix', key: '/work', cwd: '/work-other', remote: false },
  ];
  for (const item of cases) test(item.name, () => {
    const home = mkdtempSync(join(tmpdir(), 'gbrain-mcp-root-'));
    const config = join(home, '.claude.json');
    try {
      writeFileSync(config, JSON.stringify({
        mcpServers: { gbrain: LOCAL },
        projects: {
          [item.key]: { mcpServers: { gbrain: REMOTE } },
          ...(item.nearer ? { [item.cwd]: { mcpServers: { unrelated: REMOTE } } } : {}),
        },
      }));
      expect(hasRemoteOnlyGbrainMcp({ HOME: home }, item.cwd)).toBe(item.remote);
      const remoteHash = createHash('sha256').update(REMOTE.url).digest('hex').slice(0, 8);
      expect(detectEndpointHash(config, item.cwd)).toBe(item.remote ? remoteHash : 'local');
      expect(filter).toBeDefined();
      const result = spawnSync('jq', ['-c', '--arg', 'cwd', item.cwd, filter!, config], {
        encoding: 'utf8', timeout: 10_000,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(item.remote ? REMOTE : LOCAL);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
