"""
Database setup and session management for SQLModel.
"""
from sqlmodel import SQLModel, create_engine, Session
import os

# Database URL - SQLite for local development
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./recommendation_service.db")

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False  # Set to True for SQL logging
)


def init_db():
    """Initialize database tables."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Get database session."""
    with Session(engine) as session:
        yield session

