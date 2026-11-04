"""API tests. The YOLO model is stubbed so the suite stays fast and offline."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import detect as detect_routes


@pytest.fixture()
def client(storage_path):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def fake_inference(monkeypatch):
    def fake_run_detection(_image):
        return (
            [
                {"bbox": [1.0, 2.0, 10.0, 20.0], "confidence": 0.9},
                {"bbox": [5.0, 6.0, 15.0, 25.0], "confidence": 0.7},
            ],
            12.5,
        )

    monkeypatch.setattr(detect_routes, "run_detection", fake_run_detection)
    return fake_run_detection


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "storage" in body


def test_detect_returns_count_and_confidence(client, fake_inference, png_bytes):
    response = client.post(
        "/detect",
        files={"file": ("frame.png", png_bytes, "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert body["detected_type"] == "image"
    assert body["avg_confidence"] == pytest.approx(0.8)
    assert body["inference_time_ms"] == 12.5
    assert body["processed_image"] is None


def test_detect_can_include_overlay(client, fake_inference, png_bytes):
    response = client.post(
        "/detect?include_overlay=true",
        files={"file": ("frame.png", png_bytes, "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["processed_image"]


def test_detect_rejects_unsupported_type(client, png_bytes):
    response = client.post(
        "/detect",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 415
    assert "Unsupported media type" in response.json()["detail"]


def test_detect_rejects_video(client):
    response = client.post(
        "/detect",
        files={"file": ("clip.mp4", b"fake video", "video/mp4")},
    )
    assert response.status_code == 415


def test_detect_rejects_empty_file(client):
    response = client.post(
        "/detect",
        files={"file": ("frame.png", b"", "image/png")},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_detect_rejects_oversized_file(client, monkeypatch):
    monkeypatch.setattr(detect_routes, "MAX_UPLOAD_BYTES", 4)
    response = client.post(
        "/detect",
        files={"file": ("frame.png", b"12345", "image/png")},
    )
    assert response.status_code == 413


def test_detect_rejects_invalid_image_bytes(client):
    response = client.post(
        "/detect",
        files={"file": ("frame.png", b"definitely not an image", "image/png")},
    )
    assert response.status_code == 400
    assert "decode" in response.json()["detail"].lower()


def test_detect_missing_file_has_readable_error(client):
    response = client.post("/detect")
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_history_and_reset(client, fake_inference, png_bytes):
    client.post("/detect", files={"file": ("frame.png", png_bytes, "image/png")})

    history = client.get("/history")
    assert history.status_code == 200
    body = history.json()
    assert len(body["detections"]) == 1
    assert body["stats"]["total_detections"] == 2
    assert body["stats"]["frames_processed"] == 1

    reset = client.post("/reset")
    assert reset.status_code == 200
    assert client.get("/history").json()["detections"] == []
