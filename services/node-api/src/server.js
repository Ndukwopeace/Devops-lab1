const { createApp } = require('./app');
const { PgRepository } = require('./repository');

async function main() {
  const repo = PgRepository.fromEnv();
  await repo.initSchema();
  const port = Number(process.env.PORT || 3001);
  createApp(repo).listen(port, '0.0.0.0', () => console.log(`node-api listening on ${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
