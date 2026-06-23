from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from common.db import get_db
from common.models import Incident as DBIncident
from common.schemas import IncidentCreate, Incident
import uuid
from datetime import datetime

router = APIRouter()

@router.post("/", response_model=Incident, status_code=201)
def create_incident(incident: IncidentCreate, db: Session = Depends(get_db)):
    incident_id = str(uuid.uuid4())
    
    db_incident = DBIncident(
        id=incident_id,
        event_type=incident.event_type,
        event_cause=incident.event_cause,
        start_time=incident.start_time,
        priority=incident.priority,
        road_closure_req=incident.road_closure_req,
        longitude=incident.location[0],
        latitude=incident.location[1],
        status="open",
        created_at=datetime.utcnow()
    )
    db.add(db_incident)
    db.commit()
    db.refresh(db_incident)
    
    return {**incident.dict(), "id": incident_id, "status": "open", "created_at": db_incident.created_at}

@router.get("/", response_model=list[Incident])
def get_incidents(db: Session = Depends(get_db)):
    incidents = db.query(DBIncident).order_by(DBIncident.created_at.desc()).limit(100).all()
    
    res = []
    for inc in incidents:
        res.append({
            "id": inc.id,
            "event_type": inc.event_type,
            "event_cause": inc.event_cause,
            "start_time": inc.start_time,
            "priority": inc.priority,
            "road_closure_req": inc.road_closure_req,
            "location": [inc.longitude, inc.latitude],
            "status": inc.status,
            "created_at": inc.created_at
        })
    return res
