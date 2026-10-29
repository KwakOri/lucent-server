import { V2CheckoutService } from './v2-checkout.service';

type Row = Record<string, any>;

type Filter =
  | { op: 'eq'; column: string; value: unknown }
  | { op: 'in'; column: string; values: unknown[] }
  | { op: 'is'; column: string; value: unknown };

interface FakeCall {
  table: string;
  method: 'select';
  columns: string | null;
  filters: Filter[];
}

interface FakeOptions {
  tables: Record<string, Row[]>;
  // select 응답 대신 돌려줄 결과(오류 흉내). undefined면 정상 응답.
  overrideSelect?: (call: FakeCall) => { data: null; error: Row } | undefined;
  // select가 reject되게 할 때 쓴다.
  rejectSelect?: (call: FakeCall) => Error | undefined;
}

// PostgREST max_rows(기본 1000)
const FAKE_MAX_ROWS = 1000;

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

// Postgres 기본: ASC NULLS LAST, DESC NULLS FIRST
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

  const embedOrder = (order: Row): Row => ({
    ...order,
    items: (tables.v2_order_items || [])
      .filter((item) => item.order_id === order.id)
      .map((item) => ({ ...item, adjustments: [] })),
    adjustments: [],
    payments: [],
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
    let columns: string | null = null;
    let countRequested = false;
    let single = false;
    let range: [number, number] | null = null;
    const filters: Filter[] = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];

    const execute = async () => {
      const call: FakeCall = {
        table,
        method: 'select',
        columns,
        filters: [...filters],
      };
      calls.push(call);
      const rejection = options.rejectSelect?.(call);
      if (rejection) {
        throw rejection;
      }
      const override = options.overrideSelect?.(call);
      if (override) {
        return { ...override, count: null };
      }

      const sorted = (tables[table] || [])
        .filter((row) => filters.every((filter) => matchesFilter(row, filter)))
        .sort((left, right) => compareForOrder(left, right, orders));
      let rows = range ? sorted.slice(range[0], range[1] + 1) : sorted;
      rows = rows.slice(0, FAKE_MAX_ROWS);
      const data = rows.map((row) => project(table, columns, row));
      if (single) {
        if (data.length > 1) {
          return { data: null, error: { message: 'multiple rows' } };
        }
        return { data: data[0] ?? null, error: null };
      }
      return {
        data,
        error: null,
        count: countRequested ? sorted.length : null,
      };
    };

    const builder: any = {
      select: (selectColumns?: string, selectOptions?: { count?: string }) => {
        columns = selectColumns ?? '*';
        countRequested = selectOptions?.count === 'exact';
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
      range: (rangeFrom: number, rangeTo: number) => {
        range = [rangeFrom, rangeTo];
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
const OTHER_PROFILE_ID = uuid(1, 2);

function orderRow(index: number, profileId = PROFILE_ID): Row {
  return {
    id: uuid(2, index),
    order_no: `V2-TEST-${index}`,
    profile_id: profileId,
    order_status: 'CONFIRMED',
    payment_status: 'CAPTURED',
    fulfillment_status: 'UNFULFILLED',
    grand_total: 1000 * index,
    // 번호가 클수록 최근 주문(목록은 placed_at 내림차순)
    placed_at: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
    created_at: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
  };
}

function itemRow(index: number, orderId: string, type: 'DIGITAL' | 'PHYSICAL') {
  return {
    id: uuid(3, index),
    order_id: orderId,
    line_type: 'STANDARD',
    line_status: 'PENDING',
    variant_id: null,
    product_id: null,
    fulfillment_type_snapshot: type,
    requires_shipping_snapshot: type === 'PHYSICAL',
    display_snapshot: {},
  };
}

function entitlementRow(index: number, orderId: string, status: string): Row {
  return {
    id: uuid(4, index),
    order_id: orderId,
    order_item_id: uuid(3, index),
    status,
  };
}

// 실물 주문 C(가장 오래됨) → 디지털 B(GRANTED+PENDING) → 디지털 A(GRANTED 2건, 가장 최근)
function threeOrderTables(): Record<string, Row[]> {
  const orderC = orderRow(1);
  const orderB = orderRow(2);
  const orderA = orderRow(3);
  const otherUserOrder = orderRow(4, OTHER_PROFILE_ID);
  return {
    v2_orders: [orderC, orderB, orderA, otherUserOrder],
    v2_order_items: [
      itemRow(1, orderC.id, 'PHYSICAL'),
      itemRow(2, orderB.id, 'DIGITAL'),
      itemRow(3, orderB.id, 'DIGITAL'),
      itemRow(4, orderA.id, 'DIGITAL'),
      itemRow(5, orderA.id, 'DIGITAL'),
      itemRow(6, otherUserOrder.id, 'DIGITAL'),
    ],
    v2_digital_entitlements: [
      entitlementRow(2, orderB.id, 'GRANTED'),
      entitlementRow(3, orderB.id, 'PENDING'),
      entitlementRow(4, orderA.id, 'GRANTED'),
      entitlementRow(5, orderA.id, 'GRANTED'),
      // 목록에 없는 다른 사용자 주문의 권한은 섞이면 안 된다
      entitlementRow(6, otherUserOrder.id, 'GRANTED'),
    ],
  };
}

function createService(fake: ReturnType<typeof createFakeSupabase>) {
  const service = new V2CheckoutService(
    {} as any,
    { notifyOrderPlaced: jest.fn(), notifyPaymentCaptured: jest.fn() } as any,
    {} as any,
  );
  jest.spyOn(service as any, 'supabase', 'get').mockReturnValue(fake.supabase);
  const warn = jest
    .spyOn((service as any).logger, 'warn')
    .mockImplementation(() => undefined);
  return { service, warn };
}

function entitlementCalls(fake: ReturnType<typeof createFakeSupabase>) {
  return fake.calls.filter((call) => call.table === 'v2_digital_entitlements');
}

function withoutSummary(result: any): any {
  return {
    ...result,
    items: result.items.map((item: Row) => {
      const copy = { ...item };
      delete copy.digital_entitlement_summary;
      return copy;
    }),
  };
}

describe('V2CheckoutService 주문 목록 디지털 권한 요약 (WN-501)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('주문마다 권한 행 수(상태 무관)와 GRANTED 수를 붙이고, 권한 행이 없으면 0/0이다', async () => {
    const tables = threeOrderTables();
    const fake = createFakeSupabase({ tables });
    const { service, warn } = createService(fake);

    const result = await service.listOrders(PROFILE_ID, {});

    expect(result.items.map((item: Row) => item.order_no)).toEqual([
      'V2-TEST-3',
      'V2-TEST-2',
      'V2-TEST-1',
    ]);
    expect(
      result.items.map((item: Row) => item.digital_entitlement_summary),
    ).toEqual([
      { total: 2, granted: 2 },
      { total: 2, granted: 1 },
      { total: 0, granted: 0 },
    ]);

    const calls = entitlementCalls(fake);
    expect(calls).toHaveLength(1);
    expect(calls[0].columns).toBe('order_id, status');
    expect(calls[0].filters).toEqual([
      {
        op: 'in',
        column: 'order_id',
        values: [uuid(2, 3), uuid(2, 2), uuid(2, 1)],
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('REVOKED·EXPIRED 같은 다른 상태도 total에 들어가고 granted에는 GRANTED만 센다', async () => {
    const tables = threeOrderTables();
    tables.v2_digital_entitlements.push(
      entitlementRow(7, uuid(2, 3), 'REVOKED'),
      entitlementRow(8, uuid(2, 3), 'EXPIRED'),
    );
    const fake = createFakeSupabase({ tables });
    const { service } = createService(fake);

    const result = await service.listOrders(PROFILE_ID, {});

    expect(result.items[0].digital_entitlement_summary).toEqual({
      total: 4,
      granted: 2,
    });
  });

  it('응답 키는 기존과 같고 주문마다 digital_entitlement_summary 1개만 늘어난다', async () => {
    const tables = threeOrderTables();
    const fake = createFakeSupabase({ tables });
    const { service } = createService(fake);

    const result = await service.listOrders(PROFILE_ID, {});

    expect(Object.keys(result)).toEqual([
      'items',
      'total',
      'limit',
      'page',
      'totalPages',
    ]);
    expect(result).toEqual(
      expect.objectContaining({ total: 3, limit: 20, page: 1, totalPages: 1 }),
    );
    for (const item of result.items) {
      const detail = await service.getOrderById(item.id, PROFILE_ID);
      expect(Object.keys(item)).toEqual([
        ...Object.keys(detail),
        'digital_entitlement_summary',
      ]);
      const listedWithoutSummary = { ...item };
      delete listedWithoutSummary.digital_entitlement_summary;
      expect(listedWithoutSummary).toEqual(detail);
    }
  });

  it('주문이 0건이면 권한을 조회하지 않고 응답은 기존과 같다', async () => {
    const fake = createFakeSupabase({
      tables: { v2_orders: [], v2_digital_entitlements: [] },
    });
    const { service } = createService(fake);

    const result = await service.listOrders(PROFILE_ID, {});

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 20,
      page: 1,
      totalPages: 1,
    });
    expect(entitlementCalls(fake)).toHaveLength(0);
    expect(fake.calls.map((call) => call.table)).toEqual(['v2_orders']);
  });

  it.each([
    [
      '오류 응답',
      {
        overrideSelect: (call: FakeCall) =>
          call.table === 'v2_digital_entitlements'
            ? {
                data: null,
                error: { code: '57014', message: 'statement timeout' },
              }
            : undefined,
      },
    ],
    [
      '예외',
      {
        rejectSelect: (call: FakeCall) =>
          call.table === 'v2_digital_entitlements'
            ? new Error('fetch failed')
            : undefined,
      },
    ],
  ] as Array<[string, Partial<FakeOptions>]>)(
    '권한 조회가 실패하면(%s) 모든 주문의 요약을 null로 두고 warn을 남기며 나머지 응답은 같다',
    async (_label, failure) => {
      const okFake = createFakeSupabase({ tables: threeOrderTables() });
      const okResult = await createService(okFake).service.listOrders(
        PROFILE_ID,
        {},
      );

      const fake = createFakeSupabase({
        tables: threeOrderTables(),
        ...failure,
      });
      const { service, warn } = createService(fake);

      const result = await service.listOrders(PROFILE_ID, {});

      expect(
        result.items.map((item: Row) => item.digital_entitlement_summary),
      ).toEqual([null, null, null]);
      expect(
        result.items.every((item: Row) =>
          Object.prototype.hasOwnProperty.call(
            item,
            'digital_entitlement_summary',
          ),
        ),
      ).toBe(true);
      expect(withoutSummary(result)).toEqual(withoutSummary(okResult));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(
        'V2_ORDERS_ENTITLEMENT_SUMMARY_FETCH_FAILED',
      );
      expect(warn.mock.calls[0][0]).toContain('order_count=3');
    },
  );

  it('한 페이지 주문 60건은 권한을 50건씩 2번에 나눠 읽고 요약은 주문마다 맞다', async () => {
    const orders = Array.from({ length: 60 }, (_, index) =>
      orderRow(index + 1),
    );
    const entitlements = orders.flatMap((order, index) =>
      index % 2 === 0
        ? [entitlementRow(index + 1, order.id, 'GRANTED')]
        : [
            entitlementRow(index + 1, order.id, 'GRANTED'),
            entitlementRow(index + 101, order.id, 'PENDING'),
          ],
    );
    const fake = createFakeSupabase({
      tables: {
        v2_orders: orders,
        v2_order_items: [],
        v2_digital_entitlements: entitlements,
      },
    });
    const { service } = createService(fake);

    const result = await service.listOrders(PROFILE_ID, { limit: '100' });

    const calls = entitlementCalls(fake);
    expect(calls).toHaveLength(2);
    expect(
      calls.map((call) => (call.filters[0] as { values: unknown[] }).values),
    ).toEqual([
      result.items.slice(0, 50).map((item: Row) => item.id),
      result.items.slice(50).map((item: Row) => item.id),
    ]);
    for (const item of result.items) {
      const index = orders.findIndex((order) => order.id === item.id);
      expect(item.digital_entitlement_summary).toEqual(
        index % 2 === 0 ? { total: 1, granted: 1 } : { total: 2, granted: 1 },
      );
    }
  });

  it('관리자 전체 목록(includeAllForAdmin)에도 같은 필드가 붙는다', async () => {
    const tables = threeOrderTables();
    const fake = createFakeSupabase({ tables });
    const { service } = createService(fake);

    const result = await service.listOrders(PROFILE_ID, {
      includeAllForAdmin: true,
    });

    expect(
      result.items.map((item: Row) => [
        item.order_no,
        item.digital_entitlement_summary,
      ]),
    ).toEqual([
      ['V2-TEST-4', { total: 1, granted: 1 }],
      ['V2-TEST-3', { total: 2, granted: 2 }],
      ['V2-TEST-2', { total: 2, granted: 1 }],
      ['V2-TEST-1', { total: 0, granted: 0 }],
    ]);
  });
});
