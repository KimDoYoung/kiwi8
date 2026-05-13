import os
import re
import collections
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
from typing import List, Optional
from backend.core.config import config

router = APIRouter()

def tail(filename, n=100):
    """파일의 마지막 n줄을 효율적으로 읽어옵니다."""
    try:
        with open(filename, "r", encoding="utf-8", errors="ignore") as f:
            return list(collections.deque(f, maxlen=n))
    except Exception:
        return []

@router.get("/logs")
async def get_logs(
    lines: int = Query(100, ge=1, le=1000),
    level: Optional[str] = Query(None, regex="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$"),
    file_index: int = Query(0, ge=0, le=7)
):
    log_file = config.LOG_FILE
    if file_index > 0:
        log_file = f"{log_file}.{file_index}"

    if not os.path.exists(log_file):
        raise HTTPException(status_code=404, detail=f"Log file not found: {log_file}")

    try:
        read_count = lines * 5 if level else lines
        raw_logs = tail(log_file, read_count)

        if level:
            pattern = re.compile(f"- {level} -")
            filtered_logs = [line for line in raw_logs if pattern.search(line)]
        else:
            filtered_logs = raw_logs

        results = filtered_logs[-lines:]

        return {
            "file_name": os.path.basename(log_file),
            "returned_count": len(results),
            "logs": [line.rstrip() for line in results]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/logs/download")
async def download_log(
    file_index: int = Query(0, ge=0, le=7)
):
    """로그 파일을 다운로드합니다."""
    log_file = config.LOG_FILE
    if file_index > 0:
        log_file = f"{log_file}.{file_index}"

    if not os.path.exists(log_file):
        raise HTTPException(status_code=404, detail=f"Log file not found: {log_file}")

    return FileResponse(
        path=log_file,
        filename=os.path.basename(log_file),
        media_type='application/octet-stream'
    )

@router.get("/logs/files")
async def list_log_files():
    log_dir = config.LOG_DIR
    files = []
    if os.path.exists(log_dir):
        for f_name in sorted(os.listdir(log_dir)):
            if f_name.startswith("kiwi8.log"):
                path = os.path.join(log_dir, f_name)
                files.append({
                    "name": f_name,
                    "size": os.path.getsize(path),
                    "modified": os.path.getmtime(path)
                })
    return files
