import pytest
from sqlalchemy import create_engine
from app.core.database import Base
from app.core.config import settings


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    engine = create_engine(settings.DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
