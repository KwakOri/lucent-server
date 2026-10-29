/**
 * PostgREST `in.(...)` 필터에 값을 많이 넣으면 URL이 길어져 게이트웨이(로컬 Kong 약 8KB)와
 * backend fetch 응답 헤더(16KB, PostgREST `Content-Location`) 한도에 걸린다.
 * 값 100개(uuid 기준 URL 약 4~4.5KB)씩 나눠 같은 읽기 쿼리를 청크마다 실행하고 결과를 합친다.
 */
export const DEFAULT_IN_CHUNK_SIZE = 100;

export interface ChunkedSelectResponse<Row, Err> {
  data: Row[] | null;
  error: Err | null;
}

export interface ChunkedSelectOptions {
  chunkSize?: number;
}

/**
 * `.in(column, values)` 읽기 쿼리를 청크로 나눠 병렬 실행하고 결과를 합친다. 읽기 전용이다.
 * insert·update·delete를 넘기면 청크별 부분 반영이 생기므로 쓰지 않는다.
 *
 * - `buildQuery`는 부를 때마다 `this.supabase.from(...)`부터 새 체인을 만든다. supabase-js 빌더는
 *   `.in()`이 자기 자신을 바꾸므로, 미리 만든 빌더에 `.in()`만 붙이면 청크 필터가 한 URL에 쌓인다.
 * - 값은 JS에서 같은 값(Set 기준) 중복을 처음 나온 순서로 제거한 뒤 나눈다. `in()` 한 번에 중복 값을
 *   넣어도 행은 한 번만 오므로, 중복이 다른 청크로 갈라져 같은 행이 두 번 오지 않게 하기 위해서다.
 *   대소문자만 다른 uuid, 숫자 1과 문자열 '1'처럼 DB에서 같은 값이 되는 값은 호출처가 먼저 정규화한다.
 * - 값이 없으면 Supabase를 호출하지 않고 `{ data: [], error: null }`을 돌려준다.
 * - 결과 순서: 청크 순서(값 순서) → 각 청크 응답 순서. 쿼리의 `.order()`는 청크 안에서만 지켜진다.
 *   청크 기준 컬럼 값이 같은 행은 한 청크에 모이므로 그 값 안의 순서는 원래 쿼리와 같고,
 *   여러 값에 걸친 전체 순서가 필요하면 호출처가 메모리에서 다시 정렬한다.
 * - 오류: 청크 순서로 처음 만난 오류를 그대로 돌려준다. 응답 `error`면 `{ data: null, error }`,
 *   예외(reject)면 그 값을 그대로 던진다. 모든 청크가 끝난 뒤 판단한다.
 * - PostgREST `max_rows`(기본 1000)는 청크마다 따로 걸린다. 청크 하나가 그 수를 넘을 수 있으면
 *   `chunkSize`를 줄인다. 같은 이유로 체인 안 `.limit()`·`.range()`도 청크마다 걸린다.
 * - 지원하지 않는 형태: `.single()`·`.maybeSingle()`(행 배열이 아님), 관계 컬럼(`rel.col`) `in()`
 *   (같은 부모 행이 여러 청크에서 자식 일부씩 나뉘어 옴), `count` 합산.
 * - 동시 요청 수는 청크 수와 같고 따로 제한하지 않는다(값 1,000개 = 요청 10개).
 * - 타입: 쿼리가 any(서비스의 `this.supabase`)면 행·오류도 기존처럼 any, 타입 있는 클라이언트면
 *   그 행·오류 타입을 따른다.
 *
 * @example
 * const { data, error } = await selectInChunks(orderIds, (ids) =>
 *   this.supabase.from('v2_orders').select('id, customer_snapshot').in('id', ids),
 * );
 */
export async function selectInChunks<Value, Row = any, Err = any>(
  values: readonly Value[],
  buildQuery: (
    chunkValues: Value[],
  ) => PromiseLike<{ data: Row[] | null; error: Err | null }>,
  options: ChunkedSelectOptions = {},
): Promise<ChunkedSelectResponse<Row, Err>> {
  const chunkSize = options.chunkSize ?? DEFAULT_IN_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError(
      `chunkSize must be a positive integer (received ${chunkSize})`,
    );
  }

  const uniqueValues = Array.from(new Set(values || []));
  if (uniqueValues.length === 0) {
    return { data: [], error: null };
  }

  const chunks: Value[][] = [];
  for (let index = 0; index < uniqueValues.length; index += chunkSize) {
    chunks.push(uniqueValues.slice(index, index + chunkSize));
  }

  const settled = await Promise.allSettled(
    chunks.map(async (chunkValues) => buildQuery(chunkValues)),
  );

  const rows: Row[] = [];
  for (const result of settled) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
    const { data, error } = result.value;
    if (error) {
      return { data: null, error };
    }
    for (const row of data || []) {
      rows.push(row);
    }
  }

  return { data: rows, error: null };
}
