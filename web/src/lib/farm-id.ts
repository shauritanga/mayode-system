/**
 * Display form of the farm id. Stored codes stay as generated (hectare 5.15R12, block 5.15R); they are shown as
 * canal:block-side, then a dash and the hectare number — 5:15R-12 and 5:15R. Anything else (older -H01 codes,
 * canal codes) is returned unchanged.
 */
export function farmId(code?: string | null): string {
  if (!code) return code ?? '';
  const hectare = /^(\d+)\.(\d+[LR])(\d+)$/.exec(code);
  if (hectare) return `${hectare[1]}:${hectare[2]}-${hectare[3]}`;
  const block = /^(\d+)\.(\d+[LR])$/.exec(code);
  if (block) return `${block[1]}:${block[2]}`;
  return code;
}
