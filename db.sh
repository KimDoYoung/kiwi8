#!/bin/bash

#----------------------------------------------------
# 1. 환경 설정 및 DB 경로 설정
#----------------------------------------------------
PROFILE=${KIWI8_MODE:-local}
ENV_FILE=".env.$PROFILE"

if [ -f "$ENV_FILE" ]; then
    # .env 파일에서 BASE_DIR 추출 (공백 및 따옴표 제거)
    BASE_DIR=$(grep '^BASE_DIR=' "$ENV_FILE" | cut -d '=' -f2- | sed "s/['\"]//g")
fi

# BASE_DIR이 정의되지 않은 경우 기본값 설정
BASE_DIR=${BASE_DIR:-$(pwd)/data}
DB_FILE="$BASE_DIR/db/kiwi8.db"

#----------------------------------------------------
# 2. 유틸리티 함수
#----------------------------------------------------

show_header() {
    echo "---------------------------------------------"
    echo "profile : $PROFILE"
    echo "db-file : $DB_FILE"
    echo "---------------------------------------------"
}

get_tables() {
    sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
}

# 테이블을 목록으로 보여주고 번호로 선택받는 함수
pick_table() {
    local tables=($(get_tables))
    if [ ${#tables[@]} -eq 0 ]; then
        echo "오류: 테이블이 존재하지 않습니다."
        return 1
    fi

    echo ""
    echo "[테이블 목록]"
    for i in "${!tables[@]}"; do
        printf "%2d. %s\n" $((i+1)) "${tables[$i]}"
    done
    echo ""
    
    read -p "선택할 테이블 번호를 입력하세요: " idx
    if [[ "$idx" =~ ^[0-9]+$ ]] && [ "$idx" -ge 1 ] && [ "$idx" -le ${#tables[@]} ]; then
        SELECTED_TABLE="${tables[$((idx-1))]}"
        return 0
    else
        echo "잘못된 번호입니다."
        return 1
    fi
}

#----------------------------------------------------
# 3. 핵심 기능 함수 정의
#----------------------------------------------------

list_tables() {
    if [ ! -f "$DB_FILE" ]; then
        echo "오류: DB 파일이 존재하지 않습니다 ($DB_FILE)"
        return
    fi
    echo "[테이블 목록 및 데이터 건수]"
    local tables=$(get_tables)
    if [ -z "$tables" ]; then
        echo "테이블이 없습니다."
    else
        for table in $tables; do
            count=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM $table;")
            printf "  - %-20s : %d\n" "$table" "$count"
        done
    fi
}

desc_table() {
    if [ ! -f "$DB_FILE" ]; then
        echo "오류: DB 파일이 존재하지 않습니다 ($DB_FILE)"
        return
    fi
    if [ -z "$1" ]; then
        pick_table || return
        table=$SELECTED_TABLE
    else
        table=$1
    fi
    [ -z "$table" ] && return
    echo ""
    echo "[$table 테이블 구조]"
    sqlite3 "$DB_FILE" ".schema $table"
}

select_table() {
    if [ ! -f "$DB_FILE" ]; then
        echo "오류: DB 파일이 존재하지 않습니다 ($DB_FILE)"
        return
    fi
    if [ -z "$1" ]; then
        pick_table || return
        table=$SELECTED_TABLE
    else
        table=$1
    fi
    [ -z "$table" ] && return
    echo ""
    echo "[$table 데이터 조회 (최대 100건)]"
    sqlite3 -header -column "$DB_FILE" "SELECT * FROM $table LIMIT 100;"
}

run_sql() {
    if [ ! -f "$DB_FILE" ]; then
        echo "오류: DB 파일이 존재하지 않습니다 ($DB_FILE)"
        return
    fi
    if [ -z "$1" ]; then
        read -p "수행할 SQL을 입력하세요: " sql
    else
        sql=$1
    fi
    [ -z "$sql" ] && return
    echo ""
    echo "[SQL 수행 결과]"
    sqlite3 -header -column "$DB_FILE" "$sql"
}

delete_db() {
    if [ ! -f "$DB_FILE" ]; then
        echo "오류: 삭제할 DB 파일이 없습니다 ($DB_FILE)"
        return
    fi
    echo "!!! 주의: 데이터베이스 파일($DB_FILE)을 삭제합니다 !!!"
    read -p "정말 삭제하시겠습니까? (y/N): " confirm
    if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
        rm -f "$DB_FILE"
        echo "데이터베이스 파일이 삭제되었습니다."
    else
        echo "취소되었습니다."
    fi
}

#----------------------------------------------------
# 4. 실행 로직 (CLI 인자 처리 또는 단일 메뉴 실행 후 종료)
#----------------------------------------------------

if [ $# -gt 0 ]; then
    # 인자가 있는 경우 CLI 모드로 동작
    case "$1" in
        list)   list_tables ;;
        desc)   desc_table "$2" ;;
        select) select_table "$2" ;;
        run)    run_sql "$2" ;;
        delete) delete_db ;;
        *)      echo "사용법: $0 {list|desc|select|run|delete}" ;;
    esac
    exit 0
fi

# 인자가 없는 경우 대화형 메뉴 (단일 실행 후 종료)
show_header
echo "1. 테이블 목록 (db.sh list)"
echo "2. 테이블 desc (db.sh desc)"
echo "3. 테이블 select (db.sh select)"
echo "4. sql 실행 (db.sh run)"
echo "---------------------------------------------"
echo "99. db 삭제"
echo "q. 종료"
echo "---------------------------------------------"
read -p "선택: " choice

case "$choice" in
    1) list_tables ;;
    2) desc_table ;;
    3) select_table ;;
    4) run_sql ;;
    99) delete_db ;;
    q|Q) exit 0 ;;
    *) echo "잘못된 선택입니다." ;;
esac

exit 0
