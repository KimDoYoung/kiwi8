# backend/utils/common_utils.py
"""
공통 유틸리티 모듈
"""
from typing import Any

def parse_price(val: Any, default: int = 0) -> int:
    """
    금액, 수량, 단가 등을 나타내는 값(문자열, 숫자)을 안전하게 정수로 변환합니다.
    
    특징:
    - 콤마(,) 제거
    - 소수점 문자열('60112.5000')을 정상적으로 float 처리 후 정수로 변환
    - None, 빈 문자열('') 등은 기본값 반환
    - 변환 실패 시 예외 없이 기본값 반환
    
    Args:
        val: 변환할 값 (예: '10,000', '60112.5000', 10000, None)
        default: 변환 실패 시 반환할 기본값 (기본값 0)
        
    Returns:
        변환된 정수값
    """
    if val is None or val == '':
        return default
        
    try:
        # 문자열일 경우 콤마 제거 후 float -> int 변환
        if isinstance(val, str):
            val_str = val.replace(',', '').strip()
            if not val_str:
                return default
            return int(float(val_str))
            
        # 숫자 타입일 경우 바로 float -> int
        return int(float(val))
        
    except (ValueError, TypeError):
        return default
