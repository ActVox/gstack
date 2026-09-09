import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
  discoverTemplates,
  isSkillGeneratedForHost,
} from '../scripts/discover-skills';
import { getHostConfig } from '../hosts/index';

const ROOT = path.resolve(import.meta.dir, '..');

describe('host-specific source generation coverage', () => {
  test('includeSkills is an allowlist and skipSkills wins', () => {
    const generation = { includeSkills: ['alpha', 'beta'], skipSkills: ['beta'] };
    expect(isSkillGeneratedForHost('alpha', generation)).toBe(true);
    expect(isSkillGeneratedForHost('beta', generation)).toBe(false);
    expect(isSkillGeneratedForHost('gamma', generation)).toBe(false);
  });

  test('Claude health coverage excludes host-skipped templates', () => {
    const generation = getHostConfig('claude').generation;
    const covered = discoverTemplates(ROOT).filter(({ tmpl }) => {
      const skillDir = path.basename(path.dirname(path.join(ROOT, tmpl)));
      return isSkillGeneratedForHost(skillDir, generation);
    });

    expect(covered.some(({ output }) => output === 'claude/SKILL.md')).toBe(false);
    for (const { output } of covered) {
      expect(fs.existsSync(path.join(ROOT, output))).toBe(true);
    }
  });
});