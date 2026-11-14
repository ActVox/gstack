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
  test('no workflow job runs on an unprovisioned Ubicloud runner by default', () => {
    // Upstream keeps Ubicloud names in comments and as an explicit free_runner
    // dispatch override. The fork invariant is the effective default: no job's
    // `runs-on` and no default runner constant may name one.
    const assigned = /^\s*(?:runs-on|FREE_SUITE_RUNNER):\s*["']?ubicloud-/m;
    const offenders = fs.readdirSync(WORKFLOWS)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
      .filter((name) => assigned.test(fs.readFileSync(path.join(WORKFLOWS, name), 'utf8')));

    expect(offenders, `unprovisioned Ubicloud runner assignments: ${offenders.join(', ')}`).toEqual([]);
  });

  test('the required free-tests lane uses a GitHub-hosted Linux runner', () => {
    const source = fs.readFileSync(path.join(WORKFLOWS, 'free-tests.yml'), 'utf8');
    const freeSuite = source.split('\n  free-suite:\n')[1]!.split(/^  [a-zA-Z0-9_-]+:\n/m)[0]!;
    expect(source).toMatch(/^  FREE_SUITE_RUNNER: ubuntu-latest$/m);
    // The shard runner and its timeout now come from the free-plan job (upstream #3850).
    expect(freeSuite).toContain('runs-on: ${{ needs.free-plan.outputs.runner }}');
    expect(freeSuite).toMatch(/^    timeout-minutes: \S/m);
    expect(freeSuite).toContain('GSTACK_FREE_JOBS: "1"');
    expect(freeSuite).toContain('GSTACK_FREE_RETRY_FLAKY: "1"');
  });

  test('the CI image keeps Ubuntu sources reachable from GitHub-hosted runners', () => {
    const source = fs.readFileSync(DOCKERFILE, 'utf8');
    expect(source).not.toContain('mirror.hetzner.com');
  });

  test('the periodic re-dispatch job can only follow a paid report', () => {
    // Upstream's wiring test pins this job's exact `if`, so the fork does not add
    // its own ENABLE_PAID_EVALS clause. A skipped `report` leaves its output
    // empty, which keeps the job from ever dispatching another paid run.
    const source = fs.readFileSync(path.join(WORKFLOWS, 'evals-periodic.yml'), 'utf8');
    const body = source.split('\n  redispatch:\n')[1]!.split(/^  [a-zA-Z0-9_-]+:\n/m)[0]!;
    expect(body).toContain('needs: report');
    expect(body).toContain("needs.report.outputs.redispatch == 'true'");
    expect(body).toContain('runs-on: ubuntu-latest');
    const report = source.split('\n  report:\n')[1]!.split(/^  [a-zA-Z0-9_-]+:\n/m)[0]!;
    expect(report).toContain("vars.ENABLE_PAID_EVALS == 'true'");
  });

  test('paid eval jobs stay disabled until ActVox explicitly provisions credentials', () => {
    for (const name of ['evals.yml', 'evals-periodic.yml', 'evals-marathon.yml', 'eval-sweep.yml']) {
      const source = fs.readFileSync(path.join(WORKFLOWS, name), 'utf8');
      const jobStarts = [...source.matchAll(/^  (build-image|evals|plan-slices|eval-slices|eval-codex-slices|eval-rerun|train-bisect|schema-canary|gate-census|report|slices-report|image|sweep):\n/gm)];
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
