import asyncio
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import backend.api.common.stock_functions  # noqa: F401 — fill_kind_stk_info job 등록
import backend.domains.market.market_service  # noqa: F401 — job_registry 등록 활성화
import backend.jobs.judal_data_collect  # noqa: F401
import backend.jobs.naver_options  # noqa: F401
import backend.jobs.system_init  # noqa: F401
import backend.jobs.write_account_history  # noqa: F401
from backend.api.v1.common.system_routes import router as system_router
from backend.api.v1.endpoints.ai_routes import router as ai_router
from backend.api.v1.endpoints.diary_routes import router as diary_router
from backend.api.v1.endpoints.home_routes import router as home_router
from backend.api.v1.endpoints.kdaemon_routes import router as kdaemon_router
from backend.api.v1.endpoints.layout_preset_routes import router as layout_preset_router
from backend.api.v1.endpoints.market_routes import router as market_router
from backend.api.v1.endpoints.menus_routes import router as menus_router
from backend.api.v1.endpoints.mystock_routes import router as mystock_router
from backend.api.v1.endpoints.news_routes import router as news_router
from backend.api.v1.endpoints.scheduler_routes import router as scheduler_router
from backend.api.v1.endpoints.settings_routes import router as settings_router
from backend.api.v1.endpoints.stkcompany.account_routes import router as stkcompany_account_router
from backend.api.v1.endpoints.stkcompany.kis_routes import router as kis_router
from backend.api.v1.endpoints.stkcompany.kiwoom_routes import router as kiwoom_router
from backend.api.v1.endpoints.stkcompany.ls_routes import router as ls_router
from backend.api.v1.endpoints.stock_routes import router as stock_router
from backend.api.v1.endpoints.trend_routes import router as trend_router
from backend.api.v1.endpoints.websocket_routes import router as ws_router
from backend.api.v1.endpoints.words_routes import router as words_router
from backend.core.config import config
from backend.core.exception_handler import add_exception_handlers
from backend.core.jwtmiddleware import JWTAuthMiddleware
from backend.core.kiwi8_db import create_kiwi8_db
from backend.core.logger import get_logger
from backend.domains.infrahub.ws_manager import ws_manager
from backend.domains.kscheduler.k_scheduler import KScheduler

logger = get_logger(__name__)
schduler: KScheduler | None = None


def create_app() -> FastAPI:
    kiwi8_app = FastAPI(title='Kiwi8 - 주식관리', version='0.0.1')
    add_middlewares(kiwi8_app)
    add_routes(kiwi8_app)
    dist_path = add_static_files(kiwi8_app)
    add_exception_handlers(kiwi8_app)

    if dist_path:
        index_file = os.path.join(dist_path, 'index.html')
        from fastapi.responses import JSONResponse as _JSONResponse
        from starlette.exceptions import HTTPException as _StarletteHTTPException

        @kiwi8_app.exception_handler(_StarletteHTTPException)
        async def spa_404_handler(request, exc: _StarletteHTTPException):
            if exc.status_code == 404:
                path = request.url.path
                if '/api/' in path:
                    return _JSONResponse({'detail': 'Not Found'}, status_code=404)
                rel = path.lstrip('/')
                file_path = os.path.join(dist_path, rel)
                if os.path.isfile(file_path):
                    return FileResponse(file_path)
                return FileResponse(index_file)
            return _JSONResponse({'detail': getattr(exc, 'detail', str(exc))}, status_code=exc.status_code)

    # 루트 앱에 /kiwi8로 마운트
    root_app = FastAPI()
    add_event_handlers(root_app)  # sub-app의 lifespan은 실행 안되므로 root_app에 등록
    root_app.mount('/kiwi8', kiwi8_app)  # /kiwi8 하위로 마운트
    return root_app


def add_static_files(app: FastAPI):
    """React 빌드 결과물 서빙 개선"""
    dist_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
    dist_path = os.path.abspath(dist_path)

    # 일지 이미지 정적 파일 서빙 (항상 마운트)
    images_path = os.path.join(config.FILE_FOLDER, 'images')
    os.makedirs(images_path, exist_ok=True)
    app.mount('/files/images', StaticFiles(directory=images_path), name='files_images')

    if os.path.exists(dist_path):
        app.mount('/assets', StaticFiles(directory=os.path.join(dist_path, 'assets')), name='assets')
        return dist_path
    return None


def add_middlewares(app: FastAPI):
    """미들웨어 설정"""
    # CORS 설정
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    # JWT 인증 미들웨어 등록
    app.add_middleware(JWTAuthMiddleware)


def add_routes(app: FastAPI):
    # API 라우터 포함
    app.include_router(home_router)
    app.include_router(ws_router)
    app.include_router(system_router, prefix='/api/v1/common', tags=['common'])
    app.include_router(settings_router, prefix='/api/v1/settings', tags=['settings'])
    # 증권사 API 라우터
    app.include_router(kiwoom_router, prefix='/api/v1/stkcompany/kiwoom', tags=['kiwoom'])
    app.include_router(kis_router, prefix='/api/v1/stkcompany/kis', tags=['kis'])
    app.include_router(ls_router, prefix='/api/v1/stkcompany/ls', tags=['ls'])
    app.include_router(stkcompany_account_router, prefix='/api/v1/stkcompany', tags=['stkcompany'])
    # 서비스 라우터
    app.include_router(ai_router,    prefix='/api/v1/ai',     tags=['ai'])
    app.include_router(kdaemon_router, prefix='/api/v1/kdaemon', tags=['kdaemon'])
    app.include_router(market_router, prefix='/api/v1/market', tags=['market'])
    app.include_router(stock_router, prefix='/api/v1/stock', tags=['stock'])
    app.include_router(mystock_router, prefix='/api/v1/mystock', tags=['mystock'])
    app.include_router(trend_router, prefix='/api/v1/trend', tags=['trend'])
    app.include_router(diary_router, prefix='/api/v1/diary', tags=['diary'])
    app.include_router(words_router, prefix='/api/v1/words', tags=['words'])
    app.include_router(news_router, prefix='/api/v1/news', tags=['news'])
    app.include_router(scheduler_router, prefix='/api/v1/scheduler', tags=['scheduler'])
    app.include_router(menus_router, prefix='/api/v1/menus', tags=['menus'])
    app.include_router(layout_preset_router, prefix='/api/v1/layout-presets', tags=['layout-presets'])


def add_event_handlers(app: FastAPI):
    """이벤트 핸들러 설정"""
    app.add_event_handler('startup', startup_event)
    app.add_event_handler('shutdown', shutdown_event)


async def startup_event():
    """Kiwi8 application  시작"""
    logger.info('---------------------------------')
    logger.info(f'Startup 프로세스 시작 : 버전 {config.VERSION}, 모드 {config.PROFILE_NAME}')
    logger.info('---------------------------------')

    db_path = config.DB_PATH
    parent_dir = os.path.dirname(db_path)
    # sqlite3데이터베이스 생성
    if not os.path.exists(parent_dir):
        logger.info(f'DB 디렉토리가 존재하지 않습니다. 생성합니다: {parent_dir}')
        os.makedirs(parent_dir, exist_ok=True)
    create_kiwi8_db(db_path)

    logger.info(f'DB 파일 경로: {db_path}')
    logger.info(f'Log 파일 경로: {config.LOG_FILE}')
    asyncio.create_task(ws_manager.start())

    # kdaemon: DB에 running 상태 저장돼 있으면 자동 재시작
    import sqlite3 as _sqlite3
    try:
        with _sqlite3.connect(db_path) as _c:
            _row = _c.execute("SELECT status FROM auto_trade_state WHERE id=1").fetchone()
        if _row and _row[0] == 'running':
            from backend.domains.kdaemon.k_daemon import KDaemon
            _daemon = KDaemon.get(db_path, poll_interval_sec=60)
            asyncio.create_task(_daemon.start())
            logger.info('kdaemon: DB 상태 running → 자동 재시작')
    except Exception as _e:
        logger.warning(f'kdaemon 자동 재시작 실패: {_e}')

    global scheduler
    if config.SCHEDULER_ENABLED:
        logger.info('scheduler 시작함...')
        scheduler = KScheduler(db_path=db_path, poll_sec=1)

        # 지수 가져오기 작업 등록 (5분마다)
        from backend.domains.kscheduler.k_scheduler import Job
        scheduler.upsert_job(Job(
            name="fetch_market_jisu",
            func_name="fetch_market_jisu",
            schedule_type="interval",
            schedule_expr="seconds=300",
            enabled=True
        ))

        scheduler.upsert_job(Job(
            name="scrap_judal",
            func_name="scrap_judal",
            schedule_type="cron",
            schedule_expr="0 1 * * *",
            enabled=True,
            timeout_sec=2400,
            overlap_policy="skip",
        ))

        scheduler.upsert_job(Job(
            name="scrap_naver_options",
            func_name="scrap_naver_options",
            schedule_type="cron",
            schedule_expr="0 2 * * *",
            enabled=True,
            timeout_sec=3600,
            overlap_policy="skip",
        ))

        scheduler.upsert_job(Job(
            name="write_account_history",
            func_name="write_account_history",
            schedule_type="cron",
            schedule_expr="50 23 * * *",
            enabled=True,
            timeout_sec=120,
            overlap_policy="skip",
        ))

        scheduler.upsert_job(Job(
            name="fill_kind_stk_info",
            func_name="fill_kind_stk_info",
            schedule_type="cron",
            schedule_expr="0 3 * * *",
            enabled=True,
            timeout_sec=300,
            overlap_policy="skip",
        ))

        scheduler.upsert_job(Job(
            name="system_init",
            func_name="system_init",
            schedule_type="cron",
            schedule_expr="0 4 * * *",
            enabled=True,
            timeout_sec=300,
            overlap_policy="skip",
        ))

        asyncio.create_task(scheduler.start(worker_count=4))
    else:
        logger.info('SCHEDULER_ENABLED=false → 스케줄러 비활성화 (dev 모드)')
    logger.info('---------------------------------')
    logger.info('Startup 프로세스 종료')
    logger.info('---------------------------------')


async def shutdown_event():
    """Kiwi8 application 종료"""
    logger.info('---------------------------------')
    logger.info('Shutdown 프로세스 시작')
    logger.info('---------------------------------')
    await ws_manager.stop()
    if scheduler:
        scheduler.stop()
    logger.info('---------------------------------')
    logger.info('Shutdown 프로세스 종료')
    logger.info('---------------------------------')


app = create_app()

if __name__ == '__main__':
    import uvicorn

    logger.info('Kiwi8 주식매매 웹서비스 시작')
    uvicorn.run(app, host='0.0.0.0', port=8003)
