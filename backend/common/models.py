from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey
from .db import Base
from datetime import datetime

class Incident(Base):
    __tablename__ = "incidents"
    
    id = Column(String, primary_key=True, index=True)
    event_type = Column(String, nullable=False)
    event_cause = Column(String)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime)
    resolution_time = Column(Integer) # in minutes
    status = Column(String)
    priority = Column(String)
    road_closure_req = Column(Boolean, default=False)
    corridor = Column(String)
    zone_id = Column(Integer)
    police_station_id = Column(Integer)
    junction = Column(String)
    admin_area = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="operator")
