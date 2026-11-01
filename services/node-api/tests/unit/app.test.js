const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');

function fakeRepo({ healthy = true } = {}) {
  const items = [];
  return {
    items,
    async ping() {
      if (!healthy) throw new Error('db down');
    },
    async listItems() {
      return [...items];
    },
    async addItem(name) {
      const item = { id: items.length + 1, name };
      items.push(item);
      return item;
    },
  };
}

async function withServer(repo, fn) {
  const server = createApp(repo).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const postJson = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

test('GET /health returns ok', async () => {
  await withServer(fakeRepo(), async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

test('GET /health returns 503 when the database is down', async () => {
  await withServer(fakeRepo({ healthy: false }), async (base) => {
    assert.equal((await fetch(`${base}/health`)).status, 503);
  });
});

test('POST /items then GET /items', async () => {
  await withServer(fakeRepo(), async (base) => {
    const created = await postJson(`${base}/items`, JSON.stringify({ name: '  widget ' }));
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { id: 1, name: 'widget' });
    const list = await fetch(`${base}/items`);
    assert.deepEqual(await list.json(), [{ id: 1, name: 'widget' }]);
  });
});

test('POST /items rejects invalid names', async () => {
  const bodies = [{}, { name: '' }, { name: '   ' }, { name: 5 }, { name: 'x'.repeat(101) }];
  const repo = fakeRepo();
  await withServer(repo, async (base) => {
    for (const body of bodies) {
      const res = await postJson(`${base}/items`, JSON.stringify(body));
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(repo.items.length, 0);
  });
});

test('POST /items rejects malformed JSON', async () => {
  await withServer(fakeRepo(), async (base) => {
    const res = await postJson(`${base}/items`, '{not json');
    assert.equal(res.status, 400);
  });
});
