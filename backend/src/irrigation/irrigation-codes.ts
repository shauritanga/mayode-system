/**
 * Codes for the physical layout: <canal>.<block><L|R> for a block (5.15R) and <block code><hectare> for a hectare (5.15R12).
 * Blocks from before sides were recorded have no side and keep the older -H01 style for their hectares.
 */
export type BlockSide = 'LEFT' | 'RIGHT';

const SIDE_LETTER: Record<BlockSide, string> = { LEFT: 'L', RIGHT: 'R' };

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const blockCodeFor = (canalNumber: number, blockNumber: number, side: BlockSide) =>
  `${canalNumber}.${blockNumber}${SIDE_LETTER[side]}`;

export const hectareCodeFor = (blockCode: string, hectareNumber: number, side?: BlockSide | null) =>
  side ? `${blockCode}${hectareNumber}` : `${blockCode}-H${pad2(hectareNumber)}`;

/**
 * A farm id typed the way it is shown (1:1R-1) or with dots (1.1R-1) is looked up as it is stored (1.1R1); anything else is left alone.
 * Block ids (1:1R, 1.1R) are normalised the same way.
 */
export function normalizeFarmId(text: string): string {
  const t = text.trim().toUpperCase().replace(/\s+/g, '');
  const hectare = /^(\d+)[.:](\d+[LR])-?(\d+)$/.exec(t);
  if (hectare) return `${hectare[1]}.${hectare[2]}${hectare[3]}`;
  const block = /^(\d+)[.:](\d+[LR])$/.exec(t);
  if (block) return `${block[1]}.${block[2]}`;
  return text.trim();
}
