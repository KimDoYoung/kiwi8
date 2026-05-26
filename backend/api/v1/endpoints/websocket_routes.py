from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.core.logger import get_logger
from backend.domains.infrahub.ws_manager import ws_manager

logger = get_logger(__name__)

router = APIRouter()


@router.websocket("/ws/realtime")
async def ws_realtime(websocket: WebSocket):
    await websocket.accept()
    await ws_manager.add_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        await ws_manager.remove_client(websocket)
