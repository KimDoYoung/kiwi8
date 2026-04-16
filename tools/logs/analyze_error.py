#!/usr/bin/env python3
"""
에러 로그 분석 도구

사용법:
    python -m tools.logs.analyze_error
    python -m tools.logs.analyze_error --lines 100
    python -m tools.logs.analyze_error --today  # 오늘 날짜만
"""
import sys
import argparse
from pathlib import Path
from collections import Counter
from datetime import datetime
import re

# 프로젝트 루트를 path에 추가
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend.core.config import config


def get_log_path():
    """로그 파일 경로"""
    return Path(config.BASE_DIR) / 'logs' / 'kiwi8.log'


def analyze_errors(log_file: Path, lines: int = None, today_only: bool = False):
    """에러 로그 분석"""
    
    if not log_file.exists():
        print(f"❌ 로그 파일이 없습니다: {log_file}")
        return
    
    print("="*60)
    print("🔍 Kiwi8 에러 로그 분석")
    print("="*60)
    print(f"📁 로그 파일: {log_file}\n")
    
    errors = []
    warnings = []
    today = datetime.now().strftime('%Y-%m-%d')
    
    with open(log_file, 'r', encoding='utf-8') as f:
        log_lines = f.readlines()
        
        # lines 옵션이 있으면 마지막 N줄만
        if lines:
            log_lines = log_lines[-lines:]
    
    for line in log_lines:
        # 오늘 날짜 필터
        if today_only and today not in line:
            continue
            
        if ' - ERROR - ' in line:
            errors.append(line.strip())
        elif ' - WARNING - ' in line:
            warnings.append(line.strip())
    
    # 에러 통계
    print(f"📊 통계")
    print(f"   총 에러: {len(errors)}개")
    print(f"   총 경고: {len(warnings)}개")
    print()
    
    if errors:
        print("="*60)
        print("❌ 에러 목록 (최근 10개)")
        print("="*60)
        for error in errors[-10:]:
            print(error)
            print()
        
        # 에러 패턴 분석
        print("="*60)
        print("📈 에러 패턴 분석")
        print("="*60)
        
        error_patterns = []
        for error in errors:
            # 에러 메시지 추출 (ERROR - 이후 부분)
            match = re.search(r'ERROR - (.+)', error)
            if match:
                msg = match.group(1)
                # 첫 50자만
                error_patterns.append(msg[:50])
        
        counter = Counter(error_patterns)
        for pattern, count in counter.most_common(5):
            print(f"   [{count:3d}회] {pattern}")
        print()
    
    if warnings:
        print("="*60)
        print("⚠️  경고 목록 (최근 5개)")
        print("="*60)
        for warning in warnings[-5:]:
            print(warning)
            print()


def main():
    parser = argparse.ArgumentParser(description='에러 로그 분석 도구')
    parser.add_argument('--lines', type=int, help='분석할 마지막 N줄')
    parser.add_argument('--today', action='store_true', help='오늘 날짜 로그만')
    
    args = parser.parse_args()
    
    log_file = get_log_path()
    analyze_errors(log_file, args.lines, args.today)


if __name__ == '__main__':
    main()
