from sqlalchemy import create_engine, Column, Integer, String, Float, Date, ForeignKey, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./account_book.db")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    dob = Column(String, nullable=True)
    age = Column(Integer, nullable=True)
    
    expenses = relationship("Expense", back_populates="owner")
    incomes = relationship("Income", back_populates="owner")
    assets = relationship("Asset", back_populates="owner")

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, index=True)
    amount = Column(Float, nullable=False)
    store = Column(String, nullable=True)
    category = Column(String, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    owner = relationship("User", back_populates="expenses")

class Income(Base):
    __tablename__ = "incomes"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, index=True)           # YYYY-MM-DD
    amount = Column(Float, nullable=False)
    source = Column(String, nullable=True)      # 収入源（給料、副業、etc.）
    category = Column(String, nullable=True)    # 給与、ボーナス、副業、その他
    user_id = Column(Integer, ForeignKey("users.id"))
    
    owner = relationship("User", back_populates="incomes")

class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)       # 資産名（現金、銀行口座A等）
    amount = Column(Float, nullable=False, default=0)
    note = Column(String, nullable=True)        # メモ
    updated_at = Column(String, nullable=True)  # 最終更新日
    user_id = Column(Integer, ForeignKey("users.id"))
    
    owner = relationship("User", back_populates="assets")

class PasswordResetToken(Base):
    __tablename__ = "password_resets"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    expires_at = Column(DateTime, nullable=False)

    user = relationship("User")

# Create tables
Base.metadata.create_all(bind=engine)
