/**
 * ActVox does not provision upstream's Ubicloud runners. A copied
 * `runs-on: ubicloud-*` lane remains queued forever and makes a verified
 * release look like a flaky GitHub outage. Keep every fork workflow on
 * GitHub-hosted runners unless the repository explicitly adds that substrate.
 */
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WORKFLOWS = path.resolve(import.meta.dir, '..', '.github', 'workflows');
const DOCKERFILE = path.resolve(import.meta.dir, '..', '.github', 'docker', 'Dockerfile.ci');

describe('ActVox CI runner policy', () => {
  test('no workflow references unprovisioned Ubicloud runners', () => {
    const offenders = fs.readdirSync(WORKFLOWS)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .filter((name) => fs.readFileSync(path.join(WORKFLOWS, name), 'utf8').includes('ubicloud-standard-'));

    expect(offenders, `unprovisioned Ubicloud references: ${offenders.join(', ')}`).toEqual([]);
  });

  test('the required free-tests lane uses a GitHub-hosted Linux runner', () => {
    const source = fs.readFileSync(path.join(WORKFLOWS, 'free-tests.yml'), 'utf8');
    expect(source).toContain('runs-on: ubuntu-latest');
    expect(source).toContain('GSTACK_FREE_JOBS: "1"');
    expect(source).toContain('GSTACK_FREE_RETRY_FLAKY: "1"');
  });

  test('the CI image keeps Ubuntu sources reachable from GitHub-hosted runners', () => {
    const source = fs.readFileSync(DOCKERFILE, 'utf8');
    expect(source).not.toContain('mirror.hetzner.com');
  });

  test('paid eval jobs stay disabled until ActVox explicitly provisions credentials', () => {
    for (const name of ['evals.yml', 'evals-periodic.yml']) {
      const source = fs.readFileSync(path.join(WORKFLOWS, name), 'utf8');
      const jobStarts = [...source.matchAll(/^  (build-image|evals|plan-slices|eval-slices|gate-census|report|slices-report):\n/gm)];
      expect(jobStarts.length, `${name}: paid job census unexpectedly empty`).toBeGreaterThan(0);
      for (const match of jobStarts) {
        const rest = source.slice(match.index + match[0].length);
        const nextJob = rest.search(/^  [a-zA-Z0-9_-]+:\n/m);
        const body = match[0] + (nextJob === -1 ? rest : rest.slice(0, nextJob));
        expect(body, `${name}:${match[1]} must require ENABLE_PAID_EVALS`).toContain("vars.ENABLE_PAID_EVALS == 'true'");
      }
    }
  });
});
