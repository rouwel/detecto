"""Tests for detection record storage and statistics."""

import json

import pytest
from backend.models.record import (
    DetectionRecord,
    clear_history,
    get_detections,
    get_stats,
    save_detection,
)


def make_record(confidences=(0.9, 0.7), processing_time_ms=10.0, inference_time_ms=6.0):
    detections = [{"bbox": [0, 0, 10, 10], "confidence": c} for c in confidences]
    return DetectionRecord.create(
        filename="frame.jpg",
        detected_type="image",
        detections=detections,
        processing_time_ms=processing_time_ms,
        inference_time_ms=inference_time_ms,
    )


def test_record_computes_average_confidence():
    record = make_record((0.9, 0.7))
    assert record.count == 2
    assert record.avg_confidence == pytest.approx(0.8)


def test_record_without_detections_has_zero_confidence():
    assert make_record(()).avg_confidence == 0.0


def test_save_and_read_roundtrip(storage_path):
    save_detection(make_record())
    records = get_detections()
    assert len(records) == 1
    assert records[0].filename == "frame.jpg"
    assert json.loads(storage_path.read_text())[0]["avg_confidence"] == 0.8


def test_limit_returns_most_recent(storage_path):
    for confidence in (0.1, 0.2, 0.3):
        save_detection(make_record((confidence,)))
    records = get_detections(limit=2)
    assert [r.avg_confidence for r in records] == [0.2, 0.3]


def test_history_is_trimmed_to_max_records(storage_path, monkeypatch):
    from backend.models import record

    monkeypatch.setattr(record, "MAX_HISTORY_RECORDS", 2)
    for confidence in (0.1, 0.2, 0.3):
        save_detection(make_record((confidence,)))
    assert len(get_detections()) == 2


def test_corrupted_storage_is_treated_as_empty(storage_path):
    storage_path.parent.mkdir(parents=True, exist_ok=True)
    storage_path.write_text("{not json")
    assert get_detections() == []


def test_clear_history(storage_path):
    save_detection(make_record())
    clear_history()
    assert get_detections() == []
    assert storage_path.read_text() == "[]"


def test_stats(storage_path):
    save_detection(make_record((0.8, 0.6), processing_time_ms=10.0, inference_time_ms=5.0))
    save_detection(make_record((1.0,), processing_time_ms=20.0, inference_time_ms=15.0))

    stats = get_stats()
    assert stats["frames_processed"] == 2
    assert stats["total_detections"] == 3
    assert stats["mean_confidence"] == pytest.approx(0.8)
    assert stats["avg_processing_time_ms"] == 15.0
    assert stats["avg_inference_time_ms"] == 10.0
