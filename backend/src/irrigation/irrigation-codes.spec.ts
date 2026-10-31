import { blockCodeFor, hectareCodeFor } from './irrigation-codes';

describe('irrigation codes', () => {
  it('names a block <canal>.<block><L|R>', () => {
    expect(blockCodeFor(5, 15, 'RIGHT')).toBe('5.15R');
    expect(blockCodeFor(1, 3, 'LEFT')).toBe('1.3L');
  });

  it('names a hectare <block code><hectare>', () => {
    expect(hectareCodeFor('5.15R', 12, 'RIGHT')).toBe('5.15R12');
    expect(hectareCodeFor('1.3L', 1, 'LEFT')).toBe('1.3L1');
  });

  it('keeps the older style for blocks without a side', () => {
    expect(hectareCodeFor('C01-B01', 2, null)).toBe('C01-B01-H02');
  });
});
