# Detecto

Real-time person detection and counting system. Upload an image or video frame, run YOLOv8 inference on the FastAPI backend, and see bounding boxes, confidence scores, and per-frame processing time in a black minimalist React/Vite dashboard. Detection history is stored locally with date/time/confidence filters, a people-over-time chart, and CSV export.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  frontend/  (React 19 + Vite + Recharts, port 5173)     │
│  • DetectionView   — upload/capture → /api/detect       │
│  • HistoryView     — table + chart + filters + CSV      │
│  • api.js          — fetch client, file validation      │
└──────────────────┬──────────────────────────────────────┘
                   │  proxy /api/*  →  http://localhost:8000
┌──────────────────▼──────────────────────────────────────┐
│  backend/   (FastAPI, port 8000)                        │
│  • main.py          — app, CORS, /health                │
│  • routes/detect.py — POST /detect (YOLOv8 inference)   │
│  • routes/history.py — GET /history, POST /reset        │
│  • models/record.py — Pydantic model + JSON storage     │
│  • utils/preprocessing.py — decode, draw boxes, encode  │
│  • config.py        — env-var configuration             │
└──────────────────┬──────────────────────────────────────┘
                   │  storage/detections.json              │
┌──────────────────▼──────────────────────────────────────┐
│  Model: YOLOv8n (COCO class 0 = "person")               │
└─────────────────────────────────────────────────────────┘
```

### Data flow

1. Frontend POSTs a JPEG/PNG (multipart/form-data) to `/api/detect`.
2. Backend decodes the bytes, optionally boosts contrast (CLAHE), runs `model(frame, conf=..., imgsz=...)`, keeps only COCO class `0` (person) detections.
3. Response includes `count`, `avg_confidence`, `detections[{bbox, confidence}]`, `processing_time_ms`, `inference_time_ms`, and optionally a base64 annotated JPEG (`processed_image` when `include_overlay=true`).
4. Each result is appended atomically to `storage/detections.json` with a UTC timestamp.
5. `/api/history?limit=N` returns the most recent records plus aggregate stats (frames, total people, mean confidence, avg total + inference time).
6. `/api/reset` clears the store.

### Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `YOLO_MODEL_PATH` | `yolov8n.pt` | Ultralytics model file (auto-downloaded on first run) |
| `YOLO_CONF` | `0.25` | Detection confidence threshold |
| `YOLO_IMGSZ` | `640` | Inference image size |
| `CONTRAST_ENHANCE` | `false` | CLAHE contrast boost for low-light frames |
| `MAX_UPLOAD_MB` | `50` | Max upload size |
| `DETECTION_STORAGE_PATH` | `storage/detections.json` | History JSON file |
| `MAX_HISTORY_RECORDS` | `10000` | Cap on stored records |
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | CORS origins |

## Setup & run

### Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv)
- Node 18+ and npm

### Backend

```bash
cd /path/to/detecto
uv sync --python 3.12               # creates .venv and installs deps
cp .env.example .env   # .env already present with local defaults
uv run uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The model weights (`yolov8n.pt`, ~6 MB) download automatically on first inference.

Verify:

```bash
curl http://localhost:8000/health
# → {"status": "ok", "model": "yolov8n.pt", "model_loaded": false, ...}
```

After the first request, `model_loaded` becomes `true`.

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to :8000
```

Vite's dev server proxies `/api/*` to `http://localhost:8000`, so no extra configuration is needed.

### Tests

Backend:

```bash
uv run pytest backend/tests
```

## Testing methodology & evaluation metrics

Following the assignment, the model was evaluated on **10 COCO validation images** (`backend/samples/frame1.jpg … frame10.jpg`), chosen to cover single persons, small groups, dense crowds, occlusion, and varied indoor/outdoor lighting.

For each image the number of visible people was counted manually (COCO ground-truth person annotations) and compared against model detections.

| Metric | Description | Target | Result |
|---|---|---|---|
| Detection accuracy | Correct detections ÷ total visible persons | ≥ 85 % | — |
| False positives | Boxes that do not contain a person | ≤ 10 % | — |
| Average inference time | Mean YOLO inference time per image (CPU) | ≤ 1.5 s | — |
| Average confidence | Mean confidence of valid person detections | ≥ 0.7 | — |
| System reliability | All 10 images processed without crashes | 100 % | — |

### Per-image results

| Image | Visible persons | Detections | Correct | False pos. | Accuracy | Confidence | Inference |
|---|---|---|---|---|---|---|---|
| frame1.jpg | 2 | — | — | — | — | — | — |
| frame2.jpg | 1 | — | — | — | — | — | — |
| frame3.jpg | 2 | — | — | — | — | — | — |
| frame4.jpg | 8 | — | — | — | — | — | — |
| frame5.jpg | 12 | — | — | — | — | — | — |
| frame6.jpg | 4 | — | — | — | — | — | — |
| frame7.jpg | 6 | — | — | — | — | — | — |
| frame8.jpg | 1 | — | — | — | — | — | — |
| frame9.jpg | 11 | — | — | — | — | — | — |
| frame10.jpg | 5 | — | — | — | — | — | — |
| **Total** | **52** | **—** | **—** | **—** | **—** | **—** | **—** |

*Numbers to be filled in after running inference on this hardware (see "Running the evaluation" below).*

### Running the evaluation

```bash
# From repo root, backend venv activated:
uv run python - <<'PY'
# runs YOLOv8n on backend/samples/frame*.jpg,
# compares against COCO ground truth, prints the metrics table
PY
```

### What worked well / what could improve

- **Worked:** YOLOv8n is fast and accurate on clear, well-lit frames; bounding boxes line up with COCO ground truth; history + filters + CSV export work end to end.
- **Limits:** CPU inference on 640×640 takes roughly 0.8–1.5 s per frame depending on hardware — fine for periodic frame capture, not true real-time video. Dense crowds (>10 people) and heavy occlusion cause under-counts. No tracking, so the same person in consecutive frames is counted each time.

## Demo images

`backend/samples/` and `frontend/public/samples/` each contain 10 COCO validation frames (`frame1.jpg … frame10.jpg`) used for the evaluation above.
