"use client";

import React, { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  AlertTriangle,
  Plus,
  Check,
  GitCompare,
} from "lucide-react";
import { MarketCapRankingItem } from "@/app/api/stock/route";
import {
  MANUFACTURING_SECTORS,
  ManufacturingSector,
  TIMEFRAMES,
  TimeframeKey,
  formatMarketCapOku,
  formatSignedMarketCapOku,
} from "@/data/companies";

interface MarketCapRankingProps {
  items: MarketCapRankingItem[];
  selectedRange: TimeframeKey;
  selectedSector: ManufacturingSector | "ALL";
  selectedCode: string;
  compareCodes: string[];
  onSelectCompany: (code: string) => void;
  onToggleCompareCode: (code: string) => void;
  onSetCompareCodes: (codes: string[]) => void;
  isLoading: boolean;
}

export default function MarketCapRanking({
  items,
  selectedRange,
  selectedSector,
  selectedCode,
  compareCodes,
  onSelectCompany,
  onToggleCompareCode,
  onSetCompareCodes,
  isLoading,
}: MarketCapRankingProps) {
  const currentTimeframeObj =
    TIMEFRAMES.find((t) => t.key === selectedRange) ?? TIMEFRAMES[5];

  // 左ペインの業種フィルタと自動連動
  const targetItems = useMemo(() => {
    if (selectedSector !== "ALL") {
      return items.filter((item) => item.sector === selectedSector);
    }
    return items;
  }, [items, selectedSector]);

  // 伸び率 Top 20社（降順）
  const top20List = useMemo(() => {
    return [...targetItems]
      .sort((a, b) => b.growthPercent - a.growthPercent)
      .slice(0, 20);
  }, [targetItems]);

  // 伸び率 ワースト 20社（昇順）
  const worst20List = useMemo(() => {
    return [...targetItems]
      .sort((a, b) => a.growthPercent - b.growthPercent)
      .slice(0, 20);
  }, [targetItems]);

  // バーグラフの最大幅計算用
  const maxAbsGrowth = useMemo(() => {
    if (targetItems.length === 0) return 10;
    return Math.max(5, ...targetItems.map((i) => Math.abs(i.growthPercent)));
  }, [targetItems]);

  const renderRankingTable = (
    list: MarketCapRankingItem[],
    type: "top" | "worst"
  ) => {
    const isTop = type === "top";
    return (
      <div
        className={`flex flex-col rounded-2xl border ${
          isTop
            ? "border-emerald-500/30 bg-slate-950/80"
            : "border-rose-500/30 bg-slate-950/80"
        } overflow-hidden`}
      >
        {/* カラムヘッダー */}
        <div
          className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${
            isTop
              ? "border-emerald-500/20 bg-emerald-500/10"
              : "border-rose-500/20 bg-rose-500/10"
          }`}
        >
          <div className="flex items-center gap-2">
            {isTop ? (
              <Trophy className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            <h3 className="text-sm font-extrabold text-white">
              {isTop
                ? `時価総額 伸び率 Top ${list.length}社`
                : `時価総額 伸び率 ワースト ${list.length}社`}
            </h3>
          </div>

          {list.length >= 2 && (
            <button
              onClick={() =>
                onSetCompareCodes(list.slice(0, 4).map((i) => i.code))
              }
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                isTop
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  : "border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
              }`}
            >
              <GitCompare className="h-3 w-3" />
              <span>{isTop ? "Top4社を比較" : "ワースト4社を比較"}</span>
            </button>
          )}
        </div>

        {/* テーブルヘッダー */}
        <div className="grid grid-cols-12 items-center border-b border-slate-800/80 bg-slate-900/70 px-3 py-2 text-[11px] font-semibold text-slate-400">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-5">銘柄 / 業種</div>
          <div className="col-span-3 text-right">現在時価総額</div>
          <div className="col-span-2 text-right">伸び率 (増減)</div>
          <div className="col-span-1 text-center">比較</div>
        </div>

        {/* ランキングリスト（20社） */}
        <div className="divide-y divide-slate-800/60 max-h-[640px] overflow-y-auto">
          {list.map((item, idx) => {
            const rank = idx + 1;
            const isSelected = item.code === selectedCode;
            const isCompared = compareCodes.includes(item.code);
            const isPositive = item.growthPercent >= 0;
            const barRatio = Math.min(
              100,
              Math.round((Math.abs(item.growthPercent) / maxAbsGrowth) * 100)
            );
            const sectorMeta = MANUFACTURING_SECTORS.find(
              (s) => s.name === item.sector
            );

            return (
              <div
                key={item.code}
                onClick={() => onSelectCompany(item.code)}
                className={`group relative grid grid-cols-12 items-center gap-1 px-3 py-2.5 text-xs transition cursor-pointer ${
                  isSelected
                    ? "bg-emerald-500/15"
                    : "hover:bg-slate-900/90"
                }`}
              >
                {/* 背景バーゲージ演出 */}
                <div
                  className={`pointer-events-none absolute inset-y-0 right-0 opacity-10 ${
                    isPositive ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${barRatio * 0.45}%` }}
                />

                {/* 順位 */}
                <div className="col-span-1 flex justify-center">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-extrabold ${
                      rank === 1
                        ? isTop
                          ? "bg-amber-400 text-slate-950"
                          : "bg-rose-500 text-white"
                        : rank === 2
                        ? "bg-slate-300 text-slate-950"
                        : rank === 3
                        ? "bg-amber-700 text-white"
                        : "text-slate-400"
                    }`}
                  >
                    {rank}
                  </span>
                </div>

                {/* 銘柄コード・企業名・業種 */}
                <div className="col-span-5 min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-slate-400">
                      {item.code}
                    </span>
                    <span
                      className={`truncate rounded border px-1.5 py-0.2 text-[9px] font-medium ${
                        sectorMeta?.badgeClass ??
                        "border-slate-700 bg-slate-800 text-slate-300"
                      }`}
                    >
                      {item.sector}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-bold text-slate-100 group-hover:text-emerald-300">
                    {item.nameJa}
                  </div>
                </div>

                {/* 開始時価総額 → 現在時価総額 */}
                <div className="col-span-3 text-right font-mono">
                  <div className="text-xs font-bold text-white">
                    {formatMarketCapOku(item.latestMarketCapOku, 2)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    開始: {formatMarketCapOku(item.startMarketCapOku, 1)}
                  </div>
                </div>

                {/* 伸び率(%) ＆ 変動額 */}
                <div className="col-span-2 text-right font-mono">
                  <div
                    className={`inline-flex items-center gap-0.5 font-extrabold ${
                      isPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="h-3 w-3 shrink-0" />
                    ) : (
                      <TrendingDown className="h-3 w-3 shrink-0" />
                    )}
                    <span>
                      {isPositive ? "+" : ""}
                      {item.growthPercent.toFixed(2)}%
                    </span>
                  </div>
                  <div
                    className={`text-[10px] ${
                      isPositive ? "text-emerald-400/80" : "text-rose-400/80"
                    }`}
                  >
                    {formatSignedMarketCapOku(item.changeMarketCapOku, 1)}
                  </div>
                </div>

                {/* 比較チャート追加/解除アイコンボタン */}
                <div className="col-span-1 flex justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCompareCode(item.code);
                    }}
                    className={`flex h-6 w-6 items-center justify-center rounded-md border transition cursor-pointer ${
                      isCompared
                        ? "border-sky-400 bg-sky-500/25 text-sky-300"
                        : "border-slate-800 bg-slate-900 text-slate-500 hover:border-sky-500/50 hover:text-sky-300"
                    }`}
                    title={
                      isCompared
                        ? "比較対象から外す"
                        : "比較対象に追加"
                    }
                  >
                    {isCompared ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-4 sm:p-5 shadow-xl">
      {/* シンプルなヘッダー（余計な切替ボタンを撤去） */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              時価総額 伸び率ランキング
            </h2>
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-300">
              {currentTimeframeObj.label} /{" "}
              {selectedSector === "ALL" ? "全16業種" : selectedSector}（
              {targetItems.length}社）
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            行クリックで個別推移を表示、右端の「＋」で比較チャートへ追加できます
          </p>
        </div>
      </div>

      {/* ランキング本体（Top 20社 & ワースト 20社 2カラム並列） */}
      <div className="mt-4">
        {isLoading && items.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-xs text-slate-400">
            時価総額伸び率ランキングを集計中...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {renderRankingTable(top20List, "top")}
            {renderRankingTable(worst20List, "worst")}
          </div>
        )}
      </div>
    </div>
  );
}
