import { balanceFrom } from './stock';

describe('stock balance', () => {
  it('derives on-hand, reserved and available from the ledger', () => {
    expect(
      balanceFrom({
        IN: 1000,
        RESERVE: 400,
        UNRESERVE: 100,
        OUT: 0,
        ADJUST: -20,
      }),
    ).toEqual({
      onHandKg: 980,
      reservedKg: 300,
      availableKg: 680,
    });
  });

  it('a release converts the reservation into an outflow without changing available twice', () => {
    const reserved = balanceFrom({ IN: 1000, RESERVE: 400 });
    const released = balanceFrom({
      IN: 1000,
      RESERVE: 400,
      UNRESERVE: 400,
      OUT: 400,
    });
    expect(reserved.availableKg).toBe(600);
    expect(released).toEqual({
      onHandKg: 600,
      reservedKg: 0,
      availableKg: 600,
    });
  });

  it('is zero for an empty warehouse', () => {
    expect(balanceFrom({})).toEqual({
      onHandKg: 0,
      reservedKg: 0,
      availableKg: 0,
    });
  });
});
