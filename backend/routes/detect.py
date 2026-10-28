"""Detection API routes."""

import os
import tempfile
import time
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from ultralytics import YOLO

from backend.models.record import DetectionRecord, save_detection
from backend.utils.preprocessing import decode_frame, draw_detections, encode_overlay

router = APIRouter()

ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"]
ALLOWED_VIDEO_TYPES = ["video/mp4", "video/mpeg"]

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


@router.post("/detect")
async def uploadImages(file: UploadFile = File(...)):
    content_type = file.content_type

    if content_type in ALLOWED_IMAGE_TYPES:
        media_type = "image"
    elif content_type in ALLOWED_VIDEO_TYPES:
        media_type = "video"
    else:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported media type: '{content_type}'. "
                f"Allowed types: {', '.join(ALLOWED_IMAGE_TYPES + ALLOWED_VIDEO_TYPES)}"
            ),
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    start_time = time.perf_counter()
    detections = detect_people(contents)
    processing_time_ms = (time.perf_counter() - start_time) * 1000

    # Decode the frame, draw overlays, and encode the processed image.
    processed_image_b64 = None
    frame = decode_frame(contents)
    if frame is not None:
        frame = draw_detections(frame, detections)
        processed_image_b64 = encode_overlay(frame)

    # Persist the detection for the history endpoints.
    save_detection(
        DetectionRecord.create(
            filename=file.filename or "unknown",
            detected_type=media_type,
            detections=detections,
            processing_time_ms=processing_time_ms,
        )
    )

    return {
        "filename": file.filename,
        "detected_type": media_type,
        "count": len(detections),
        "detections": detections,
        "processing_time_ms": processing_time_ms,
        "processed_image": processed_image_b64,
    }
