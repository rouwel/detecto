"""Data models and storage for the person detection history."""

import json
import os
import threading
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from ..config import DETECTION_STORAGE_PATH, MAX_HISTORY_RECORDS

# Serialises read-modify-write cycles when multiple requests save at once.
_lock = threading.RLock()


class DetectionRecord(BaseModel):
    """A single detection event captured during inference."""

    timestamp: str
    filename: str
    detected_type: str
    count: int
    avg_confidence: float = 0.0
    detections: list[dict[str, Any]]
    processing_time_ms: float
    inference_time_ms: float = 0.0

    @classmethod
    def create(
        cls,
        filename: str,
        detected_type: str,
        detections: list[dict[str, Any]],
        processing_time_ms: float,
        inference_time_ms: float = 0.0,
    ) -> "DetectionRecord":
        confidences = [float(d["confidence"]) for d in detections if d.get("confidence") is not None]
        return cls(
            timestamp=datetime.now(timezone.utc).isoformat(),
            filename=filename,
            detected_type=detected_type,
            count=len(detections),
            avg_confidence=sum(confidences) / len(confidences) if confidences else 0.0,
            detections=detections,
            processing_time_ms=processing_time_ms,
            inference_time_ms=inference_time_ms,
        )

    def model_dump(self) -> dict[str, Any]:
        return json.loads(self.model_dump_json())


def _read_records() -> list[DetectionRecord]:
    """Load records from disk, tolerating a missing or corrupted file."""
    if not DETECTION_STORAGE_PATH.exists():
        return []

    try:
        data = json.loads(DETECTION_STORAGE_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return []

    if not isinstance(data, list):
        return []
    return [DetectionRecord(**item) for item in data if isinstance(item, dict)]


def _write_records(records: list[DetectionRecord]) -> None:
    """Atomically replace the storage file to avoid partial writes."""
    DETECTION_STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps([r.model_dump() for r in records], indent=2)
    tmp_path = DETECTION_STORAGE_PATH.with_suffix(DETECTION_STORAGE_PATH.suffix + ".tmp")
    tmp_path.write_text(payload)
    os.replace(tmp_path, DETECTION_STORAGE_PATH)


def save_detection(record: DetectionRecord) -> None:
    """Append a detection record, trimming the oldest entries when capped."""
    with _lock:
        records = _read_records()
        records.append(record)
        if MAX_HISTORY_RECORDS > 0:
            records = records[-MAX_HISTORY_RECORDS:]
        _write_records(records)


def get_detections(limit: int | None = None) -> list[DetectionRecord]:
    """Retrieve stored detection records (optionally limited to the most recent N)."""
    with _lock:
        records = _read_records()

    if limit is not None:
        records = records[-limit:]
    return records


def clear_history() -> None:
    """Clear all stored detection history."""
    with _lock:
        _write_records([])


def get_stats() -> dict[str, Any]:
    """Compute basic accuracy/performance stats from stored detections."""
    records = get_detections()

    confidences = [
        float(d["confidence"])
        for record in records
        for d in record.detections
        if d.get("confidence") is not None
    ]

    def _mean(values: list[float]) -> float:
        return sum(values) / len(values) if values else 0.0

    avg_crowd = (
        sum(r.count for r in records) / len(records) if records else 0.0
    )
    peak = max((r.count for r in records), default=0)

    return {
        "total_detections": sum(r.count for r in records),
        "frames_processed": len(records),
        "avg_crowd": avg_crowd,
        "peak": peak,
        "mean_confidence": _mean(confidences),
        "avg_processing_time_ms": _mean([r.processing_time_ms for r in records]),
        "avg_inference_time_ms": _mean([r.inference_time_ms for r in records if r.inference_time_ms]),
    }
