"""
account_history 잡 수동 실행 테스트
실행: uv run python tools/run_account_history.py [--force]

--force : 휴장일/주말이어도 강제 실행
"""
import asyncio
import sys

sys.path.insert(0, '.')  # 프로젝트 루트 기준 실행


async def main(force: bool = False) -> None:
    if force:
        # is_open_day를 항상 True로 패치
        from backend.domains.infrahub import open_time_checker as _otc
        _orig = _otc.OpenTimeChecker.is_open_day

        async def _always_open(self, d=None):
            return True

        _otc.OpenTimeChecker.is_open_day = _always_open
        print("[run_account_history] --force: is_open_day 패치 적용")

    from backend.jobs.write_account_history import write_account_history_job
    await write_account_history_job({})


if __name__ == '__main__':
    force = '--force' in sys.argv
    asyncio.run(main(force=force))
