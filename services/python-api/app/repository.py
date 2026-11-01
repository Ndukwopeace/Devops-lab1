import os

import psycopg
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row


class PostgresRepository:
    def __init__(self, conninfo):
        self._conninfo = conninfo

    @classmethod
    def from_params(cls, host, port, dbname, user, password=None):
        return cls(
            make_conninfo(
                host=host,
                port=port,
                dbname=dbname,
                user=user,
                password=password or None,
                connect_timeout=3,
            )
        )

    @classmethod
    def from_env(cls):
        return cls.from_params(
            os.environ["DB_HOST"],
            os.environ.get("DB_PORT", "5432"),
            os.environ["DB_NAME"],
            os.environ["DB_USER"],
            os.environ.get("DB_PASSWORD"),
        )

    def _connect(self):
        return psycopg.connect(self._conninfo, row_factory=dict_row)

    def init_schema(self):
        with self._connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS items ("
                "id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL)"
            )

    def ping(self):
        with self._connect() as conn:
            conn.execute("SELECT 1")

    def list_items(self):
        with self._connect() as conn:
            return conn.execute("SELECT id, name FROM items ORDER BY id").fetchall()

    def add_item(self, name):
        with self._connect() as conn:
            return conn.execute(
                "INSERT INTO items (name) VALUES (%s) RETURNING id, name", (name,)
            ).fetchone()
