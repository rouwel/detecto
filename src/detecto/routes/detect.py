"""Detection API routes."""

import time

from fastapi import APIRouter, File, HTTPException, UploadFile

from detecto.detection import detect_people
from detecto.models.record import DetectionRecord, save_detection
from detecto.utils.preprocessing import decode_frame, draw_detections, encode_overlay

router = APIRouter()

ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"]
ALLOWED_VIDEO_TYPES = ["video/mp4", "video/mpeg"]


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
