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
