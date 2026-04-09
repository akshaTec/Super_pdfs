# Backend

FastAPI service for PDF reading (WebSocket TTS streaming).

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (recommended; this project includes `uv.lock`)

## Install dependencies

From the `backend` directory:

```bash
uv sync
```

## Start the server

Run from the `backend` directory so the top-level `main` module resolves:

```bash
uv run uvicorn main:app --reload --port 8000
```

The API listens on **http://127.0.0.1:8000** by default. The frontend expects the reader WebSocket at `ws://localhost:8000` unless you set `NEXT_PUBLIC_BACKEND_WS_URL`.

On first run, the TTS stack may download model weights from Hugging Face; ensure outbound network access (and Hugging Face access if you use a proxy or firewall).

### Without uv

```bash
pip install -e .
uvicorn main:app --reload --port 8000
```

(Use the same working directory: `backend`.)
