/**
 * TradingView Lightweight Charts Custom Series Primitive for Smart Money Concepts (SMC) Zones
 * Implements ISeriesPrimitive and IPrimitivePaneView using HTML5 Canvas API.
 */

class SMCPrimitivePaneRenderer {
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const chart = this._source._chart;
      const series = this._source._series;
      const zones = this._source._zones;

      if (!chart || !series || !zones || zones.length === 0) return;

      const timeScale = chart.timeScale();

      zones.forEach((zone) => {
        if (!zone.price1 || !zone.price2 || !zone.time1) return;

        // Convert price bounds to Y pixels on the canvas
        const y1 = series.priceToCoordinate(zone.price2); // Upper price (higher Y value in price space -> lower Y pixel)
        const y2 = series.priceToCoordinate(zone.price1); // Lower price (lower Y value in price space -> higher Y pixel)

        if (y1 === null || y2 === null) return;

        // Convert time bounds to X pixels on the canvas
        let x1 = timeScale.timeToCoordinate(zone.time1);
        let x2 = zone.time2 ? timeScale.timeToCoordinate(zone.time2) : null;

        // If zone started before visible time range, snap to left pane edge
        if (x1 === null) {
          x1 = 0;
        }

        // If zone extends into the future beyond rightmost bar, extend to canvas width
        if (x2 === null || x2 < x1) {
          x2 = scope.mediaSize.width;
        }

        const rectX = Math.min(x1, x2);
        const rectWidth = Math.max(Math.abs(x2 - x1), 15);
        const rectY = Math.min(y1, y2);
        const rectHeight = Math.max(Math.abs(y2 - y1), 2);

        // Styling based on zone type
        const isBullish = zone.type.startsWith('bullish');
        const isOB = zone.type.endsWith('_ob');

        const fillColor = isBullish
          ? 'rgba(38, 166, 154, 0.20)'  // Semi-transparent green
          : 'rgba(239, 83, 80, 0.20)';  // Semi-transparent red

        const borderColor = isBullish
          ? 'rgba(38, 166, 154, 0.85)'
          : 'rgba(239, 83, 80, 0.85)';

        const textColor = isBullish ? '#4ade80' : '#f87171';

        ctx.save();

        // Fill Rectangle
        ctx.fillStyle = fillColor;
        ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

        // Border Stroke
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.setLineDash(isOB ? [] : [4, 4]); // Solid border for Order Blocks, dashed for FVGs
        ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

        // Zone Label Text
        const labelText = `${isBullish ? 'BULL' : 'BEAR'} ${isOB ? 'OB' : 'FVG'}`;
        ctx.fillStyle = textColor;
        ctx.font = '600 10px "JetBrains Mono", sans-serif';
        ctx.textBaseline = 'top';

        // Draw label pill background
        const textMetrics = ctx.measureText(labelText);
        const textWidth = textMetrics.width;
        const pillPadding = 3;

        if (rectWidth > textWidth + 10 && rectY > 15) {
          ctx.fillStyle = isBullish ? 'rgba(6, 78, 59, 0.85)' : 'rgba(127, 29, 29, 0.85)';
          ctx.fillRect(rectX + 2, rectY + 2, textWidth + pillPadding * 2, 14);

          ctx.fillStyle = textColor;
          ctx.fillText(labelText, rectX + 2 + pillPadding, rectY + 3);
        }

        ctx.restore();
      });
    });
  }
}

class SMCPrimitivePaneView {
  constructor(source) {
    this._source = source;
    this._renderer = new SMCPrimitivePaneRenderer(source);
  }

  renderer() {
    return this._renderer;
  }

  zOrder() {
    return 'normal';
  }
}

export class SMCPrimitivePlugin {
  constructor() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._zones = [];
    this._paneView = new SMCPrimitivePaneView(this);
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {
    // Required by ISeriesPrimitive
  }

  paneViews() {
    return [this._paneView];
  }

  setData(zones) {
    this._zones = zones || [];
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  autoscaleInfo() {
    return null;
  }
}
