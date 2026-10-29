import { createClient } from '@supabase/supabase-js';
import { DEFAULT_IN_CHUNK_SIZE, selectInChunks } from './supabase-chunk';

type Row = { id: string; seq: number };

const makeIds = (count: number, prefix = 'id') =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

const makeUuid = (index: number) =>
  `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

// 테이블 순서대로 `in()`에 걸리는 행을 돌려주는 가짜 쿼리. 중복 값을 넣어도 행은 한 번만 온다.
const createFakeTable = (ids: string[]) => {
  const table: Row[] = ids.map((id, seq) => ({ id, seq }));
  const calls: string[][] = [];
  const query = (chunkIds: string[]) => {
    calls.push(chunkIds);
    const wanted = new Set(chunkIds);
    return Promise.resolve({
      data: table.filter((row) => wanted.has(row.id)),
      error: null,
    });
  };
  return { table, calls, query };
};

const flushAsync = async (rounds = 5) => {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('selectInChunks', () => {
  it('uses chunk size 100 by default', () => {
    expect(DEFAULT_IN_CHUNK_SIZE).toBe(100);
  });

  it.each([
    [0, []],
    [1, [1]],
    [100, [100]],
    [101, [100, 1]],
    [240, [100, 100, 40]],
  ])(
    'splits %i ids into chunks %j and returns every matching row',
    async (count, expectedChunkSizes) => {
      const ids = makeIds(count);
      const fake = createFakeTable(ids);

      const result = await selectInChunks(ids, fake.query);

      expect(fake.calls.map((chunk) => chunk.length)).toEqual(
        expectedChunkSizes,
      );
      expect(fake.calls.flat()).toEqual(ids);
      expect(result).toEqual({ data: fake.table, error: null });
    },
  );

  it('makes no call and returns an empty array for empty or missing input', async () => {
    const query = jest.fn();

    await expect(selectInChunks([], query)).resolves.toEqual({
      data: [],
      error: null,
    });
    await expect(selectInChunks(undefined as any, query)).resolves.toEqual({
      data: [],
      error: null,
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('removes duplicate ids so rows match a single in() call', async () => {
    const uniqueIds = makeIds(150);
    const fake = createFakeTable(uniqueIds);
    // 중복이 청크 경계(100)를 넘어 다른 청크로 갈라지는 배치
    const idsWithDuplicates = [
      ...uniqueIds.slice(0, 120),
      'id-5',
      'id-110',
      ...uniqueIds.slice(120),
      'id-149',
      'id-0',
    ];
    const singleCall = await fake.query(idsWithDuplicates);
    fake.calls.length = 0;

    const result = await selectInChunks(idsWithDuplicates, fake.query);

    expect(fake.calls.map((chunk) => chunk.length)).toEqual([100, 50]);
    expect(fake.calls.flat()).toEqual(uniqueIds);
    expect(result.data).toHaveLength(singleCall.data.length);
    expect(result.data).toEqual(singleCall.data);
  });

  it('keeps chunk order, then each chunk response order, even when later chunks finish first', async () => {
    const ids = makeIds(5);
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let chunkIndex = 0;

    const pending = selectInChunks(
      ids,
      async (chunkIds) => {
        const gate = gates[chunkIndex++];
        await gate.promise;
        // 청크 안 응답 순서는 쿼리 결과 그대로(여기서는 역순)
        return {
          data: [...chunkIds].reverse().map((id) => ({ id })),
          error: null,
        };
      },
      { chunkSize: 2 },
    );

    gates[2].resolve();
    gates[1].resolve();
    gates[0].resolve();

    await expect(pending).resolves.toEqual({
      data: [
        { id: 'id-1' },
        { id: 'id-0' },
        { id: 'id-3' },
        { id: 'id-2' },
        { id: 'id-4' },
      ],
      error: null,
    });
  });

  it('starts every chunk query before any of them resolves', async () => {
    const ids = makeIds(240);
    const gate = deferred<void>();
    let started = 0;

    const pending = selectInChunks(ids, async (chunkIds) => {
      started += 1;
      await gate.promise;
      return { data: chunkIds.map((id) => ({ id })), error: null };
    });

    await Promise.resolve();
    expect(started).toBe(3);
    gate.resolve();
    await expect(pending).resolves.toMatchObject({ error: null });
  });

  it('returns the first error in chunk order as the same object, not the first to finish', async () => {
    const ids = makeIds(300);
    const secondError = { message: 'second', code: '42P01', details: null };
    const thirdError = { message: 'third', code: '57014', details: null };
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let chunkIndex = 0;
    let settled = false;

    const pending = selectInChunks(ids, async (chunkIds) => {
      const index = chunkIndex++;
      await gates[index].promise;
      if (index === 1) {
        return { data: null, error: secondError };
      }
      if (index === 2) {
        return { data: null, error: thirdError };
      }
      return { data: chunkIds.map((id) => ({ id })), error: null };
    }).finally(() => {
      settled = true;
    });

    gates[2].resolve();
    await flushAsync();
    gates[1].resolve();
    await flushAsync();
    // 오류 청크가 모두 끝나도 앞 청크가 남아 있으면 기다린다
    expect(settled).toBe(false);
    gates[0].resolve();

    const result = await pending;
    expect(result.data).toBeNull();
    expect(result.error).toBe(secondError);
  });

  it('rethrows the first rejection in chunk order as-is, not the first to reject', async () => {
    const ids = makeIds(300);
    const secondFailure = new TypeError('fetch failed: second');
    const thirdFailure = new TypeError('fetch failed: third');
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let chunkIndex = 0;
    let settled = false;

    const pending = selectInChunks(ids, async (chunkIds) => {
      const index = chunkIndex++;
      await gates[index].promise;
      if (index === 1) {
        throw secondFailure;
      }
      if (index === 2) {
        throw thirdFailure;
      }
      return { data: chunkIds.map((id) => ({ id })), error: null };
    }).finally(() => {
      settled = true;
    });
    pending.catch(() => undefined);

    gates[2].resolve();
    await flushAsync();
    expect(settled).toBe(false);
    gates[1].resolve();
    gates[0].resolve();

    await expect(pending).rejects.toBe(secondFailure);
  });

  it('turns a synchronous throw in the query builder into a rejection', async () => {
    const failure = new Error('builder failed');

    await expect(
      selectInChunks(makeIds(1), () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  it('treats null data without an error as no rows', async () => {
    await expect(
      selectInChunks(makeIds(3), () =>
        Promise.resolve({ data: null, error: null }),
      ),
    ).resolves.toEqual({ data: [], error: null });
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects chunk size %p without calling the query',
    async (chunkSize) => {
      const query = jest.fn();

      await expect(
        selectInChunks(makeIds(3), query, { chunkSize }),
      ).rejects.toThrow(RangeError);
      expect(query).not.toHaveBeenCalled();
    },
  );

  describe('with a supabase-js query chain', () => {
    const tableIds = Array.from({ length: 240 }, (_, index) => makeUuid(index));
    let requestedUrls: string[];
    let responseGate: Promise<void>;

    // PostgREST 대신 `id=in.(...)`를 읽어 테이블 순서대로 행을 돌려주는 fetch
    const fakeFetch = async (input: any) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      requestedUrls.push(url.toString());
      await responseGate;
      const filter = url.searchParams.get('id') || '';
      const wanted = new Set(
        filter
          .replace(/^in\.\(/, '')
          .replace(/\)$/, '')
          .split(','),
      );
      const rows = tableIds
        .map((id, seq) => ({ id, seq }))
        .filter((row) => wanted.has(row.id));
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const supabase = createClient('http://127.0.0.1:54321', 'test-key', {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fakeFetch as typeof fetch },
    }) as any;

    beforeEach(() => {
      requestedUrls = [];
      responseGate = Promise.resolve();
    });

    it('runs the same .in() chain once per chunk and merges the rows', async () => {
      const result = await selectInChunks(tableIds, (ids) =>
        supabase.from('v2_orders').select('id, seq').in('id', ids),
      );

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(240);
      expect(result.data.map((row: Row) => row.id)).toEqual(tableIds);
      expect(requestedUrls).toHaveLength(3);
      for (const requestedUrl of requestedUrls) {
        expect(new URL(requestedUrl).pathname).toBe('/rest/v1/v2_orders');
      }
      // uuid 100개 청크의 URL 길이가 로컬 Kong 한도(8,190B)보다 충분히 작다
      expect(Math.max(...requestedUrls.map((url) => url.length))).toBeLessThan(
        4500,
      );
    });

    it('sends every chunk request before any response arrives', async () => {
      const gate = deferred<void>();
      responseGate = gate.promise;

      const pending = selectInChunks(tableIds, (ids) =>
        supabase.from('v2_orders').select('id, seq').in('id', ids),
      );

      await flushAsync(20);
      expect(requestedUrls).toHaveLength(3);
      gate.resolve();
      await expect(pending).resolves.toMatchObject({ error: null });
    });
  });
});
