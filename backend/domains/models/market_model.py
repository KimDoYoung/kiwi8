
from pydantic import BaseModel


class MarketJisu(BaseModel):
    kospi: float
    kospi_diff: float
    kospi_rate: float
    kosdaq: float
    kosdaq_diff: float
    kosdaq_rate: float
    kospi200: float
    kospi200_diff: float
    kospi200_rate: float
    updated_at: str # YYYYMMDDHHMMSS
