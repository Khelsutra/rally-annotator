// Dependency-free English message catalog. UI code emits keys rather than duplicating prose;
// missing keys degrade to the raw key and are forbidden by the key-presence tests.

import en from "./locales/en/common.json";

type Catalog = Record<string, string>;
const C = (j: unknown) => j as unknown as Catalog;
const CATALOG = C(en);

function interpolate(tpl: string, vars?: Record<string, string | number>): string {
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const tpl = CATALOG[key] ?? key;
  return interpolate(tpl, vars);
}

// Catalog keys excluding the `_meta` bookkeeping entry.
export function catalogKeys(): string[] {
  return Object.keys(CATALOG).filter((k) => k !== "_meta");
}
export const EN_KEYS: string[] = catalogKeys();
