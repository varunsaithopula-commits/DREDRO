import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { SMCPrimitivePlugin } from '../plugins/SMCPrimitivePlugin';

export default function Chart({ candles = [], smcZones = [], isBullishFilter = true, isBearishFilter = true, isOBFilter = true, isFVGFilter = true }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const primitiveRef = useRef(null);

  // Initialize chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f19' },
        textColor: '#94a3b8',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace"
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' }
      },
      crosshair: {
        mode: 1, // Normal crosshair
        vertLine: {
          color: '#38bdf8',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0284c7'
        },
        horzLine: {
          color: '#38bdf8',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0284c7'
        }
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
        alignLabels: true
      }
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350'
    });

    // Instantiate and attach custom SMC primitive plugin
    const smcPlugin = new SMCPrimitivePlugin();
    candlestickSeries.attachPrimitive(smcPlugin);

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    primitiveRef.current = smcPlugin;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Update candlestick series data
  useEffect(() => {
    if (seriesRef.current && candles && candles.length > 0) {
      // Ensure sorted and unique timestamps
      const formattedCandles = candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      }));

      seriesRef.current.setData(formattedCandles);
    }
  }, [candles]);

  // Update SMC zones in custom primitive plugin
  useEffect(() => {
    if (primitiveRef.current) {
      const filteredZones = smcZones.filter((z) => {
        const isBull = z.type.startsWith('bullish');
        const isBear = z.type.startsWith('bearish');
        const isOB = z.type.endsWith('_ob');
        const isFVG = z.type.endsWith('_fvg');

        if (isBull && !isBullishFilter) return false;
        if (isBear && !isBearishFilter) return false;
        if (isOB && !isOBFilter) return false;
        if (isFVG && !isFVGFilter) return false;
        return true;
      });

      primitiveRef.current.setData(filteredZones);
    }
  }, [smcZones, isBullishFilter, isBearishFilter, isOBFilter, isFVGFilter]);

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <div ref={chartContainerRef} className="w-full h-full rounded-xl overflow-hidden shadow-2xl border border-slate-800" />
    </div>
  );
}
