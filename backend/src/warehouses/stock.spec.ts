import { composeBalance } from './stock';

describe('stock balance', () => {
  it('available is what is on hand minus what orders have claimed', () => {
    expect(composeBalance(980, 300)).toEqual({ onHandKg: 980, reservedKg: 300, availableKg: 680 });
  });

  it('is zero for an empty warehouse', () => {
    expect(composeBalance(0, 0)).toEqual({ onHandKg: 0, reservedKg: 0, availableKg: 0 });
  });

  it('rounds away floating point noise', () => {
    expect(composeBalance(0.1 + 0.2, 0).onHandKg).toBe(0.3);
  });
});
