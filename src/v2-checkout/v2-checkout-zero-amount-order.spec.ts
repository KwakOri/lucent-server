import { V2FulfillmentService } from '../v2-fulfillment/v2-fulfillment.service';
import { V2CheckoutService } from './v2-checkout.service';

type Row = Record<string, any>;

type Filter =
  | { op: 'eq'; column: string; value: unknown }
  | { op: 'in'; column: string; values: unknown[] }
  | { op: 'is'; column: string; value: unknown };

interface FakeCall {
  table: string;
  method: 'select' | 'insert' | 'update' | 'delete';
}

interface FakeOptions {
  tables: Record<string, Row[]>;
  // 쓰기를 반영하기 전에 오류를 돌려줄 때 쓴다(Supabase 쓰기 실패 흉내).
  failWrite?: (call: FakeCall, payload: Row | Row[]) => Row | null;
}

let clock = Date.parse('2026-10-30T00:00:00.000Z');
function nextTimestamp(): string {
  clock += 1;
  return new Date(clock).toISOString();
}

function uuid(prefix: number, index: number): string {
  return `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function matchesFilter(row: Row, filter: Filter): boolean {
  switch (filter.op) {
    case 'eq':
      return row[filter.column] === filter.value;
    case 'in':
      return filter.values.includes(row[filter.column]);
    case 'is':
      return (row[filter.column] ?? null) === filter.value;
  }
}

function compareForOrder(
  left: Row,
  right: Row,
  orders: Array<{ column: string; ascending: boolean }>,
): number {
  for (const order of orders) {
    const a = left[order.column] ?? null;
    const b = right[order.column] ?? null;
    if (a === b) {
      continue;
    }
    if (a === null) {
      return order.ascending ? 1 : -1;
    }
    if (b === null) {
      return order.ascending ? -1 : 1;
    }
    const result = a < b ? -1 : 1;
    return order.ascending ? result : -result;
  }
  return 0;
}

function createFakeSupabase(options: FakeOptions) {
  const calls: FakeCall[] = [];
  const tables = options.tables;
  let insertedCount = 0;

  const embedOrder = (order: Row): Row => ({
    ...order,
    items: (tables.v2_order_items || [])
      .filter((item) => item.order_id === order.id)
      .map((item) => ({ ...item, adjustments: [] })),
    adjustments: [],
    payments: (tables.v2_payments || [])
      .filter((payment) => payment.order_id === order.id)
      .map((payment) => ({ ...payment })),
  });

  const project = (table: string, columns: string | null, row: Row): Row => {
    if (!columns || columns.includes('*') || columns.includes('(')) {
      return table === 'v2_orders' && columns?.includes('items:')
        ? embedOrder(row)
        : { ...row };
    }
    const picked: Row = {};
    for (const column of columns.split(',').map((value) => value.trim())) {
      picked[column] = row[column];
    }
    return picked;
  };

  const from = (table: string) => {
    let method: FakeCall['method'] = 'select';
    let columns: string | null = null;
    let returning = false;
    let payload: Row | Row[] = {};
    let single = false;
    let limit: number | null = null;
    const filters: Filter[] = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];

    const execute = async () => {
      const call: FakeCall = { table, method };
      calls.push(call);
      const rowsOf = () => (tables[table] ||= []);
      const matched = () =>
        rowsOf().filter((row) =>
          filters.every((filter) => matchesFilter(row, filter)),
        );

      if (method !== 'select') {
        const failure = options.failWrite?.(call, payload);
        if (failure) {
          return { data: null, error: failure };
        }
      }

      if (method === 'insert') {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted = rows.map((row) => {
          insertedCount += 1;
          const now = nextTimestamp();
          return {
            id: uuid(9, insertedCount),
            created_at: now,
            updated_at: now,
            ...row,
          };
        });
        rowsOf().push(...inserted);
        const data = returning ? inserted.map((row) => ({ ...row })) : null;
        return { data: single ? (data?.[0] ?? null) : data, error: null };
      }

      if (method === 'update') {
        const targets = matched();
        for (const row of targets) {
          Object.assign(row, payload, { updated_at: nextTimestamp() });
        }
        const data = returning
          ? targets.map((row) => project(table, columns, row))
          : null;
        return { data: single ? (data?.[0] ?? null) : data, error: null };
      }

      if (method === 'delete') {
        const targets = matched();
        tables[table] = rowsOf().filter((row) => !targets.includes(row));
        return { data: null, error: null };
      }

      let rows = [...matched()].sort((left, right) =>
        compareForOrder(left, right, orders),
      );
      if (limit !== null) {
        rows = rows.slice(0, limit);
      }
      const data = rows.map((row) => project(table, columns, row));
      if (single) {
        if (data.length > 1) {
          return { data: null, error: { message: 'multiple rows' } };
        }
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null };
    };

    const builder: any = {
      select: (selectColumns?: string) => {
        columns = selectColumns ?? '*';
        if (method !== 'select') {
          returning = true;
        }
        return builder;
      },
      insert: (rows: Row | Row[]) => {
        method = 'insert';
        payload = rows;
        return builder;
      },
      update: (patch: Row) => {
        method = 'update';
        payload = patch;
        return builder;
      },
      delete: () => {
        method = 'delete';
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value });
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push({ op: 'in', column, values: [...values] });
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push({ op: 'is', column, value });
        return builder;
      },
      order: (column: string, orderOptions?: { ascending?: boolean }) => {
        orders.push({ column, ascending: orderOptions?.ascending !== false });
        return builder;
      },
      limit: (value: number) => {
        limit = value;
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return builder;
      },
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => execute().then(onFulfilled, onRejected),
    };
    return builder;
  };

  return { supabase: { from }, calls, tables };
}

const PROFILE_ID = uuid(1, 1);

interface LineSpec {
  line_type?: 'STANDARD' | 'BUNDLE_PARENT' | 'BUNDLE_COMPONENT';
  fulfillment_type_snapshot: 'DIGITAL' | 'PHYSICAL' | null;
  requires_shipping_snapshot: boolean | null;
  line_status?: string;
}

const DIGITAL: LineSpec = {
  fulfillment_type_snapshot: 'DIGITAL',
  requires_shipping_snapshot: false,
};
const PHYSICAL: LineSpec = {
  fulfillment_type_snapshot: 'PHYSICAL',
  requires_shipping_snapshot: true,
};

function emptyTables(): Record<string, Row[]> {
  return {
    v2_orders: [],
    v2_order_items: [],
    v2_payments: [],
    v2_digital_entitlements: [],
    v2_digital_entitlement_events: [],
  };
}

function createServices(fake: ReturnType<typeof createFakeSupabase>) {
  const notifications = {
    notifyOrderPlaced: jest.fn(),
    notifyPaymentCaptured: jest.fn(),
  };
  const fulfillment = new V2FulfillmentService(notifications as any);
  jest
    .spyOn(fulfillment as any, 'supabase', 'get')
    .mockReturnValue(fake.supabase);
  const service = new V2CheckoutService(
    {} as any,
    notifications as any,
    fulfillment,
  );
  jest.spyOn(service as any, 'supabase', 'get').mockReturnValue(fake.supabase);
  const applyPaymentCallback = jest.spyOn(service, 'applyPaymentCallback');
  const ensureEntitlements = jest.spyOn(
    fulfillment,
    'ensureDigitalEntitlementsForOrder',
  );
  const warn = jest
    .spyOn((service as any).logger, 'warn')
    .mockImplementation(() => undefined);
  return {
    service,
    notifications,
    applyPaymentCallback,
    ensureEntitlements,
    warn,
  };
}

// 장바구니·견적·항목 생성은 스텁으로 두고, 주문 행 저장부터 응답까지는 실제 코드로 돈다.
function prepareCreateOrder(
  service: V2CheckoutService,
  tables: Record<string, Row[]>,
  input: { totalPayable: number; lines: LineSpec[] },
) {
  const stub = (name: string, value: unknown) =>
    jest.spyOn(service as any, name).mockResolvedValue(value as never);
  stub('getOrCreateActiveCart', { id: uuid(13, 1) });
  stub('getCartItems', [{ id: uuid(14, 1) }]);
  stub('resolveCheckoutPayload', {
    channel: 'WEB',
    lineContexts: [],
    campaignId: null,
    couponCode: null,
  });
  stub('assertCartHasNoOwnedDigitalVariants', undefined);
  stub('buildCheckoutQuote', {
    quote: {
      quote_reference: 'QUOTE-1',
      summary: {
        subtotal: input.totalPayable,
        total_payable_amount: input.totalPayable,
      },
    },
    shippingAmount: 0,
  });
  jest
    .spyOn(service as any, 'buildCheckoutPriceMismatches')
    .mockReturnValue([]);
  let itemIndex = 0;
  jest
    .spyOn(service as any, 'createOrderItems')
    .mockImplementation(async (...args: unknown[]) => {
      const orderId = args[0] as string;
      const contexts = input.lines.map((line) => {
        itemIndex += 1;
        const row = {
          id: uuid(20, itemIndex),
          order_id: orderId,
          line_type: line.line_type || 'STANDARD',
          line_status: line.line_status || 'PENDING',
          variant_id: null,
          product_id: null,
          quantity: 1,
          fulfillment_type_snapshot: line.fulfillment_type_snapshot,
          requires_shipping_snapshot: line.requires_shipping_snapshot,
          final_line_total: 0,
          display_snapshot: {},
          created_at: nextTimestamp(),
        };
        tables.v2_order_items.push(row);
        return { orderItem: row };
      });
      return contexts;
    });
  stub('createOrderItemAdjustments', undefined);
  stub('createOrderAdjustments', undefined);
  stub('reserveTrackedInventoryForOrderItems', undefined);
  stub('markCartConverted', undefined);
}

function trail(fake: ReturnType<typeof createFakeSupabase>): string[] {
  return fake.calls.map((call) => `${call.table}.${call.method}`);
}

// 주문 생성의 기존 Supabase 호출 순서(스텁 밖): 멱등 조회 → 주문 insert → 주문 상세 조회
const CREATE_ORDER_TRAIL = [
  'v2_orders.select',
  'v2_orders.insert',
  'v2_orders.select',
];

describe('V2CheckoutService 0원 디지털 주문 자동 결제 확정 (WN-499)', () => {
  const envKeys = [
    'V2_FULFILLMENT_WRITE_ENABLED',
    'V2_FULFILLMENT_ENABLE_DIGITAL_WRITE',
    'V2_FULFILLMENT_ALLOWED_CHANNELS',
    'V2_FULFILLMENT_ALLOWED_VARIANT_IDS',
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.V2_FULFILLMENT_WRITE_ENABLED = 'true';
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    jest.restoreAllMocks();
  });

  it('유료 디지털 주문은 지금처럼 입금 대기로 남고 결제·권한·호출이 늘지 않는다', async () => {
    const tables = emptyTables();
    const fake = createFakeSupabase({ tables });
    const { service, notifications, applyPaymentCallback } =
      createServices(fake);
    prepareCreateOrder(service, tables, {
      totalPayable: 1000,
      lines: [DIGITAL],
    });

    const result = await service.createOrder(PROFILE_ID, {
      idempotency_key: 'PAID-1',
    });

    expect(Object.keys(result)).toEqual([
      'idempotent_replayed',
      'quote_reference',
      'order',
    ]);
    expect(result.idempotent_replayed).toBe(false);
    expect(result.order).toEqual(
      expect.objectContaining({
        order_status: 'PENDING',
        payment_status: 'PENDING',
        fulfillment_status: 'UNFULFILLED',
        grand_total: 1000,
        payments: [],
      }),
    );
    expect(tables.v2_payments).toHaveLength(0);
    expect(tables.v2_digital_entitlements).toHaveLength(0);
    expect(applyPaymentCallback).not.toHaveBeenCalled();
    expect(notifications.notifyOrderPlaced).toHaveBeenCalledTimes(1);
    expect(notifications.notifyPaymentCaptured).not.toHaveBeenCalled();
    expect(trail(fake)).toEqual(CREATE_ORDER_TRAIL);
  });

  it.each([
    ['실물만', [PHYSICAL]],
    ['디지털 + 실물', [DIGITAL, PHYSICAL]],
    [
      '배송 필요로 표시된 디지털',
      [
        {
          fulfillment_type_snapshot: 'DIGITAL',
          requires_shipping_snapshot: true,
        },
      ],
    ],
    [
      '이행 유형을 모르는 항목',
      [
        DIGITAL,
        { fulfillment_type_snapshot: null, requires_shipping_snapshot: null },
      ],
    ],
    [
      '실물 구성품이 있는 번들',
      [
        { line_type: 'BUNDLE_PARENT', ...DIGITAL },
        { line_type: 'BUNDLE_COMPONENT', ...DIGITAL },
        { line_type: 'BUNDLE_COMPONENT', ...PHYSICAL },
      ],
    ],
  ] as Array<[string, LineSpec[]]>)(
    '0원이어도 디지털 전용이 아니면(%s) 지금처럼 입금 대기로 남는다',
    async (_label, lines) => {
      const tables = emptyTables();
      const fake = createFakeSupabase({ tables });
      const { service, notifications, applyPaymentCallback } =
        createServices(fake);
      prepareCreateOrder(service, tables, { totalPayable: 0, lines });

      const result = await service.createOrder(PROFILE_ID, {
        idempotency_key: 'MIXED-1',
      });

      expect(result.order).toEqual(
        expect.objectContaining({
          order_status: 'PENDING',
          payment_status: 'PENDING',
          grand_total: 0,
          payments: [],
        }),
      );
      expect(tables.v2_payments).toHaveLength(0);
      expect(tables.v2_digital_entitlements).toHaveLength(0);
      expect(applyPaymentCallback).not.toHaveBeenCalled();
      expect(notifications.notifyPaymentCaptured).not.toHaveBeenCalled();
      expect(trail(fake)).toEqual(CREATE_ORDER_TRAIL);
    },
  );

  it('0원 디지털 전용 주문은 FREE 0원 결제로 확정되고 항목마다 권한이 GRANTED로 발급된다', async () => {
    const tables = emptyTables();
    const fake = createFakeSupabase({ tables });
    const {
      service,
      notifications,
      applyPaymentCallback,
      ensureEntitlements,
      warn,
    } = createServices(fake);
    prepareCreateOrder(service, tables, {
      totalPayable: 0,
      lines: [DIGITAL, DIGITAL],
    });

    const result = await service.createOrder(PROFILE_ID, {
      idempotency_key: 'FREE-1',
    });

    const orderId = tables.v2_orders[0].id;
    expect(Object.keys(result)).toEqual([
      'idempotent_replayed',
      'quote_reference',
      'order',
    ]);
    expect(result.idempotent_replayed).toBe(false);
    expect(result.quote_reference).toBe('QUOTE-1');
    expect(result.order).toEqual(
      expect.objectContaining({
        id: orderId,
        order_status: 'CONFIRMED',
        payment_status: 'CAPTURED',
        fulfillment_status: 'UNFULFILLED',
        grand_total: 0,
        confirmed_at: expect.any(String),
      }),
    );
    expect(result.order.items).toHaveLength(2);
    expect(result.order.payments).toHaveLength(1);

    expect(applyPaymentCallback).toHaveBeenCalledTimes(1);
    expect(applyPaymentCallback).toHaveBeenCalledWith(orderId, {
      status: 'CAPTURED',
      provider: 'FREE',
      amount: 0,
      external_reference: `ZERO-AMOUNT-${orderId}`,
      metadata: { source: 'V2_CHECKOUT_ZERO_AMOUNT_ORDER' },
    });
    expect(tables.v2_payments).toEqual([
      expect.objectContaining({
        order_id: orderId,
        provider: 'FREE',
        method: null,
        status: 'CAPTURED',
        amount: 0,
        refunded_total: 0,
        currency_code: 'KRW',
        external_reference: `ZERO-AMOUNT-${orderId}`,
        captured_at: expect.any(String),
        metadata: expect.objectContaining({
          source: 'V2_CHECKOUT_ZERO_AMOUNT_ORDER',
        }),
      }),
    ]);

    expect(ensureEntitlements).toHaveBeenCalledTimes(1);
    expect(tables.v2_digital_entitlements).toHaveLength(2);
    expect(
      tables.v2_digital_entitlements.map((row) => row.order_item_id).sort(),
    ).toEqual(tables.v2_order_items.map((row) => row.id).sort());
    for (const entitlement of tables.v2_digital_entitlements) {
      expect(entitlement).toEqual(
        expect.objectContaining({
          order_id: orderId,
          status: 'GRANTED',
          access_type: 'DOWNLOAD',
        }),
      );
    }

    // 주문 접수 알림은 지금처럼 입금 대기 상태의 주문으로 먼저 보내고, 결제 확정 알림이 뒤따른다.
    expect(notifications.notifyOrderPlaced).toHaveBeenCalledTimes(1);
    expect(notifications.notifyOrderPlaced.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        id: orderId,
        order_status: 'PENDING',
        payment_status: 'PENDING',
      }),
    );
    expect(notifications.notifyPaymentCaptured).toHaveBeenCalledTimes(1);
    expect(
      notifications.notifyOrderPlaced.mock.invocationCallOrder[0],
    ).toBeLessThan(
      notifications.notifyPaymentCaptured.mock.invocationCallOrder[0],
    );
    expect(warn).not.toHaveBeenCalled();

    // 0원 디지털 주문에서만 늘어나는 호출: 결제 콜백 5회 + 권한 보장 2회 + 항목당 발급 7회
    // (관리자 입금 확인과 같은 경로이고, 유료 주문 호출 수는 위 테스트대로 그대로다)
    const grantPerItem = [
      'v2_digital_entitlements.select',
      'v2_digital_entitlements.select',
      'v2_orders.select',
      'v2_order_items.select',
      'v2_digital_entitlements.insert',
      'v2_digital_entitlement_events.insert',
      'v2_digital_entitlements.select',
    ];
    expect(trail(fake)).toEqual([
      ...CREATE_ORDER_TRAIL,
      'v2_orders.select',
      'v2_payments.select',
      'v2_payments.insert',
      'v2_orders.update',
      'v2_orders.select',
      'v2_orders.select',
      'v2_order_items.select',
      ...grantPerItem,
      ...grantPerItem,
    ]);
  });

  it('0원 디지털 번들(구성품 모두 디지털)은 번들 부모 줄을 빼고 판정해 확정한다', async () => {
    const tables = emptyTables();
    const fake = createFakeSupabase({ tables });
    const { service, applyPaymentCallback } = createServices(fake);
    prepareCreateOrder(service, tables, {
      totalPayable: 0,
      lines: [
        {
          line_type: 'BUNDLE_PARENT',
          fulfillment_type_snapshot: null,
          requires_shipping_snapshot: null,
        },
        { line_type: 'BUNDLE_COMPONENT', ...DIGITAL },
        { line_type: 'BUNDLE_COMPONENT', ...DIGITAL },
      ],
    });

    const result = await service.createOrder(PROFILE_ID, {
      idempotency_key: 'FREE-BUNDLE-1',
    });

    expect(applyPaymentCallback).toHaveBeenCalledTimes(1);
    expect(result.order.payment_status).toBe('CAPTURED');
    expect(tables.v2_digital_entitlements).toHaveLength(2);
  });

  it('같은 멱등 키로 다시 요청하면 기존 주문을 돌려주고 결제 확정·권한 발급을 다시 하지 않는다', async () => {
    const tables = emptyTables();
    const fake = createFakeSupabase({ tables });
    const { service, notifications, applyPaymentCallback, ensureEntitlements } =
      createServices(fake);
    prepareCreateOrder(service, tables, {
      totalPayable: 0,
      lines: [DIGITAL],
    });

    const first = await service.createOrder(PROFILE_ID, {
      idempotency_key: 'FREE-REPLAY',
    });
    const callsAfterFirst = fake.calls.length;
    const second = await service.createOrder(PROFILE_ID, {
      idempotency_key: 'FREE-REPLAY',
    });

    expect(second.idempotent_replayed).toBe(true);
    expect(Object.keys(second)).toEqual(['idempotent_replayed', 'order']);
    expect(second.order).toEqual(
      expect.objectContaining({
        id: first.order.id,
        order_status: 'CONFIRMED',
        payment_status: 'CAPTURED',
      }),
    );
    expect(applyPaymentCallback).toHaveBeenCalledTimes(1);
    expect(ensureEntitlements).toHaveBeenCalledTimes(1);
    expect(tables.v2_orders).toHaveLength(1);
    expect(tables.v2_payments).toHaveLength(1);
    expect(tables.v2_digital_entitlements).toHaveLength(1);
    expect(notifications.notifyOrderPlaced).toHaveBeenCalledTimes(1);
    expect(notifications.notifyPaymentCaptured).toHaveBeenCalledTimes(1);
    // 재요청은 멱등 조회 + 주문 상세 조회뿐이다(기존과 같음)
    expect(trail(fake).slice(callsAfterFirst)).toEqual([
      'v2_orders.select',
      'v2_orders.select',
    ]);
  });

  it('결제 확정이 실패하면 주문 생성은 성공으로 응답하고 주문은 입금 대기로 남으며 warn을 남긴다', async () => {
    const tables = emptyTables();
    const fake = createFakeSupabase({
      tables,
      failWrite: (call) =>
        call.table === 'v2_payments' && call.method === 'insert'
          ? { code: '57014', message: 'canceling statement due to timeout' }
          : null,
    });
    const {
      service,
      notifications,
      applyPaymentCallback,
      ensureEntitlements,
      warn,
    } = createServices(fake);
    prepareCreateOrder(service, tables, {
      totalPayable: 0,
      lines: [DIGITAL],
    });

    const result = await service.createOrder(PROFILE_ID, {
      idempotency_key: 'FREE-FAIL',
    });

    const order = tables.v2_orders[0];
    expect(result.idempotent_replayed).toBe(false);
    expect(result.order).toEqual(
      expect.objectContaining({
        id: order.id,
        order_status: 'PENDING',
        payment_status: 'PENDING',
        payments: [],
      }),
    );
    expect(order.order_status).toBe('PENDING');
    expect(order.payment_status).toBe('PENDING');
    expect(applyPaymentCallback).toHaveBeenCalledTimes(1);
    expect(ensureEntitlements).not.toHaveBeenCalled();
    expect(tables.v2_payments).toHaveLength(0);
    expect(tables.v2_digital_entitlements).toHaveLength(0);
    expect(notifications.notifyOrderPlaced).toHaveBeenCalledTimes(1);
    expect(notifications.notifyPaymentCaptured).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(`order_id=${order.id}`);
    expect(warn.mock.calls[0][0]).toContain(`order_no=${order.order_no}`);
    expect(warn.mock.calls[0][0]).toContain('v2 payment 생성 실패');
  });
});
