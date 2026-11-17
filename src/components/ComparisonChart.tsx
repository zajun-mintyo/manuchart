"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  GitCompare,
  Plus,
  X,
  Download,
  Upload,
  Bookmark,
  Trash2,
  Search,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Factory,
  Layers,
  Crown,
  ArrowRight,
  ExternalLink,
  Maximize2,
  Minimize2,
  Table2,
} from "lucide-react";
import {
  StockApiResponse,
  StockCandlePoint,
  CategoryIndexSeries,
  CategoryIndexPoint,
} from "@/app/api/stock/route";
import {
  PRIME_MANUFACTURING_COMPANIES,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_GROUPS,
  ProductCategoryId,
  SUPPLY_CHAIN_PRESETS,
  NICHE_TOP_PRESETS,
  COMPARISON_PRESETS,
  TIMEFRAMES,
  TimeframeKey,
  SavedComparisonView,
  getCompanyByCode,
  formatMarketCapOku,
  formatSignedMarketCapOku,
} from "@/data/companies";
import { MarketCapAxisMode, ChartHeightSize } from "@/components/StockChart";

export interface ComparisonCompanySeries {
  code: string;
  nameJa: string;
  sector: string;
  color: string;
  data: StockApiResponse;
}

export type ComparisonLensMode =
  | "product_index"
  | "supply_chain"
  | "niche_top"
  | "custom_company";

export const COMPARE_PALETTE = [
  "#10b981", // エメラルド (1社目)
  "#38bdf8", // スカイブルー (2社目)
  "#f59e0b", // アンバー (3社目)
  "#c084fc", // パープル (4社目)
  "#fb7185", // ローズ (5社目)
  "#2dd4bf", // ティール (6社目)
  "#facc15", // イエロー (7社目)
  "#818cf8", // インディゴ (8社目)
];

interface ComparisonChartProps {
  compareCodes: string[];
  seriesList: ComparisonCompanySeries[];
  categorySeriesList: CategoryIndexSeries[];
  selectedCategoryIds: ProductCategoryId[];
  onToggleCategoryId: (id: ProductCategoryId) => void;
  onSetCategoryIds: (ids: ProductCategoryId[]) => void;
  lensMode: ComparisonLensMode;
  onChangeLensMode: (mode: ComparisonLensMode) => void;
  selectedRange: TimeframeKey;
  metricMode: MarketCapAxisMode;
  onChangeMetricMode: (mode: MarketCapAxisMode) => void;
  onAddCode: (code: string) => void;
  onRemoveCode: (code: string) => void;
  onClearCodes: () => void;
  onSetCodes: (codes: string[]) => void;
  onSelectPrimaryCode: (code: string) => void;
  savedViews: SavedComparisonView[];
  onSaveView: (name: string) => void;
  onDeleteView: (id: string) => void;
  onApplyView: (view: SavedComparisonView) => void;
  onExportViewJson: (customName?: string) => void;
  onImportViewJson: (file: File) => void;
  selectedCompanyCode: string;
  isLoading: boolean;
  chartSize?: ChartHeightSize;
  onChangeChartSize?: (size: ChartHeightSize) => void;
}

export default function ComparisonChart({
  compareCodes,
  seriesList,
  categorySeriesList,
  selectedCategoryIds,
  onToggleCategoryId,
  onSetCategoryIds,
  lensMode,
  onChangeLensMode,
  selectedRange,
  metricMode,
  onChangeMetricMode,
  onAddCode,
  onRemoveCode,
  onClearCodes,
  onSetCodes,
  onSelectPrimaryCode,
  savedViews,
  onSaveView,
  onDeleteView,
  onApplyView,
  onExportViewJson,
  onImportViewJson,
  selectedCompanyCode,
  isLoading,
  chartSize = "large",
  onChangeChartSize,
}: ComparisonChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const addPopoverRef = useRef<HTMLDivElement | null>(null);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverSvgY, setHoverSvgY] = useState<number | null>(null);

  // サプライチェーン比較・ニッチトップ比較で現在選択中のプリセットID
  const [activeSupplyChainId, setActiveSupplyChainId] = useState<string>(
    SUPPLY_CHAIN_PRESETS[0].id
  );
  const [activeNicheTopId, setActiveNicheTopId] = useState<string>(
    NICHE_TOP_PRESETS[0].id
  );

  // ================= 可視化領域コントロール（アコーディオン開閉状態） =================
  // 品目・プリセット選択パネル全体（ワンタッチ抽出＋20品目ピルボタン群など）の表示・非表示
  const [isSelectorPanelOpen, setIsSelectorPanelOpen] = useState<boolean>(true);
  // カテゴリ詳細パネル（品目カード / 川上〜川下フロー図 / ニッチトップカード）の表示・非表示
  const [isCategoryDetailOpen, setIsCategoryDetailOpen] =
    useState<boolean>(false);
  // 下部サマリー＆ドリルダウン表の表示・非表示
  const [isSummaryTableOpen, setIsSummaryTableOpen] = useState<boolean>(true);

  // ポップオーバー開閉状態
  const [isViewMenuOpen, setIsViewMenuOpen] = useState<boolean>(false);
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [addSearchQuery, setAddSearchQuery] = useState<string>("");
  const [newViewName, setNewViewName] = useState<string>("");

  // 外側クリックでポップオーバーを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        viewMenuRef.current &&
        !viewMenuRef.current.contains(e.target as Node)
      ) {
        setIsViewMenuOpen(false);
      }
      if (
        addPopoverRef.current &&
        !addPopoverRef.current.contains(e.target as Node)
      ) {
        setIsAddOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentTimeframeObj =
    TIMEFRAMES.find((t) => t.key === selectedRange) ?? TIMEFRAMES[5];

  const selectedCompany = useMemo(
    () => getCompanyByCode(selectedCompanyCode),
    [selectedCompanyCode]
  );

  const activeSupplyChainPreset = useMemo(
    () =>
      SUPPLY_CHAIN_PRESETS.find((p) => p.id === activeSupplyChainId) ??
      SUPPLY_CHAIN_PRESETS[0],
    [activeSupplyChainId]
  );

  const activeNicheTopPreset = useMemo(
    () =>
      NICHE_TOP_PRESETS.find((p) => p.id === activeNicheTopId) ??
      NICHE_TOP_PRESETS[0],
    [activeNicheTopId]
  );

  // 選択中の生産品目シリーズ一覧
  const activeCategorySeries = useMemo(() => {
    return categorySeriesList.filter((c) =>
      selectedCategoryIds.includes(c.categoryId)
    );
  }, [categorySeriesList, selectedCategoryIds]);

  // 追加候補の検索フィルタリング
  const candidateCompanies = useMemo(() => {
    const q = addSearchQuery.trim().toLowerCase();
    return PRIME_MANUFACTURING_COMPANIES.filter((c) => {
      if (compareCodes.includes(c.code)) return false;
      if (!q) return true;
      return (
        c.code.includes(q) ||
        c.nameJa.toLowerCase().includes(q) ||
        c.nameKana.toLowerCase().includes(q) ||
        c.sector.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }).slice(0, 14);
  }, [addSearchQuery, compareCodes]);

  // SVG キャンバス仮想サイズ（ピーク部分のデータポイントが隠れないよう上部余白を十分に確保）
  const width = 960;
  const height = 440;
  const padLeft = 18;
  const padRight = 98;
  const padTop = 38;
  const plotBottom = 400;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = plotBottom - padTop;

  const isCategoryMode = lensMode === "product_index";

  // 基準時系列ポイント配列（X軸生成用）
  const basePoints = useMemo(() => {
    if (isCategoryMode) {
      return activeCategorySeries[0]?.points ?? [];
    }
    return seriesList[0]?.data.points ?? [];
  }, [isCategoryMode, activeCategorySeries, seriesList]);

  // Y軸の最小・最大値計算（ピーク部分が上端に張り付かないよう上側余白を14%確保）
  const bounds = useMemo(() => {
    if (isCategoryMode) {
      if (activeCategorySeries.length === 0 || basePoints.length === 0) {
        return { minVal: -10, maxVal: 20 };
      }
      let minV = Infinity;
      let maxV = -Infinity;
      for (const cat of activeCategorySeries) {
        for (const p of cat.points) {
          const val =
            metricMode === "actual"
              ? p.totalMarketCapOku
              : p.avgChangePercent;
          if (val < minV) minV = val;
          if (val > maxV) maxV = val;
        }
      }
      if (minV === Infinity || maxV === -Infinity) {
        return { minVal: -10, maxVal: 20 };
      }
      if (minV === maxV) {
        minV -= 10;
        maxV += 10;
      }
      const span = maxV - minV;
      return {
        minVal: minV - span * 0.08,
        maxVal: maxV + span * 0.14,
      };
    }

    if (seriesList.length === 0 || basePoints.length === 0) {
      return { minVal: 0, maxVal: 100 };
    }

    let minV = Infinity;
    let maxV = -Infinity;

    for (const s of seriesList) {
      for (const p of s.data.points) {
        const val =
          metricMode === "actual" ? p.marketCapOku : p.marketCapChangePercent;
        if (val < minV) minV = val;
        if (val > maxV) maxV = val;
      }
    }

    if (minV === Infinity || maxV === -Infinity) {
      return { minVal: 0, maxVal: 100 };
    }

    if (minV === maxV) {
      minV -= 10;
      maxV += 10;
    }

    const span = maxV - minV;
    return {
      minVal: minV - span * 0.08,
      maxVal: maxV + span * 0.14,
    };
  }, [isCategoryMode, activeCategorySeries, seriesList, basePoints, metricMode]);

  const getX = (index: number, totalCount = basePoints.length) => {
    if (totalCount <= 1) return padLeft + plotWidth / 2;
    return padLeft + (index / (totalCount - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    const ratio = (val - bounds.minVal) / (bounds.maxVal - bounds.minVal || 1);
    return plotBottom - ratio * plotHeight;
  };

  // Y軸目盛り（5段階）
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

  // X軸目盛り（6箇所）
  const xTicks = useMemo(() => {
    if (basePoints.length === 0) return [];
    const count = Math.min(6, basePoints.length);
    const result: { index: number; label: string; x: number }[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(
        (i * (basePoints.length - 1)) / Math.max(1, count - 1)
      );
      result.push({
        index: idx,
        label: basePoints[idx].dateLabel,
        x: getX(idx),
      });
    }
    return result;
  }, [basePoints]);

  const buildCompanyPolyline = (targetPoints: StockCandlePoint[]) => {
    const segments: string[] = [];
    targetPoints.forEach((p, i) => {
      const v =
        metricMode === "actual" ? p.marketCapOku : p.marketCapChangePercent;
      if (v !== null && !isNaN(v)) {
        const x = getX(i, targetPoints.length).toFixed(1);
        const y = getY(v).toFixed(1);
        segments.push(`${segments.length === 0 ? "M" : "L"} ${x} ${y}`);
      }
    });
    return segments.join(" ");
  };

  const buildCategoryPolyline = (targetPoints: CategoryIndexPoint[]) => {
    const segments: string[] = [];
    targetPoints.forEach((p, i) => {
      const v =
        metricMode === "actual" ? p.totalMarketCapOku : p.avgChangePercent;
      if (v !== null && !isNaN(v)) {
        const x = getX(i, targetPoints.length).toFixed(1);
        const y = getY(v).toFixed(1);
        segments.push(`${segments.length === 0 ? "M" : "L"} ${x} ${y}`);
      }
    });
    return segments.join(" ");
  };

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || basePoints.length === 0) return;

    let svgX = 0;
    let svgY = 0;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      svgX = transformed.x;
      svgY = transformed.y;
    } else {
      const rect = svg.getBoundingClientRect();
      svgX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * width;
      svgY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * height;
    }

    const clampedX = Math.max(padLeft, Math.min(padLeft + plotWidth, svgX));
    const idx = Math.round(
      ((clampedX - padLeft) / plotWidth) * (basePoints.length - 1)
    );
    if (idx >= 0 && idx < basePoints.length) {
      setHoverIndex(idx);
      setHoverSvgY(svgY);
    }
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
    setHoverSvgY(null);
  };

  // マウスカーソル（X, Y）に最も近い「単一の企業（または単一の品目）」のデータポイントを特定
  const focusedPoint = useMemo(() => {
    if (hoverIndex === null || basePoints.length === 0) return null;

    if (isCategoryMode) {
      const candidates = activeCategorySeries
        .map((cat) => {
          const pts = cat.points;
          if (pts.length === 0) return null;
          const ratioIdx = Math.min(
            pts.length - 1,
            Math.round(
              (hoverIndex / Math.max(1, basePoints.length - 1)) *
                (pts.length - 1)
            )
          );
          const pt = pts[ratioIdx];
          if (!pt) return null;
          const val =
            metricMode === "actual"
              ? pt.totalMarketCapOku
              : pt.avgChangePercent;
          const xSvg = getX(ratioIdx, pts.length);
          const ySvg = getY(val);
          const distY =
            hoverSvgY !== null ? Math.abs(ySvg - hoverSvgY) : Infinity;

          return {
            id: cat.categoryId,
            name: cat.name,
            shortLabel: cat.shortName,
            subNote: `${cat.companyCount}社合算 / 牽引: ${cat.topDriver.nameJa}`,
            color: cat.color,
            dateLabel: pt.fullDateLabel,
            marketCapOku: pt.totalMarketCapOku,
            changePercent: pt.avgChangePercent,
            changeOku: pt.changeMarketCapOku,
            price: null as number | null,
            xSvg,
            ySvg,
            distY,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (candidates.length === 0) return null;
      return candidates.sort((a, b) => a.distY - b.distY)[0];
    }

    const candidates = seriesList
      .map((s) => {
        const pts = s.data.points;
        if (pts.length === 0) return null;
        const ratioIdx = Math.min(
          pts.length - 1,
          Math.round(
            (hoverIndex / Math.max(1, basePoints.length - 1)) *
              (pts.length - 1)
          )
        );
        const pt = pts[ratioIdx];
        if (!pt) return null;
        const val =
          metricMode === "actual" ? pt.marketCapOku : pt.marketCapChangePercent;
        const xSvg = getX(ratioIdx, pts.length);
        const ySvg = getY(val);
        const distY =
          hoverSvgY !== null ? Math.abs(ySvg - hoverSvgY) : Infinity;

        const scRole =
          lensMode === "supply_chain"
            ? activeSupplyChainPreset.stageMap[s.code]
            : undefined;
        const nicheBadge =
          lensMode === "niche_top"
            ? activeNicheTopPreset.shareBadges[s.code]
            : undefined;

        return {
          id: s.code,
          name: `${s.code} ${s.nameJa}`,
          shortLabel: s.nameJa,
          subNote: scRole
            ? `${scRole.stage} / ${scRole.role}`
            : nicheBadge
            ? `👑 ${nicheBadge}`
            : s.sector,
          color: s.color,
          dateLabel: pt.fullDateLabel,
          marketCapOku: pt.marketCapOku,
          changePercent: pt.marketCapChangePercent,
          changeOku: pt.marketCapChangeOku,
          price: pt.close as number | null,
          xSvg,
          ySvg,
          distY,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => a.distY - b.distY)[0];
  }, [
    hoverIndex,
    hoverSvgY,
    basePoints,
    isCategoryMode,
    activeCategorySeries,
    seriesList,
    metricMode,
    bounds,
    lensMode,
    activeSupplyChainPreset,
    activeNicheTopPreset,
  ]);

  const formatYTick = (val: number): string => {
    if (metricMode === "changePercent") {
      return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
    }
    return formatMarketCapOku(val, val >= 10000 ? 1 : 0);
  };

  const handleSaveViewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newViewName.trim();
    const defaultName =
      seriesList.map((s) => s.nameJa.split("（")[0]).join("×") || "比較ビュー";
    onSaveView(trimmed || defaultName);
    setNewViewName("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportViewJson(file);
      e.target.value = "";
      setIsViewMenuOpen(false);
    }
  };

  const findMatchingSupplyChainId = (catId: ProductCategoryId): string | null => {
    const map: Partial<Record<ProductCategoryId, string>> = {
      semicon: "sc-semicon",
      auto: "sc-auto",
      ship: "sc-ship",
      aircraft: "sc-aircraft",
      machinetool: "sc-machinetool",
      heavy_energy: "sc-heavy-energy",
      optical_cable: "sc-heavy-energy",
    };
    return map[catId] ?? null;
  };

  const getStageBadgeStyle = (stage?: string) => {
    if (!stage) return "bg-slate-800 text-slate-300 border-slate-700";
    if (stage.startsWith("川上")) {
      return "bg-purple-500/20 text-purple-300 border-purple-500/40";
    }
    if (stage.startsWith("川中")) {
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    }
    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  };

  const svgHeightClass =
    chartSize === "xlarge"
      ? "h-[540px] sm:h-[680px]"
      : chartSize === "large"
      ? "h-[450px] sm:h-[540px]"
      : "h-[350px] sm:h-[420px]";

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-3.5 sm:p-5 shadow-xl space-y-3">
      {/* ================= 1. 製造業特化「4つの比較レンズ」切替バー ================= */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-950/90 p-1">
          <button
            onClick={() => {
              onChangeLensMode("product_index");
              onChangeMetricMode("changePercent");
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition cursor-pointer ${
              lensMode === "product_index"
                ? "bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md"
                : "text-slate-300 hover:bg-slate-900 hover:text-white"
            }`}
          >
            <Factory className="h-3.5 w-3.5" />
            <span>🏭 20大生産品目 ({selectedCategoryIds.length})</span>
          </button>

          <button
            onClick={() => {
              onChangeLensMode("supply_chain");
              onChangeMetricMode("changePercent");
              onSetCodes(activeSupplyChainPreset.codes);
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition cursor-pointer ${
              lensMode === "supply_chain"
                ? "bg-gradient-to-r from-sky-400 to-indigo-400 text-slate-950 shadow-md"
                : "text-slate-300 hover:bg-slate-900 hover:text-white"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>🔗 サプライチェーン</span>
          </button>

          <button
            onClick={() => {
              onChangeLensMode("niche_top");
              onChangeMetricMode("changePercent");
              onSetCodes(activeNicheTopPreset.codes);
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition cursor-pointer ${
              lensMode === "niche_top"
                ? "bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 shadow-md"
                : "text-slate-300 hover:bg-slate-900 hover:text-white"
            }`}
          >
            <Crown className="h-3.5 w-3.5" />
            <span>👑 ニッチトップ</span>
          </button>

          <button
            onClick={() => onChangeLensMode("custom_company")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition cursor-pointer ${
              lensMode === "custom_company"
                ? "bg-sky-500 text-slate-950 shadow-md"
                : "text-slate-300 hover:bg-slate-900 hover:text-white"
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>⚖️ 自由比較 ({compareCodes.length}社)</span>
          </button>
        </div>

        {/* 右側コントロール：Y軸切替 ＆ グラフサイズ切替 ＆ ビュー管理 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Y軸モード切替（変動率% ⇔ 実額） */}
          <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
            <button
              onClick={() => onChangeMetricMode("changePercent")}
              className={`rounded-lg px-2.5 py-1 font-bold transition cursor-pointer ${
                metricMode === "changePercent"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isCategoryMode ? "平均騰落率 (%)" : "変動率 (%)"}
            </button>
            <button
              onClick={() => onChangeMetricMode("actual")}
              className={`rounded-lg px-2.5 py-1 font-bold transition cursor-pointer ${
                metricMode === "actual"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isCategoryMode ? "合算時価総額" : "実額 (兆/億円)"}
            </button>
          </div>

          {/* グラフ縦サイズ（高さ）ワンタッチ拡大・縮小ボタン */}
          {onChangeChartSize && (
            <button
              onClick={() =>
                onChangeChartSize(chartSize === "xlarge" ? "large" : "xlarge")
              }
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                chartSize === "xlarge"
                  ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
              title="折れ線グラフの高さを最大化/標準に戻す"
            >
              {chartSize === "xlarge" ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">グラフ高: 特大</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">グラフ拡大</span>
                </>
              )}
            </button>
          )}

          {/* ビュー管理メニュー */}
          <div className="relative" ref={viewMenuRef}>
            <button
              onClick={() => setIsViewMenuOpen((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                isViewMenuOpen
                  ? "border-sky-400 bg-sky-500/20 text-sky-200"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800"
              }`}
            >
              <Bookmark className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden sm:inline">ビュー保存</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />

            {isViewMenuOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-700 bg-slate-900/98 p-4 shadow-2xl backdrop-blur-xl text-xs">
                <div className="pb-3 border-b border-slate-800">
                  <div className="font-bold text-slate-200 mb-2">
                    現在の企業組合せ（{compareCodes.length}社）を保存・出力
                  </div>
                  <form onSubmit={handleSaveViewSubmit} className="flex gap-1.5">
                    <input
                      type="text"
                      value={newViewName}
                      onChange={(e) => setNewViewName(e.target.value)}
                      placeholder="ビュー名（例: 半導体サプライチェーン）"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={compareCodes.length === 0}
                      className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40 cursor-pointer"
                    >
                      保存
                    </button>
                  </form>

                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onExportViewJson(newViewName.trim() || undefined);
                        setIsViewMenuOpen(false);
                      }}
                      disabled={compareCodes.length === 0}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 py-1.5 font-semibold text-sky-300 hover:bg-sky-500/25 disabled:opacity-40 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>JSONファイル出力</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 py-1.5 font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5 text-amber-400" />
                      <span>JSONファイル読込</span>
                    </button>
                  </div>
                </div>

                <div className="py-3 border-b border-slate-800">
                  <div className="font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>保存済みマイビュー</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      クリックで適用
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {savedViews.map((view) => (
                      <div
                        key={view.id}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 hover:border-slate-700"
                      >
                        <button
                          onClick={() => {
                            onChangeLensMode("custom_company");
                            onApplyView(view);
                            setIsViewMenuOpen(false);
                          }}
                          className="flex-1 text-left font-medium text-slate-200 hover:text-emerald-300 truncate cursor-pointer"
                        >
                          <FolderOpen className="inline h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                          {view.name}
                          <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                            ({view.codes.length}社 / {view.range})
                          </span>
                        </button>
                        <button
                          onClick={() => onDeleteView(view.id)}
                          className="ml-2 p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                          title="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3">
                  <div className="font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>業界別おすすめプリセット</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COMPARISON_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          onChangeLensMode("custom_company");
                          onSetCodes(preset.codes);
                          setIsViewMenuOpen(false);
                        }}
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300 hover:border-sky-500/50 hover:text-sky-300 cursor-pointer"
                      >
                        {preset.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= 2. モード別セレクタ ＆ 下三角（▼/▲）アコーディオン制御 ================= */}

      {/* --- モードA：🏭 20大生産品目 インデックス比較（下三角ボタンでパネル全体を表示・非表示可能） --- */}
      {lensMode === "product_index" && (
        <div className="rounded-xl border border-emerald-500/25 bg-slate-950/75 overflow-hidden">
          {/* 常時表示のスリム開閉ヘッダーバー（選択中品目サマリー ＋ ▼/▲ 表示・非表示ボタン） */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-900/70">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <button
                onClick={() => setIsSelectorPanelOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-300 hover:text-emerald-200 transition cursor-pointer mr-1"
              >
                {isSelectorPanelOpen ? (
                  <ChevronUp className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-emerald-400" />
                )}
                <span>
                  🏭 20大生産品目セレクタ ({selectedCategoryIds.length}品目選択中)
                </span>
              </button>

              {/* パネルを閉じている時は、選択中の品目バッジを1行でコンパクトに表示 */}
              {!isSelectorPanelOpen && (
                <div className="flex flex-wrap items-center gap-1">
                  {activeCategorySeries.map((cat) => (
                    <span
                      key={cat.categoryId}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 text-[11px] font-bold text-slate-200"
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span>{cat.shortName}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isSelectorPanelOpen && (
                <button
                  onClick={() => setIsCategoryDetailOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-800 cursor-pointer"
                  title="全20品目カードの景気サイクル解説・合算時価総額を表示/非表示"
                >
                  <span>
                    {isCategoryDetailOpen
                      ? "品目カードを隠す"
                      : "📋 20品目カード詳細"}
                  </span>
                  {isCategoryDetailOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                </button>
              )}

              {/* ▼ / ▲ パネル全体の表示・非表示トグルボタン */}
              <button
                onClick={() => setIsSelectorPanelOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer"
                title="ワンタッチ抽出ボタンと20品目リストを表示/非表示"
              >
                <span>
                  {isSelectorPanelOpen
                    ? "品目パネルを隠す"
                    : "品目パネルを表示"}
                </span>
                {isSelectorPanelOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* 展開時のみ表示されるワンタッチ抽出バー＆全20品目ピルボタン群 */}
          {isSelectorPanelOpen && (
            <div className="px-3.5 py-2.5 space-y-2.5 border-t border-slate-800/80">
              {/* 1段目：クイック抽出（トップ5 / ボトム5 / 基幹5）＆ 4大産業グループ切替 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400 mr-0.5">
                    ワンタッチ抽出:
                  </span>
                  {/* 🔥 期間トップ5品目 抽出ボタン */}
                  <button
                    onClick={() => {
                      const top5 = [...categorySeriesList]
                        .sort(
                          (a, b) =>
                            b.avgPeriodChangePercent - a.avgPeriodChangePercent
                        )
                        .slice(0, 5)
                        .map((c) => c.categoryId);
                      if (top5.length > 0) onSetCategoryIds(top5);
                    }}
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-300 hover:bg-emerald-500/25 transition cursor-pointer"
                    title="20品目のうち現在最も伸びている上位5品目をプロット"
                  >
                    🔥 伸び率トップ5
                  </button>

                  {/* ❄️ 出遅れボトム5品目 抽出ボタン */}
                  <button
                    onClick={() => {
                      const bottom5 = [...categorySeriesList]
                        .sort(
                          (a, b) =>
                            a.avgPeriodChangePercent - b.avgPeriodChangePercent
                        )
                        .slice(0, 5)
                        .map((c) => c.categoryId);
                      if (bottom5.length > 0) onSetCategoryIds(bottom5);
                    }}
                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-extrabold text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
                    title="20品目のうち調整中・出遅れている下位5品目をプロット"
                  >
                    ❄️ 出遅れボトム5
                  </button>

                  {/* ⭐ 主要5品目（車・船・空・半導体・工作機械） */}
                  <button
                    onClick={() =>
                      onSetCategoryIds([
                        "auto",
                        "ship",
                        "aircraft",
                        "semicon",
                        "machinetool",
                      ])
                    }
                    className="rounded-lg border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 transition cursor-pointer"
                  >
                    ⭐ 基幹5品目
                  </button>

                  <span className="hidden lg:inline text-slate-700 mx-0.5">
                    |
                  </span>

                  {/* 4大産業グループ（5品目×4）ワンクリック切替 */}
                  {PRODUCT_CATEGORY_GROUPS.map((grp) => {
                    const isGroupSelected =
                      selectedCategoryIds.length === grp.categoryIds.length &&
                      grp.categoryIds.every((id) =>
                        selectedCategoryIds.includes(id)
                      );
                    return (
                      <button
                        key={grp.key}
                        onClick={() => onSetCategoryIds(grp.categoryIds)}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition cursor-pointer ${
                          isGroupSelected
                            ? "border-amber-400 bg-amber-500/20 text-amber-200 shadow-sm"
                            : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white"
                        }`}
                        title={grp.description}
                      >
                        {grp.shortLabel}
                      </button>
                    );
                  })}

                  <button
                    onClick={() =>
                      onSetCategoryIds(PRODUCT_CATEGORIES.map((c) => c.id))
                    }
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                  >
                    全20品目
                  </button>
                </div>
              </div>

              {/* 2段目：全20品目のピルボタン一覧（現在の伸び率を色付きで併記、クリックで個別ON/OFF） */}
              <div className="flex flex-wrap items-center gap-1.5">
                {PRODUCT_CATEGORIES.map((cat) => {
                  const active = selectedCategoryIds.includes(cat.id);
                  const catData = categorySeriesList.find(
                    (s) => s.categoryId === cat.id
                  );
                  const pct = catData?.avgPeriodChangePercent ?? 0;
                  const isUp = pct >= 0;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => onToggleCategoryId(cat.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                        active
                          ? "bg-slate-900 text-white shadow-sm"
                          : "border-slate-800/90 bg-slate-950/80 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                      }`}
                      style={{
                        borderColor: active ? cat.color : undefined,
                      }}
                      title={`${cat.name}（${cat.cycleType}）`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: cat.color,
                          opacity: active ? 1 : 0.45,
                        }}
                      />
                      <span>{cat.shortName}</span>
                      <span
                        className={`font-mono text-[11px] font-extrabold ${
                          active
                            ? isUp
                              ? "text-emerald-400"
                              : "text-rose-400"
                            : "text-slate-500"
                        }`}
                      >
                        {isUp ? "+" : ""}
                        {pct.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 展開時のみ表示される20大品目詳細カードグリッド（▼ボタンで開閉） */}
              {isCategoryDetailOpen && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 sm:grid-cols-4 lg:grid-cols-5">
                  {PRODUCT_CATEGORIES.map((cat) => {
                    const active = selectedCategoryIds.includes(cat.id);
                    const catData = categorySeriesList.find(
                      (s) => s.categoryId === cat.id
                    );
                    const pct = catData?.avgPeriodChangePercent ?? 0;
                    const isUp = pct >= 0;

                    return (
                      <button
                        key={cat.id}
                        onClick={() => onToggleCategoryId(cat.id)}
                        className={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition cursor-pointer ${
                          active
                            ? "bg-slate-900/95 shadow-md"
                            : "border-slate-800/70 bg-slate-950/50 opacity-55 hover:opacity-90"
                        }`}
                        style={{
                          borderColor: active ? cat.color : undefined,
                        }}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-extrabold text-white truncate">
                              {cat.shortName}
                            </span>
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400 line-clamp-1">
                            {cat.cycleType}
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between gap-1">
                          <span
                            className={`font-mono text-xs font-extrabold ${
                              isUp ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {pct.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {catData
                              ? formatMarketCapOku(
                                  catData.latestTotalMarketCapOku,
                                  1
                                )
                              : `${cat.codes.length}社`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- モードB：🔗 サプライチェーン（川上 ➡ 川中 ➡ 川下）波及比較 --- */}
      {lensMode === "supply_chain" && (
        <div className="rounded-xl border border-sky-500/30 bg-slate-950/75 px-3.5 py-2.5 space-y-2.5">
          {/* 常時表示のスリム1行バー（プリセット選択 ＋ ▼川上〜川下フロー開閉ボタン） */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {SUPPLY_CHAIN_PRESETS.map((sc) => {
                const active = sc.id === activeSupplyChainPreset.id;
                return (
                  <button
                    key={sc.id}
                    onClick={() => {
                      setActiveSupplyChainId(sc.id);
                      onSetCodes(sc.codes);
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      active
                        ? "border-sky-400 bg-sky-500/20 text-white shadow-sm"
                        : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    {sc.title}
                  </button>
                );
              })}
            </div>

            {/* ▼ / ▲ サプライチェーン詳細フローの表示・非表示ボタン */}
            <button
              onClick={() => setIsCategoryDetailOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 cursor-pointer shrink-0"
              title="川上➡川中➡川下の3段階フロー図を表示/非表示"
            >
              <span>
                {isCategoryDetailOpen
                  ? "川上〜川下フローを隠す"
                  : "🔗 川上➡川中➡川下 内訳を表示"}
              </span>
              {isCategoryDetailOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* 展開時のみ表示される「川上 ➡ 川中 ➡ 川下」ビジュアルフローパネル */}
          {isCategoryDetailOpen && (
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <p className="text-[11px] text-slate-400">
                {activeSupplyChainPreset.description}
              </p>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                {(
                  [
                    "川上 (素材・部材)",
                    "川中 (装置・部品)",
                    "川下 (完成品・最終)",
                  ] as const
                ).map((stageName, stageIdx) => {
                  const stageCodes = activeSupplyChainPreset.codes.filter(
                    (c) =>
                      activeSupplyChainPreset.stageMap[c]?.stage === stageName
                  );

                  return (
                    <div
                      key={stageName}
                      className="relative rounded-xl border border-slate-800 bg-slate-900/80 p-2.5"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-extrabold ${getStageBadgeStyle(
                            stageName
                          )}`}
                        >
                          {stageName}
                        </span>
                        {stageIdx < 2 && (
                          <ArrowRight className="hidden md:block h-4 w-4 text-slate-500" />
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {stageCodes.map((code) => {
                          const comp = getCompanyByCode(code);
                          const roleInfo =
                            activeSupplyChainPreset.stageMap[code];
                          const sItem = seriesList.find((s) => s.code === code);
                          const pct =
                            sItem?.data.meta.periodMarketCapChangePercent ?? 0;
                          const colorIdx = compareCodes.indexOf(code);
                          const lineColor =
                            colorIdx >= 0
                              ? COMPARE_PALETTE[
                                  colorIdx % COMPARE_PALETTE.length
                                ]
                              : "#94a3b8";

                          return (
                            <div
                              key={code}
                              onClick={() => onSelectPrimaryCode(code)}
                              className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/80 px-2.5 py-1.5 text-xs hover:border-slate-700 cursor-pointer"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: lineColor }}
                                  />
                                  <span className="font-bold text-white truncate">
                                    {comp?.nameJa ?? code}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate pl-4">
                                  {roleInfo?.role}
                                </div>
                              </div>
                              <span
                                className={`font-mono text-xs font-extrabold shrink-0 ${
                                  pct >= 0
                                    ? "text-emerald-400"
                                    : "text-rose-400"
                                }`}
                              >
                                {pct >= 0 ? "+" : ""}
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- モードC：👑 ニッチトップ（世界シェア独占品目）比較 --- */}
      {lensMode === "niche_top" && (
        <div className="rounded-xl border border-amber-500/30 bg-slate-950/75 px-3.5 py-2.5 space-y-2.5">
          {/* 常時表示のスリム1行バー（プリセット選択 ＋ ▼シェア詳細カード開閉ボタン） */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {NICHE_TOP_PRESETS.map((np) => {
                const active = np.id === activeNicheTopPreset.id;
                return (
                  <button
                    key={np.id}
                    onClick={() => {
                      setActiveNicheTopId(np.id);
                      onSetCodes(np.codes);
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      active
                        ? "border-amber-400 bg-amber-500/20 text-white shadow-sm"
                        : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    {np.title}
                  </button>
                );
              })}
            </div>

            {/* ▼ / ▲ ニッチトップ詳細カードの表示・非表示ボタン */}
            <button
              onClick={() => setIsCategoryDetailOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer shrink-0"
              title="世界シェア独占バッジ・利益率カードを表示/非表示"
            >
              <span>
                {isCategoryDetailOpen
                  ? "シェア詳細を隠す"
                  : "👑 世界シェア詳細カードを表示"}
              </span>
              {isCategoryDetailOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* 展開時のみ表示されるニッチトップ詳細カード一覧 */}
          {isCategoryDetailOpen && (
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <p className="text-[11px] text-slate-400">
                {activeNicheTopPreset.description}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {activeNicheTopPreset.codes.map((code) => {
                  const comp = getCompanyByCode(code);
                  const badgeText = activeNicheTopPreset.shareBadges[code];
                  const sItem = seriesList.find((s) => s.code === code);
                  const pct =
                    sItem?.data.meta.periodMarketCapChangePercent ?? 0;
                  const colorIdx = compareCodes.indexOf(code);
                  const lineColor =
                    colorIdx >= 0
                      ? COMPARE_PALETTE[colorIdx % COMPARE_PALETTE.length]
                      : "#94a3b8";

                  return (
                    <div
                      key={code}
                      onClick={() => onSelectPrimaryCode(code)}
                      className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-2.5 hover:border-amber-500/40 transition cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: lineColor }}
                            />
                            <span className="text-xs font-extrabold text-white truncate">
                              {comp?.nameJa ?? code}
                            </span>
                          </div>
                          <span
                            className={`font-mono text-xs font-extrabold shrink-0 ${
                              pct >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {pct >= 0 ? "+" : ""}
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">
                          👑 {badgeText}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>
                          営業利益率 {comp?.operatingMargin.toFixed(1)}%
                        </span>
                        <span>ROE {comp?.roe.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- 比較対象企業チップ ＆ 「＋企業を追加」バー（企業比較モード時） --- */}
      {!isCategoryMode && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {compareCodes.map((code, idx) => {
              const comp = getCompanyByCode(code);
              const color = COMPARE_PALETTE[idx % COMPARE_PALETTE.length];
              const sData = seriesList.find((s) => s.code === code)?.data;
              const periodPct = sData?.meta.periodMarketCapChangePercent ?? 0;

              return (
                <div
                  key={code}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-bold text-white">
                    {comp?.nameJa ?? code}
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      periodPct >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {periodPct >= 0 ? "+" : ""}
                    {periodPct.toFixed(1)}%
                  </span>
                  <button
                    onClick={() => onRemoveCode(code)}
                    className="ml-0.5 rounded p-0.5 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer"
                    title="比較から外す"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}

            {/* ＋ 企業を追加ボタン */}
            <div className="relative" ref={addPopoverRef}>
              <button
                onClick={() => setIsAddOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-sky-500/50 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-300 hover:bg-sky-500/20 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>企業を追加</span>
              </button>

              {isAddOpen && (
                <div className="absolute left-0 top-full z-40 mt-2 w-80 rounded-2xl border border-slate-700 bg-slate-900/98 p-3 shadow-2xl backdrop-blur-xl text-xs">
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={addSearchQuery}
                      onChange={(e) => setAddSearchQuery(e.target.value)}
                      placeholder="証券コード・企業名・製品で検索..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                      autoFocus
                    />
                  </div>

                  {!addSearchQuery && selectedCompany && (
                    <div className="mb-2 pb-2 border-b border-slate-800">
                      <div className="text-[10px] font-semibold text-slate-400 mb-1">
                        {selectedCompany.nameJa} の同業ライバル候補
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedCompany.peers.map((peerCode) => {
                          const peer = getCompanyByCode(peerCode);
                          if (!peer || compareCodes.includes(peerCode))
                            return null;
                          return (
                            <button
                              key={peerCode}
                              onClick={() => {
                                onAddCode(peerCode);
                                setIsAddOpen(false);
                              }}
                              className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-sky-500/20 cursor-pointer"
                            >
                              ＋ {peer.nameJa}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/50">
                    {candidateCompanies.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => {
                          onAddCode(c.code);
                          setAddSearchQuery("");
                          setIsAddOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      >
                        <div className="truncate pr-2">
                          <span className="font-mono font-bold text-sky-400 mr-1.5">
                            {c.code}
                          </span>
                          <span className="font-semibold text-white">
                            {c.nameJa}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">
                          {formatMarketCapOku(c.marketCapOku, 1)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {compareCodes.length > 1 && (
            <button
              onClick={onClearCodes}
              className="text-xs text-slate-500 hover:text-rose-400 transition cursor-pointer"
            >
              すべてクリア
            </button>
          )}
        </div>
      )}

      {/* ================= 3. 単一フォーカス銘柄の大型ステータスバー ================= */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/90 px-4 py-2 text-sm border border-slate-800/80 min-h-[44px]">
        {focusedPoint ? (
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="font-mono text-sm sm:text-base font-extrabold text-white bg-slate-800 px-2.5 py-0.5 rounded-lg">
              📅 {focusedPoint.dateLabel}
            </span>
            <span className="inline-flex items-center gap-2 text-base sm:text-lg font-extrabold text-white">
              <span
                className="h-3.5 w-3.5 rounded-full shrink-0 ring-2 ring-white/50"
                style={{ backgroundColor: focusedPoint.color }}
              />
              <span>{focusedPoint.name}</span>
            </span>
            <span className="text-slate-300 text-xs sm:text-sm">
              {isCategoryMode ? "合算時価総額:" : "時価総額:"}{" "}
              <strong className="font-mono text-base sm:text-xl font-black text-white">
                {formatMarketCapOku(focusedPoint.marketCapOku, 2)}
              </strong>
            </span>
            <span className="text-slate-300 text-xs sm:text-sm">
              {isCategoryMode ? "品目平均伸び率:" : "期間伸び率:"}{" "}
              <strong
                className={`font-mono text-base sm:text-xl font-black ${
                  focusedPoint.changePercent >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {focusedPoint.changePercent >= 0 ? "▲ +" : "▼ "}
                {focusedPoint.changePercent.toFixed(2)}%
              </strong>
            </span>
            <span className="text-slate-400 text-xs sm:text-sm">
              期間増減:{" "}
              <strong
                className={`font-mono font-bold ${
                  focusedPoint.changeOku >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {formatSignedMarketCapOku(focusedPoint.changeOku, 1)}
              </strong>
            </span>
            {focusedPoint.price !== null && (
              <span className="text-slate-400 text-xs sm:text-sm">
                株価:{" "}
                <strong className="font-mono font-bold text-slate-200">
                  {focusedPoint.price.toLocaleString()}円
                </strong>
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between w-full text-xs text-slate-400">
            <span>
              💡 折れ線グラフのデータポイントにマウスを合わせると、選択中の単一データを大きく表示します
            </span>
            <span className="font-mono text-slate-500">
              期間: {currentTimeframeObj.label}
            </span>
          </div>
        )}
      </div>

      {/* ================= 4. 主役：大型折れ線グラフSVG本体（overflow-hiddenを外しピーク部分の見切れを完全防止） ================= */}
      <div className="relative rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-950 shadow-inner">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-slate-950/60 backdrop-blur-[2px]">
            <div className="flex items-center gap-2.5 rounded-full border border-sky-500/30 bg-slate-900/95 px-4 py-2 text-xs font-medium text-sky-300 shadow-lg">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              比較データを同期中...
            </div>
          </div>
        )}

        {/* 選択されている単一データポイントの正円マーカー（縦横比に依存せず常に真円＆ピークでも絶対に見切れない） */}
        {hoverIndex !== null && focusedPoint && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{
              left: `${(focusedPoint.xSvg / width) * 100}%`,
              top: `${(focusedPoint.ySvg / height) * 100}%`,
            }}
          >
            <span
              className="absolute h-8 w-8 rounded-full opacity-35"
              style={{ backgroundColor: focusedPoint.color }}
            />
            <span
              className="relative h-4 w-4 rounded-full border-[2.5px] border-white shadow-lg"
              style={{ backgroundColor: focusedPoint.color }}
            />
          </div>
        )}

        {/* ホバー時に「選択されている単一の企業（または単一の品目）」だけを表示する「横長（ワイド＆スリム）」ツールチップ */}
        {hoverIndex !== null &&
          focusedPoint &&
          (() => {
            const leftPct = (focusedPoint.xSvg / width) * 100;
            const topPct = (focusedPoint.ySvg / height) * 100;
            // 上半分（ピーク付近）では必ずデータポイントの「下側」に配置し、上部が隠れるのを100%防止
            const placeBelow = topPct < 48;
            const horizTranslate =
              leftPct < 28
                ? "12px"
                : leftPct > 72
                ? "calc(-100% - 12px)"
                : "-50%";
            const vertTranslate = placeBelow ? "20px" : "calc(-100% - 20px)";

            return (
              <div
                className="pointer-events-none absolute z-30 rounded-xl border-2 bg-slate-900/95 px-4 py-2.5 shadow-2xl backdrop-blur-md whitespace-nowrap"
                style={{
                  borderColor: focusedPoint.color,
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  transform: `translate(${horizTranslate}, ${vertTranslate})`,
                }}
              >
                {/* 1段目：単一企業名（大きめ太字） ＆ 日付バッジ（横並びスリムヘッダー） */}
                <div className="flex items-center justify-between gap-5 border-b border-slate-700/90 pb-1.5 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 rounded-full shrink-0 ring-2 ring-white/70"
                      style={{ backgroundColor: focusedPoint.color }}
                    />
                    <span className="text-sm sm:text-base font-black text-white leading-tight">
                      {focusedPoint.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-sky-300 bg-slate-800/90 px-2 py-0.5 rounded">
                    📅 {focusedPoint.dateLabel}
                  </span>
                </div>

                {/* 2段目：時価総額・伸び率・増減/株価を横長1列に配置（高さを抑えてピーク見切れを完全防止） */}
                <div className="flex items-baseline gap-4">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 mr-1.5">
                      {isCategoryMode ? "合算時価総額" : "時価総額"}
                    </span>
                    <span className="font-mono text-lg sm:text-xl font-black text-white">
                      {formatMarketCapOku(focusedPoint.marketCapOku, 2)}
                    </span>
                  </div>

                  <div className="border-l border-slate-700/80 pl-3.5">
                    <span className="text-[11px] font-semibold text-slate-400 mr-1.5">
                      {isCategoryMode ? "平均伸び率" : "期間伸び率"}
                    </span>
                    <span
                      className={`font-mono text-lg sm:text-xl font-black ${
                        focusedPoint.changePercent >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {focusedPoint.changePercent >= 0 ? "▲+" : "▼"}
                      {focusedPoint.changePercent.toFixed(2)}%
                    </span>
                  </div>

                  <div className="hidden sm:block border-l border-slate-700/80 pl-3.5 text-xs">
                    <span className="text-slate-400 mr-1">
                      {focusedPoint.price !== null ? "増減/株価:" : "増減額:"}
                    </span>
                    <span className="font-mono font-bold text-slate-200">
                      {formatSignedMarketCapOku(focusedPoint.changeOku, 1)}
                      {focusedPoint.price !== null
                        ? ` / ${focusedPoint.price.toLocaleString()}円`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

        {(isCategoryMode && activeCategorySeries.length === 0) ||
        (!isCategoryMode && seriesList.length === 0) ? (
          <div className="flex h-[420px] flex-col items-center justify-center gap-3 p-6 text-center">
            <GitCompare className="h-10 w-10 text-slate-600" />
            <div className="text-sm font-bold text-slate-300">
              {isCategoryMode
                ? "比較する生産品目が選択されていません"
                : "比較する企業が選択されていません"}
            </div>
            <button
              onClick={() =>
                isCategoryMode
                  ? onSetCategoryIds([
                      "auto",
                      "ship",
                      "aircraft",
                      "semicon",
                      "machinetool",
                    ])
                  : onSetCodes(["7203", "7267"])
              }
              className="mt-1 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition cursor-pointer"
            >
              {isCategoryMode
                ? "主要5品目（自動車・船・飛行機・半導体・工作機械）を表示"
                : "トヨタ自動車 × 本田技研工業 をプロット"}
            </button>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className={`${svgHeightClass} w-full block rounded-2xl cursor-crosshair transition-[height] duration-200`}
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
          >
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
                  {formatYTick(t.value)}
                </text>
              </g>
            ))}

            {metricMode === "changePercent" &&
              bounds.minVal < 0 &&
              bounds.maxVal > 0 && (
                <line
                  x1={padLeft}
                  y1={getY(0)}
                  x2={width - padRight}
                  y2={getY(0)}
                  stroke="#64748b"
                  strokeWidth="1.2"
                  strokeDasharray="6 4"
                />
              )}

            {isCategoryMode
              ? activeCategorySeries.map((cat) => {
                  const isFocused = focusedPoint?.id === cat.categoryId;
                  const isDimmed =
                    focusedPoint !== null && !isFocused;
                  return (
                    <path
                      key={cat.categoryId}
                      d={buildCategoryPolyline(cat.points)}
                      fill="none"
                      stroke={cat.color}
                      strokeWidth={isFocused ? "4.0" : "2.5"}
                      strokeOpacity={isDimmed ? 0.45 : 1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })
              : seriesList.map((s) => {
                  const isFocused = focusedPoint?.id === s.code;
                  const isDimmed =
                    focusedPoint !== null && !isFocused;
                  return (
                    <path
                      key={s.code}
                      d={buildCompanyPolyline(s.data.points)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={isFocused ? "4.0" : "2.5"}
                      strokeOpacity={isDimmed ? 0.45 : 1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}

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

            {/* 選択されている単一データポイントのクロスヘアライン（正円ドットはHTMLオーバーレイ側で歪みなく描画） */}
            {hoverIndex !== null && focusedPoint && (
              <g>
                <line
                  x1={focusedPoint.xSvg}
                  y1={padTop}
                  x2={focusedPoint.xSvg}
                  y2={plotBottom}
                  stroke="#cbd5e1"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                />
                <line
                  x1={padLeft}
                  y1={focusedPoint.ySvg}
                  x2={width - padRight}
                  y2={focusedPoint.ySvg}
                  stroke="#cbd5e1"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                />
              </g>
            )}
          </svg>
        )}
      </div>

      {/* ================= 5. 下部サマリー＆ドリルダウン表（▼/▲ で表示・非表示を制御可能） ================= */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 overflow-hidden">
        <button
          onClick={() => setIsSummaryTableOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-900/80 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-sky-400" />
            <span>
              {isCategoryMode
                ? `生産品目 比較サマリー＆銘柄ドリルダウン表 (${activeCategorySeries.length}品目)`
                : `比較銘柄 数値サマリー表 (${seriesList.length}社)`}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <span>{isSummaryTableOpen ? "表を折りたたむ" : "表を展開する"}</span>
            {isSummaryTableOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </button>

        {isSummaryTableOpen &&
          (isCategoryMode ? (
            <div className="overflow-x-auto border-t border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="py-2.5 px-3.5">生産品目カテゴリ</th>
                    <th className="py-2.5 px-3">景気サイクル・動く要因</th>
                    <th className="py-2.5 px-3 text-right">
                      品目平均伸び率 ({currentTimeframeObj.shortLabel})
                    </th>
                    <th className="py-2.5 px-3 text-right">品目合算時価総額</th>
                    <th className="py-2.5 px-3">牽引トップ銘柄</th>
                    <th className="py-2.5 px-3.5 text-right">
                      深掘りドリルダウン
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeCategorySeries.map((cat) => {
                    const isUp = cat.avgPeriodChangePercent >= 0;
                    const matchingScId = findMatchingSupplyChainId(
                      cat.categoryId
                    );

                    return (
                      <tr
                        key={cat.categoryId}
                        className="hover:bg-slate-900/70 transition"
                      >
                        <td className="py-2.5 px-3.5 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span>{cat.name}</span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                              {cat.companyCount}社
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">
                          {cat.cycleType}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono text-sm font-extrabold ${
                            isUp ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isUp ? "▲ +" : "▼ "}
                          {cat.avgPeriodChangePercent.toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                          <div>
                            {formatMarketCapOku(
                              cat.latestTotalMarketCapOku,
                              1
                            )}
                          </div>
                          <div
                            className={`text-[10px] ${
                              cat.periodChangeMarketCapOku >= 0
                                ? "text-emerald-400/80"
                                : "text-rose-400/80"
                            }`}
                          >
                            (
                            {formatSignedMarketCapOku(
                              cat.periodChangeMarketCapOku,
                              1
                            )}
                            )
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() =>
                              onSelectPrimaryCode(cat.topDriver.code)
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] hover:border-emerald-500/40 cursor-pointer"
                            title="クリックで個別チャートを表示"
                          >
                            <span className="font-bold text-slate-200">
                              {cat.topDriver.nameJa}
                            </span>
                            <span
                              className={`font-mono font-bold ${
                                cat.topDriver.growthPercent >= 0
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {cat.topDriver.growthPercent >= 0 ? "+" : ""}
                              {cat.topDriver.growthPercent.toFixed(1)}%
                            </span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                onChangeLensMode("custom_company");
                                onSetCodes(cat.codes);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/25 transition cursor-pointer"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>構成{cat.companyCount}社を比較</span>
                            </button>
                            {matchingScId && (
                              <button
                                onClick={() => {
                                  const sc = SUPPLY_CHAIN_PRESETS.find(
                                    (p) => p.id === matchingScId
                                  );
                                  if (sc) {
                                    setActiveSupplyChainId(sc.id);
                                    onChangeLensMode("supply_chain");
                                    onSetCodes(sc.codes);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/15 px-2 py-1 text-[11px] font-bold text-purple-300 hover:bg-purple-500/25 transition cursor-pointer"
                                title="この品目の川上〜川下サプライチェーンを比較"
                              >
                                <span>🔗 川上〜川下</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            seriesList.length > 0 && (
              <div className="overflow-x-auto border-t border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                      <th className="py-2.5 px-3.5">銘柄</th>
                      <th className="py-2.5 px-3">
                        {lensMode === "supply_chain"
                          ? "サプライチェーン工程・役割"
                          : lensMode === "niche_top"
                          ? "世界シェア独占・強み"
                          : "業種 / 主力品目"}
                      </th>
                      <th className="py-2.5 px-3 text-right">開始時価総額</th>
                      <th className="py-2.5 px-3 text-right">現在時価総額</th>
                      <th className="py-2.5 px-3 text-right">
                        期間変動額 ({currentTimeframeObj.shortLabel})
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        時価総額伸び率 ({currentTimeframeObj.shortLabel})
                      </th>
                      <th className="py-2.5 px-3 text-right">現在株価</th>
                      <th className="py-2.5 px-3.5 text-right">
                        PER / PBR / 営業利益率
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {seriesList.map((s) => {
                      const comp = getCompanyByCode(s.code);
                      const meta = s.data.meta;
                      const isUp = meta.periodMarketCapChangePercent >= 0;
                      const scInfo = activeSupplyChainPreset.stageMap[s.code];
                      const nicheBadge =
                        activeNicheTopPreset.shareBadges[s.code];

                      return (
                        <tr
                          key={s.code}
                          onClick={() => onSelectPrimaryCode(s.code)}
                          className="hover:bg-slate-900/70 transition cursor-pointer"
                          title="クリックして個別推移を表示"
                        >
                          <td className="py-2.5 px-3.5 font-bold text-white">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: s.color }}
                              />
                              <span className="font-mono text-slate-400">
                                {s.code}
                              </span>
                              <span className="hover:text-emerald-300">
                                {s.nameJa}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {lensMode === "supply_chain" && scInfo ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${getStageBadgeStyle(
                                    scInfo.stage
                                  )}`}
                                >
                                  {scInfo.stage.split(" ")[0]}
                                </span>
                                <span className="text-slate-300 text-[11px]">
                                  {scInfo.role}
                                </span>
                              </div>
                            ) : lensMode === "niche_top" && nicheBadge ? (
                              <span className="inline-block rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                                👑 {nicheBadge}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                {s.sector}
                                {comp ? ` / ${comp.subCategory}` : ""}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {formatMarketCapOku(meta.startMarketCapOku, 2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                            {formatMarketCapOku(meta.latestMarketCapOku, 2)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-semibold ${
                              isUp ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {formatSignedMarketCapOku(
                              meta.periodMarketCapChangeOku,
                              2
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold ${
                              isUp ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {isUp ? "▲ +" : "▼ "}
                            {meta.periodMarketCapChangePercent.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                            {meta.latestPrice.toLocaleString()}円
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-mono text-[11px] text-slate-300">
                            {comp
                              ? `${comp.per.toFixed(1)}倍 / ${comp.pbr.toFixed(
                                  2
                                )}倍 / 利益率${comp.operatingMargin.toFixed(
                                  1
                                )}%`
                              : "---"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ))}
      </div>
    </div>
  );
}
