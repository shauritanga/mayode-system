import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SaleOrdersService } from './sale-orders.service';

const coopUser = (mamcosId: string | null = 'm1', id = 'u1') =>
  ({ id, role: UserRole.CUSTOM, mamcosId }) as any;
const superAdmin = {
  id: 'sa',
  role: UserRole.SUPER_ADMIN,
  mamcosId: null,
} as any;

const warehouse = {
  id: 'w1',
  name: 'Main store',
  mamcosId: 'm1',
  isActive: true,
};
const buyer = { id: 'b1', name: 'Acme Rice', mamcosId: 'm1' };
const lot = {
  id: 'lot1',
  lotNumber: 'LOT-1',
  totalWeightKg: 1000,
  riceVariety: 'Super',
  warehouseId: 'w1',
  _count: { inventoryRecords: 3 },
};

function setup(
  over: {
    available?: number;
    lotRemaining?: number;
    buyer?: any;
    lot?: any;
  } = {},
) {
  const available = over.available ?? 1000;
  const sums = { IN: available, RESERVE: 0, UNRESERVE: 0, OUT: 0, ADJUST: 0 };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ value: 7 }]),
    stockMovement: {
      groupBy: jest.fn().mockResolvedValue(
        Object.entries(sums).map(([type, v]) => ({
          type,
          _sum: { quantityKg: v },
        })),
      ),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
    saleOrder: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { quantityKg: 1000 - (over.lotRemaining ?? 1000) },
      }),
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ id: 'o1', ...data })),
    },
    sale: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantityKg: 0 } }),
    },
    saleOrderEvent: { create: jest.fn().mockResolvedValue({}) },
    mamcos: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Mbarali Rice Growers' }),
    },
  };
  const prisma: any = {
    buyer: {
      findUnique: jest
        .fn()
        .mockResolvedValue(over.buyer === undefined ? buyer : over.buyer),
    },
    lot: {
      findUnique: jest
        .fn()
        .mockResolvedValue(over.lot === undefined ? lot : over.lot),
    },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  const warehouses: any = {
    requireWarehouse: jest.fn().mockResolvedValue(warehouse),
    userNames: jest.fn().mockResolvedValue(new Map()),
  };
  return {
    service: new SaleOrdersService(prisma, {} as any, warehouses, settings()),
    prisma,
    tx,
    warehouses,
  };
}

const settings = (
  over: Partial<{
    loadTolerancePct: number;
    reservationExpiryDays: number;
  }> = {},
): any => ({
  getSalesSettings: jest.fn().mockResolvedValue({
    loadTolerancePct: 2,
    reservationExpiryDays: 7,
    ...over,
  }),
});

const dto = {
  buyerId: 'b1',
  warehouseId: 'w1',
  lotId: 'lot1',
  quantityKg: 400,
  pricePerKg: 2500,
};

describe('Reserving stock for a buyer', () => {
  it('issues a reference, holds the stock and records who reserved it', async () => {
    const { service, tx } = setup();
    const order = await service.reserve(dto, coopUser());
    expect(order.reference).toBe('MBA-26-0007');
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'RESERVE',
        quantityKg: 400,
        refType: 'sale_order',
        createdByUserId: 'u1',
      }),
    });
    expect(tx.saleOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdByUserId: 'u1', mamcosId: 'm1' }),
    });
    expect(tx.saleOrderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'order.reserved',
        actorUserId: 'u1',
        toStatus: 'RESERVED',
      }),
    });
  });

  it('refuses to oversell the warehouse', async () => {
    const { service, tx } = setup({ available: 300 });
    await expect(service.reserve(dto, coopUser())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.saleOrder.create).not.toHaveBeenCalled();
  });

  it('refuses to oversell the lot even when the warehouse has more stock', async () => {
    const { service, tx } = setup({ lotRemaining: 350 });
    await expect(service.reserve(dto, coopUser())).rejects.toThrow(
      'only 350 kg left',
    );
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("hides another cooperative's buyer", async () => {
    const { service } = setup({ buyer: { ...buyer, mamcosId: 'm2' } });
    await expect(service.reserve(dto, coopUser())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a lot stored in a different warehouse', async () => {
    const { service } = setup({ lot: { ...lot, warehouseId: 'w2' } });
    await expect(service.reserve(dto, coopUser())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Super Admin cannot mix a platform buyer with a cooperative warehouse', async () => {
    const { service } = setup({ buyer: { ...buyer, mamcosId: null } });
    await expect(service.reserve(dto, superAdmin)).rejects.toThrow(
      'same cooperative',
    );
  });
});

describe('Loading trucks', () => {
  const truck = { vehiclePlate: 't123abc', driverName: 'Juma' };

  function loadSetup(
    sale: { paymentReceived: boolean },
    order: Record<string, unknown> = {},
    priorLoads: { weightKg: number; sequence: number }[] = [],
    available = 5000,
  ) {
    const base = {
      id: 'o1',
      reference: 'MAD-26-0001',
      mamcosId: 'm1',
      warehouseId: 'w1',
      status: 'CONFIRMED',
      saleId: 's1',
      quantityKg: 1000,
      needsTransport: false,
      creditTermDays: null,
      releaseApprovedByUserId: null,
      ...order,
    };
    const movements: any[] = [];
    const loadedBefore = priorLoads.reduce((t, l) => t + l.weightKg, 0);
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      saleOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderLoad: {
        findMany: jest.fn().mockResolvedValue(priorLoads),
        create: jest.fn(),
      },
      stockMovement: {
        createMany: jest.fn(async ({ data }) => {
          movements.push(...data);
        }),
        groupBy: jest.fn().mockResolvedValue([
          { type: 'IN', _sum: { quantityKg: available } },
          { type: 'RESERVE', _sum: { quantityKg: base.quantityKg } },
          { type: 'UNRESERVE', _sum: { quantityKg: loadedBefore } },
          { type: 'OUT', _sum: { quantityKg: loadedBefore } },
        ]),
      },
      dispatch: { create: jest.fn() },
      inventoryRecord: { updateMany: jest.fn() },
      saleOrderEvent: { create: jest.fn() },
    };
    const prisma: any = {
      saleOrder: {
        findUnique: jest.fn().mockResolvedValue(base),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...base,
          events: [],
          loads: [],
          buyer: {},
          warehouse: {},
          lot: {},
          sale,
        }),
      },
      sale: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 's1',
          ...sale,
          lot: { inventoryRecords: [{ id: 'r1' }] },
        }),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };
    const warehouses: any = {
      requireWarehouse: jest.fn().mockResolvedValue(warehouse),
      userNames: jest.fn().mockResolvedValue(new Map()),
    };
    return {
      service: new SaleOrdersService(prisma, {} as any, warehouses, settings()),
      tx,
      movements,
    };
  }
  const sum = (m: any[], type: string) =>
    m.filter((x) => x.type === type).reduce((s, x) => s + x.quantityKg, 0);

  it('blocks loading while unpaid with no credit term or manager approval', async () => {
    const { service, tx } = loadSetup({ paymentReceived: false });
    await expect(service.loadTruck('o1', truck, coopUser())).rejects.toThrow(
      'Payment has not been received',
    );
    expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ['paid', { paymentReceived: true }, {}],
    ['credit approved', { paymentReceived: false }, { creditTermDays: 14 }],
    [
      'manager override',
      { paymentReceived: false },
      { releaseApprovedByUserId: 'mgr' },
    ],
  ])('loads a truck when %s', async (_n, sale, order) => {
    const { service, tx } = loadSetup(sale, order);
    await service.loadTruck('o1', { ...truck, weightKg: 1000 }, coopUser());
    expect(tx.orderLoad.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sequence: 1,
        weightKg: 1000,
        vehiclePlate: 'T123ABC',
      }),
    });
  });

  it('a full single load turns the reservation into an outflow and releases the order', async () => {
    const { service, tx, movements } = loadSetup({ paymentReceived: true });
    await service.loadTruck('o1', truck, coopUser());
    expect(sum(movements, 'UNRESERVE')).toBe(1000);
    expect(sum(movements, 'OUT')).toBe(1000);
    expect(tx.saleOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RELEASED' }),
      }),
    );
    expect(tx.inventoryRecord.updateMany).toHaveBeenCalled();
    expect(tx.dispatch.create).toHaveBeenCalledTimes(1);
  });

  it('a partial first load keeps the order open, with the rest still reserved', async () => {
    const { service, tx, movements } = loadSetup({ paymentReceived: true });
    await service.loadTruck('o1', { ...truck, weightKg: 600 }, coopUser());
    expect(sum(movements, 'UNRESERVE')).toBe(600);
    expect(sum(movements, 'OUT')).toBe(600);
    expect(tx.saleOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PARTIALLY_RELEASED' } }),
    );
    expect(tx.inventoryRecord.updateMany).not.toHaveBeenCalled();
  });

  it('the second truck finishes the order and does not create another gate pass', async () => {
    const { service, tx, movements } = loadSetup(
      { paymentReceived: true },
      { status: 'PARTIALLY_RELEASED' },
      [{ weightKg: 600, sequence: 1 }],
    );
    await service.loadTruck('o1', { ...truck, weightKg: 400 }, coopUser());
    expect(sum(movements, 'UNRESERVE')).toBe(400);
    expect(tx.orderLoad.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sequence: 2 }),
    });
    expect(tx.saleOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RELEASED' }),
      }),
    );
    expect(tx.dispatch.create).not.toHaveBeenCalled();
  });

  it('a final load a little short is accepted and frees the shortfall, so the ledger balances', async () => {
    const { service, movements } = loadSetup(
      { paymentReceived: true },
      { status: 'PARTIALLY_RELEASED' },
      [{ weightKg: 600, sequence: 1 }],
    );
    await service.loadTruck('o1', { ...truck, weightKg: 390 }, coopUser()); // 990 of 1000: within 2%
    expect(sum(movements, 'OUT')).toBe(390);
    expect(sum(movements, 'UNRESERVE')).toBe(400); // 390 loaded + 10 kg shortfall released
  });

  it('a slight overshoot comes from free stock and is allowed within tolerance', async () => {
    const { service, movements } = loadSetup(
      { paymentReceived: true },
      {},
      [],
      5000,
    );
    await service.loadTruck('o1', { ...truck, weightKg: 1015 }, coopUser());
    expect(sum(movements, 'OUT')).toBe(1015);
    expect(sum(movements, 'UNRESERVE')).toBe(1000);
  });

  it('refuses a load far beyond the order, and an overshoot with no free stock to cover it', async () => {
    const big = loadSetup({ paymentReceived: true });
    await expect(
      big.service.loadTruck('o1', { ...truck, weightKg: 1100 }, coopUser()),
    ).rejects.toThrow('Re-weigh');
    const tight = loadSetup({ paymentReceived: true }, {}, [], 1005); // 5 kg free
    await expect(
      tight.service.loadTruck('o1', { ...truck, weightKg: 1015 }, coopUser()),
    ).rejects.toThrow('free stock');
    expect(big.movements).toHaveLength(0);
    expect(tight.movements).toHaveLength(0);
  });

  it('cannot load before the order is confirmed or after it is fully released', async () => {
    await expect(
      loadSetup(
        { paymentReceived: true },
        { status: 'RESERVED' },
      ).service.loadTruck('o1', truck, coopUser()),
    ).rejects.toThrow('Confirm the order');
    await expect(
      loadSetup(
        { paymentReceived: true },
        { status: 'RELEASED' },
      ).service.loadTruck('o1', truck, coopUser()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('transport rules follow what the buyer asked for', async () => {
    const own = loadSetup({ paymentReceived: true });
    await expect(
      own.service.loadTruck(
        'o1',
        { ...truck, mode: 'HIRED', transporterName: 'FastHaul' },
        coopUser(),
      ),
    ).rejects.toThrow('buyer collects');
    const ours = loadSetup({ paymentReceived: true }, { needsTransport: true });
    await expect(
      ours.service.loadTruck(
        'o1',
        { ...truck, mode: 'BUYER_PICKUP' },
        coopUser(),
      ),
    ).rejects.toThrow('arrange transport');
    await expect(
      ours.service.loadTruck('o1', { ...truck, mode: 'HIRED' }, coopUser()),
    ).rejects.toThrow('Name the transporter');
    await ours.service.loadTruck(
      'o1',
      { ...truck, mode: 'HIRED', transporterName: 'FastHaul' },
      coopUser(),
    );
    expect(ours.tx.orderLoad.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: 'HIRED', status: 'ASSIGNED' }),
    });
  });

  it('a buyer collecting in their own truck is recorded as delivered at the gate', async () => {
    const { service, tx } = loadSetup({ paymentReceived: true });
    await service.loadTruck('o1', truck, coopUser());
    expect(tx.orderLoad.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: 'BUYER_PICKUP',
        status: 'DELIVERED',
        receivedBy: 'Juma',
      }),
    });
  });

  it('hides orders of another cooperative', async () => {
    const { service } = loadSetup(
      { paymentReceived: true },
      { mamcosId: 'm2' },
    );
    await expect(
      service.loadTruck('o1', truck, coopUser()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Cancelling', () => {
  it('only a reserved order can be cancelled; confirmed orders already have a financial sale', async () => {
    const prisma: any = {
      saleOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'o1', mamcosId: 'm1', status: 'CONFIRMED' }),
      },
    };
    const service = new SaleOrdersService(
      prisma,
      {} as any,
      {} as any,
      settings(),
    );
    await expect(
      service.cancel('o1', 'changed mind', coopUser()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('Tolerance and expiry come from Settings', () => {
  it('a wider tolerance from Settings accepts a bigger overshoot', async () => {
    const mk = (pct: number) => {
      const tx: any = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        saleOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        orderLoad: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn(),
        },
        stockMovement: {
          createMany: jest.fn(),
          groupBy: jest.fn().mockResolvedValue([
            { type: 'IN', _sum: { quantityKg: 5000 } },
            { type: 'RESERVE', _sum: { quantityKg: 1000 } },
          ]),
        },
        dispatch: { create: jest.fn() },
        inventoryRecord: { updateMany: jest.fn() },
        saleOrderEvent: { create: jest.fn() },
      };
      const order = {
        id: 'o1',
        reference: 'R',
        mamcosId: 'm1',
        warehouseId: 'w1',
        status: 'CONFIRMED',
        saleId: 's1',
        quantityKg: 1000,
        needsTransport: false,
        creditTermDays: 7,
        releaseApprovedByUserId: null,
      };
      const prisma: any = {
        saleOrder: {
          findUnique: jest.fn().mockResolvedValue(order),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            ...order,
            events: [],
            loads: [],
            buyer: {},
            warehouse: {},
            lot: {},
            sale: {},
          }),
        },
        sale: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 's1',
            paymentReceived: false,
            lot: { inventoryRecords: [] },
          }),
        },
        $transaction: jest.fn(async (fn) => fn(tx)),
      };
      return new SaleOrdersService(
        prisma,
        {} as any,
        {
          requireWarehouse: jest.fn().mockResolvedValue(warehouse),
          userNames: jest.fn().mockResolvedValue(new Map()),
        } as any,
        settings({ loadTolerancePct: pct }),
      );
    };
    const load = {
      vehiclePlate: 'T 123 ABC',
      driverName: 'Juma',
      weightKg: 1040,
    };
    await expect(mk(2).loadTruck('o1', load, coopUser())).rejects.toThrow(
      'Re-weigh',
    );
    await expect(
      mk(5).loadTruck('o1', load, coopUser()),
    ).resolves.toBeDefined();
  });

  it('expires stale unconfirmed orders, returning their stock, recorded as done by the system', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      saleOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stockMovement: { create: jest.fn() },
      saleOrderEvent: { create: jest.fn() },
    };
    const prisma: any = {
      saleOrder: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'o1', warehouseId: 'w1', quantityKg: 400 },
          ]),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };
    const service = new SaleOrdersService(
      prisma,
      {} as any,
      {} as any,
      settings({ reservationExpiryDays: 3 }),
    );
    expect(await service.expireStale()).toBe(1);
    expect(prisma.saleOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'RESERVED' }),
      }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'UNRESERVE', quantityKg: 400 }),
    });
    expect(tx.saleOrderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'order.expired',
        actorUserId: null,
      }),
    });
  });

  it('expiry set to 0 turns it off', async () => {
    const prisma: any = { saleOrder: { findMany: jest.fn() } };
    const service = new SaleOrdersService(
      prisma,
      {} as any,
      {} as any,
      settings({ reservationExpiryDays: 0 }),
    );
    expect(await service.expireStale()).toBe(0);
    expect(prisma.saleOrder.findMany).not.toHaveBeenCalled();
  });

  it('only a part-loaded order can be closed short', async () => {
    const prisma: any = {
      saleOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'o1', mamcosId: 'm1', status: 'CONFIRMED' }),
      },
    };
    const service = new SaleOrdersService(
      prisma,
      {} as any,
      {} as any,
      settings(),
    );
    await expect(
      service.closeShort('o1', 'buyer left', coopUser()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
