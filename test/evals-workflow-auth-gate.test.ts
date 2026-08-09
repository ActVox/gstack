import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WORKFLOW = path.resolve(__dirname, '..', '.github', 'workflows', 'evals.yml');
const content = fs.readFileSync(WORKFLOW, 'utf-8');

function suiteBlock(name: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  if (start === -1) throw new Error(`Missing eval suite: ${name}`);

  let end = start + 1;
  while (end < lines.length && !/^\s{10}- name: /.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

describe('evals.yml credential gating', () => {
  test('Anthropic-dependent suites declare their credential requirement', () => {
    const suites = [
      'llm-judge',
      'e2e-browse',
      'e2e-plan',
      'e2e-deploy',
      'e2e-design',
      'e2e-qa-workflow',
      'e2e-review',
      'e2e-workflow',
      'e2e-pty-plan-smoke',
    ];

    for (const suite of suites) {
      expect(suiteBlock(suite)).toContain('requires_anthropic: true');
    }
  });

  test('provider-independent suites remain runnable without Anthropic credentials', () => {
    const suites = ['e2e-qa-bugs', 'e2e-routing', 'e2e-codex', 'e2e-gemini'];
    for (const suite of suites) {
      expect(suiteBlock(suite)).not.toContain('requires_anthropic: true');
    }
  });

  test('run and skip steps use the same fail-closed credential predicate', () => {
    expect(content).toContain(
      "if: matrix.suite.requires_anthropic != true || env.HAS_ANTHROPIC_API_KEY == 'true'",
    );
    expect(content).toContain(
      "if: matrix.suite.requires_anthropic == true && env.HAS_ANTHROPIC_API_KEY != 'true'",
    );
  });
});
