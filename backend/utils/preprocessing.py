"""Image preprocessing utilities for detection frames."""

import base64

import cv2
import numpy as np


def decode_frame(image_bytes: bytes) -> np.ndarray | None:
    """Decode raw image bytes (JPEG/PNG) into a BGR OpenCV frame."""
    if not image_bytes:
        return None
    return cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)


def prepare_frame(frame: np.ndarray, contrast: bool = False) -> np.ndarray:
    """Apply optional preprocessing before inference.

    Ultralytics performs resizing and normalization internally, so the only
    extra step here is an optional CLAHE contrast boost for low-light frames.
    """
    if not contrast:
        return frame

    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    lightness, a, b = cv2.split(lab)
    lightness = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(lightness)
    return cv2.cvtColor(cv2.merge((lightness, a, b)), cv2.COLOR_LAB2BGR)


def draw_detections(frame: np.ndarray, detections: list[dict]) -> np.ndarray:
    """Draw bounding boxes + confidence labels onto a frame (in place)."""
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        confidence = det.get("confidence", 0.0)

        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
        label = f"Person {confidence:.2f}"
        (_, label_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
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
