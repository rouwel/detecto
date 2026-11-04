"""Detecto backend application."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import ALLOWED_ORIGINS, DETECTION_STORAGE_PATH, YOLO_MODEL_PATH
from .routes.detect import is_model_loaded
from .routes.detect import router as detect_router
from .routes.history import router as history_router

app = FastAPI(
    title="Detecto",
    version="0.1.0",
    description="Real-time person detection and counting API powered by YOLOv8.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    """Return a readable message instead of FastAPI's nested validation dump."""
    fields = ", ".join(".".join(str(part) for part in err["loc"]) for err in exc.errors())
    return JSONResponse(
        status_code=422,
        content={"detail": f"Invalid or missing request data: {fields}"},
    )


@app.get("/health")
async def health():
    """Liveness/readiness probe used by the frontend and tests."""
    return {
        "status": "ok",
        "model": YOLO_MODEL_PATH,
        "model_loaded": is_model_loaded(),
        "storage": str(DETECTION_STORAGE_PATH),
    }


app.include_router(detect_router)
app.include_router(history_router)
