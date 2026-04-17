from __future__ import annotations

import asyncio
import contextlib
import dataclasses
import json
import os
import random
import socket
import sqlite3
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

# ==== 유틸 ====
KST = timezone(timedelta(hours=9))

def utcnow() -> datetime:
    return datetime.now(UTC)

def to_iso(dt: datetime | None) -> str | None:
    return dt.astimezone(UTC).isoformat() if dt else None

def from_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)

def now_tz(tz_name: str) -> datetime:
    # 간단 처리: Asia/Seoul만 고정. tzdb 없이 KST만 지원(요구시 확장)
    return datetime.now(KST if tz_name == "Asia/Seoul" else UTC)

# ==== 간단 cron 파서 (분 시 일 월 요일) ====
# 형식: "m h dom mon dow"
#   * 또는 숫자, 쉼표/하이픈 범위 일부 지원 (간단화)
# 예: "0 1 * * *" = 매일 01:00
def _parse_field(token: str, minv: int, maxv: int) -> set[int]:
    vals: set[int] = set()
    if token == "*":
        return set(range(minv, maxv + 1))
    for part in token.split(","):
        if "-" in part:
            a, b = part.split("-")
            vals.update(range(int(a), int(b) + 1))
        else:
            vals.add(int(part))
    return {v for v in vals if minv <= v <= maxv}

def next_cron_time(expr: str, base: datetime) -> datetime:
    # expr: "m h dom mon dow"
    m, h, dom, mon, dow = expr.split()
    M = _parse_field(m, 0, 59)
    H = _parse_field(h, 0, 23)
    D = _parse_field(dom, 1, 31)
    MO = _parse_field(mon, 1, 12)
    W = _parse_field(dow, 0, 6)  # Monday=0

    # base의 다음 분부터 탐색(최대 366일 탐색)
    t = base.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(525600):  # 1년치 분 탐색 안전빵
        if (t.minute in M and t.hour in H and t.day in D and t.month in MO and t.weekday() in W):
            return t
        t += timedelta(minutes=1)
    # fallback (비정상): 1분 뒤
    return base + timedelta(minutes=1)

# ==== 잡 레지스트리 ====
JobFunc = Callable[[dict], Awaitable[Any]]

class JobRegistry:
    def __init__(self) -> None:
        self._funcs: dict[str, JobFunc] = {}

    def register(self, name: str) -> Callable[[JobFunc], JobFunc]:
        def deco(func: JobFunc) -> JobFunc:
            self._funcs[name] = func
            return func
        return deco

    def get(self, name: str) -> JobFunc:
        if name not in self._funcs:
            raise KeyError(f"Job function not found: {name}")
        return self._funcs[name]

job_registry = JobRegistry()

# ==== KScheduler ====
@dataclasses.dataclass
class Job:
    name: str
    func_name: str
    schedule_type: str           # interval|cron|once
    schedule_expr: str
    timezone: str = "Asia/Seoul"
    enabled: bool = True
    max_conc: int = 1
    overlap_policy: str = "skip" # skip|queue|cancel
    timeout_sec: int = 0
    retry_max: int = 0
    retry_backoff: float = 2.0
    jitter_sec: int = 0
    next_run_at: datetime | None = None
    last_run_at: datetime | None = None

class KScheduler:
    def __init__(self, db_path: str, poll_sec: int = 1):
        self.db_path = db_path
        self.poll_sec = poll_sec
        self._stop = asyncio.Event()
        self._running_jobs: dict[str, int] = {}  # name -> running count
        self._queue: asyncio.Queue[tuple[Job, dict]] = asyncio.Queue()
        self._workers: list[asyncio.Task] = []
        self._con = sqlite3.connect(self.db_path, check_same_thread=False)
        self._con.row_factory = sqlite3.Row
        self._prepare_schema()
        self._hostname_pid = f"{socket.gethostname()}:{os.getpid()}"

    # --- DB helpers ---
    def _prepare_schema(self):
        cur = self._con.cursor()
        cur.executescript("""
        CREATE TABLE IF NOT EXISTS kscheduler_job (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          func_name TEXT NOT NULL,
          schedule_type TEXT NOT NULL,
          schedule_expr TEXT NOT NULL,
          timezone TEXT DEFAULT 'Asia/Seoul',
          enabled INTEGER DEFAULT 1,
          max_conc INTEGER DEFAULT 1,
          overlap_policy TEXT DEFAULT 'skip',
          timeout_sec INTEGER DEFAULT 0,
          retry_max INTEGER DEFAULT 0,
          retry_backoff REAL DEFAULT 2.0,
          jitter_sec INTEGER DEFAULT 0,
          next_run_at TEXT,
          last_run_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS kscheduler_run (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_name TEXT NOT NULL,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT,
          message TEXT
        );
        CREATE TABLE IF NOT EXISTS kscheduler_lock (
          lock_key TEXT PRIMARY KEY,
          holder TEXT,
          acquired_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)
        self._con.commit()

    def _fetch_jobs(self) -> list[Job]:
        rows = self._con.execute("SELECT * FROM kscheduler_job WHERE enabled=1").fetchall()
        jobs: list[Job] = []
        for r in rows:
            jobs.append(Job(
                name=r["name"],
                func_name=r["func_name"],
                schedule_type=r["schedule_type"],
                schedule_expr=r["schedule_expr"],
                timezone=r["timezone"],
                enabled=bool(r["enabled"]),
                max_conc=int(r["max_conc"]),
                overlap_policy=r["overlap_policy"],
                timeout_sec=int(r["timeout_sec"]),
                retry_max=int(r["retry_max"]),
                retry_backoff=float(r["retry_backoff"]),
                jitter_sec=int(r["jitter_sec"]),
                next_run_at=from_iso(r["next_run_at"]),
                last_run_at=from_iso(r["last_run_at"]),
            ))
        return jobs

    def _update_next_run(self, job: Job, dt: datetime | None) -> None:
        self._con.execute(
            "UPDATE kscheduler_job SET next_run_at=?, updated_at=CURRENT_TIMESTAMP WHERE name=?",
            (to_iso(dt), job.name)
        )
        self._con.commit()

    def _insert_run(self, job: Job, started_at: datetime) -> int:
        cur = self._con.cursor()
        cur.execute("INSERT INTO kscheduler_run(job_name, started_at) VALUES (?,?)",
                    (job.name, to_iso(started_at)))
        self._con.commit()
        return int(cur.lastrowid)

    def _finish_run(self, run_id: int, status: str, message: str | None = None) -> None:
        self._con.execute(
            "UPDATE kscheduler_run SET finished_at=?, status=?, message=? WHERE id=?",
            (to_iso(utcnow()), status, message, run_id)
        )
        self._con.commit()

    # --- scheduling ---
    def _compute_next(self, job: Job, base: datetime | None = None) -> datetime:
        base = base or utcnow()
        tznow = now_tz(job.timezone).astimezone(UTC)

        if job.schedule_type == "interval":
            # schedule_expr: "seconds=900" or JSON {"seconds":900}
            seconds = 0
            try:
                if job.schedule_expr.strip().startswith("{"):
                    seconds = json.loads(job.schedule_expr)["seconds"]
                else:
                    # key=value 형태 빠르게 파싱
                    parts = dict(p.split("=") for p in job.schedule_expr.split(","))
                    seconds = int(parts.get("seconds", "0"))
            except Exception:
                seconds = int(job.schedule_expr) if job.schedule_expr.isdigit() else 60
            return base + timedelta(seconds=seconds)

        elif job.schedule_type == "cron":
            expr = job.schedule_expr.strip()
            # tznow 기준으로 계산 후 UTC로
            next_local = next_cron_time(expr, now_tz(job.timezone))
            return next_local.astimezone(UTC)

        elif job.schedule_type == "once":
            at = from_iso(job.schedule_expr)
            if at is None:
                # 문자열이 로컬시간일 수 있으니 KST로 가정
                at = datetime.fromisoformat(job.schedule_expr).replace(tzinfo=KST).astimezone(UTC)
            return at
        else:
            # fallback: 1분 뒤
            return base + timedelta(minutes=1)

    # --- locking for multi-process safety ---
    def _try_acquire_lock(self, key: str) -> bool:
        try:
            self._con.execute("INSERT INTO kscheduler_lock(lock_key, holder) VALUES (?,?)",
                              (key, self._hostname_pid))
            self._con.commit()
            return True
        except sqlite3.IntegrityError:
            return False

    def _release_lock(self, key: str) -> None:
        self._con.execute("DELETE FROM kscheduler_lock WHERE lock_key=?", (key,))
        self._con.commit()

    # --- public API ---
    def upsert_job(self, job: Job) -> None:
        cur = self._con.cursor()
        cur.execute("""
        INSERT INTO kscheduler_job(name, func_name, schedule_type, schedule_expr, timezone,
            enabled, max_conc, overlap_policy, timeout_sec, retry_max, retry_backoff, jitter_sec, next_run_at, last_run_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            func_name=excluded.func_name,
            schedule_type=excluded.schedule_type,
            schedule_expr=excluded.schedule_expr,
            timezone=excluded.timezone,
            enabled=excluded.enabled,
            max_conc=excluded.max_conc,
            overlap_policy=excluded.overlap_policy,
            timeout_sec=excluded.timeout_sec,
            retry_max=excluded.retry_max,
            retry_backoff=excluded.retry_backoff,
            jitter_sec=excluded.jitter_sec,
            updated_at=CURRENT_TIMESTAMP
        """, (
            job.name, job.func_name, job.schedule_type, job.schedule_expr, job.timezone,
            int(job.enabled), job.max_conc, job.overlap_policy, job.timeout_sec,
            job.retry_max, job.retry_backoff, job.jitter_sec, to_iso(job.next_run_at), to_iso(job.last_run_at)
        ))
        self._con.commit()
        # next_run 초기화
        j = self._con.execute("SELECT next_run_at FROM kscheduler_job WHERE name=?", (job.name,)).fetchone()
        if not j["next_run_at"]:
            self._update_next_run(job, self._compute_next(job))

    async def start(self, worker_count: int = 4):
        # 워커 생성
        for _ in range(worker_count):
            self._workers.append(asyncio.create_task(self._worker()))
        # 메인 루프
        try:
            while not self._stop.is_set():
                await self._tick()
                await asyncio.sleep(self.poll_sec)
        finally:
            # 종료 절차
            for w in self._workers:
                w.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await asyncio.gather(*self._workers)

    def stop(self):
        self._stop.set()

    async def _tick(self):
        now = utcnow()
        for job in self._fetch_jobs():
            nr = job.next_run_at or self._compute_next(job, now)
            if nr <= now:
                # overlap 정책 체크
                running = self._running_jobs.get(job.name, 0)
                if running >= job.max_conc:
                    if job.overlap_policy == "skip":
                        # 다음 예약만 갱신
                        self._update_next_run(job, self._compute_next(job, now))
                        continue
                    elif job.overlap_policy == "cancel":
                        # 현재 러닝을 취소 시킬 로직은 복잡 → 단순 skip과 동일 처리
                        self._update_next_run(job, self._compute_next(job, now))
                        continue
                    elif job.overlap_policy == "queue":
                        pass  # 큐잉 허용

                # 지터 적용
                payload = {}
                if job.jitter_sec > 0:
                    await asyncio.sleep(random.uniform(0, job.jitter_sec))

                self._update_next_run(job, self._compute_next(job, now))
                await self._queue.put((job, payload))

    async def _worker(self):
        while True:
            job, payload = await self._queue.get()
            self._running_jobs[job.name] = self._running_jobs.get(job.name, 0) + 1
            try:
                await self._run_job(job, payload)
            finally:
                self._running_jobs[job.name] -= 1
                self._queue.task_done()

    async def _run_job(self, job: Job, payload: dict):
        # 멀티 프로세스 중복 방지 락(옵션): 필요 없으면 주석 처리해도 됨
        lock_key = f"job:{job.name}"
        got = self._try_acquire_lock(lock_key)
        if not got:
            return

        run_id = self._insert_run(job, utcnow())
        try:
            func = job_registry.get(job.func_name)

            async def _invoke(attempt: int = 0):
                coro = func(payload)
                if job.timeout_sec and job.timeout_sec > 0:
                    return await asyncio.wait_for(coro, timeout=job.timeout_sec)
                return await coro

            attempt = 0
            while True:
                try:
                    await _invoke(attempt)
                    self._finish_run(run_id, "success", None)
                    break
                except TimeoutError:
                    if attempt >= job.retry_max:
                        self._finish_run(run_id, "timeout", f"timeout after {attempt} retries")
                        break
                except Exception as e:
                    if attempt >= job.retry_max:
                        self._finish_run(run_id, "error", str(e))
                        break
                attempt += 1
                # 지수 백오프
                await asyncio.sleep(job.retry_backoff ** attempt)
        finally:
            self._release_lock(lock_key)

# ==== 예시 잡 함수들 ====
@job_registry.register("nightly_board_scrape")
async def nightly_board_scrape(_payload: dict):
    """
    예: 새벽 01:00에 종목 토론 게시판 스크래핑
    여기에 실제 스크래핑 로직(HTTP 요청 등 aiohttp 사용)을 구현.
    """
    # from backend.domains.scrapers.board import scrape_all  (가정)
    # await scrape_all()
    await asyncio.sleep(0.1)  # 데모용

@job_registry.register("refresh_daily_cache")
async def refresh_daily_cache(_payload: dict):
    """
    예: 장 시작 전 캐시 미리 채우기
    """
    await asyncio.sleep(0.05)
