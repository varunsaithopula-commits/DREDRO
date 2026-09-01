import numpy as np
import pandas as pd
from typing import List, Dict, Any
from sklearn.ensemble import RandomForestClassifier

class TrendPredictor:
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
        self.is_trained = False

    def predict_trend(self, candles: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Ingests OHLCV candles, computes technical indicators, trains/predicts market trend.
        Returns: { "trend": "Bullish" | "Bearish" | "Neutral", "confidence": float }
        """
        if not candles or len(candles) < 15:
            return {"trend": "Neutral", "confidence": 50.0}

        df = pd.DataFrame(candles)
        df = df.sort_values('time').reset_index(drop=True)

        # Feature Engineering
        df['return_1'] = df['close'].pct_change(1)
        df['return_3'] = df['close'].pct_change(3)
        df['return_5'] = df['close'].pct_change(5)
        df['hl_range'] = (df['high'] - df['low']) / df['close']
        df['body_size'] = (df['close'] - df['open']).abs() / df['hl_range'].replace(0, 1e-5)
        df['sma_5'] = df['close'].rolling(5).mean()
        df['dist_sma_5'] = (df['close'] - df['sma_5']) / df['close']

        # Target variable: +1 if price 3 candles ahead is higher, -1 if lower
        df['future_return'] = df['close'].shift(-3) - df['close']
        df['target'] = np.where(df['future_return'] > 1.0, 1, np.where(df['future_return'] < -1.0, -1, 0))

        feature_cols = ['return_1', 'return_3', 'return_5', 'hl_range', 'body_size', 'dist_sma_5']
        
        # Clean NaNs
        clean_df = df.dropna(subset=feature_cols).copy()
        if len(clean_df) < 10:
            last_ret = df['return_3'].iloc[-1] if not df['return_3'].empty else 0
            if last_ret > 0.0005:
                return {"trend": "Bullish", "confidence": 62.5}
            elif last_ret < -0.0005:
                return {"trend": "Bearish", "confidence": 62.5}
            return {"trend": "Neutral", "confidence": 50.0}

        train_data = clean_df.dropna(subset=['target'])
        if len(train_data) > 8:
            X_train = train_data[feature_cols]
            y_train = train_data['target']
            self.model.fit(X_train, y_train)
            self.is_trained = True

        # Predict on latest candle
        latest_features = clean_df[feature_cols].iloc[-1:].values
        
        if self.is_trained:
            probs = self.model.predict_proba(latest_features)[0]
            classes = self.model.classes_
            
            # Map probabilities to Bullish (+1), Bearish (-1), Neutral (0)
            class_prob_map = dict(zip(classes, probs))
            bull_prob = class_prob_map.get(1, 0.0)
            bear_prob = class_prob_map.get(-1, 0.0)
            neutral_prob = class_prob_map.get(0, 0.0)

            if bull_prob > max(bear_prob, neutral_prob):
                return {"trend": "Bullish", "confidence": round(bull_prob * 100, 1)}
            elif bear_prob > max(bull_prob, neutral_prob):
                return {"trend": "Bearish", "confidence": round(bear_prob * 100, 1)}
            else:
                conf = max(neutral_prob, 0.5) * 100
                return {"trend": "Neutral", "confidence": round(conf, 1)}
        else:
            last_close = df['close'].iloc[-1]
            last_open = df['open'].iloc[-1]
            if last_close > last_open:
                return {"trend": "Bullish", "confidence": 58.0}
            elif last_close < last_open:
                return {"trend": "Bearish", "confidence": 58.0}
            return {"trend": "Neutral", "confidence": 50.0}
