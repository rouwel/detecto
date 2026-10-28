"""Data models and storage for the person detection history."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel

# Storage location can be overridden with the DETECTION_STORAGE_PATH env var.
DETECTION_STORAGE_PATH = Path(
    os.getenv("DETECTION_STORAGE_PATH", "storage/detections.json")
)


class DetectionRecord(BaseModel):
    """A single detection event captured during inference."""

    timestamp: str
    filename: str
    detected_type: str
    count: int
    detections: list[dict[str, Any]]
    processing_time_ms: float

    @classmethod
    def create(
        cls,
        filename: str,
        detected_type: str,
        detections: list[dict[str, Any]],
        processing_time_ms: float,
    ) -> "DetectionRecord":
        return cls(
            timestamp=datetime.now(timezone.utc).isoformat(),
            filename=filename,
            detected_type=detected_type,
            count=len(detections),
            detections=detections,
            processing_time_ms=processing_time_ms,
        )

    def model_dump(self) -> dict[str, Any]:
        return json.loads(self.model_dump_json())


def save_detection(record: DetectionRecord) -> None:
    """Append a detection record to the JSON storage file."""
    DETECTION_STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    records = get_detections()
    records.append(record)
    DETECTION_STORAGE_PATH.write_text(json.dumps([r.model_dump() for r in records], indent=2))


def get_detections(limit: int | None = None) -> list[DetectionRecord]:
    """Retrieve stored detection records (optionally limited to the most recent N)."""
    if not DETECTION_STORAGE_PATH.exists():
        return []

    try:
        data = json.loads(DETECTION_STORAGE_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        # Corrupted or unreadable storage -> start fresh rather than crash.
        return []

    records = [DetectionRecord(**item) for item in data if isinstance(item, dict)]

    if limit is not None:
        records = records[-limit:]

    return records


def clear_history() -> None:
    """Clear all stored detection history."""
    DETECTION_STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    DETECTION_STORAGE_PATH.write_text("[]")


def get_stats() -> dict[str, Any]:
    """Compute basic accuracy/performance stats from stored detections."""
    records = get_detections()

    all_detections = [d for r in records for d in r.detections if d.get("confidence") is not None]
    confidences = [float(d["confidence"]) for d in all_detections]

    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    avg_processing_time_ms = (
        sum(r.processing_time_ms for r in records) / len(records) if records else 0.0
    )

    return {
        "total_detections": sum(r.count for r in records),
        "frames_processed": len(records),
        "mean_confidence": avg_confidence,
        "avg_processing_time_ms": avg_processing_time_ms,
    }
