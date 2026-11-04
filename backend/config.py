"""Central configuration for the Detecto backend.

All values can be overridden through environment variables or the project
`.env` file. Paths that are relative are resolved against the repository root
so the service behaves the same regardless of the current working directory.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_path(name: str, default: str) -> Path:
    """Return an env-provided path, anchored to the repo root when relative."""
    path = Path(os.getenv(name, default)).expanduser()
    return path if path.is_absolute() else BASE_DIR / path


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


# Model / inference
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
YOLO_CONF = float(os.getenv("YOLO_CONF", "0.25"))
YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "640"))
CONTRAST_ENHANCE = _env_bool("CONTRAST_ENHANCE", False)

# Uploads
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Storage
DETECTION_STORAGE_PATH = _env_path("DETECTION_STORAGE_PATH", "storage/detections.json")
MAX_HISTORY_RECORDS = int(os.getenv("MAX_HISTORY_RECORDS", "10000"))

# HTTP
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
