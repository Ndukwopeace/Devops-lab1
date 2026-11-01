const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { PgRepository } = require('../../src/repository');

// Fail loudly if the disposable test database was not provided.
const required = ['TEST_DB_HOST', 'TEST_DB_PORT', 'TEST_DB_NAME', 'TEST_DB_USER'];
const missing = required.filter((key) => !process.env[key]);
assert.deepEqual(missing, [], 'integration test needs these variables (see scripts/ci/test-component.sh)');
// Refuse to touch anything that is not clearly a test database.
assert.match(process.env.TEST_DB_NAME, /test/, 'TEST_DB_NAME must contain "test"');

test('items roundtrip against PostgreSQL', async () => {
  const repo = new PgRepository({
    host: process.env.TEST_DB_HOST,
    port: Number(process.env.TEST_DB_PORT),
    database: process.env.TEST_DB_NAME,
    user: process.env.TEST_DB_USER,
    password: process.env.TEST_DB_PASSWORD || undefined,
  });
  const server = createApp(repo).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await repo.initSchema();
    await repo.pool.query('TRUNCATE items RESTART IDENTITY');
    const base = `http://127.0.0.1:${server.address().port}`;

    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/items`)).json(), []);

    const created = await fetch(`${base}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'from-integration-test' }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await (await fetch(`${base}/items`)).json(), [
      { id: 1, name: 'from-integration-test' },
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await repo.close();
  }
});
