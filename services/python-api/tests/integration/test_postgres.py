import os

import pytest

from app.api import create_app
from app.repository import PostgresRepository


@pytest.fixture
def repo():
    # Fail loudly if the disposable test database was not provided.
    missing = [k for k in ("TEST_DB_HOST", "TEST_DB_PORT", "TEST_DB_NAME", "TEST_DB_USER") if not os.environ.get(k)]
    if missing:
        pytest.fail(f"integration test needs {', '.join(missing)} (see scripts/ci/test-component.sh)")
    # Refuse to touch anything that is not clearly a test database.
    if "test" not in os.environ["TEST_DB_NAME"]:
        pytest.fail("TEST_DB_NAME must contain 'test'")
    repo = PostgresRepository.from_params(
        os.environ["TEST_DB_HOST"],
        os.environ["TEST_DB_PORT"],
        os.environ["TEST_DB_NAME"],
        os.environ["TEST_DB_USER"],
        os.environ.get("TEST_DB_PASSWORD"),
    )
    repo.init_schema()
    with repo._connect() as conn:
        conn.execute("TRUNCATE items RESTART IDENTITY")
    return repo


def test_items_roundtrip_against_postgres(repo):
    client = create_app(repo).test_client()

    assert client.get("/health").status_code == 200
    assert client.get("/items").get_json() == []

    created = client.post("/items", json={"name": "from-integration-test"})
    assert created.status_code == 201

    assert client.get("/items").get_json() == [{"id": 1, "name": "from-integration-test"}]
