import asyncio
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.api.v1.endpoints.accounts_routes import router as accounts_router
from backend.api.v1.endpoints.diary_routes import router as diary_router
from backend.api.v1.endpoints.home_routes import router as home_router
from backend.api.v1.endpoints.kdemon_routes import router as kdemon_router
from backend.api.v1.endpoints.mystock_routes import router as mystock_router
from backend.api.v1.endpoints.scheduler_routes import router as scheduler_router
from backend.api.v1.endpoints.settings_routes import router as settings_router
from backend.api.v1.endpoints.stkcompany.kis_routes import router as kis_router
from backend.api.v1.endpoints.stkcompany.kiwoom_routes import router as kiwoom_router
from backend.api.v1.endpoints.stkcompany.ls_routes import router as ls_router
from backend.api.v1.endpoints.menus_routes import router as menus_router
from backend.api.v1.endpoints.stock_routes import router as stock_router
from backend.core.config import config
from backend.core.exception_handler import add_exception_handlers
from backend.core.jwtmiddleware import JWTAuthMiddleware
from backend.core.kiwi8_db import create_kiwi8_db
from backend.core.logger import get_logger
from backend.domains.kscheduler.k_scheduler import KScheduler

logger = get_logger(__name__)
schduler: KScheduler | None = None


def create_app() -> FastAPI:
    kiwi8_app = FastAPI(title='Kiwi8 - 주식매매(개인용)', version='0.0.1')
    add_middlewares(kiwi8_app)
    add_routes(kiwi8_app)
    add_static_files(kiwi8_app)
    add_exception_handlers(kiwi8_app)

    # 루트 앱에 /kiwi8로 마운트
    root_app = FastAPI()
    add_event_handlers(root_app)  # sub-app의 lifespan은 실행 안되므로 root_app에 등록
    root_app.mount('/kiwi8', kiwi8_app)  # /kiwi8 하위로 마운트
    return root_app


def add_static_files(app: FastAPI):
    """React 빌드 결과물 서빙"""
    dist_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
    dist_path = os.path.abspath(dist_path)
    if os.path.exists(dist_path):
        app.mount('/assets', StaticFiles(directory=os.path.join(dist_path, 'assets')), name='assets')

        @app.get('/{full_path:path}', include_in_schema=False)
        async def serve_spa(full_path: str):
            index_file = os.path.join(dist_path, 'index.html')
            return FileResponse(index_file)


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
    app.include_router(settings_router, prefix='/api/v1/settings', tags=['settings'])
    # 증권사 API 라우터
    app.include_router(kiwoom_router, prefix='/api/v1/kiwoom', tags=['kiwoom'])
    app.include_router(kis_router, prefix='/api/v1/kis', tags=['kis'])
    app.include_router(ls_router, prefix='/api/v1/ls', tags=['ls'])
    # 서비스 라우터
    app.include_router(accounts_router, prefix='/api/v1/accounts', tags=['accounts'])
    app.include_router(kdemon_router, prefix='/api/v1/kdemon', tags=['kdemon'])
    app.include_router(stock_router, prefix='/api/v1/stock', tags=['stock'])
    app.include_router(mystock_router, prefix='/api/v1/mystock', tags=['mystock'])
    app.include_router(diary_router, prefix='/api/v1/diary', tags=['diary'])
    app.include_router(scheduler_router, prefix='/api/v1/scheduler', tags=['scheduler'])
    app.include_router(menus_router, prefix='/api/v1/menus', tags=['menus'])


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
    logger.info('scheduler 시작함...')
    global scheduler
    scheduler = KScheduler(db_path=db_path, poll_sec=1)
    asyncio.create_task(scheduler.start(worker_count=4))
    logger.info('---------------------------------')
    logger.info('Startup 프로세스 종료')
    logger.info('---------------------------------')


async def shutdown_event():
    """Kiwi8 application 종료"""
    logger.info('---------------------------------')
    logger.info('Shutdown 프로세스 시작')
    logger.info('---------------------------------')
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
