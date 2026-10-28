import base64
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile

from detecto.detection import detect_people

app = FastAPI()

ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"]
ALLOWED_VIDEO_TYPES = ["video/mp4", "video/mpeg"]


@app.get("/hello")
async def root():
    return {"message": "Hello World"}


@app.post("/detect")
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

    # Decode the frame and draw bounding boxes + labels for the overlay image.
    processed_image_b64 = None
    frame = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
    if frame is not None:
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            confidence = det["confidence"]

            cv2.rectangle(
                frame,
                (int(x1), int(y1)),
                (int(x2), int(y2)),
                (0, 255, 0),  # green box
                2,
            )
            label = f"Person {confidence:.2f}"
            (label_w, label_h), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
            )
            label_y = max(0, int(y1 - label_h - 4))
            cv2.putText(
                frame,
                label,
                (int(x1), label_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2,
            )

        ok, buffer = cv2.imencode(".jpg", frame)
        if ok:
            processed_image_b64 = base64.b64encode(buffer.tobytes()).decode("utf-8")

    return {
        "filename": file.filename,
        "detected_type": media_type,
        "count": len(detections),
        "detections": detections,
        "processing_time_ms": processing_time_ms,
        "processed_image": processed_image_b64,
    }
