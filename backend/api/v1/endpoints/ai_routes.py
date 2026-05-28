from fastapi import APIRouter

from backend.core.config import config
from backend.core.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.get("/llm-info")
def llm_info():
    return {
        "llm_url":   config.LLM_URL,
        "llm_model": config.LLM_MODEL,
    }
