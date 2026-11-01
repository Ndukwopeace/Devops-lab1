from app.api import create_app
from app.repository import PostgresRepository

repo = PostgresRepository.from_env()
repo.init_schema()
app = create_app(repo)
