import { V2AdminService } from './v2-admin.service';

type Row = Record<string, any>;

interface FakeCall {
  table: string;
  columns: string[];
  inValues: unknown[][];
}

// 로컬 Kong은 요청 URL 약 8.1KB에서 414, PostgREST max_rows는 1000.
const FAKE_URL_LIMIT = 8000;
const FAKE_MAX_ROWS = 1000;

// select 컬럼 목록만 돌려주고, in() 값 길이가 URL 한도를 넘으면 414를 흉내 낸다.
function createFakeSupabase(options: {
  tables: Record<string, Row[]>;
  fail?: string[];
}) {
  const calls: FakeCall[] = [];

  const from = (table: string) => {
    let columns: string[] = [];
    const inFilters: Array<{ column: string; values: unknown[] }> = [];

    const execute = async () => {
      calls.push({
        table,
        columns,
        inValues: inFilters.map((filter) => filter.values),
      });
      if (options.fail?.includes(table)) {
        return { data: null, error: { message: `${table} failed` } };
      }
      const urlLength = inFilters.reduce(
        (sum, filter) => sum + filter.values.map(String).join(',').length,
        0,
      );
      if (urlLength > FAKE_URL_LIMIT) {
        return { data: null, error: { message: '414 Request-URI Too Large' } };
      }
      const matched = (options.tables[table] || []).filter((row) =>
        inFilters.every((filter) => filter.values.includes(row[filter.column])),
      );
      return {
        data: matched.slice(0, FAKE_MAX_ROWS).map((row) => {
          const projected: Row = {};
          for (const column of columns) {
            projected[column] = row[column];
          }
          return projected;
        }),
        error: null,
      };
    };

    const builder: any = {
      select: (columnList: string) => {
        columns = columnList.split(',').map((column) => column.trim());
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        inFilters.push({ column, values: [...values] });
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

function queueRow(index: number, overrides: Row): Row {
  return {
    order_id: orderId(index),
    order_no: `PERF-${index}`,
    order_status: 'CONFIRMED',
    payment_status: 'CAPTURED',
    fulfillment_status: 'UNFULFILLED',
    grand_total: 10000,
    created_at: `2026-10-${String(10 + (index % 20)).padStart(2, '0')}T00:00:00.000Z`,
    has_bundle: false,
    has_physical: false,
    has_digital: false,
    waiting_shipment_count: 0,
    in_transit_shipment_count: 0,
    delivered_shipment_count: 0,
    ...overrides,
  };
}

function entitlement(index: number, status: string): Row {
  return { order_id: orderId(index), status };
}

function createService(
  queueItems: Row[],
  fake: ReturnType<typeof createFakeSupabase>,
) {
  const service = new V2AdminService({} as any, {} as any);
  jest.spyOn(service as any, 'supabase', 'get').mockReturnValue(fake.supabase);
  jest.spyOn(service, 'listSalesStats').mockResolvedValue({
    range: {},
    filters: {},
    summary: {},
    daily: [],
    metadata: {},
  });
  jest
    .spyOn(service, 'listOrderQueue')
    .mockResolvedValue({ items: queueItems, limit: 500 });
  jest
    .spyOn(service, 'listInventoryHealth')
    .mockResolvedValue({ items: [], summary: {} });
  jest.spyOn(service, 'listApprovals').mockResolvedValue({ items: [] });
  jest.spyOn(service, 'listActionLogs').mockResolvedValue({ items: [] });
  jest
    .spyOn(service, 'getCutoverGateChecklist')
    .mockResolvedValue({ summary: { blocked_count: 0 } });
  jest.spyOn(service as any, 'countPendingApprovals').mockResolvedValue(0);
  jest.spyOn(service as any, 'countFailedActionsSince').mockResolvedValue(0);
  jest
    .spyOn(service as any, 'getProductionBatchStatusCounts')
    .mockResolvedValue({});
  jest
    .spyOn(service as any, 'getShippingBatchStatusCounts')
    .mockResolvedValue({});
  return service;
}

function callsTo(fake: ReturnType<typeof createFakeSupabase>, table: string) {
  return fake.calls.filter((call) => call.table === table);
}

function errorCodeOf(error: unknown): string | undefined {
  const response = (error as { getResponse?: () => unknown })?.getResponse?.();
  return (response as { errorCode?: string } | undefined)?.errorCode;
}

// 운영 대시보드 주문 단계 판정(WN-498). 수정 전 기준(5a274b1)에서는 1·2번 행이 PRODUCTION이었다.
describe('V2AdminService 대시보드 주문 단계 판정', () => {
  const queueItems = [
    // 1. 전액 환불: 주문 CONFIRMED·결제 REFUNDED·항목 모두 REFUNDED라 큐 뷰 구성 플래그가 모두 false
    queueRow(1, { payment_status: 'REFUNDED' }),
    // 2. 디지털 전용 + 권한 모두 GRANTED, 배송 완료 전환 전
    queueRow(2, { has_digital: true }),
    // 3. 디지털 전용 + 권한 일부 PENDING
    queueRow(3, { has_digital: true }),
    // 4. 부분 환불 + 실물 남음 + 배송 대기
    queueRow(4, {
      payment_status: 'PARTIALLY_REFUNDED',
      has_physical: true,
      waiting_shipment_count: 1,
    }),
    // 5. 디지털 전용 + 권한 행 없음
    queueRow(5, { has_digital: true }),
    // 6. 디지털 전용 + 권한 GRANTED·REVOKED
    queueRow(6, { has_digital: true }),
    // 7. 디지털 전용 + 주문 COMPLETED (권한 조회 없이 배송완료)
    queueRow(7, { has_digital: true, order_status: 'COMPLETED' }),
    // 8. 디지털 전용 + 권한 모두 GRANTED + 부분 환불
    queueRow(8, { has_digital: true, payment_status: 'PARTIALLY_REFUNDED' }),
    // 9. 입금 대기
    queueRow(9, { order_status: 'PENDING', payment_status: 'PENDING' }),
    // 10. 입금 확인(AUTHORIZED)
    queueRow(10, { payment_status: 'AUTHORIZED', has_digital: true }),
    // 11. 취소
    queueRow(11, { order_status: 'CANCELED', payment_status: 'CANCELED' }),
    // 12. 실물 + 디지털, 배송 행 없음 (권한과 무관하게 제작중)
    queueRow(12, { has_physical: true, has_digital: true }),
  ];
  const entitlements = [
    entitlement(2, 'GRANTED'),
    entitlement(2, 'GRANTED'),
    entitlement(3, 'GRANTED'),
    entitlement(3, 'PENDING'),
    entitlement(6, 'GRANTED'),
    entitlement(6, 'REVOKED'),
    entitlement(7, 'GRANTED'),
    entitlement(8, 'GRANTED'),
    entitlement(12, 'GRANTED'),
  ];

  it('전액 환불은 취소, 디지털 전용은 권한이 모두 GRANTED일 때만 배송완료로 센다', async () => {
    const fake = createFakeSupabase({
      tables: { v2_digital_entitlements: entitlements },
    });
    const service = createService(queueItems, fake);

    const result = await service.getDashboardOverview({});

    expect(result.pipeline.order_stage_counts).toEqual({
      PAYMENT_PENDING: 1,
      PAYMENT_CONFIRMED: 1,
      PRODUCTION: 4, // 3, 5, 6, 12
      READY_TO_SHIP: 1, // 4
      IN_TRANSIT: 0,
      DELIVERED: 3, // 2, 7, 8
      CANCELED: 2, // 1, 11
    });
    expect(Object.keys(result.pipeline.order_stage_counts)).toEqual([
      'PAYMENT_PENDING',
      'PAYMENT_CONFIRMED',
      'PRODUCTION',
      'READY_TO_SHIP',
      'IN_TRANSIT',
      'DELIVERED',
      'CANCELED',
    ]);
    expect(result.kpis.payment_pending_count).toBe(1);
    expect(result.kpis.ready_to_ship_count).toBe(1);
    // 기존 동작 그대로: PAYMENT_PENDING 우선순위 0이 `|| 99`로 99가 되어 READY_TO_SHIP 뒤에 온다.
    expect(
      result.queues.urgent_orders.map((row: any) => [row.order_no, row.stage]),
    ).toEqual([
      ['PERF-4', 'READY_TO_SHIP'],
      ['PERF-9', 'PAYMENT_PENDING'],
    ]);
  });

  it('권한은 결제 확정·미완료 디지털 전용 주문만 한 번 읽는다', async () => {
    const fake = createFakeSupabase({
      tables: { v2_digital_entitlements: entitlements },
    });
    const service = createService(queueItems, fake);

    await service.getDashboardOverview({});

    const calls = callsTo(fake, 'v2_digital_entitlements');
    expect(calls).toHaveLength(1);
    expect(calls[0].columns).toEqual(['order_id', 'status']);
    expect(calls[0].inValues[0]).toEqual([
      orderId(2),
      orderId(3),
      orderId(5),
      orderId(6),
      orderId(8),
    ]);
    expect(fake.calls.map((call) => call.table)).toEqual([
      'v2_digital_entitlements',
    ]);
  });

  it('후보가 없으면 권한을 읽지 않는다', async () => {
    const fake = createFakeSupabase({
      tables: { v2_digital_entitlements: entitlements },
    });
    const service = createService(
      queueItems.filter((row) =>
        [orderId(1), orderId(4), orderId(7), orderId(9)].includes(row.order_id),
      ),
      fake,
    );

    const result = await service.getDashboardOverview({});

    expect(fake.calls).toHaveLength(0);
    expect(result.pipeline.order_stage_counts).toMatchObject({
      PAYMENT_PENDING: 1,
      PRODUCTION: 0,
      READY_TO_SHIP: 1,
      DELIVERED: 1,
      CANCELED: 1,
    });
  });

  it('후보 240건도 URL 한도 안에서 나눠 읽고 모두 판정한다', async () => {
    const manyItems = Array.from({ length: 240 }, (_, index) =>
      queueRow(index + 1, { has_digital: true }),
    );
    const manyEntitlements = manyItems.flatMap((row, index) =>
      index % 2 === 0
        ? [entitlement(index + 1, 'GRANTED'), entitlement(index + 1, 'GRANTED')]
        : [
            entitlement(index + 1, 'GRANTED'),
            entitlement(index + 1, 'PENDING'),
          ],
    );
    const fake = createFakeSupabase({
      tables: { v2_digital_entitlements: manyEntitlements },
    });
    const service = createService(manyItems, fake);

    const result = await service.getDashboardOverview({ queueLimit: '1000' });

    expect(result.pipeline.order_stage_counts).toMatchObject({
      PRODUCTION: 120,
      DELIVERED: 120,
    });
    const calls = callsTo(fake, 'v2_digital_entitlements');
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.flatMap((call) => call.inValues[0])).toHaveLength(240);
  });

  it('권한 조회가 실패하면 대시보드 오류 코드로 끝난다', async () => {
    const fake = createFakeSupabase({
      tables: { v2_digital_entitlements: entitlements },
      fail: ['v2_digital_entitlements'],
    });
    const service = createService(queueItems, fake);

    let code: string | undefined;
    try {
      await service.getDashboardOverview({});
    } catch (error) {
      code = errorCodeOf(error);
    }
    expect(code).toBe('V2_ADMIN_DASHBOARD_ENTITLEMENT_FETCH_FAILED');
  });
});
