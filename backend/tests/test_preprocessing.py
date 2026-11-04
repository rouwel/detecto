"""Tests for image preprocessing utilities."""

import numpy as np

from backend.utils.preprocessing import decode_frame, draw_detections, encode_overlay, prepare_frame


def test_decode_frame_accepts_png(png_bytes):
    frame = decode_frame(png_bytes)
    assert frame is not None
    assert frame.shape == (24, 32, 3)


def test_decode_frame_rejects_garbage():
    assert decode_frame(b"not an image") is None
    assert decode_frame(b"") is None


def test_prepare_frame_without_contrast_is_identity():
    frame = np.full((10, 10, 3), 50, dtype=np.uint8)
    assert prepare_frame(frame) is frame


def test_prepare_frame_with_contrast_preserves_shape():
    frame = np.full((10, 10, 3), 50, dtype=np.uint8)
    result = prepare_frame(frame, contrast=True)
    assert result.shape == frame.shape
    assert result.dtype == frame.dtype


def test_draw_and_encode_overlay(png_bytes):
    frame = decode_frame(png_bytes)
    detections = [{"bbox": [2, 2, 20, 20], "confidence": 0.9}]
    drawn = draw_detections(frame, detections)
    encoded = encode_overlay(drawn)
    assert encoded
    assert isinstance(encoded, str)
