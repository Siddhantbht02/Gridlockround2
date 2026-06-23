import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from common.db import engine, Base
import incidence_service.router
import prediction_service.router
import allocation_service.router
import auth_service.router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Traffic Intelligence API", version="1.0")

origins = ["*"]
env_origins = os.getenv("ALLOWED_ORIGINS")
if env_origins:
    origins = [o.strip() for o in env_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_service.router.router, prefix="/api/auth", tags=["Auth"])
app.include_router(incidence_service.router.router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(prediction_service.router.router, prefix="/api/predict", tags=["Prediction"])
app.include_router(allocation_service.router.router, prefix="/api/allocate", tags=["Resource Allocation"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
