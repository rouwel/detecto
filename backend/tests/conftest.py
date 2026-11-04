"""Shared test fixtures for the Detecto backend."""

import io

import pytest
from PIL import Image


@pytest.fixture()
def png_bytes() -> bytes:
    """A tiny valid PNG image."""
    buffer = io.BytesIO()
    Image.new("RGB", (32, 24), (30, 30, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture()
def storage_path(tmp_path, monkeypatch):
    """Point the record store at a temporary file for each test."""
    from backend.models import record

    path = tmp_path / "detections.json"
    monkeypatch.setattr(record, "DETECTION_STORAGE_PATH", path)
    return path
