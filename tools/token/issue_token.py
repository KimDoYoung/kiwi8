#!/usr/bin/env python3
"""
증권사별 토큰 발급 도구

사용법:
    python -m tools.token.issue_token --broker kiwoom
    python -m tools.token.issue_token --broker kis
    python -m tools.token.issue_token --broker ls
    python -m tools.token.issue_token --all  # 모든 증권사
"""
import asyncio
import sys
import argparse
from pathlib import Path

# 프로젝트 루트를 path에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend.domains.stkcompanys.kiwoom.managers.kiwoom_token_manager import KiwoomTokenManager
from backend.domains.stkcompanys.kis.managers.kis_token_manager import KisTokenManager
# from backend.domains.stkcompanys.ls.managers.ls_token_manager import LsTokenManager  # LS 구현 시 추가


async def issue_kiwoom_token():
    """키움증권 토큰 발급"""
    print("\n" + "="*50)
    print("🔑 키움증권 토큰 발급")
    print("="*50)
    
    try:
        manager = KiwoomTokenManager()
        result = await manager.issue_access_token()
        
        print(f"✅ 토큰 발급 성공!")
        print(f"   Token: {result['token'][:30]}...")
        print(f"   Type: {result['token_type']}")
        print(f"   만료: {result['expires_dt']}")
        return True
        
    except Exception as e:
        print(f"❌ 토큰 발급 실패: {e}")
        return False


async def issue_kis_token():
    """한국투자증권 토큰 발급"""
    print("\n" + "="*50)
    print("🔑 한국투자증권 토큰 발급")
    print("="*50)
    
    try:
        manager = KisTokenManager()
        result = await manager.issue_access_token()
        
        print(f"✅ 토큰 발급 성공!")
        print(f"   Token: {result['token'][:30]}...")
        print(f"   Type: {result['token_type']}")
        print(f"   만료: {result['expires_dt']}")
        return True
        
    except Exception as e:
        print(f"❌ 토큰 발급 실패: {e}")
        return False


async def issue_ls_token():
    """LS증권 토큰 발급"""
    print("\n" + "="*50)
    print("🔑 LS증권 토큰 발급")
    print("="*50)
    
    print("⚠️  LS증권 토큰 매니저가 아직 구현되지 않았습니다.")
    return False


async def issue_all_tokens():
    """모든 증권사 토큰 발급"""
    print("\n" + "="*50)
    print("🔑 모든 증권사 토큰 발급")
    print("="*50)
    
    results = {
        'kiwoom': await issue_kiwoom_token(),
        'kis': await issue_kis_token(),
        'ls': await issue_ls_token(),
    }
    
    print("\n" + "="*50)
    print("📊 발급 결과 요약")
    print("="*50)
    for broker, success in results.items():
        status = "✅ 성공" if success else "❌ 실패"
        print(f"   {broker.upper()}: {status}")
    
    return all(results.values())


async def main():
    parser = argparse.ArgumentParser(description='증권사 토큰 발급 도구')
    parser.add_argument('--broker', choices=['kiwoom', 'kis', 'ls'], help='증권사 선택')
    parser.add_argument('--all', action='store_true', help='모든 증권사 토큰 발급')
    
    args = parser.parse_args()
    
    if args.all:
        await issue_all_tokens()
    elif args.broker == 'kiwoom':
        await issue_kiwoom_token()
    elif args.broker == 'kis':
        await issue_kis_token()
    elif args.broker == 'ls':
        await issue_ls_token()
    else:
        parser.print_help()


if __name__ == '__main__':
    asyncio.run(main())
