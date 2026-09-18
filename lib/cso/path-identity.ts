import * as fs from 'node:fs';
import { relative, resolve, sep } from 'node:path';

/**
 * Resolve only macOS's root-owned compatibility aliases. Caller-created
 * symlinks remain visible to component-by-component security validation.
 */
export function resolvePlatformSystemAlias(value: string): string {
  const requested = resolve(value);
  if (process.platform !== 'darwin') return requested;
  for (const alias of ['/var', '/tmp', '/etc']) {
    if (requested !== alias && !requested.startsWith(`${alias}${sep}`)) continue;
    let metadata: fs.Stats, target: string;
    try {
      metadata = fs.lstatSync(alias);
      target = fs.realpathSync(alias);
    } catch {
      return requested;
    }
    const expected = resolve('/private', alias.slice(1));
    if (!metadata.isSymbolicLink() || metadata.uid !== 0 || target !== expected) return requested;
    return resolve(target, relative(alias, requested));
  }
  return requested;
}
