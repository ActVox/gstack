import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { EvalTestEntry } from './eval-store';
import { buildCookieWorkflowJudgeInput } from './cookie-workflow-judge-input';
import { COOKIE_MANUAL_REVIEW_FILE } from './cookie-workflow-manual-review';

// Later documentation added to the judged BROWSER.md section after the approval
// was recorded (v1.91.4.0 Windows Opera wave). Reversing it reconstructs the
// exact historical prompt bytes, including the section's line range.
const LATER_BROWSER_BLOCK = /\*\*Windows: Opera and Opera GX\.\*\*[\s\S]*?appear in CLI output\.\n\n/;
const LATER_BROWSER_EDITS: Array<[string, string]> = [
  ['The picker recognizes Chrome, Chromium, Brave, Edge, Windows-only Opera and Opera GX, and macOS-only Comet, Arc, and Dia.', 'The picker recognizes Chrome, Chromium, Brave, Edge, and macOS-only Comet, Arc, and Dia.'],
  [' Opera and Opera GX are Windows-only and read from `%APPDATA%\\Opera Software\\Opera Stable` or `Opera GX Stable`, in `Default` or `Profile N` directories; legacy root-level layouts, Opera side profiles and portable or relocated installs are not detected. Opera has no native extraction, so its App-Bound cookies (if any) need manual sign-in.', ''],
];

// Exact installer text in the historical approval. Fixture data only: never
// execute it or substitute it into current workflow/approval admission.
// The live generated docs now use the verified Bun 1.4.2 installer.
const APPROVED_BUN_INSTALL = `   if ! command -v bun >/dev/null 2>&1; then
     BUN_VERSION="1.3.10"
     BUN_INSTALL_SHA="bab8acfb046aac8c72407bdcce903957665d655d7acaa3e11c7c4616beae68dd"
     tmpfile=$(mktemp)
     curl -fsSL "https://bun.sh/install" -o "$tmpfile"
     # shasum is macOS/perl; coreutils-only Linux ships sha256sum instead —
     # resolve whichever exists so the verify never fails on a missing tool.
     if command -v sha256sum >/dev/null 2>&1; then
       actual_sha=$(sha256sum "$tmpfile" | awk '{print $1}')
     else
       actual_sha=$(shasum -a 256 "$tmpfile" | awk '{print $1}')
     fi
     if [ "$actual_sha" != "$BUN_INSTALL_SHA" ]; then
       echo "ERROR: bun install script checksum mismatch" >&2
       echo "  expected: $BUN_INSTALL_SHA" >&2
       echo "  got:      $actual_sha" >&2
       rm "$tmpfile"; exit 1
     fi
     BUN_VERSION="$BUN_VERSION" bash "$tmpfile"
     rm "$tmpfile"
   fi`;

export function approvedCookieWorkflowSource(source: string): string {
  let removedLines = 0;
  let removedSkillLines = 0;
  let historical = source
    .replace(/^   if ! command -v bun >\/dev\/null 2>&1; then\n[\s\S]*?^   fi$/m, block => {
      removedSkillLines = block.split('\n').length - APPROVED_BUN_INSTALL.split('\n').length;
      return APPROVED_BUN_INSTALL;
    })
    .replace(LATER_BROWSER_BLOCK, block => { removedLines = block.split('\n').length - 1; return ''; });
  for (const [later, earlier] of LATER_BROWSER_EDITS) historical = historical.replace(later, earlier);
  return historical
    .replace(/(--- BEGIN FILE "setup-browser-cookies\/SKILL\.md" \(lines \d+-)(\d+)(; entrypoint\) ---)/, (_, head, end, tail) => `${head}${Number(end) - removedSkillLines}${tail}`)
    .replace(/(--- BEGIN FILE "BROWSER\.md" \(lines \d+-)(\d+)(; section\) ---)/, (_, head, end, tail) => `${head}${Number(end) - removedLines}${tail}`);
}

export function manualReviewFixture(root = resolve(import.meta.dir, '../..')): EvalTestEntry {
  const approval = JSON.parse(readFileSync(resolve(root, COOKIE_MANUAL_REVIEW_FILE), 'utf8'));
  const prompt = approvedCookieWorkflowSource(buildCookieWorkflowJudgeInput(root).prompt);
  if (createHash('sha256').update(prompt).digest('hex') !== approval.prompt_sha256
    || Buffer.byteLength(prompt) !== approval.prompt_bytes) {
    throw new Error('Historical cookie approval fixture no longer reconstructs the exact approved prompt');
  }
  return {
    name: 'setup-browser-cookies/SKILL.md workflow', suite: 'Cookie setup workflow quality', tier: 'llm-judge',
    passed: false, execution: 'executed', exit_reason: 'provider_refusal', attempt: 1, duration_ms: 1, cost_usd: 0,
    model: approval.model, prompt,
    error: 'Synthetic provider refusal fixture, not live model evidence',
    manual_review: { approval, refusal: { stop_reason: 'refusal', response_id: 'msg_synthetic_fixture',
      request_id: 'req_synthetic_fixture', model: approval.model, input_tokens: 1, output_tokens: 0, text_blocks: 0 } },
  };
}
