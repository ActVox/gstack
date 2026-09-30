import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { prepareMethodology } from '../bin/gstack-autoplan-snapshot';

const ROOT = path.resolve(import.meta.dir, '..');
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('optional lean instruction profile', () => {
  for (const host of ['codex', 'claude']) {
    test(`${host}: isolated output keeps supporting sections usable`, () => {
      const out = fs.mkdtempSync(path.join(os.tmpdir(), `gstack-lean-${host}-`));
      const source = path.join(ROOT, 'ship/SKILL.md');
      const before = hash(source);
      try {
        const run = spawnSync('bun', ['run', 'scripts/gen-skill-docs.ts', '--host', host,
          '--profile', 'lean', '--out-dir', out], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
        expect(run.status, run.stderr).toBe(0);
        expect(hash(source)).toBe(before);
        const skill = (name: string) => path.join(out, host === 'codex' ? `gstack-${name}` : name, 'SKILL.md');
        const ship = fs.readFileSync(skill('ship'), 'utf8');
        const pdf = fs.readFileSync(skill('make-pdf'), 'utf8');
        expect(pdf).toContain('P=');
        expect(pdf).toContain('MAKE_PDF_READY');
        expect(ship).not.toMatch(/\{\{[A-Z_]+/);
        const links = [...ship.matchAll(/\]\(([^)]+\/sections\/[^)]+\.md)\)/g)].map(m => m[1]);
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link.startsWith(out)).toBe(true);
          expect(fs.existsSync(link), link).toBe(true);
          expect(fs.readFileSync(link, 'utf8')).not.toMatch(/\{\{[A-Z_]+/);
        }
        // A coordinating skill must load the selected host profile, not fall back
        // to missing sidecar files or the source checkout's full instructions.
        const autoplan = fs.readFileSync(skill('autoplan'), 'utf8');
        for (const name of ['office-hours', 'plan-ceo-review', 'plan-eng-review']) {
          expect(autoplan).toContain(skill(name));
          expect(fs.existsSync(skill(name))).toBe(true);
        }
        const restore = path.join(out, 'restore.md');
        fs.writeFileSync(restore, 'fixture restore point');
        for (const phase of ['ceo', 'design', 'dx', 'eng']) {
          const name = `plan-${phase === 'dx' ? 'devex' : phase}-review`;
          const bound = prepareMethodology(phase, skill(name), restore);
          expect(bound.sources).toHaveLength(2);
          expect(fs.readFileSync(bound.methodologyPath, 'utf8')).toContain('## Review Sections');
        }
        if (host === 'codex') expect(fs.existsSync(path.join(out, 'gstack-review/agents/openai.yaml'))).toBe(true);
      } finally {
        fs.rmSync(out, { recursive: true, force: true });
      }
    });
  }

  test('lean generation requires an isolated output directory', () => {
    const source = path.join(ROOT, 'ship/SKILL.md');
    const before = hash(source);
    const run = spawnSync('bun', ['run', 'scripts/gen-skill-docs.ts', '--host', 'codex', '--profile', 'lean'],
      { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('requires --out-dir');
    expect(hash(source)).toBe(before);
  });
});
