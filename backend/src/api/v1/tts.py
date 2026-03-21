import base64
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from src.services.tts_service import TTSService
from src.utils.chunking import chunk_text

logger = logging.getLogger(__name__)

router = APIRouter()

# Single shared engine; TTSService is expected to be thread/async-safe.
tts_engine = TTSService()


@router.websocket("/ws/stream_reading")
async def websocket_reading_endpoint(websocket: WebSocket) -> None:
    """
    Stream TTS audio for a single PDF page.

    Protocol (JSON over WebSocket):
      Client → Server: { "page_text": "<raw pdf text>" }
      Server → Client (N times): { "type": "audio_chunk", "sentence_id": int, "audio_b64": str }
      Server → Client (once):    { "type": "completed" }
      Server → Client (on error): { "type": "error", "detail": str }

    Audio bytes are Base64-encoded so they travel safely inside JSON.
    """
    await websocket.accept()
    logger.info("WebSocket connection accepted from %s", websocket.client)

    try:
        # 1. Receive the page text from the frontend.
        data = await websocket.receive_json()
        raw_page_text: str = data.get("page_text", "").strip()

        if not raw_page_text:
            await websocket.send_json({"type": "error", "detail": "page_text is required and must not be empty."})
            await websocket.close(code=1003)
            return

        # 2. Clean and tokenize into sentences using the chunking module.
        sentences = chunk_text(raw_page_text)

        if not sentences:
            await websocket.send_json({"type": "error", "detail": "No sentences could be extracted from the provided text."})
            await websocket.close(code=1003)
            return

        logger.debug("Streaming %d sentences to client", len(sentences))

        # 3. Stream one audio chunk per sentence as it is generated.
        async for chunk in tts_engine.generate_audio_stream(sentences):
            # Base64-encode raw bytes so they serialize cleanly inside JSON.
            audio_b64 = base64.b64encode(chunk["audio_bytes"]).decode("ascii")
            await websocket.send_json({
                "type": "audio_chunk",
                "sentence_id": chunk["sentence_id"],
                "audio_b64": audio_b64,
            })

        # 4. Signal completion so the frontend knows the page is fully read.
        await websocket.send_json({"type": "completed"})
        logger.info("Finished streaming page to client %s", websocket.client)

    except WebSocketDisconnect:
        logger.info("Client %s disconnected mid-stream", websocket.client)

    except Exception as exc:
        logger.exception("Unexpected error during TTS stream: %s", exc)
        # Only send the error frame if the connection is still open.
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.send_json({"type": "error", "detail": "Internal server error during TTS generation."})
        raise