import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from smc_calculator import SMCCalculator
from ai_model import TrendPredictor

app = FastAPI(title="DREGRO SMC & AI Logic Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

smc_calc = SMCCalculator(swing_window=5, projection_seconds=3600)
ai_predictor = TrendPredictor()

class CandleItem(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = 0.0

class AnalyzeRequest(BaseModel):
    candles: List[CandleItem]

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "Python SMC & AI Engine",
        "version": "1.0.0"
    }

@app.post("/api/analyze")
def analyze_market_data(payload: AnalyzeRequest):
    if not payload.candles:
        raise HTTPException(status_code=400, detail="Candles list cannot be empty.")

    raw_candles = [c.model_dump() for c in payload.candles]

    # Calculate SMC zones (FVGs, Order Blocks, BOS)
    smc_zones = smc_calc.calculate_smc_zones(raw_candles)

    # Predict trend with Random Forest model
    ai_trend = ai_predictor.predict_trend(raw_candles)

    return {
        "status": "success",
        "smc_zones": smc_zones,
        "ai_trend": ai_trend
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
