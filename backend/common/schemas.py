from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class IncidentBase(BaseModel):
    event_type: str
    event_cause: Optional[str] = None
    start_time: datetime
    priority: Optional[str] = "Medium"
    road_closure_req: Optional[bool] = False
    location: List[float] # [longitude, latitude]
    
class IncidentCreate(IncidentBase):
    pass

class Incident(IncidentBase):
    id: str
    status: Optional[str] = "open"
    created_at: datetime
    
    class Config:
        orm_mode = True

class PredictionRequest(BaseModel):
    event_type: str
    requires_road_closure: bool = False
    latitude: float
    longitude: float
    hour: int
    day_of_week: int
    route_coordinates: Optional[List[List[float]]] = None

class ResourceRecommendations(BaseModel):
    officers: int
    barricades: int

class PredictionResponse(BaseModel):
    severity: str
    priority: str
    importance: str
    impact_score: float
    expected_duration: int
    closure_required: bool
    recommendations: ResourceRecommendations
    xai_explanation: Dict[str, float]
    action_plan: List[Dict[str, Any]]
    learning_report: Dict[str, str]
    blast_radius_km: float

class Token(BaseModel):
    access_token: str
    token_type: str

class UserLogin(BaseModel):
    username: str
    password: str
