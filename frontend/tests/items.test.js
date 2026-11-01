import { describe, expect, it } from 'vitest'
import { loadAll } from '../utils/items.js'

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

describe('loadAll', () => {
  it('collects items from every source', async () => {
    const fetcher = async (url) => json(url.startsWith('http://a') ? [{ id: 1, name: 'one' }] : [])
    const results = await loadAll(
      [
        { name: 'a', url: 'http://a' },
        { name: 'b', url: 'http://b' },
      ],
      fetcher,
    )
    expect(results).toEqual([
      { name: 'a', items: [{ id: 1, name: 'one' }], error: null },
      { name: 'b', items: [], error: null },
    ])
  })

  it('reports an HTTP error without hiding the other sources', async () => {
    const fetcher = async (url) => (url.startsWith('http://bad') ? json({}, 500) : json([{ id: 2, name: 'two' }]))
    const results = await loadAll(
      [
        { name: 'bad', url: 'http://bad' },
        { name: 'good', url: 'http://good' },
      ],
      fetcher,
    )
    expect(results[0]).toEqual({ name: 'bad', items: [], error: 'HTTP 500' })
    expect(results[1].items).toEqual([{ id: 2, name: 'two' }])
  })

  it('reports a network failure', async () => {
    const fetcher = async () => {
      throw new Error('connect ECONNREFUSED')
    }
    const results = await loadAll([{ name: 'down', url: 'http://down' }], fetcher)
    expect(results[0].error).toBe('connect ECONNREFUSED')
  })
})
