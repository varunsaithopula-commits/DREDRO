import React, { useState, useEffect } from 'react';
import Chart from './Chart';
import { Activity, TrendingUp, TrendingDown, Layers, ShieldCheck, Cpu, RefreshCw, Eye, EyeOff, Radio } from 'lucide-react';

export default function Dashboard() {
  const [wsConnected, setWsConnected] = useState(false);
  const [isSimulator, setIsSimulator] = useState(true);
  const [ltp, setLtp] = useState(24850.0);
  const [prevLtp, setPrevLtp] = useState(24850.0);
  const [candles, setCandles] = useState([]);
  const [smcZones, setSmcZones] = useState([]);
  const [aiTrend, setAiTrend] = useState({ trend: 'Neutral', confidence: 50.0 });
  const [tickDirection, setTickDirection] = useState('neutral');

  // Filter States
  const [isBullishFilter, setIsBullishFilter] = useState(true);
  const [isBearishFilter, setIsBearishFilter] = useState(true);
  const [isOBFilter, setIsOBFilter] = useState(true);
  const [isFVGFilter, setIsFVGFilter] = useState(true);

  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connectWs = () => {
      ws = new WebSocket('ws://localhost:4000');

      ws.onopen = () => {
        setWsConnected(true);
        console.log('[React UI] Connected to Node.js WebSocket backend.');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'INITIAL_STATE' || message.type === 'MARKET_TICK') {
            const data = message.data;
            if (data.ltp !== undefined) {
              setLtp((prev) => {
                if (data.ltp > prev) setTickDirection('up');
                else if (data.ltp < prev) setTickDirection('down');
                return data.ltp;
              });
            }
            if (data.isSimulator !== undefined) setIsSimulator(data.isSimulator);
            if (data.candles) setCandles(data.candles);
            if (data.smcZones) setSmcZones(data.smcZones);
            if (data.aiTrend) setAiTrend(data.aiTrend);
          } else if (message.type === 'SMC_UPDATE') {
            if (message.data.smcZones) setSmcZones(message.data.smcZones);
            if (message.data.aiTrend) setAiTrend(message.data.aiTrend);
          }
        } catch (err) {
          console.error('[React UI] Error parsing WS message:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.warn('[React UI] Disconnected from WebSocket server. Retrying in 2s...');
        reconnectTimeout = setTimeout(connectWs, 2000);
      };

      ws.onerror = (err) => {
        console.error('[React UI] WebSocket error:', err);
      };
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const obCount = smcZones.filter((z) => z.type.endsWith('_ob')).length;
  const fvgCount = smcZones.filter((z) => z.type.endsWith('_fvg')).length;

  return (
    <div className="flex flex-col min-h-screen bg-[#070a11] text-slate-100 p-4 md:p-6 gap-6">
      {/* Header Bar */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/10">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white font-sans">DREGRO Trading Desk</h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Upstox v2 WS
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">NSE_INDEX | Nifty 50 Real-Time SMC Engine</p>
          </div>
        </div>

        {/* Price & Connection Pill */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="flex flex-col items-end">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Nifty 50 Index</span>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono transition-colors duration-300 ${
                  tickDirection === 'up'
                    ? 'text-emerald-400'
                    : tickDirection === 'down'
                    ? 'text-rose-400'
                    : 'text-white'
                }`}
              >
                ₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="h-9 w-px bg-slate-800 hidden md:block" />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
            <Radio className={`w-4 h-4 ${wsConnected ? (isSimulator ? 'text-amber-400 animate-pulse' : 'text-emerald-400 animate-ping') : 'text-rose-500'}`} />
            <span className="text-xs font-mono font-medium">
              {wsConnected
                ? isSimulator
                  ? 'Simulator Active'
                  : 'Upstox v2 Live'
                : 'Connecting...'}
            </span>
          </div>
        </div>
      </header>

      {/* Metrics & AI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AI Trend Card */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Random Forest AI Trend</span>
            <div className="flex items-center gap-2 mt-1">
              {aiTrend.trend === 'Bullish' ? (
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              ) : aiTrend.trend === 'Bearish' ? (
                <TrendingDown className="w-5 h-5 text-rose-400" />
              ) : (
                <Cpu className="w-5 h-5 text-slate-400" />
              )}
              <span
                className={`text-lg font-bold font-mono ${
                  aiTrend.trend === 'Bullish'
                    ? 'text-emerald-400'
                    : aiTrend.trend === 'Bearish'
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {aiTrend.trend} ({aiTrend.confidence}%)
              </span>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800/50 text-slate-300">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        {/* Order Blocks Card */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Active Order Blocks (OB)</span>
            <div className="text-xl font-bold font-mono text-cyan-400 mt-1">{obCount} Zones</div>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Fair Value Gaps Card */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Fair Value Gaps (FVG)</span>
            <div className="text-xl font-bold font-mono text-purple-400 mt-1">{fvgCount} Imbalances</div>
          </div>
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Current Candle OHLC */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex flex-col justify-center">
          <span className="text-xs text-slate-400 font-medium mb-1">Live 1m Candle</span>
          {latestCandle ? (
            <div className="grid grid-cols-4 gap-1 text-xs font-mono">
              <div><span className="text-slate-500">O:</span> {latestCandle.open}</div>
              <div><span className="text-slate-500">H:</span> {latestCandle.high}</div>
              <div><span className="text-slate-500">L:</span> {latestCandle.low}</div>
              <div><span className="text-slate-500">C:</span> {latestCandle.close}</div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Awaiting market ticks...</div>
          )}
        </div>
      </div>

      {/* Main Chart Workspace */}
      <main className="flex-1 flex flex-col gap-4 rounded-2xl bg-slate-900/40 border border-slate-800 p-4">
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">SMC Zone Layer Filters:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <button
              onClick={() => setIsBullishFilter(!isBullishFilter)}
              className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                isBullishFilter
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
              }`}
            >
              {isBullishFilter ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Bullish Zones
            </button>

            <button
              onClick={() => setIsBearishFilter(!isBearishFilter)}
              className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                isBearishFilter
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
              }`}
            >
              {isBearishFilter ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Bearish Zones
            </button>

            <button
              onClick={() => setIsOBFilter(!isOBFilter)}
              className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                isOBFilter
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
              }`}
            >
              Order Blocks (OB)
            </button>

            <button
              onClick={() => setIsFVGFilter(!isFVGFilter)}
              className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                isFVGFilter
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500 line-through'
              }`}
            >
              Fair Value Gaps (FVG)
            </button>
          </div>
        </div>

        {/* Lightweight Charts Component */}
        <div className="flex-1 min-h-[550px] w-full">
          <Chart
            candles={candles}
            smcZones={smcZones}
            isBullishFilter={isBullishFilter}
            isBearishFilter={isBearishFilter}
            isOBFilter={isOBFilter}
            isFVGFilter={isFVGFilter}
          />
        </div>
      </main>
    </div>
  );
}
