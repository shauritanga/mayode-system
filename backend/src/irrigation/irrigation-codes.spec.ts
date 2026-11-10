import { blockCodeFor, hectareCodeFor, normalizeFarmId } from './irrigation-codes';

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

  it('reads a farm id as shown or as stored', () => {
    expect(normalizeFarmId('1:1R-1')).toBe('1.1R1');
    expect(normalizeFarmId('1.1r-1')).toBe('1.1R1');
    expect(normalizeFarmId(' 5.15R12 ')).toBe('5.15R12');
    expect(normalizeFarmId('5:15R')).toBe('5.15R');
    expect(normalizeFarmId('Mwakasege')).toBe('Mwakasege');
  });
});
