import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { prepareMethodology } from '../bin/gstack-autoplan-snapshot';
import { runGeneration } from '../scripts/gen-skill-docs';
import { generateAutoplanReviewFile } from '../scripts/resolvers/composition';
import { HOST_PATHS } from '../scripts/resolvers/types';

const ROOT = path.resolve(import.meta.dir, '..');
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('optional lean instruction profile', () => {
  test('review references preserve Windows drive and network registry roots', () => {
    for (const registry of ['C:/Users/test/skills', '//server/share/skills']) {
      for (const host of ['codex', 'claude'] as const) {
        const skillName = host === 'claude' ? 'plan-ceo-review' : 'gstack-plan-ceo-review';
        const reference = generateAutoplanReviewFile({
          instructionProfile: 'lean', host, paths: HOST_PATHS[host],
          skillName: 'autoplan', tmplPath: path.join(ROOT, 'autoplan/SKILL.md.tmpl'),
          sectionRoot: `${registry}/${host === 'claude' ? 'autoplan' : 'gstack-autoplan'}/sections`,
        }, ['plan-ceo-review']);
        expect(reference).toBe(`\`${registry}/${skillName}/SKILL.md\``);
      }
    }
  });

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
        const pdfSetup = pdf.match(/## MAKE-PDF SETUP[^\n]*\n\n```bash\n([\s\S]*?)\n```/)?.[1];
        expect(pdfSetup).toBeDefined();
        const pdfBinary = path.join(out, 'fixture-pdf');
        fs.writeFileSync(pdfBinary, '#!/bin/sh\nprintf "LEAN_PDF_CALLED:%s:%s\\n" "$1" "$2"\n', { mode: 0o755 });
        const pdfRun = spawnSync('bash', ['-c', `${pdfSetup}\n"$P" generate fixture.md`], {
          cwd: out, env: { ...process.env, MAKE_PDF_BIN: pdfBinary }, encoding: 'utf8', timeout: 10_000,
        });
        expect(pdfRun.status, pdfRun.stderr).toBe(0);
        expect(pdfRun.stdout).toContain(`MAKE_PDF_READY: ${pdfBinary}`);
        expect(pdfRun.stdout).toContain('LEAN_PDF_CALLED:generate:fixture.md');
        expect(ship).not.toMatch(/\{\{[A-Z_]+/);
        const links = [...ship.matchAll(/\]\(([^)]+\/sections\/[^)]+\.md)\)/g)].map(m => m[1]);
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link).not.toContain('\\');
          const relative = path.relative(out, link);
          expect(path.isAbsolute(relative)).toBe(false);
          expect(relative.split(path.sep)[0]).not.toBe('..');
          expect(fs.existsSync(link), link).toBe(true);
          expect(fs.readFileSync(link, 'utf8')).not.toMatch(/\{\{[A-Z_]+/);
        }
        // A coordinating skill must load the selected host profile, not fall back
        // to missing sidecar files or the source checkout's full instructions.
        const autoplan = fs.readFileSync(skill('autoplan'), 'utf8');
        for (const name of ['office-hours', 'plan-ceo-review', 'plan-eng-review']) {
          expect(autoplan).toContain(skill(name).split(path.sep).join('/'));
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

  test('lean rejects all-host generation before creating overlapping output', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gstack-lean-all-'));
    try {
      const run = spawnSync('bun', ['run', 'scripts/gen-skill-docs.ts', '--host', 'all',
        '--profile', 'lean', '--out-dir', out], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('requires a single --host');
      await expect(runGeneration({ host: 'all', instructionProfile: 'lean', outputRoot: out }))
        .rejects.toThrow('requires a single --host');
      expect(fs.readdirSync(out)).toEqual([]);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  test('lean rejects source aliases and descendants before rendering', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gstack-lean-alias-'));
    const alias = path.join(temp, 'source');
    const source = path.join(ROOT, 'ship/SKILL.md');
    const before = hash(source);
    try {
      fs.symlinkSync(ROOT, alias, 'junction');
      for (const outputRoot of [ROOT, path.join(ROOT, 'ship'), alias, path.join(alias, 'new-render', 'nested')]) {
        // Dry-run makes this regression safe even if the guard is removed.
        await expect(runGeneration({ host: 'claude', instructionProfile: 'lean', outputRoot, dryRun: true }))
          .rejects.toThrow('outside the source checkout');
      }
      expect(hash(source)).toBe(before);
      expect(fs.existsSync(path.join(ROOT, 'new-render'))).toBe(false);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  test('lean rejects a source link within an otherwise isolated output', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gstack-lean-linked-file-'));
    const source = path.join(ROOT, 'ship/SKILL.md');
    const before = hash(source);
    try {
      fs.symlinkSync(path.dirname(source), path.join(out, 'ship'), 'junction');
      const result = await runGeneration({ host: 'claude', instructionProfile: 'lean', outputRoot: out, dryRun: true });
      expect(result.exitCode).toBe(1);
      expect(result.diagnostics.some(d => d.kind === 'error' && d.relativePath === 'ship/SKILL.md'
        && d.message.includes('outside the source checkout'))).toBe(true);
      expect(hash(source)).toBe(before);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
