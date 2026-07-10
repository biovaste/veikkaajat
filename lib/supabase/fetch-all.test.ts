import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows } from './fetch-all'

// Builds a page function backed by a fixed array, mimicking PostgREST .range()
function pagerFor<T>(rows: T[]) {
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }))
}

describe('fetchAllRows', () => {
  it('returns all rows when they fit in one page', async () => {
    const page = pagerFor([1, 2, 3])
    const { data, error } = await fetchAllRows(page, 1000)
    expect(error).toBeNull()
    expect(data).toEqual([1, 2, 3])
    expect(page).toHaveBeenCalledTimes(1)
    expect(page).toHaveBeenCalledWith(0, 999)
  })

  it('pages past the cap and preserves order', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => i)
    const page = pagerFor(rows)
    const { data, error } = await fetchAllRows(page, 1000)
    expect(error).toBeNull()
    expect(data).toHaveLength(2500)
    expect(data[0]).toBe(0)
    expect(data[2499]).toBe(2499)
    expect(page).toHaveBeenCalledTimes(3)
    expect(page).toHaveBeenNthCalledWith(2, 1000, 1999)
    expect(page).toHaveBeenNthCalledWith(3, 2000, 2999)
  })

  it('stops after an exact-multiple final page', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => i)
    const page = pagerFor(rows)
    const { data } = await fetchAllRows(page, 1000)
    expect(data).toHaveLength(2000)
    // 2 full pages + 1 empty probe page
    expect(page).toHaveBeenCalledTimes(3)
  })

  it('returns the error and no partial data if a page fails', async () => {
    const page = vi.fn(async (from: number) =>
      from === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null }
        : { data: null, error: { message: 'boom' } },
    )
    const { data, error } = await fetchAllRows(page, 1000)
    expect(error).toEqual({ message: 'boom' })
    expect(data).toBeNull()
  })

  it('handles an empty table', async () => {
    const page = pagerFor([])
    const { data, error } = await fetchAllRows(page, 1000)
    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(page).toHaveBeenCalledTimes(1)
  })
})
