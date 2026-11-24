import { assertFarmUsable, farmDebtOf, openFarmDebtHolds, owedOutsideFarm } from './farm-debt';

const due = (id: string, amount: number, split: unknown, paid = 0, waived = 0) => ({
  id, amount, waivedAmount: waived, farmSplit: split, payments: paid ? [{ amount: paid }] : [],
});

function fakeDb(dues: ReturnType<typeof due>[], holds: any[] = []) {
  const updated: string[] = [];
  return {
    updated,
    farmerDue: { findMany: async ({ where }: any) => (where.id ? dues.filter((d) => where.id.in.includes(d.id)) : dues) },
    farmDebtHold: {
      findMany: async () => holds.filter((h) => !h.clearedAt),
      update: async ({ where }: any) => { updated.push(where.id); holds.find((h) => h.id === where.id).clearedAt = new Date(); },
    },
  } as any;
}

describe('farm debt on a sold farm', () => {
  const dues = [
    due('a', 1000, [{ hectareId: 'H1', share: 1 }]),                                  // all on the sold farm
    due('b', 600, [{ hectareId: 'H1', share: 0.5 }, { hectareId: 'H2', share: 0.5 }]), // half on it
    due('c', 400, null),                                                             // not tied to a farm
    due('d', 500, [{ hectareId: 'H1', share: 1 }], 500),                              // already paid
  ];

  it("counts the farm's share of each due, and what is owed beyond the farm", async () => {
    const db = fakeDb(dues);
    const debt = await farmDebtOf(db, 'f', 'm', 'H1');
    expect(debt.amount).toBe(1300); // 1000 + 600 * 0.5
    expect(debt.dues.map((d) => d.dueId).sort()).toEqual(['a', 'b']);
    expect(await owedOutsideFarm(db, 'f', 'm', 'H1')).toBe(700); // 600 * 0.5 + 400
    expect(await owedOutsideFarm(db, 'f', 'm')).toBe(2000);      // no farm named: everything
  });

  it('blocks use while a hold has unpaid dues, and releases it once they are paid', async () => {
    const hold = { id: 'h', hectareId: 'H1', dues: [{ dueId: 'a', share: 1 }], amountAtTransfer: 1000, clearedAt: null };
    await expect(assertFarmUsable(fakeDb([due('a', 1000, null)], [hold]), 'H1')).rejects.toThrow(/cannot be used yet/);
    const paid = fakeDb([due('a', 1000, null, 1000)], [{ ...hold }]);
    await expect(assertFarmUsable(paid, 'H1')).resolves.toBeUndefined();
    expect(paid.updated).toEqual(['h']);
    expect(await openFarmDebtHolds(paid, 'H1')).toEqual([]);
  });
});
