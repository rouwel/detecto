"""Image preprocessing utilities for detection frames."""

import base64

import cv2
import numpy as np


def decode_frame(image_bytes: bytes) -> np.ndarray | None:
    """Decode raw image bytes (JPEG/PNG) into a BGR OpenCV frame."""
    return cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)


def draw_detections(frame: np.ndarray, detections: list[dict]) -> np.ndarray:
    """Draw bounding boxes + confidence labels onto a frame (in place)."""
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        confidence = det.get("confidence", 0.0)

        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
        label = f"Person {confidence:.2f}"
        (label_w, label_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
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
    return frame


def encode_overlay(frame: np.ndarray) -> str | None:
    """Encode a frame as a base64 JPEG string for API responses."""
    ok, buffer = cv2.imencode(".jpg", frame)
    if not ok:
        return None
    return base64.b64encode(buffer.tobytes()).decode("utf-8")
