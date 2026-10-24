import { V2AdminBatchService } from './v2-admin-batch.service';
import { V2AdminService } from './v2-admin.service';
import { V2AdminOrderTransitionService } from './v2-admin-order-transition.service';

type Row = Record<string, any>;

type Filter =
  | { op: 'in'; column: string; values: unknown[] }
  | { op: 'eq'; column: string; value: unknown }
  | { op: 'gt'; column: string; value: number }
  | { op: 'notNull'; column: string };

interface FakeCall {
  table: string;
  method: 'select' | 'insert' | 'delete';
  filters: Filter[];
  urlLength: number;
}

interface FakeOptions {
  tables: Record<string, Row[]>;
  // 테이블 → 오류를 돌려주기 전 지연(ms)
  fail?: Record<string, number>;
  // 이 테이블 호출은 until이 풀릴 때까지 응답하지 않는다(동시 시작 확인용)
  hold?: { tables: string[]; until: Promise<void> };
}

// 로컬 Kong은 요청 URL 약 8.1KB에서 414, PostgREST max_rows는 1000.
const FAKE_URL_LIMIT = 8000;
const FAKE_MAX_ROWS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function matchesFilter(row: Row, filter: Filter): boolean {
  switch (filter.op) {
    case 'in':
      return filter.values.includes(row[filter.column]);
    case 'eq':
      return row[filter.column] === filter.value;
    case 'gt':
      return Number(row[filter.column]) > filter.value;
    case 'notNull':
      return row[filter.column] !== null && row[filter.column] !== undefined;
  }
}

function createFakeSupabase(options: FakeOptions) {
  const calls: FakeCall[] = [];

  const from = (table: string) => {
    let method: FakeCall['method'] = 'select';
    let payload: Row[] = [];
    const filters: Filter[] = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let limit: number | null = null;

    const execute = async () => {
      const urlLength = filters.reduce(
        (sum, filter) =>
          sum +
          (filter.op === 'in' ? filter.values.map(String).join(',').length : 0),
        0,
      );
      calls.push({ table, method, filters: [...filters], urlLength });

      if (options.hold?.tables.includes(table)) {
        await options.hold.until;
      }
      const failDelay = options.fail?.[table];
      if (failDelay !== undefined) {
        await sleep(failDelay);
        return { data: null, error: { message: `${table} failed` } };
      }
      if (urlLength > FAKE_URL_LIMIT) {
        return { data: null, error: { message: '414 Request-URI Too Large' } };
      }

      const tableRows = (options.tables[table] ||= []);
      if (method === 'insert') {
        tableRows.push(...payload.map((row) => ({ ...row })));
        return { data: null, error: null };
      }
      const matched = tableRows.filter((row) =>
        filters.every((filter) => matchesFilter(row, filter)),
      );
      if (method === 'delete') {
        options.tables[table] = tableRows.filter(
          (row) => !matched.includes(row),
        );
        return { data: null, error: null };
      }

      const sorted = [...matched].sort((left, right) => {
        for (const order of orders) {
          const a = left[order.column];
          const b = right[order.column];
          if (a === b) {
            continue;
          }
          const result = a < b ? -1 : 1;
          return order.ascending ? result : -result;
        }
        return 0;
      });
      const limited = limit === null ? sorted : sorted.slice(0, limit);
      return {
        data: limited.slice(0, FAKE_MAX_ROWS).map((row) => ({ ...row })),
        error: null,
      };
    };

    const builder: any = {
      select: () => builder,
      insert: (rows: Row[]) => {
        method = 'insert';
        payload = rows;
        return builder;
      },
      delete: () => {
        method = 'delete';
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push({ op: 'in', column, values: [...values] });
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value });
        return builder;
      },
      gt: (column: string, value: number) => {
        filters.push({ op: 'gt', column, value });
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        if (operator !== 'is' || value !== null) {
          throw new Error(`unsupported not(${column}, ${operator})`);
        }
        filters.push({ op: 'notNull', column });
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
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => execute().then(onFulfilled, onRejected),
    };
    return builder;
  };

  return { supabase: { from }, calls };
}

function orderId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function errorCodeOf(error: unknown): string | undefined {
  const response = (error as { getResponse?: () => unknown })?.getResponse?.();
  return (response as { errorCode?: string } | undefined)?.errorCode;
}

async function captureErrorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return errorCodeOf(error) || String(error);
  }
  throw new Error('expected rejection');
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function buildTransitionTables(count: number): Record<string, Row[]> {
  const ids = Array.from({ length: count }, (_, index) => orderId(index + 1));
  return {
    v2_orders: ids.map((id, index) => ({
      id,
      order_no: `PERF-${index + 1}`,
      order_status: 'PENDING',
      payment_status: 'PENDING',
      fulfillment_status: 'UNFULFILLED',
      grand_total: 10000,
      metadata: {},
    })),
    v2_admin_order_queue_view: ids.map((id) => ({
      order_id: id,
      has_bundle: false,
      has_physical: true,
      has_digital: false,
      waiting_shipment_count: 0,
      in_transit_shipment_count: 0,
      delivered_shipment_count: 0,
    })),
    v2_admin_fulfillment_queue_view: [],
    v2_digital_entitlements: [],
  };
}

describe('V2AdminOrderTransitionService 전이 앞 읽기', () => {
  const ids = [orderId(1), orderId(2)];

  function createService(fake: ReturnType<typeof createFakeSupabase>) {
    const service = new V2AdminOrderTransitionService(
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service as any, 'supabase', 'get')
      .mockReturnValue(fake.supabase);
    return service;
  }

  it('preview 결과는 주문·큐 행으로 만들어진다', async () => {
    const fake = createFakeSupabase({ tables: buildTransitionTables(2) });
    const service = createService(fake);

    const result = await service.preview({
      orderIds: ids,
      targetStage: 'PAYMENT_CONFIRMED',
    });

    expect(result.mode).toBe('PREVIEW');
    expect(result.summary.requested_order_count).toBe(2);
    expect(result.summary.found_order_count).toBe(2);
    expect(result.rows.map((row: any) => row.order_id)).toEqual(ids);
    expect(fake.calls.map((call) => call.table).sort()).toEqual([
      'v2_admin_fulfillment_queue_view',
      'v2_admin_order_queue_view',
      'v2_digital_entitlements',
      'v2_orders',
    ]);
  });

  it('여러 읽기가 실패하면 순차 실행 때처럼 앞 순서(orders → queue → shipments → entitlements) 오류를 낸다', async () => {
    const queueLater = createService(
      createFakeSupabase({
        tables: buildTransitionTables(2),
        fail: { v2_admin_order_queue_view: 20, v2_digital_entitlements: 0 },
      }),
    );
    await expect(
      captureErrorCode(
        queueLater.preview({ orderIds: ids, targetStage: 'PAYMENT_CONFIRMED' }),
      ),
    ).resolves.toBe('V2_ADMIN_ORDER_LINEAR_QUEUE_FETCH_FAILED');

    const ordersLater = createService(
      createFakeSupabase({
        tables: buildTransitionTables(2),
        fail: { v2_orders: 20, v2_admin_fulfillment_queue_view: 0 },
      }),
    );
    await expect(
      captureErrorCode(
        ordersLater.preview({
          orderIds: ids,
          targetStage: 'PAYMENT_CONFIRMED',
        }),
      ),
    ).resolves.toBe('V2_ADMIN_ORDER_LINEAR_ORDERS_FETCH_FAILED');
  });

  it('독립 읽기 4개를 함께 시작한다', async () => {
    let release: () => void = () => undefined;
    const until = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = createFakeSupabase({
      tables: buildTransitionTables(2),
      hold: {
        tables: [
          'v2_orders',
          'v2_admin_order_queue_view',
          'v2_admin_fulfillment_queue_view',
          'v2_digital_entitlements',
        ],
        until,
      },
    });
    const service = createService(fake);

    const pending = service.preview({
      orderIds: ids,
      targetStage: 'PAYMENT_CONFIRMED',
    });
    await flushMicrotasks();
    expect(fake.calls).toHaveLength(4);

    release();
    await expect(pending).resolves.toMatchObject({ mode: 'PREVIEW' });
  });
});

function buildCandidateTables(count: number): Record<string, Row[]> {
  const ids = Array.from({ length: count }, (_, index) => orderId(index + 1));
  const baseTime = Date.UTC(2026, 9, 1);
  const projectId = '10000000-0000-4000-8000-000000000001';
  const campaignId = '20000000-0000-4000-8000-000000000001';
  return {
    v2_admin_order_queue_view: ids.map((id, index) => ({
      order_id: id,
      order_no: `PERF-${index + 1}`,
      order_status: 'CONFIRMED',
      payment_status: 'AUTHORIZED',
      fulfillment_status: 'UNFULFILLED',
      has_physical: true,
      has_digital: false,
      has_bundle: false,
      waiting_shipment_count: 0,
      in_transit_shipment_count: 0,
      delivered_shipment_count: 0,
      created_at: new Date(baseTime + index * 1000).toISOString(),
      placed_at: new Date(baseTime + index * 1000).toISOString(),
    })),
    v2_orders: ids.map((id, index) => ({
      id,
      customer_snapshot: { name: `입금자${index + 1}` },
      shipping_address_snapshot: {},
    })),
    v2_order_items: ids.flatMap((id, index) => [
      {
        id: `30000000-0000-4000-8000-${String(index * 2 + 1).padStart(12, '0')}`,
        order_id: id,
        project_id_snapshot: projectId,
        project_name_snapshot: '프로젝트',
        campaign_id_snapshot: campaignId,
        campaign_name_snapshot: '캠페인',
        display_snapshot: {},
        line_status: 'ACTIVE',
        created_at: new Date(baseTime + index * 1000 + 1).toISOString(),
      },
    ]),
    v2_projects: [{ id: projectId, name: '프로젝트' }],
    v2_campaigns: [{ id: campaignId, name: '캠페인' }],
    v2_price_lists: [],
    v2_admin_production_batches: [],
    v2_admin_production_batch_orders: [],
    v2_admin_shipping_batches: [],
    v2_admin_shipping_batch_orders: [],
  };
}

describe('V2AdminBatchService 생산 후보 조회 읽기', () => {
  function createService(fake: ReturnType<typeof createFakeSupabase>) {
    const service = new V2AdminBatchService({} as any);
    jest
      .spyOn(service as any, 'supabase', 'get')
      .mockReturnValue(fake.supabase);
    return service;
  }

  it('입금자명과 주문 범위 조회를 함께 시작한다', async () => {
    let release: () => void = () => undefined;
    const until = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = createFakeSupabase({
      tables: buildCandidateTables(3),
      hold: { tables: ['v2_orders', 'v2_order_items'], until },
    });
    const service = createService(fake);

    const pending = service.listProductionCandidates({ limit: 300 });
    await flushMicrotasks();
    const started = fake.calls.map((call) => call.table);
    expect(started).toContain('v2_orders');
    expect(started).toContain('v2_order_items');

    release();
    const result = await pending;
    expect(result.items.map((row: any) => row.depositor_name)).toEqual([
      '입금자3',
      '입금자2',
      '입금자1',
    ]);
    expect(result.items.map((row: any) => row.project_name)).toEqual([
      '프로젝트',
      '프로젝트',
      '프로젝트',
    ]);
  });

  it('입금자명과 범위 조회가 모두 실패하면 입금자명 오류를 낸다', async () => {
    const service = createService(
      createFakeSupabase({
        tables: buildCandidateTables(3),
        fail: { v2_orders: 20, v2_order_items: 0 },
      }),
    );
    await expect(
      captureErrorCode(service.listProductionCandidates({ limit: 300 })),
    ).resolves.toBe('V2_ADMIN_BATCH_DEPOSITOR_FETCH_FAILED');
  });

  it('잠금 배치 조회와 범위 조회가 모두 실패하면 잠금 배치 오류를 낸다', async () => {
    const service = createService(
      createFakeSupabase({
        tables: buildCandidateTables(3),
        fail: { v2_admin_production_batches: 20, v2_order_items: 0 },
      }),
    );
    await expect(
      captureErrorCode(service.listProductionCandidates({ limit: 300 })),
    ).resolves.toBe('V2_ADMIN_PRODUCTION_CANDIDATE_OPEN_BATCH_FETCH_FAILED');
  });
});

function itemId(index: number): string {
  return `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function callsTo(fake: ReturnType<typeof createFakeSupabase>, table: string) {
  return fake.calls.filter((call) => call.table === table);
}

describe('V2AdminBatchService 후보 조회 청크', () => {
  it('주문 240건(URL 한도 초과)도 입금자명·범위를 100건씩 나눠 모두 채운다', async () => {
    const fake = createFakeSupabase({ tables: buildCandidateTables(240) });
    const service = new V2AdminBatchService({} as any);
    jest
      .spyOn(service as any, 'supabase', 'get')
      .mockReturnValue(fake.supabase);

    const result = await service.listProductionCandidates({ limit: 300 });

    expect(result.items).toHaveLength(240);
    expect(result.items[0].depositor_name).toBe('입금자240');
    expect(result.items[239].depositor_name).toBe('입금자1');
    expect(
      result.items.every((row: any) => row.project_name === '프로젝트'),
    ).toBe(true);
    for (const table of ['v2_orders', 'v2_order_items']) {
      const calls = callsTo(fake, table);
      expect(calls).toHaveLength(3);
      expect(calls.every((call) => call.urlLength <= FAKE_URL_LIMIT)).toBe(
        true,
      );
    }
  });
});

function buildOrderQueueTables(
  count: number,
  linesPerOrder: number,
): Record<string, Row[]> {
  const ids = Array.from({ length: count }, (_, index) => orderId(index + 1));
  const baseTime = Date.UTC(2026, 9, 1);
  return {
    v2_admin_order_queue_view: ids.map((id, index) => ({
      order_id: id,
      order_no: `PERF-${index + 1}`,
      order_status: 'CONFIRMED',
      created_at: new Date(baseTime + index * 1000).toISOString(),
    })),
    v2_orders: ids.map((id, index) => ({
      id,
      customer_snapshot: { name: `입금자${index + 1}` },
      shipping_address_snapshot: {},
    })),
    // 주문 안 항목을 created_at 역순으로 넣어 정렬이 실제로 쓰이게 한다.
    v2_order_items: ids.flatMap((id, index) =>
      Array.from({ length: linesPerOrder }, (_, line) => ({
        id: itemId(index * linesPerOrder + line + 1),
        order_id: id,
        line_type: 'STANDARD',
        quantity: line + 1,
        product_name_snapshot: `상품${index + 1}-${line + 1}`,
        variant_name_snapshot: null,
        final_line_total: 1000,
        created_at: new Date(
          baseTime + index * 1000 + (linesPerOrder - line),
        ).toISOString(),
      })),
    ),
  };
}

function createAdminService(fake: ReturnType<typeof createFakeSupabase>) {
  const service = new V2AdminService({} as any, {} as any);
  jest.spyOn(service as any, 'supabase', 'get').mockReturnValue(fake.supabase);
  return service;
}

describe('V2AdminService 주문 큐 청크', () => {
  it('주문 240건·항목 1,200행도 입금자명·항목 요약을 모두 채우고 주문 안 순서를 지킨다', async () => {
    const fake = createFakeSupabase({ tables: buildOrderQueueTables(240, 5) });
    const service = createAdminService(fake);

    const result = await service.listOrderQueue({ limit: '1000' });

    expect(result.items).toHaveLength(240);
    const newest = result.items[0];
    expect(newest.order_id).toBe(orderId(240));
    expect(newest.depositor_name).toBe('입금자240');
    expect(newest.item_line_count).toBe(5);
    expect(newest.item_quantity_total).toBe(15);
    expect(newest.items.map((item: any) => item.product_name)).toEqual([
      '상품240-5',
      '상품240-4',
      '상품240-3',
      '상품240-2',
      '상품240-1',
    ]);
    expect(result.items.every((row: any) => row.item_line_count === 5)).toBe(
      true,
    );
    for (const table of ['v2_orders', 'v2_order_items']) {
      const calls = callsTo(fake, table);
      expect(calls).toHaveLength(3);
      expect(calls.every((call) => call.urlLength <= FAKE_URL_LIMIT)).toBe(
        true,
      );
    }
  });
});

function buildAllocationTables(
  count: number,
  linesPerOrder: number,
): Record<string, Row[]> {
  const ids = Array.from({ length: count }, (_, index) => orderId(index + 1));
  const eventId = (index: number) =>
    `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  return {
    v2_order_financial_events: ids.map((id, index) => ({
      id: eventId(index + 1),
      order_id: id,
      event_type: 'CAPTURE',
      amount: linesPerOrder * 1000,
    })),
    v2_order_items: ids.flatMap((id, index) =>
      Array.from({ length: linesPerOrder }, (_, line) => ({
        id: itemId(index * linesPerOrder + line + 1),
        order_id: id,
        line_type: 'STANDARD',
        quantity: 1,
        final_line_total: 1000,
      })),
    ),
    // 모든 이벤트가 이미 맞게 배분된 상태(1,200행 — max_rows 1000을 넘는다)
    v2_order_item_financial_allocations: ids.flatMap((id, index) =>
      Array.from({ length: linesPerOrder }, (_, line) => ({
        financial_event_id: eventId(index + 1),
        order_id: id,
        order_item_id: itemId(index * linesPerOrder + line + 1),
        event_type: 'CAPTURE',
        allocated_amount: 1000,
      })),
    ),
  };
}

describe('V2AdminService 매출 allocation 동기화 청크', () => {
  it('이벤트 240건이 이미 맞게 배분돼 있으면 지우거나 다시 넣지 않는다', async () => {
    const fake = createFakeSupabase({ tables: buildAllocationTables(240, 5) });
    const service = createAdminService(fake);

    await (service as any).syncOrderItemFinancialAllocations();

    expect(fake.calls.filter((call) => call.method !== 'select')).toEqual([]);
    for (const table of [
      'v2_order_items',
      'v2_order_item_financial_allocations',
    ]) {
      const calls = callsTo(fake, table);
      expect(calls).toHaveLength(3);
      expect(calls.every((call) => call.urlLength <= FAKE_URL_LIMIT)).toBe(
        true,
      );
    }
  });

  it('금액이 바뀐 이벤트 하나만 지우고 주문 항목 순서대로 다시 배분한다', async () => {
    const tables = buildAllocationTables(240, 5);
    tables.v2_order_financial_events[150].amount = 7000;
    const changedEventId = tables.v2_order_financial_events[150].id;
    const fake = createFakeSupabase({ tables });
    const service = createAdminService(fake);

    await (service as any).syncOrderItemFinancialAllocations();

    const writes = fake.calls.filter((call) => call.method !== 'select');
    expect(writes.map((call) => call.method)).toEqual(['delete', 'insert']);
    expect(writes[0].filters).toEqual([
      { op: 'in', column: 'financial_event_id', values: [changedEventId] },
    ]);
    const rewritten = tables.v2_order_item_financial_allocations.filter(
      (row) => row.financial_event_id === changedEventId,
    );
    expect(rewritten.map((row) => row.order_item_id)).toEqual(
      [751, 752, 753, 754, 755].map(itemId),
    );
    expect(
      rewritten.reduce((sum, row) => sum + Number(row.allocated_amount), 0),
    ).toBe(7000);
  });
});
