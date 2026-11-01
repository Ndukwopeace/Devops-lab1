const { Pool } = require('pg');

class PgRepository {
  constructor(config) {
    this.pool = new Pool({ ...config, connectionTimeoutMillis: 3000 });
  }

  static fromEnv(env = process.env) {
    return new PgRepository({
      host: env.DB_HOST,
      port: Number(env.DB_PORT || 5432),
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD || undefined,
    });
  }

  async initSchema() {
    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL)'
    );
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  async listItems() {
    const { rows } = await this.pool.query('SELECT id, name FROM items ORDER BY id');
    return rows;
  }

  async addItem(name) {
    const { rows } = await this.pool.query(
      'INSERT INTO items (name) VALUES ($1) RETURNING id, name',
      [name]
    );
    return rows[0];
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { PgRepository };
