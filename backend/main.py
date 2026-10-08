"""FastAPI app serving pre-generated CSDI imputation results.

No model inference happens here - it only reads the `.pk` files that already
contain the pretrained model's output (see OUTPUT_FORMAT.md). The two series
endpoints stream their points over SSE to simulate realtime arrival; the
underlying data itself is still the static, pre-computed output. Run with:

    .venv\\Scripts\\python.exe -m uvicorn backend.main:app --reload --port 8800

or simply:

    .venv\\Scripts\\python.exe -m backend.main
"""
import asyncio
import json
import os
from typing import AsyncGenerator, List

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .loader import get_comparison_series, get_meta, get_real_series
from .schemas import MetaResponse

# Port 8000 collided with another local service, so the API now defaults to
# 8800. Override with the CSDI_API_PORT env var if that one is taken too.
DEFAULT_PORT = int(os.environ.get("CSDI_API_PORT", 8800))

app = FastAPI(title="CSDI Imputation API", version="0.3.0")

# FE runs on a different origin (different dev server port) than this API,
# so the browser needs the API to explicitly allow cross-origin GET requests.
# No cookies/auth are involved here, so allow_credentials stays False, which
# lets allow_origins stay "*" (a browser rejects "*" combined with
# credentials). Tighten allow_origins to the real FE origin(s) before
# deploying anywhere public.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # disable nginx buffering if proxied later
}


async def _sse_stream(request: Request, points: List[dict], interval_ms: int) -> AsyncGenerator[str, None]:
    for point in points:
        if await request.is_disconnected():
            break
        yield f"event: point\ndata: {json.dumps(point)}\n\n"
        if interval_ms > 0:
            await asyncio.sleep(interval_ms / 1000)
    yield f"event: done\ndata: {json.dumps({'total': len(points)})}\n\n"


@app.get("/api/{dataset}/meta", response_model=MetaResponse)
def meta(dataset: str):
    try:
        return get_meta(dataset)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/{dataset}/series/{sample_id}/{feature_id}/real")
def real_series(
    request: Request,
    dataset: str,
    sample_id: int,
    feature_id: int,
    interval_ms: int = Query(200, ge=0, description="Delay (ms) between SSE points, simulates realtime playback"),
):
    try:
        points = get_real_series(dataset, sample_id, feature_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except IndexError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return StreamingResponse(
        _sse_stream(request, points, interval_ms),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@app.get("/api/{dataset}/series/{sample_id}/{feature_id}/full")
def full_series(
    request: Request,
    dataset: str,
    sample_id: int,
    feature_id: int,
    interval_ms: int = Query(200, ge=0, description="Delay (ms) between SSE points, simulates realtime playback"),
):
    try:
        points = get_comparison_series(dataset, sample_id, feature_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except IndexError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return StreamingResponse(
        _sse_stream(request, points, interval_ms),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=DEFAULT_PORT, reload=True)
