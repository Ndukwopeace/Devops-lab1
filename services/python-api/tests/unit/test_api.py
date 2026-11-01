import pytest

from app.api import create_app


class FakeRepo:
    def __init__(self, healthy=True):
        self.healthy = healthy
        self.items = []

    def ping(self):
        if not self.healthy:
            raise RuntimeError("db down")

    def list_items(self):
        return list(self.items)

    def add_item(self, name):
        item = {"id": len(self.items) + 1, "name": name}
        self.items.append(item)
        return item


@pytest.fixture
def repo():
    return FakeRepo()


@pytest.fixture
def client(repo):
    return create_app(repo).test_client()


def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_health_reports_unavailable_database():
    client = create_app(FakeRepo(healthy=False)).test_client()
    assert client.get("/health").status_code == 503


def test_items_starts_empty(client):
    assert client.get("/items").get_json() == []


def test_post_then_list(client):
    created = client.post("/items", json={"name": "  widget "})
    assert created.status_code == 201
    assert created.get_json() == {"id": 1, "name": "widget"}
    assert client.get("/items").get_json() == [{"id": 1, "name": "widget"}]


@pytest.mark.parametrize("body", [{}, {"name": ""}, {"name": "   "}, {"name": 5}, {"name": "x" * 101}])
def test_post_rejects_invalid_name(client, repo, body):
    assert client.post("/items", json=body).status_code == 400
    assert repo.items == []
