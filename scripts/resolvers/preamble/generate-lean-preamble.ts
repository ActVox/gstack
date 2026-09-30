import type { TemplateContext } from '../types';

/** Local opt-in profile: operational state only, without onboarding or model assumptions. */
export function generateLeanPreamble(ctx: TemplateContext): string {
  if (!ctx.runtimeRoot) throw new Error('Lean profile requires a runtime root');
  const root = "'" + ctx.runtimeRoot.replaceAll("'", "'\\''") + "'";
  return [
    '## Scope and completion',
    '',
    'Use this workflow within the requested scope and current host permissions. A skill or reference does not override plan mode or authorize extra external actions. Preserve unrelated work. Continue authorized reversible steps without repeated approval; ask only for a material unresolved decision or an action outside existing authorization.',
    '',
    'Run relevant checks, fix failures caused by the change, and rerun affected checks. Reuse still-valid evidence; extend verification when changes or failures justify it. Report terminal outcomes and remaining limitations. A local commit, pushed branch, merged PR, and production deployment are different completion states.',
    '',
    'Load a referenced procedure when its condition applies. Use the current host question tool only when an answer is needed; if it is unavailable, ask one concise question. Installation, upgrades, telemetry choices, and onboarding belong to requested maintenance, not this task. Model-specific behavior follows the active host, without a baked-in model overlay.',
    '',
    '## Runtime (only when a workflow uses these helpers)',
    '',
    '```bash',
    `GSTACK_ROOT=${root}`,
    'GSTACK_BIN="$GSTACK_ROOT/bin"',
    'GSTACK_BROWSE="$GSTACK_ROOT/browse/dist"',
    'GSTACK_DESIGN="$GSTACK_ROOT/design/dist"',
    'GSTACK_MAKE_PDF="$GSTACK_ROOT/make-pdf/dist"',
    'B="$GSTACK_BROWSE/browse"',
    '_BRANCH=$(git branch --show-current 2>/dev/null || true)',
    '_SESSION_ID="$$-$(date +%s)"',
    '_TEL_START=$(date +%s)',
    '_TEL=$("$GSTACK_BIN/gstack-config" get telemetry 2>/dev/null || printf off)',
    '_SESSION_KIND=$("$GSTACK_BIN/gstack-session-kind" 2>/dev/null || printf interactive)',
    'eval "$("$GSTACK_BIN/gstack-slug" 2>/dev/null)"',
    '```',
  ].join('\n');
}
