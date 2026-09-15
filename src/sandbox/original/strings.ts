/**
 * The live game's English interface strings, for the ported layouts.
 *
 * These are the same dictionaries src/i18n/en.ts composes (core, base, map,
 * chat). The sandbox reads them directly rather than through src/i18n/index.ts,
 * which lazy-loads translations; the practice sandbox is English-only.
 */
import {BASE} from '../../i18n/en/base';
import {CHAT} from '../../i18n/en/chat';
import {CORE} from '../../i18n/en/core';
import {MAP} from '../../i18n/en/map';

const EN_SUBSET = {...CORE, ...BASE, ...MAP, ...CHAT} as const;
export type LiveKey = keyof typeof EN_SUBSET;

export function t(key: LiveKey, vars?: Record<string, string | number>): string {
  let text: string = EN_SUBSET[key];
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  return text;
}
