import time
from typing import List, Dict, Any

class SMCCalculator:
    def __init__(self, swing_window: int = 5, projection_seconds: int = 3600):
        self.swing_window = swing_window
        self.projection_seconds = projection_seconds

    def calculate_smc_zones(self, candles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Ingests OHLCV candle list: [{'time': int, 'open': float, 'high': float, 'low': float, 'close': float, 'volume': float}]
        Returns formatted SMC zone objects: [{ time1, time2, price1, price2, type }]
        """
        if not candles or len(candles) < 5:
            return []

        # Sort candles by timestamp ascending
        sorted_candles = sorted(candles, key=lambda c: c['time'])
        last_time = sorted_candles[-1]['time']
        future_time = last_time + self.projection_seconds

        zones = []

        # 1. Detect Fair Value Gaps (FVG)
        fvg_zones = self._detect_fvgs(sorted_candles, future_time)
        zones.extend(fvg_zones)

        # 2. Detect Break of Structure (BOS) & Order Blocks (OB)
        ob_zones = self._detect_obs_and_bos(sorted_candles, future_time)
        zones.extend(ob_zones)

        # Filter out zones that are already fully mitigated by recent price action
        active_zones = self._filter_mitigated_zones(sorted_candles, zones)

        return active_zones

    def _detect_fvgs(self, candles: List[Dict[str, Any]], future_time: int) -> List[Dict[str, Any]]:
        fvgs = []
        n = len(candles)

        for i in range(2, n):
            c1 = candles[i - 2] # 3rd oldest candle in 3-candle sequence
            c2 = candles[i - 1] # Impulse candle
            c3 = candles[i]     # Newest candle in sequence

            # Bullish FVG: low of candle 3 > high of candle 1
            if c3['low'] > c1['high']:
                gap_size = c3['low'] - c1['high']
                if gap_size >= 0.5: # Minimum gap threshold for Nifty 50
                    fvgs.append({
                        'time1': c2['time'],
                        'time2': future_time,
                        'price1': round(c1['high'], 2),
                        'price2': round(c3['low'], 2),
                        'type': 'bullish_fvg'
                    })

            # Bearish FVG: high of candle 3 < low of candle 1
            elif c3['high'] < c1['low']:
                gap_size = c1['low'] - c3['high']
                if gap_size >= 0.5:
                    fvgs.append({
                        'time1': c2['time'],
                        'time2': future_time,
                        'price1': round(c3['high'], 2),
                        'price2': round(c1['low'], 2),
                        'type': 'bearish_fvg'
                    })

        return fvgs

    def _detect_obs_and_bos(self, candles: List[Dict[str, Any]], future_time: int) -> List[Dict[str, Any]]:
        obs = []
        n = len(candles)
        w = min(self.swing_window, max(2, n // 4))

        swing_highs = []
        swing_lows = []

        # Identify swing highs and swing lows over rolling window
        for i in range(w, n - w):
            current_high = candles[i]['high']
            current_low = candles[i]['low']

            is_high = all(current_high >= candles[j]['high'] for j in range(i - w, i + w + 1) if j != i)
            is_low = all(current_low <= candles[j]['low'] for j in range(i - w, i + w + 1) if j != i)

            if is_high:
                swing_highs.append((i, candles[i]))
            if is_low:
                swing_lows.append((i, candles[i]))

        # Check for Break of Structure (BOS)
        # 1. Bullish BOS: candle closes above prior swing high
        for sh_idx, sh_candle in swing_highs:
            for k in range(sh_idx + 1, n):
                if candles[k]['close'] > sh_candle['high']:
                    # Bullish BOS confirmed at candle k!
                    # Find order block: last bearish candle (close < open) preceding the impulse move
                    ob_candle = None
                    for m in range(k - 1, max(-1, sh_idx - 5), -1):
                        if candles[m]['close'] < candles[m]['open']:
                            ob_candle = candles[m]
                            break
                    
                    if not ob_candle:
                        ob_candle = candles[k - 1]

                    obs.append({
                        'time1': ob_candle['time'],
                        'time2': future_time,
                        'price1': round(ob_candle['low'], 2),
                        'price2': round(ob_candle['high'], 2),
                        'type': 'bullish_ob'
                    })
                    break

        # 2. Bearish BOS: candle closes below prior swing low
        for sl_idx, sl_candle in swing_lows:
            for k in range(sl_idx + 1, n):
                if candles[k]['close'] < sl_candle['low']:
                    # Bearish BOS confirmed!
                    # Find order block: last bullish candle (close > open) preceding impulse
                    ob_candle = None
                    for m in range(k - 1, max(-1, sl_idx - 5), -1):
                        if candles[m]['close'] > candles[m]['open']:
                            ob_candle = candles[m]
                            break

                    if not ob_candle:
                        ob_candle = candles[k - 1]

                    obs.append({
                        'time1': ob_candle['time'],
                        'time2': future_time,
                        'price1': round(ob_candle['low'], 2),
                        'price2': round(ob_candle['high'], 2),
                        'type': 'bearish_ob'
                    })
                    break

        return obs

    def _filter_mitigated_zones(self, candles: List[Dict[str, Any]], zones: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Deduplicates and filters out zones that have been fully mitigated by subsequent price action.
        """
        active_zones = []
        unique_keys = set()

        for z in zones:
            key = (z['time1'], z['price1'], z['price2'], z['type'])
            if key in unique_keys:
                continue
            unique_keys.add(key)

            # Check if price after time1 has mitigated this zone
            is_mitigated = False
            for c in candles:
                if c['time'] > z['time1']:
                    if z['type'].startswith('bullish'):
                        # Bullish zone mitigated if price drops below price1
                        if c['low'] < z['price1']:
                            is_mitigated = True
                            break
                    elif z['type'].startswith('bearish'):
                        # Bearish zone mitigated if price rises above price2
                        if c['high'] > z['price2']:
                            is_mitigated = True
                            break

            if not is_mitigated:
                active_zones.append(z)

        # Return latest 10 active zones max to keep chart clean and uncluttered
        return active_zones[-10:]
