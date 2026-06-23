from fastapi import APIRouter, Depends, HTTPException, status
from common.schemas import Token, UserLogin
from datetime import datetime, timedelta

router = APIRouter()

# Mocking auth for the demo
@router.post("/login", response_model=Token)
def login(user: UserLogin):
    if user.username == "admin" and user.password == "admin":
        return {"access_token": "mock_token", "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Incorrect username or password")
