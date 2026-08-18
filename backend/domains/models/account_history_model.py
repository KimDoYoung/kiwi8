from pydantic import BaseModel, Field


class AccountHistoryRow(BaseModel):
    """일별 계좌 자산 스냅샷 (account_history 1행)"""
    record_date: str = Field(..., description="기록일자 (YYYY-MM-DD)")

    total_asset: int = Field(0, description="전체 자산")
    total_buy: int = Field(0, description="전체 매입금액")
    total_pnl: int = Field(0, description="전체 평가손익")
    total_rate: str = Field("0.00%", description="전체 수익률")

    kis_acct_no: str | None = None
    kis_total_asset: int = 0
    kis_buy_amt: int = 0
    kis_eval_pnl: int = 0
    kis_rate: str = "0.00%"
    kis_ord_avail: int = 0
    kis_hold_cnt: int = 0

    ls_acct_no: str | None = None
    ls_total_asset: int = 0
    ls_buy_amt: int = 0
    ls_eval_pnl: int = 0
    ls_rate: str = "0.00%"
    ls_ord_avail: int = 0
    ls_hold_cnt: int = 0

    kiwoom_acct_no: str | None = None
    kiwoom_total_asset: int = 0
    kiwoom_buy_amt: int = 0
    kiwoom_eval_pnl: int = 0
    kiwoom_rate: str = "0.00%"
    kiwoom_ord_avail: int = 0
    kiwoom_hold_cnt: int = 0
