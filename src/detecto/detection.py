"""Person detection service.

Wraps a YOLO model (defaults to `yolov8n.pt`) and exposes a simple
``detect_people`` function that turns raw image bytes into person
detections (bounding boxes + confidence scores).

The model is loaded lazily so the API starts quickly, and can be
overridden with the ``YOLO_MODEL_PATH`` environment variable.
"""

import os
import tempfile
from typing import Any

from ultralytics import YOLO

DEFAULT_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")

_model = None


def get_model() -> Any:
    """Load the YOLO model once and cache it."""
    global _model
    if _model is None:
        _model = YOLO(DEFAULT_MODEL_PATH)
    return _model


def detect_people(image_bytes: bytes) -> list[dict[str, Any]]:
    """Run person detection on an uploaded frame.

    Args:
        image_bytes: Raw image bytes (JPEG or PNG).

    Returns:
        A list of detections, each containing:
            - "bbox": [x1, y1, x2, y2] pixel coordinates (xyxy format)
            - "confidence": detection confidence score
    """
    model = get_model()

    # YOLO expects a file path/source, so write the bytes to a temp file.
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
        tmp_file.write(image_bytes)
        tmp_path = tmp_file.name

    try:
        results = model(tmp_path)
        result = results[0]
        boxes = result.boxes

        detections: list[dict[str, Any]] = []
        if boxes is not None:
            for box in boxes:
                # COCO class index 0 corresponds to "person".
                if int(box.cls[0]) != 0:
                    continue
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                detections.append(
                    {
                        "bbox": [x1, y1, x2, y2],
                        "confidence": float(box.conf[0]),
                    }
                )
        return detections
    finally:
        os.unlink(tmp_path)
