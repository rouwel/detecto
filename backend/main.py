"""Detecto backend application."""

from fastapi import FastAPI

from backend.routes.detect import router as detect_router
from backend.routes.history import router as history_router

app = FastAPI()


@app.get("/hello")
async def root():
    return {"message": "Hello World"}


app.include_router(detect_router)
app.include_router(history_router)
