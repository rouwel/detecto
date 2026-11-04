"""Detection API routes."""

import time
from typing import Any

import numpy as np
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from ultralytics import YOLO

from ..config import (
    CONTRAST_ENHANCE,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_MB,
    YOLO_CONF,
    YOLO_IMGSZ,
    YOLO_MODEL_PATH,
)
from ..models.record import DetectionRecord, save_detection
from ..utils.preprocessing import decode_frame, draw_detections, encode_overlay, prepare_frame

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png"}
PERSON_CLASS_ID = 0  # COCO class index for "person"

_model = None


def get_model() -> Any:
    """Load the YOLO model once and cache it."""
    global _model
    if _model is None:
        _model = YOLO(YOLO_MODEL_PATH)
    return _model


def is_model_loaded() -> bool:
    """Return whether the model has already been loaded (used by /health)."""
    return _model is not None


def run_detection(image: bytes | np.ndarray) -> tuple[list[dict[str, Any]], float]:
    """Run person detection and return detections plus inference time in ms.

    Args:
        image: Raw image bytes (JPEG/PNG) or a decoded BGR numpy frame.

    Returns:
        A tuple of (detections, inference_time_ms). Each detection contains
        "bbox" ([x1, y1, x2, y2] in image pixels) and "confidence".
    """
    if isinstance(image, (bytes, bytearray)):
        frame = decode_frame(bytes(image))
        if frame is None:
            raise ValueError("Could not decode image. Use a valid JPEG or PNG file.")
    else:
        frame = image

    frame = prepare_frame(frame, contrast=CONTRAST_ENHANCE)
    model = get_model()

    started = time.perf_counter()
    results = model(frame, conf=YOLO_CONF, imgsz=YOLO_IMGSZ, verbose=False)
    inference_time_ms = (time.perf_counter() - started) * 1000

    detections: list[dict[str, Any]] = []
    boxes = results[0].boxes
    if boxes is not None:
        for box in boxes:
            if int(box.cls[0]) != PERSON_CLASS_ID:
                continue
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            detections.append(
                {
                    "bbox": [x1, y1, x2, y2],
                    "confidence": float(box.conf[0]),
                }
            )

    return detections, inference_time_ms


def detect_people(image: bytes | np.ndarray) -> list[dict[str, Any]]:
    """Convenience wrapper returning only the detections."""
    detections, _ = run_detection(image)
    return detections


@router.post("/detect")
async def detect(
    file: UploadFile = File(...),
    include_overlay: bool = Query(False, description="Include a base64 annotated image."),
):
    """Detect people in an uploaded JPEG/PNG image."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported media type: '{file.content_type}'. "
                f"Allowed types: {', '.join(sorted(ALLOWED_IMAGE_TYPES))}"
            ),
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large. Maximum size is {MAX_UPLOAD_MB} MB.",
        )

    frame = decode_frame(contents)
    if frame is None:
        raise HTTPException(
            status_code=400,
            detail="Could not decode image. Use a valid JPEG or PNG file.",
        )

    start_time = time.perf_counter()
    detections, inference_time_ms = run_detection(frame)

    # Only build the annotated image when the caller asks for it.
    processed_image_b64 = None
    if include_overlay:
        processed_image_b64 = encode_overlay(draw_detections(frame.copy(), detections))

    processing_time_ms = (time.perf_counter() - start_time) * 1000
    confidences = [d["confidence"] for d in detections]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    save_detection(
        DetectionRecord.create(
            filename=file.filename or "unknown",
            detected_type="image",
            detections=detections,
            processing_time_ms=processing_time_ms,
            inference_time_ms=inference_time_ms,
        )
    )

    return {
        "filename": file.filename,
        "detected_type": "image",
        "count": len(detections),
        "avg_confidence": avg_confidence,
        "detections": detections,
        "processing_time_ms": processing_time_ms,
        "inference_time_ms": inference_time_ms,
        "processed_image": processed_image_b64,
    }
