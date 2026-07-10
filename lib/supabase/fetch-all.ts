// Supabase/PostgREST caps every response at 1000 rows (db-max-rows), silently
// truncating larger result sets — an explicit .limit() above 1000 does NOT help.
// scoring_log/predictions crossed that size mid-tournament, so any unbounded
// read of those tables must go through this helper.
//
// The page callback MUST apply a deterministic .order() (unique column or
// combination, e.g. id) before .range(), otherwise pages can overlap or skip rows.

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
  }
  return { data: all, error: null }
}
