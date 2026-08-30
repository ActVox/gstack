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
  });
});
