"""History API routes."""

from fastapi import APIRouter, Query

from ..models.record import clear_history, get_detections, get_stats

router = APIRouter()


@router.get("/history")
async def get_history(limit: int = Query(100, ge=1, le=1000)):
    """Retrieve stored detection history (most recent N records)."""
    records = get_detections(limit=limit)
    return {
        "detections": [r.model_dump() for r in records],
        "stats": get_stats(),
    }


@router.post("/reset")
async def reset_history():
    """Clear the stored detection history."""
    clear_history()
    return {"status": "cleared", "message": "Detection history cleared"}
