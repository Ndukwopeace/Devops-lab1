// Fetch /items from every API. One API being down must not hide the others,
// so each result carries its own error instead of throwing.
export async function loadAll(sources, fetcher = fetch) {
  return Promise.all(
    sources.map(async ({ name, url }) => {
      try {
        const response = await fetcher(`${url}/items`)
        if (!response.ok) {
          return { name, items: [], error: `HTTP ${response.status}` }
        }
        return { name, items: await response.json(), error: null }
      } catch (err) {
        return { name, items: [], error: err.message }
      }
    }),
  )
}
