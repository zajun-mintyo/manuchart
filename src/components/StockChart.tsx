"use client";

import React, { useState, useRef, useMemo } from "react";
import { StockCandlePoint, StockApiResponse } from "@/app/api/stock/route";
import {
  formatMarketCapOku,
  formatSignedMarketCapOku,
} from "@/data/companies";

// 個別チャートの表示モード（デフォルトは "marketCap" = 時価総額折れ線）
export type ChartMode = "marketCap" | "priceArea" | "candle";
// 時価総額折れ線時のY軸スケール（デフォルトは "actual" = 実額（兆円/億円））
export type MarketCapAxisMode = "actual" | "changePercent";
// チャート高さサイズ（可視化領域コントロール用）
export type ChartHeightSize = "normal" | "large" | "xlarge";

interface StockChartProps {
  primaryData: StockApiResponse;
  primaryName: string;
  chartMode: ChartMode;
  marketCapAxisMode: MarketCapAxisMode;
  showSmaShort: boolean;
  showSmaMid: boolean;
  showSmaLong: boolean;
  isLoading: boolean;
  chartSize?: ChartHeightSize;
}

export default function StockChart({
  primaryData,
  primaryName,
  chartMode,
  marketCapAxisMode,
  showSmaShort,
  showSmaMid,
  showSmaLong,
  isLoading,
  chartSize = "large",
}: StockChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = primaryData.points || [];
  const isPositivePeriod = primaryData.meta.periodMarketCapChangePercent >= 0;

  // SVG キャンバス仮想サイズ（ピーク部分のデータポイントが隠れないよう上部余白を十分に確保）
  const width = 960;
  const height = 425;
  const padLeft = 16;
  const padRight = 98; // 兆円・億円表記が入るよう右余白を確保
  const padTop = 38;
  const priceBottom = 325;
  const volTop = 345;
  const volBottom = 395;
  const plotWidth = width - padLeft - padRight;
  const priceHeight = priceBottom - padTop;
  const volHeight = volBottom - volTop;

  // 現在のチャート設定に応じたY軸値の抽出関数
  const extractMainValue = (p: StockCandlePoint): number => {
    if (chartMode === "marketCap") {
      return marketCapAxisMode === "actual"
        ? p.marketCapOku
        : p.marketCapChangePercent;
    }
    return p.close;
  };

  // Y軸レンジと出来高最大値の計算
  const bounds = useMemo(() => {
    if (points.length === 0) {
      return { minVal: 0, maxVal: 100, maxVol: 1 };
    }

    // 時価総額の変動率（%）モード時
    if (chartMode === "marketCap" && marketCapAxisMode === "changePercent") {
      let minPct = 0;
      let maxPct = 0;
      for (const p of points) {
        if (p.marketCapChangePercent < minPct) minPct = p.marketCapChangePercent;
        if (p.marketCapChangePercent > maxPct) maxPct = p.marketCapChangePercent;
      }
      const span = Math.max(2, maxPct - minPct);
      return {
        minVal: minPct - span * 0.08,
        maxVal: maxPct + span * 0.14, // ピーク部分が上端に張り付かないよう上側余白を広めに確保
        maxVol: Math.max(1, ...points.map((p) => p.volume)),
      };
    }

    let minP = Infinity;
    let maxP = -Infinity;
    let maxV = 1;

    for (const p of points) {
      if (chartMode === "marketCap") {
        // 時価総額（実額：億円）モード
        if (p.marketCapOku < minP) minP = p.marketCapOku;
        if (p.marketCapOku > maxP) maxP = p.marketCapOku;

        if (showSmaShort && p.marketCapSmaShort !== null) {
          if (p.marketCapSmaShort < minP) minP = p.marketCapSmaShort;
          if (p.marketCapSmaShort > maxP) maxP = p.marketCapSmaShort;
        }
        if (showSmaMid && p.marketCapSmaMid !== null) {
          if (p.marketCapSmaMid < minP) minP = p.marketCapSmaMid;
          if (p.marketCapSmaMid > maxP) maxP = p.marketCapSmaMid;
        }
        if (showSmaLong && p.marketCapSmaLong !== null) {
          if (p.marketCapSmaLong < minP) minP = p.marketCapSmaLong;
          if (p.marketCapSmaLong > maxP) maxP = p.marketCapSmaLong;
        }
      } else {
        // 株価（折れ線 / ローソク足）モード
        const lowCandidate = chartMode === "candle" ? p.low : p.close;
        const highCandidate = chartMode === "candle" ? p.high : p.close;
        if (lowCandidate < minP) minP = lowCandidate;
        if (highCandidate > maxP) maxP = highCandidate;

        if (showSmaShort && p.smaShort !== null) {
          if (p.smaShort < minP) minP = p.smaShort;
          if (p.smaShort > maxP) maxP = p.smaShort;
        }
        if (showSmaMid && p.smaMid !== null) {
          if (p.smaMid < minP) minP = p.smaMid;
          if (p.smaMid > maxP) maxP = p.smaMid;
        }
        if (showSmaLong && p.smaLong !== null) {
          if (p.smaLong < minP) minP = p.smaLong;
          if (p.smaLong > maxP) maxP = p.smaLong;
        }
      }

      if (p.volume > maxV) maxV = p.volume;
    }

    if (minP === maxP) {
      minP -= 10;
      maxP += 10;
    }
    const span = maxP - minP;
    return {
      minVal: minP - span * 0.08,
      maxVal: maxP + span * 0.14, // ピーク部分が上端に張り付かないよう上側余白を広めに確保
      maxVol: maxV,
    };
  }, [
    points,
    chartMode,
    marketCapAxisMode,
    showSmaShort,
    showSmaMid,
    showSmaLong,
  ]);

  const getX = (index: number, totalCount = points.length) => {
    if (totalCount <= 1) return padLeft + plotWidth / 2;
    return padLeft + (index / (totalCount - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    const ratio = (val - bounds.minVal) / (bounds.maxVal - bounds.minVal || 1);
    return priceBottom - ratio * priceHeight;
  };

  const getVolY = (vol: number) => {
    const ratio = Math.min(1, vol / (bounds.maxVol || 1));
    return volBottom - ratio * volHeight;
  };

  // SVGのgetScreenCTM()逆変換を用いて、マウス位置とSVG内部座標を1ピクセルのズレもなく完全一致させる
  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;

    let svgX = 0;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      svgX = transformed.x;
    } else {
      const rect = svg.getBoundingClientRect();
      svgX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * width;
    }

    const clampedX = Math.max(padLeft, Math.min(padLeft + plotWidth, svgX));
    const idx = Math.round(
      ((clampedX - padLeft) / plotWidth) * (points.length - 1)
    );
    if (idx >= 0 && idx < points.length) {
      setHoverIndex(idx);
    }
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
  };

  // Y軸グリッド目盛り（5段階）
  const yTicks = useMemo(() => {
    const steps = 5;
    const arr: { value: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const val =
        bounds.minVal + ((bounds.maxVal - bounds.minVal) * i) / steps;
      arr.push({ value: val, y: getY(val) });
    }
    return arr;
  }, [bounds]);

  // X軸目盛り（6箇所程度）
  const xTicks = useMemo(() => {
    if (points.length === 0) return [];
    const count = Math.min(6, points.length);
    const result: { index: number; label: string; x: number }[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(
        (i * (points.length - 1)) / Math.max(1, count - 1)
      );
      result.push({
        index: idx,
        label: points[idx].dateLabel,
        x: getX(idx),
      });
    }
    return result;
  }, [points]);

  // ポリライン文字列生成ヘルパー
  const buildPolyline = (
    extractor: (p: StockCandlePoint) => number | null,
    targetPoints: StockCandlePoint[] = points
  ) => {
    const segments: string[] = [];
    targetPoints.forEach((p, i) => {
      const v = extractor(p);
      if (v !== null && !isNaN(v)) {
        const x = getX(i, targetPoints.length).toFixed(1);
        const y = getY(v).toFixed(1);
        segments.push(`${segments.length === 0 ? "M" : "L"} ${x} ${y}`);
      }
    });
    return segments.join(" ");
  };

  const mainStrokeColor = isPositivePeriod ? "#10b981" : "#f43f5e";
  const mainAreaPath = useMemo(() => {
    if (points.length === 0) return "";
    const linePath = buildPolyline((p) => extractMainValue(p));
    const firstX = getX(0).toFixed(1);
    const lastX = getX(points.length - 1).toFixed(1);
    return `${linePath} L ${lastX} ${priceBottom} L ${firstX} ${priceBottom} Z`;
  }, [points, bounds, chartMode, marketCapAxisMode]);

  const activePoint =
    hoverIndex !== null && points[hoverIndex]
      ? points[hoverIndex]
      : points[points.length - 1];

  const candleWidth = Math.max(
    2.5,
    Math.min(14, (plotWidth / Math.max(1, points.length)) * 0.68)
  );

  // Y軸目盛りラベルのフォーマット
  const formatYTickLabel = (val: number): string => {
    if (chartMode === "marketCap") {
      if (marketCapAxisMode === "changePercent") {
        return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
      }
      return formatMarketCapOku(val, val >= 10000 ? 2 : 0);
    }
    return `${Math.round(val).toLocaleString()}円`;
  };

  const showSmaOverlay =
    chartMode === "priceArea" ||
    chartMode === "candle" ||
    (chartMode === "marketCap" && marketCapAxisMode === "actual");

  // ホバー中データポイントのパーセンテージ位置（ピークでも絶対に隠れない配置計算）
  const hoverTooltipPos = useMemo(() => {
    if (hoverIndex === null || !points[hoverIndex]) return null;
    const pt = points[hoverIndex];
    const xSvg = getX(hoverIndex);
    const ySvg = getY(extractMainValue(pt));
    const leftPct = (xSvg / width) * 100;
    const topPct = (ySvg / height) * 100;
    // 上半分（ピーク付近）にある時は必ずデータポイントの「下側」に表示して上部見切れを完全防止
    const placeBelow = topPct < 48;
    // 横長ツールチップが左右端で見切れないよう水平位置を3段階制御
    const horizTranslate =
      leftPct < 28
        ? "12px"
        : leftPct > 72
        ? "calc(-100% - 12px)"
        : "-50%";
    const vertTranslate = placeBelow ? "20px" : "calc(-100% - 20px)";
    return {
      leftPct,
      topPct,
      placeBelow,
      horizTranslate,
      vertTranslate,
    };
  }, [hoverIndex, points, bounds, chartMode, marketCapAxisMode]);

  return (
    <div className="relative select-none" ref={containerRef}>
      {/* チャート上部：ホバー中の詳細ステータスバー（大きめフォントで見やすく表示） */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900/95 px-4 py-2.5 text-sm border border-slate-700/80 shadow-md">
        {activePoint ? (
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
            <span className="font-mono text-sm sm:text-base font-extrabold text-white bg-slate-800 px-2.5 py-0.5 rounded-lg">
              📅 {activePoint.fullDateLabel}
            </span>
            {chartMode === "marketCap" ? (
              <>
                <span className="text-slate-300 text-xs sm:text-sm">
                  時価総額:{" "}
                  <strong className="font-mono text-base sm:text-xl font-black text-emerald-300">
                    {formatMarketCapOku(activePoint.marketCapOku, 2)}
                  </strong>
                </span>
                <span className="text-slate-300 text-xs sm:text-sm">
                  期間伸び率:{" "}
                  <strong
                    className={`font-mono text-base sm:text-xl font-black ${
                      activePoint.marketCapChangePercent >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {activePoint.marketCapChangePercent >= 0 ? "+" : ""}
                    {activePoint.marketCapChangePercent.toFixed(2)}%
                  </strong>
                </span>
                <span className="text-slate-300 text-xs sm:text-sm">
                  期間増減額:{" "}
                  <strong
                    className={`font-mono text-sm sm:text-base font-extrabold ${
                      activePoint.marketCapChangeOku >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {formatSignedMarketCapOku(activePoint.marketCapChangeOku, 2)}
                  </strong>
                </span>
                <span className="text-slate-300 text-xs sm:text-sm">
                  株価:{" "}
                  <strong className="font-mono text-sm sm:text-base font-bold text-white">
                    {activePoint.close.toLocaleString()}円
                  </strong>
                </span>
                <span className="text-slate-400 text-xs sm:text-sm">
                  出来高:{" "}
                  <strong className="font-mono font-semibold text-slate-200">
                    {(activePoint.volume / 10000).toFixed(0)}万株
                  </strong>
                </span>
              </>
            ) : (
              <>
                <span className="text-slate-300 text-xs sm:text-sm">
                  終値:{" "}
                  <strong className="font-mono text-base sm:text-xl font-black text-white">
                    {activePoint.close.toLocaleString()}円
                  </strong>
                </span>
                <span className="text-slate-300 text-xs sm:text-sm">
                  期間比:{" "}
                  <strong
                    className={`font-mono text-base sm:text-xl font-black ${
                      activePoint.changeFromStartPercent >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {activePoint.changeFromStartPercent >= 0 ? "+" : ""}
                    {activePoint.changeFromStartPercent.toFixed(2)}%
                  </strong>
                </span>
                <span className="text-slate-300 text-xs sm:text-sm">
                  始値:{" "}
                  <strong className="font-mono font-bold text-slate-200">
                    {activePoint.open.toLocaleString()}
                  </strong>
                </span>
                <span className="text-slate-300 text-xs sm:text-sm">
                  高値:{" "}
                  <strong className="font-mono font-bold text-emerald-400">
                    {activePoint.high.toLocaleString()}
                  </strong>
                </span>
                <span className="text-slate-300 text-xs sm:text-sm">
                  安値:{" "}
                  <strong className="font-mono font-bold text-rose-400">
                    {activePoint.low.toLocaleString()}
                  </strong>
                </span>
                <span className="text-slate-300 text-xs sm:text-sm">
                  時価総額:{" "}
                  <strong className="font-mono font-bold text-emerald-300">
                    {formatMarketCapOku(activePoint.marketCapOku, 2)}
                  </strong>
                </span>
              </>
            )}
          </div>
        ) : (
          <span className="text-slate-400">
            チャート上にカーソルを合わせると詳細値を表示します
          </span>
        )}

        {/* 移動平均線凡例 */}
        {showSmaOverlay && (
          <div className="flex items-center gap-3 text-xs font-bold">
            {showSmaShort && activePoint && (
              <span className="font-mono text-amber-400">
                ● {primaryData.meta.smaLabels[0]}:{" "}
                {chartMode === "marketCap"
                  ? activePoint.marketCapSmaShort
                    ? formatMarketCapOku(activePoint.marketCapSmaShort, 2)
                    : "---"
                  : activePoint.smaShort?.toLocaleString() ?? "---"}
              </span>
            )}
            {showSmaMid && activePoint && (
              <span className="font-mono text-sky-400">
                ● {primaryData.meta.smaLabels[1]}:{" "}
                {chartMode === "marketCap"
                  ? activePoint.marketCapSmaMid
                    ? formatMarketCapOku(activePoint.marketCapSmaMid, 2)
                    : "---"
                  : activePoint.smaMid?.toLocaleString() ?? "---"}
              </span>
            )}
            {showSmaLong && activePoint && (
              <span className="font-mono text-purple-400">
                ● {primaryData.meta.smaLabels[2]}:{" "}
                {chartMode === "marketCap"
                  ? activePoint.marketCapSmaLong
                    ? formatMarketCapOku(activePoint.marketCapSmaLong, 2)
                    : "---"
                  : activePoint.smaLong?.toLocaleString() ?? "---"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* メインSVGチャート（overflow-hiddenを外し、ピーク時のデータポイントやツールチップが絶対に隠れない仕様） */}
      <div className="relative rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-950 shadow-inner">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-slate-950/60 backdrop-blur-[2px]">
            <div className="flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-slate-900/95 px-4 py-2 text-xs font-medium text-emerald-300 shadow-lg">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
              {primaryName} の時価総額・株価データを取得中...
            </div>
          </div>
        )}

        {/* ホバー時の正円データポイント・マーカー（縦横比に依存せず常に真円＆ピークでも絶対に見切れない） */}
        {hoverIndex !== null && activePoint && hoverTooltipPos && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{
              left: `${hoverTooltipPos.leftPct}%`,
              top: `${hoverTooltipPos.topPct}%`,
            }}
          >
            <span
              className="absolute h-7 w-7 rounded-full opacity-30"
              style={{ backgroundColor: mainStrokeColor }}
            />
            <span
              className="relative h-4 w-4 rounded-full border-[2.5px] border-white shadow-lg"
              style={{ backgroundColor: mainStrokeColor }}
            />
          </div>
        )}

        {/* ホバー時にデータポイント直近に表示する「横長（ワイド＆スリム）」フローティングツールチップ */}
        {hoverIndex !== null && activePoint && hoverTooltipPos && (
          <div
            className="pointer-events-none absolute z-30 rounded-xl border-2 bg-slate-900/95 px-3.5 py-2 shadow-2xl backdrop-blur-md whitespace-nowrap"
            style={{
              borderColor: mainStrokeColor,
              left: `${hoverTooltipPos.leftPct}%`,
              top: `${hoverTooltipPos.topPct}%`,
              transform: `translate(${hoverTooltipPos.horizTranslate}, ${hoverTooltipPos.vertTranslate})`,
            }}
          >
            {/* 1段目：企業名 ＆ 日付（横並びスリムヘッダー） */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-700/80 pb-1 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-white/60"
                  style={{ backgroundColor: mainStrokeColor }}
                />
                <span className="font-extrabold text-white text-xs sm:text-sm">
                  {primaryName}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-sky-300 bg-slate-800/90 px-2 py-0.5 rounded">
                📅 {activePoint.fullDateLabel}
              </span>
            </div>

            {/* 2段目：主要指標を横長1列に配置（高さを抑えてピーク見切れを防止） */}
            {chartMode === "marketCap" ? (
              <div className="flex items-baseline gap-4">
                <div>
                  <span className="text-[11px] text-slate-400 mr-1.5">
                    時価総額
                  </span>
                  <span className="font-mono text-base sm:text-lg font-black text-white">
                    {formatMarketCapOku(activePoint.marketCapOku, 2)}
                  </span>
                </div>
                <div className="border-l border-slate-700/80 pl-3">
                  <span className="text-[11px] text-slate-400 mr-1.5">
                    伸び率
                  </span>
                  <span
                    className={`font-mono text-base sm:text-lg font-black ${
                      activePoint.marketCapChangePercent >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {activePoint.marketCapChangePercent >= 0 ? "▲+" : "▼"}
                    {activePoint.marketCapChangePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="hidden sm:block border-l border-slate-700/80 pl-3 text-xs">
                  <span className="text-slate-400 mr-1">増減/株価:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {formatSignedMarketCapOku(activePoint.marketCapChangeOku, 1)}{" "}
                    / {activePoint.close.toLocaleString()}円
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-baseline gap-4">
                <div>
                  <span className="text-[11px] text-slate-400 mr-1.5">
                    終値
                  </span>
                  <span className="font-mono text-base sm:text-lg font-black text-white">
                    {activePoint.close.toLocaleString()}円
                  </span>
                </div>
                <div className="border-l border-slate-700/80 pl-3">
                  <span className="text-[11px] text-slate-400 mr-1.5">
                    騰落率
                  </span>
                  <span
                    className={`font-mono text-base sm:text-lg font-black ${
                      activePoint.changeFromStartPercent >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {activePoint.changeFromStartPercent >= 0 ? "▲+" : "▼"}
                    {activePoint.changeFromStartPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="hidden sm:block border-l border-slate-700/80 pl-3 text-xs">
                  <span className="text-slate-400 mr-1">時価総額:</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {formatMarketCapOku(activePoint.marketCapOku, 2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className={`${
            chartSize === "xlarge"
              ? "h-[520px] sm:h-[640px]"
              : chartSize === "large"
              ? "h-[430px] sm:h-[520px]"
              : "h-[340px] sm:h-[400px]"
          } w-full block rounded-2xl cursor-crosshair transition-[height] duration-200`}
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
        >
          <defs>
            <linearGradient id="areaGradPositive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.38" />
              <stop offset="75%" stopColor="#10b981" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="areaGradNegative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.38" />
              <stop offset="75%" stopColor="#f43f5e" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Y軸の水平グリッドラインと右端ラベル */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={t.y}
                x2={width - padRight}
                y2={t.y}
                stroke="#1e293b"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={width - padRight + 8}
                y={t.y + 4}
                fill="#94a3b8"
                fontSize="12"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {formatYTickLabel(t.value)}
              </text>
            </g>
          ))}

          {/* 期間開始時点の基準ライン（時価総額モード時） */}
          {chartMode === "marketCap" && points.length > 0 && (
            <line
              x1={padLeft}
              y1={getY(
                marketCapAxisMode === "actual"
                  ? points[0].marketCapOku
                  : 0
              )}
              x2={width - padRight}
              y2={getY(
                marketCapAxisMode === "actual"
                  ? points[0].marketCapOku
                  : 0
              )}
              stroke="#64748b"
              strokeWidth="1.2"
              strokeDasharray="6 4"
            />
          )}

          {/* 価格/時価総額エリアと出来高エリアの境界線 */}
          <line
            x1={padLeft}
            y1={volTop - 8}
            x2={width - padRight}
            y2={volTop - 8}
            stroke="#1e293b"
            strokeWidth="1"
          />
          <text
            x={padLeft + 4}
            y={volTop + 8}
            fill="#64748b"
            fontSize="10"
            fontFamily="sans-serif"
          >
            出来高 (Volume)
          </text>

          {/* 出来高バー */}
          {points.map((p, i) => {
            const x = getX(i);
            const y = getVolY(p.volume);
            const barH = Math.max(1, volBottom - y);
            const isUp = p.close >= p.open;
            return (
              <rect
                key={`vol-${i}`}
                x={x - Math.max(1, candleWidth / 2)}
                y={y}
                width={Math.max(2, candleWidth)}
                height={barH}
                fill={isUp ? "#10b981" : "#f43f5e"}
                opacity={hoverIndex === i ? 0.9 : 0.32}
                rx="1"
              />
            );
          })}

          {/* 1. 時価総額 折れ線モード または 株価 折れ線モード */}
          {(chartMode === "marketCap" || chartMode === "priceArea") &&
            points.length > 0 && (
              <>
                <path
                  d={mainAreaPath}
                  fill={
                    isPositivePeriod
                      ? "url(#areaGradPositive)"
                      : "url(#areaGradNegative)"
                  }
                />
                <path
                  d={buildPolyline((p) => extractMainValue(p))}
                  fill="none"
                  stroke={mainStrokeColor}
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

          {/* 2. 株価 ローソク足モード */}
          {chartMode === "candle" &&
            points.map((p, i) => {
              const x = getX(i);
              const isUp = p.close >= p.open;
              const color = isUp ? "#10b981" : "#f43f5e";
              const highY = getY(p.high);
              const lowY = getY(p.low);
              const openY = getY(p.open);
              const closeY = getY(p.close);
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(2, Math.abs(closeY - openY));

              return (
                <g key={`candle-${i}`}>
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    rx="0.8"
                  />
                </g>
              );
            })}

          {/* 移動平均線（SMA: 短期・中期・長期） */}
          {showSmaOverlay && (
            <>
              {showSmaShort && (
                <path
                  d={buildPolyline((p) =>
                    chartMode === "marketCap" ? p.marketCapSmaShort : p.smaShort
                  )}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.6"
                  opacity="0.9"
                />
              )}
              {showSmaMid && (
                <path
                  d={buildPolyline((p) =>
                    chartMode === "marketCap" ? p.marketCapSmaMid : p.smaMid
                  )}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.6"
                  opacity="0.9"
                />
              )}
              {showSmaLong && (
                <path
                  d={buildPolyline((p) =>
                    chartMode === "marketCap" ? p.marketCapSmaLong : p.smaLong
                  )}
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth="1.7"
                  opacity="0.9"
                />
              )}
            </>
          )}

          {/* X軸の日付ラベル */}
          {xTicks.map((t, i) => (
            <text
              key={`xtick-${i}`}
              x={t.x}
              y={height - 10}
              fill="#94a3b8"
              fontSize="12"
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {t.label}
            </text>
          ))}

          {/* ホバー時のクロスヘアライン（データポイントの正円マーカーはHTMLオーバーレイ側で歪みなく描画） */}
          {hoverIndex !== null && points[hoverIndex] && (
            <g>
              {/* 垂直クロスヘアライン */}
              <line
                x1={getX(hoverIndex)}
                y1={padTop}
                x2={getX(hoverIndex)}
                y2={volBottom}
                stroke="#cbd5e1"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
              {/* 水平クロスヘアライン */}
              <line
                x1={padLeft}
                y1={getY(extractMainValue(points[hoverIndex]))}
                x2={width - padRight}
                y2={getY(extractMainValue(points[hoverIndex]))}
                stroke="#cbd5e1"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
