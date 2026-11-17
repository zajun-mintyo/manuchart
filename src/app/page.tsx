"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  RefreshCw,
  Search,
  Star,
  LineChart,
  GitCompare,
  Building2,
  CheckCircle2,
  Clock,
  Activity,
  BarChart3,
  Award,
  X,
  Plus,
  Check,
  Trophy,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  PRIME_MANUFACTURING_COMPANIES,
  MANUFACTURING_SECTORS,
  PRODUCT_CATEGORIES,
  ProductCategoryId,
  TIMEFRAMES,
  ManufacturingSector,
  TimeframeKey,
  SavedComparisonView,
  getCompanyByCode,
  formatMarketCapOku,
  formatSignedMarketCapOku,
} from "@/data/companies";
import StockChart, {
  ChartMode,
  MarketCapAxisMode,
  ChartHeightSize,
} from "@/components/StockChart";
import ComparisonChart, {
  ComparisonCompanySeries,
  ComparisonLensMode,
  COMPARE_PALETTE,
} from "@/components/ComparisonChart";
import MarketCapRanking from "@/components/MarketCapRanking";
import {
  StockApiResponse,
  MarketCapRankingItem,
  MarketCapRankingResponse,
  CategoryIndexSeries,
  CategoryIndexResponse,
} from "@/app/api/stock/route";
import {
  generateInstantStockData,
  buildInstantCategoryIndices,
  buildInstantRankingItems,
} from "@/data/instantChartEngine";

// メイン画面の3つのビュータブ
type MainViewTab = "individual" | "comparison" | "ranking";

type SortKey =
  | "marketCap"
  | "periodGrowthDesc"
  | "periodGrowthAsc"
  | "changePercent"
  | "dividendYield"
  | "code";

const DEFAULT_SAVED_VIEWS: SavedComparisonView[] = [
  {
    id: "default-toyota-honda",
    name: "トヨタ × ホンダ 時価総額比較",
    codes: ["7203", "7267"],
    range: "1Y",
    metricMode: "actual",
    createdAt: "2026-11-05T00:00:00.000Z",
    version: "1.0",
  },
  {
    id: "default-auto-4",
    name: "完成車メーカー4社（実額）",
    codes: ["7203", "7267", "7269", "7270"],
    range: "1Y",
    metricMode: "actual",
    createdAt: "2026-11-05T00:00:00.000Z",
    version: "1.0",
  },
  {
    id: "default-semicon-growth",
    name: "半導体装置3強（伸び率%）",
    codes: ["8035", "6857", "6146"],
    range: "1Y",
    metricMode: "changePercent",
    createdAt: "2026-11-05T00:00:00.000Z",
    version: "1.0",
  },
];

export default function ManuChartPage() {
  // メイン画面の選択タブ（初期値: "individual" = 個別推移）
  const [activeMainTab, setActiveMainTab] = useState<MainViewTab>("individual");

  // 選択中の個別銘柄コード（初期値: 7203 トヨタ自動車）
  const [selectedCode, setSelectedCode] = useState<string>("7203");
  // 選択中の時間軸（9段階、初期値: '1Y'）
  const [selectedRange, setSelectedRange] = useState<TimeframeKey>("1Y");
  // 業種・生産品目・ウォッチリストフィルター（"ALL" | "WATCHLIST" | "CAT:<id>" | ManufacturingSector）
  const [sectorFilter, setSectorFilter] = useState<
    ManufacturingSector | `CAT:${ProductCategoryId}` | "ALL" | "WATCHLIST"
  >("ALL");
  // 検索クエリ
  const [searchQuery, setSearchQuery] = useState<string>("");
  // 並び順（初期値: 時価総額順）
  const [sortBy, setSortBy] = useState<SortKey>("marketCap");

  // 個別チャート表示モード（デフォルト: "marketCap" = 時価総額の変動と推移）
  const [chartMode, setChartMode] = useState<ChartMode>("marketCap");
  // 個別チャート（時価総額折れ線）のY軸モード（デフォルト: "actual" = 実額 兆円/億円）
  const [marketCapAxisMode, setMarketCapAxisMode] =
    useState<MarketCapAxisMode>("actual");

  // 移動平均線の表示ON/OFF（表示設定メニュー内に収納）
  const [showSmaShort, setShowSmaShort] = useState<boolean>(false);
  const [showSmaMid, setShowSmaMid] = useState<boolean>(false);
  const [showSmaLong, setShowSmaLong] = useState<boolean>(false);
  const [isChartSettingsOpen, setIsChartSettingsOpen] =
    useState<boolean>(false);
  const chartSettingsRef = useRef<HTMLDivElement | null>(null);

  // ================= 可視化領域（キャンバス広さ）コントロール用ステート =================
  // 左サイドバー（銘柄一覧）の表示・非表示
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  // 左サイドバー内の検索・フィルタパネルの表示・非表示
  const [isSidebarFilterOpen, setIsSidebarFilterOpen] = useState<boolean>(true);
  // 折れ線グラフの縦サイズ（"normal" | "large" | "xlarge"、デフォルトは大きく見やすい "large"）
  const [chartSize, setChartSize] = useState<ChartHeightSize>("large");
  // 個別推移タブの下部ファンダメンタル指標・企業解説パネルの表示・非表示
  const [isFundamentalsOpen, setIsFundamentalsOpen] = useState<boolean>(true);

  // グラフ集中モード（左リストと下部パネルを閉じ、グラフを特大表示している状態か）
  const isFocusMode =
    !isSidebarOpen && chartSize === "xlarge" && !isFundamentalsOpen;

  const toggleFocusMode = () => {
    if (isFocusMode) {
      setIsSidebarOpen(true);
      setChartSize("large");
      setIsFundamentalsOpen(true);
    } else {
      setIsSidebarOpen(false);
      setChartSize("xlarge");
      setIsFundamentalsOpen(false);
    }
  };

  // ================= 企業・品目比較チャート用ステート =================
  // 比較レンズモード（初期値: "product_index" = 🏭 10大生産品目 比較）
  const [comparisonLensMode, setComparisonLensMode] =
    useState<ComparisonLensMode>("product_index");
  // 選択中の生産品目IDリスト（初期値: 自動車・船・飛行機・半導体・工作機械の5大品目）
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<
    ProductCategoryId[]
  >(["auto", "ship", "aircraft", "semicon", "machinetool"]);
  // 生産品目インデックス時系列データ（APIから最新値が返ってきた場合の上書き用）
  const [apiCategorySeriesList, setApiCategorySeriesList] = useState<
    CategoryIndexSeries[] | null
  >(null);
  // 比較対象銘柄コードリスト（初期値: トヨタ自動車 7203 と 本田技研工業 7267）
  const [compareCodes, setCompareCodes] = useState<string[]>(["7203", "7267"]);
  // 比較チャートのY軸モード（品目比較がデフォルトのため初期値: "changePercent" = 変動率%）
  const [compareMetricMode, setCompareMetricMode] =
    useState<MarketCapAxisMode>("changePercent");
  // 保存済み比較ビュー一覧（LocalStorage連携）
  const [savedViews, setSavedViews] =
    useState<SavedComparisonView[]>(DEFAULT_SAVED_VIEWS);

  // ウォッチリスト（LocalStorage連携）
  const [watchlist, setWatchlist] = useState<string[]>([
    "7203",
    "7267",
    "6501",
    "8035",
    "7011",
  ]);

  // API取得データ状態（0秒即時描画エンジンをベースにし、API応答時にシームレス更新）
  const [apiPrimaryData, setApiPrimaryData] = useState<StockApiResponse | null>(
    null
  );
  const [compareDataMap, setCompareDataMap] = useState<
    Record<string, StockApiResponse>
  >({});
  const [apiRankingItems, setApiRankingItems] = useState<
    MarketCapRankingItem[] | null
  >(null);
  const [liveSnapshotMap, setLiveSnapshotMap] = useState<
    Record<
      string,
      {
        price: number;
        changePercent: number;
        marketCapOku: number;
        periodGrowthPercent: number;
      }
    >
  >({});

  // 0秒即時描画：API通信完了を待たずに常に即座にチャートを描画するデータ
  const primaryData = useMemo(() => {
    if (
      apiPrimaryData &&
      apiPrimaryData.code === selectedCode &&
      apiPrimaryData.range === selectedRange
    ) {
      return apiPrimaryData;
    }
    return generateInstantStockData(selectedCode, selectedRange);
  }, [apiPrimaryData, selectedCode, selectedRange]);

  const categorySeriesList = useMemo(() => {
    if (apiCategorySeriesList && apiCategorySeriesList.length > 0) {
      return apiCategorySeriesList;
    }
    return buildInstantCategoryIndices(selectedRange, compareDataMap);
  }, [apiCategorySeriesList, selectedRange, compareDataMap]);

  const rankingItems = useMemo(() => {
    if (apiRankingItems && apiRankingItems.length > 0) {
      return apiRankingItems;
    }
    return buildInstantRankingItems(selectedRange, compareDataMap);
  }, [apiRankingItems, selectedRange, compareDataMap]);

  const [isLoadingPrimary, setIsLoadingPrimary] = useState<boolean>(false);
  const [isLoadingCompare, setIsLoadingCompare] = useState<boolean>(false);
  const [isLoadingRanking, setIsLoadingRanking] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdatedText, setLastUpdatedText] = useState<string>("--:--:--");
  const [priceFlash, setPriceFlash] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 外側クリックで「表示設定」ポップオーバーを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        chartSettingsRef.current &&
        !chartSettingsRef.current.contains(e.target as Node)
      ) {
        setIsChartSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // LocalStorageからの復元
  useEffect(() => {
    try {
      const savedWatch = localStorage.getItem("manuchart_watchlist");
      if (savedWatch) {
        const parsed = JSON.parse(savedWatch);
        if (Array.isArray(parsed)) setWatchlist(parsed);
      }
      const savedComparisonViews = localStorage.getItem(
        "manuchart_saved_views"
      );
      if (savedComparisonViews) {
        const parsedViews = JSON.parse(savedComparisonViews);
        if (Array.isArray(parsedViews) && parsedViews.length > 0) {
          setSavedViews(parsedViews);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const toggleWatchlist = (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setWatchlist((prev) => {
      const next = prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code];
      try {
        localStorage.setItem("manuchart_watchlist", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // 現在選択中の銘柄情報
  const selectedCompany = useMemo(
    () =>
      getCompanyByCode(selectedCode) ?? PRIME_MANUFACTURING_COMPANIES[0],
    [selectedCode]
  );

  // 手動更新のたびにインクリメントするシーケンス番号
  const refreshTickRef = useRef<number>(0);

  // 個別銘柄データの取得
  const fetchPrimaryStock = useCallback(
    async (
      code: string,
      range: TimeframeKey,
      forceRefresh = false,
      tick = 0
    ): Promise<StockApiResponse | null> => {
      if (!forceRefresh) {
        setIsLoadingPrimary(true);
      }

      try {
        const res = await fetch(
          `/api/stock?code=${encodeURIComponent(code)}&range=${encodeURIComponent(
            range
          )}&refresh=${forceRefresh ? "1" : "0"}&force=${
            forceRefresh ? "true" : "false"
          }&tick=${tick}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: StockApiResponse = await res.json();
        setApiPrimaryData(data);

        setLiveSnapshotMap((prev) => ({
          ...prev,
          [code]: {
            price: data.meta.latestPrice,
            changePercent: data.meta.changePercent,
            marketCapOku: data.meta.latestMarketCapOku,
            periodGrowthPercent: data.meta.periodMarketCapChangePercent,
          },
        }));

        const d = new Date(data.fetchedAt || Date.now());
        setLastUpdatedText(
          d.toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
        return data;
      } catch (err) {
        console.error("Failed to fetch stock data:", err);
        return null;
      } finally {
        setIsLoadingPrimary(false);
      }
    },
    []
  );

  // 比較対象銘柄群のデータを並行取得
  const fetchCompareStocks = useCallback(
    async (
      codes: string[],
      range: TimeframeKey,
      forceRefresh = false,
      tick = 0
    ): Promise<Record<string, StockApiResponse>> => {
      if (codes.length === 0) {
        setCompareDataMap({});
        return {};
      }
      setIsLoadingCompare(true);
      try {
        const results = await Promise.all(
          codes.map(async (c) => {
            const res = await fetch(
              `/api/stock?code=${encodeURIComponent(
                c
              )}&range=${encodeURIComponent(range)}&refresh=${
                forceRefresh ? "1" : "0"
              }&force=${forceRefresh ? "true" : "false"}&tick=${tick}&_t=${Date.now()}`,
              { cache: "no-store" }
            );
            if (!res.ok) return null;
            const json: StockApiResponse = await res.json();
            return { code: c, data: json };
          })
        );
        const nextMap: Record<string, StockApiResponse> = {};
        results.forEach((item) => {
          if (item) {
            nextMap[item.code] = item.data;
          }
        });
        setCompareDataMap(nextMap);
        setLiveSnapshotMap((prev) => {
          const next = { ...prev };
          for (const item of results) {
            if (item) {
              next[item.code] = {
                price: item.data.meta.latestPrice,
                changePercent: item.data.meta.changePercent,
                marketCapOku: item.data.meta.latestMarketCapOku,
                periodGrowthPercent: item.data.meta.periodMarketCapChangePercent,
              };
            }
          }
          return next;
        });
        return nextMap;
      } catch (err) {
        console.error("Failed to fetch comparison stocks:", err);
        return {};
      } finally {
        setIsLoadingCompare(false);
      }
    },
    []
  );

  // 選択中の時間軸における全銘柄「時価総額の伸び率ランキング」取得
  const fetchMarketCapRanking = useCallback(
    async (range: TimeframeKey, forceRefresh = false, tick = 0) => {
      setIsLoadingRanking(true);
      try {
        const res = await fetch(
          `/api/stock?mode=ranking&range=${encodeURIComponent(
            range
          )}&refresh=${forceRefresh ? "1" : "0"}&force=${
            forceRefresh ? "true" : "false"
          }&tick=${tick}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: MarketCapRankingResponse = await res.json();
        setApiRankingItems(data.items);

        setLiveSnapshotMap((prev) => {
          const next = { ...prev };
          for (const item of data.items) {
            next[item.code] = {
              price: item.latestPrice,
              changePercent: item.dayChangePercent,
              marketCapOku: item.latestMarketCapOku,
              periodGrowthPercent: item.growthPercent,
            };
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to fetch market cap ranking:", err);
      } finally {
        setIsLoadingRanking(false);
      }
    },
    []
  );

  // 20大生産品目インデックス時系列データの取得
  const fetchCategoryIndices = useCallback(
    async (range: TimeframeKey, forceRefresh = false, tick = 0) => {
      try {
        const res = await fetch(
          `/api/stock?mode=category_index&range=${encodeURIComponent(
            range
          )}&refresh=${forceRefresh ? "1" : "0"}&force=${
            forceRefresh ? "true" : "false"
          }&tick=${tick}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: CategoryIndexResponse = await res.json();
        setApiCategorySeriesList(data.categories);
      } catch (err) {
        console.error("Failed to fetch category indices:", err);
      }
    },
    []
  );

  // 銘柄・時間軸変更時の自動取得（個別・比較銘柄を先に取得してからランキング・品目インデックスへ反映）
  useEffect(() => {
    const tick = refreshTickRef.current;
    fetchPrimaryStock(selectedCode, selectedRange, false, tick).then(() => {
      fetchMarketCapRanking(selectedRange, false, tick);
      fetchCategoryIndices(selectedRange, false, tick);
    });
  }, [
    selectedCode,
    selectedRange,
    fetchPrimaryStock,
    fetchMarketCapRanking,
    fetchCategoryIndices,
  ]);

  useEffect(() => {
    const tick = refreshTickRef.current;
    fetchCompareStocks(compareCodes, selectedRange, false, tick);
  }, [compareCodes, selectedRange, fetchCompareStocks]);

  // 手動「更新」ボタンハンドラ
  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    refreshTickRef.current += 1;
    const nextTick = refreshTickRef.current;

    try {
      // 1. 個別選択銘柄＆比較対象銘柄を先にキャッシュ破棄で最新取得
      const [primaryRes] = await Promise.all([
        fetchPrimaryStock(selectedCode, selectedRange, true, nextTick),
        compareCodes.length > 0
          ? fetchCompareStocks(compareCodes, selectedRange, true, nextTick)
          : Promise.resolve({}),
      ]);

      // 2. 更新されたサーバーキャッシュ＆最新ティックで全銘柄ランキングと20大生産品目インデックスを更新
      await Promise.all([
        fetchMarketCapRanking(selectedRange, true, nextTick),
        fetchCategoryIndices(selectedRange, true, nextTick),
      ]);

      // 3. 個別銘柄の最新スナップショットが確実に優先されるよう再セット
      if (primaryRes) {
        setLiveSnapshotMap((prev) => ({
          ...prev,
          [selectedCode]: {
            price: primaryRes.meta.latestPrice,
            changePercent: primaryRes.meta.changePercent,
            marketCapOku: primaryRes.meta.latestMarketCapOku,
            periodGrowthPercent: primaryRes.meta.periodMarketCapChangePercent,
          },
        }));
      }

      const nowStr = new Date().toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setLastUpdatedText(nowStr);
      setPriceFlash(true);
      setTimeout(() => setPriceFlash(false), 700);

      showToast(
        `${selectedCompany.nameJa}（${selectedCode}）および全銘柄データを最新情報に更新しました（${nowStr}）`
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  // 生産品目の表示ON/OFFトグル
  const toggleCategoryId = (id: ProductCategoryId) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // ================= 比較対象企業の追加・削除・ビュー管理ハンドラ =================
  const addCompareCode = (code: string) => {
    setCompareCodes((prev) => {
      if (prev.includes(code)) return prev;
      if (prev.length >= 8) {
        showToast("比較チャートへの同時プロットは最大8社までです");
        return prev;
      }
      const comp = getCompanyByCode(code);
      showToast(
        `「${comp?.nameJa ?? code}」を比較対象に追加しました（${
          prev.length + 1
        }社）`
      );
      return [...prev, code];
    });
  };

  const removeCompareCode = (code: string) => {
    setCompareCodes((prev) => prev.filter((c) => c !== code));
  };

  const toggleCompareCode = (code: string) => {
    if (compareCodes.includes(code)) {
      removeCompareCode(code);
    } else {
      addCompareCode(code);
    }
  };

  const clearCompareCodes = () => {
    setCompareCodes([]);
    showToast("比較チャートの銘柄をすべてクリアしました");
  };

  const setCompareCodesBatch = (codes: string[], switchToCompare = false) => {
    const unique = Array.from(new Set(codes)).slice(0, 8);
    setCompareCodes(unique);
    if (unique.length > 0) {
      setSelectedCode(unique[0]);
    }
    if (switchToCompare) {
      setActiveMainTab("comparison");
    }
    showToast(`比較チャートに ${unique.length}社 をセットしました`);
  };

  // 比較ビューをブラウザ（LocalStorage）に保存
  const handleSaveView = (name: string) => {
    if (compareCodes.length === 0) return;
    const newView: SavedComparisonView = {
      id: `view_${Date.now()}`,
      name,
      codes: [...compareCodes],
      range: selectedRange,
      metricMode: compareMetricMode,
      createdAt: new Date().toISOString(),
      version: "1.0",
    };
    setSavedViews((prev) => {
      const next = [newView, ...prev];
      try {
        localStorage.setItem("manuchart_saved_views", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    showToast(`比較ビュー「${name}」を保存しました`);
  };

  // 保存済み比較ビューを削除
  const handleDeleteView = (id: string) => {
    setSavedViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      try {
        localStorage.setItem("manuchart_saved_views", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    showToast("保存済みビューを削除しました");
  };

  // 保存済み比較ビューを適用
  const handleApplyView = (view: SavedComparisonView) => {
    const validCodes = view.codes.filter((c) => Boolean(getCompanyByCode(c)));
    if (validCodes.length === 0) {
      showToast("有効な銘柄コードが含まれていません");
      return;
    }
    setCompareCodes(validCodes.slice(0, 8));
    setSelectedCode(validCodes[0]);
    if (view.range && TIMEFRAMES.some((t) => t.key === view.range)) {
      setSelectedRange(view.range);
    }
    if (view.metricMode === "actual" || view.metricMode === "changePercent") {
      setCompareMetricMode(view.metricMode);
    }
    showToast(`比較ビュー「${view.name}」を適用しました`);
  };

  // JSONファイルとして比較ビューを出力（エクスポート）
  const handleExportViewJson = (customName?: string) => {
    if (compareCodes.length === 0) return;
    const companyNames = compareCodes
      .map((c) => getCompanyByCode(c)?.nameJa.split("（")[0] ?? c)
      .join("×");
    const viewName = customName || `${companyNames} (${selectedRange})`;

    const exportPayload: SavedComparisonView & {
      companies: { code: string; nameJa: string; sector: string }[];
    } = {
      id: `export_${Date.now()}`,
      name: viewName,
      description: "ManuChart 企業比較チャート用ビュー設定ファイル",
      codes: [...compareCodes],
      range: selectedRange,
      metricMode: compareMetricMode,
      createdAt: new Date().toISOString(),
      version: "1.0",
      companies: compareCodes.map((c) => {
        const comp = getCompanyByCode(c);
        return {
          code: c,
          nameJa: comp?.nameJa ?? c,
          sector: comp?.sector ?? "",
        };
      }),
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeFileName = viewName.replace(/[\\/:*?"<>|\s]+/g, "_");
    a.href = url;
    a.download = `manuchart_view_${safeFileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`比較ビュー設定「${a.download}」をJSON出力しました`);
  };

  // JSONファイルから比較ビューを読み込み（インポート）
  const handleImportViewJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<SavedComparisonView>;
      if (!parsed || !Array.isArray(parsed.codes)) {
        showToast("JSONファイルの形式が正しくありません（codes配列が必要です）");
        return;
      }
      const validCodes = parsed.codes
        .map((c) => String(c).trim())
        .filter((c) => Boolean(getCompanyByCode(c)));

      if (validCodes.length === 0) {
        showToast("JSON内の証券コードに対応する製造業銘柄が見つかりませんでした");
        return;
      }

      const importedView: SavedComparisonView = {
        id: `import_${Date.now()}`,
        name:
          parsed.name ||
          file.name.replace(/\.json$/i, "") ||
          `読込ビュー (${validCodes.length}社)`,
        codes: validCodes.slice(0, 8),
        range:
          parsed.range && TIMEFRAMES.some((t) => t.key === parsed.range)
            ? parsed.range
            : selectedRange,
        metricMode:
          parsed.metricMode === "changePercent" ? "changePercent" : "actual",
        createdAt: parsed.createdAt || new Date().toISOString(),
        version: "1.0",
      };

      setCompareCodes(importedView.codes);
      setSelectedCode(importedView.codes[0]);
      setSelectedRange(importedView.range);
      setCompareMetricMode(importedView.metricMode);

      setSavedViews((prev) => {
        const next = [importedView, ...prev];
        try {
          localStorage.setItem("manuchart_saved_views", JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      showToast(
        `JSONビュー「${importedView.name}」（${importedView.codes.length}社）を読み込みました`
      );
    } catch (err) {
      console.error("Failed to import JSON view:", err);
      showToast("JSONファイルの読み込みに失敗しました");
    }
  };

  // 比較チャート用のデータシリーズ配列を構築（API取得前でも0秒で即時生成して表示）
  const comparisonSeriesList: ComparisonCompanySeries[] = useMemo(() => {
    return compareCodes.map((code, idx) => {
      const comp = getCompanyByCode(code);
      const stockData =
        compareDataMap[code] && compareDataMap[code].range === selectedRange
          ? compareDataMap[code]
          : generateInstantStockData(code, selectedRange);
      return {
        code,
        nameJa: comp?.nameJa ?? code,
        sector: comp?.sector ?? "",
        color: COMPARE_PALETTE[idx % COMPARE_PALETTE.length],
        data: stockData,
      };
    });
  }, [compareCodes, compareDataMap, selectedRange]);

  // フィルタ＆ソート済みの左ペイン企業リスト
  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return PRIME_MANUFACTURING_COMPANIES.filter((c) => {
      if (sectorFilter === "WATCHLIST") {
        if (!watchlist.includes(c.code)) return false;
      } else if (sectorFilter.startsWith("CAT:")) {
        const catId = sectorFilter.replace("CAT:", "") as ProductCategoryId;
        const cat = PRODUCT_CATEGORIES.find((item) => item.id === catId);
        if (cat && !cat.codes.includes(c.code)) return false;
      } else if (sectorFilter !== "ALL") {
        if (c.sector !== sectorFilter) return false;
      }
      if (!q) return true;
      return (
        c.code.includes(q) ||
        c.nameJa.toLowerCase().includes(q) ||
        c.nameKana.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.sector.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      if (sortBy === "marketCap") {
        const mA = liveSnapshotMap[a.code]?.marketCapOku ?? a.marketCapOku;
        const mB = liveSnapshotMap[b.code]?.marketCapOku ?? b.marketCapOku;
        return mB - mA;
      }
      if (sortBy === "periodGrowthDesc") {
        const gA =
          liveSnapshotMap[a.code]?.periodGrowthPercent ?? a.baseChangePercent;
        const gB =
          liveSnapshotMap[b.code]?.periodGrowthPercent ?? b.baseChangePercent;
        return gB - gA;
      }
      if (sortBy === "periodGrowthAsc") {
        const gA =
          liveSnapshotMap[a.code]?.periodGrowthPercent ?? a.baseChangePercent;
        const gB =
          liveSnapshotMap[b.code]?.periodGrowthPercent ?? b.baseChangePercent;
        return gA - gB;
      }
      if (sortBy === "changePercent") {
        const chA =
          liveSnapshotMap[a.code]?.changePercent ?? a.baseChangePercent;
        const chB =
          liveSnapshotMap[b.code]?.changePercent ?? b.baseChangePercent;
        return chB - chA;
      }
      if (sortBy === "dividendYield") return b.dividendYield - a.dividendYield;
      return a.code.localeCompare(b.code);
    });
  }, [sectorFilter, watchlist, searchQuery, sortBy, liveSnapshotMap]);

  // 業種ごとの登録件数マップ
  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of PRIME_MANUFACTURING_COMPANIES) {
      counts[c.sector] = (counts[c.sector] || 0) + 1;
    }
    return counts;
  }, []);

  const currentTimeframeObj =
    TIMEFRAMES.find((t) => t.key === selectedRange) ?? TIMEFRAMES[5];

  // 個別銘柄の現在時価総額・期間変動・株価
  const latestMarketCapOku =
    primaryData?.meta.latestMarketCapOku ?? selectedCompany.marketCapOku;
  const startMarketCapOku =
    primaryData?.meta.startMarketCapOku ?? selectedCompany.marketCapOku;
  const periodMarketCapChangeOku =
    primaryData?.meta.periodMarketCapChangeOku ?? 0;
  const periodMarketCapChangePercent =
    primaryData?.meta.periodMarketCapChangePercent ?? 0;
  const dayMarketCapChangeOku = primaryData?.meta.dayMarketCapChangeOku ?? 0;

  const latestPrice =
    primaryData?.meta.latestPrice ?? selectedCompany.basePrice;
  const changeAmount = primaryData?.meta.changeAmount ?? 0;
  const changePercent =
    primaryData?.meta.changePercent ?? selectedCompany.baseChangePercent;

  // 52週レンジ内の現在値ポジション (0〜100%)
  const week52Pos = useMemo(() => {
    if (!primaryData) return 50;
    const { fiftyTwoWeekLow, fiftyTwoWeekHigh } = primaryData.meta;
    if (fiftyTwoWeekHigh <= fiftyTwoWeekLow) return 50;
    return Math.max(
      2,
      Math.min(
        98,
        Math.round(
          ((latestPrice - fiftyTwoWeekLow) /
            (fiftyTwoWeekHigh - fiftyTwoWeekLow)) *
            100
        )
      )
    );
  }, [primaryData, latestPrice]);

  // ランキングに渡す業種フィルタ（WATCHLISTやCAT:のときはALL扱い）
  const activeSectorForRanking: ManufacturingSector | "ALL" =
    sectorFilter === "WATCHLIST" || sectorFilter.startsWith("CAT:")
      ? "ALL"
      : (sectorFilter as ManufacturingSector | "ALL");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* トースト通知 */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 text-sm font-medium text-emerald-300 shadow-2xl backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ================= スリムな1段トップヘッダー（3つのメインタブ切替） ================= */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          {/* 左：ロゴ＆タイトル */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-md shadow-emerald-500/20">
              <Building2 className="h-5 w-5 text-slate-950 stroke-[2.4]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white sm:text-lg">
                  ManuChart
                </h1>
                <span className="hidden sm:inline-block rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                  東証プライム製造業 {PRIME_MANUFACTURING_COMPANIES.length}社
                </span>
              </div>
            </div>
          </div>

          {/* 中央：メイン3画面切替タブ（今見たい画面だけに集中できるナビゲーション） */}
          <nav className="flex items-center rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            <button
              onClick={() => setActiveMainTab("individual")}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeMainTab === "individual"
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <LineChart className="h-4 w-4" />
              <span>個別推移</span>
            </button>

            <button
              onClick={() => setActiveMainTab("comparison")}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeMainTab === "comparison"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <GitCompare className="h-4 w-4" />
              <span>品目・企業比較</span>
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.2 font-mono text-[11px] ${
                  activeMainTab === "comparison"
                    ? "bg-slate-950/25 text-slate-950 font-extrabold"
                    : "bg-sky-500/20 text-sky-300"
                }`}
              >
                {comparisonLensMode === "product_index"
                  ? `${selectedCategoryIds.length}品目`
                  : `${compareCodes.length}社`}
              </span>
            </button>

            <button
              onClick={() => setActiveMainTab("ranking")}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeMainTab === "ranking"
                  ? "bg-amber-400 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Trophy className="h-4 w-4" />
              <span>伸び率ランキング</span>
            </button>
          </nav>

          {/* 右：最終取得時刻 ＆ 更新ボタン */}
          <div className="flex items-center gap-2.5">
            <span className="hidden md:flex items-center gap-1 text-xs text-slate-400 font-mono">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              {lastUpdatedText}
            </span>

            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
              title="最新データを再取得"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-emerald-400 ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              />
              <span>更新</span>
            </button>
          </div>
        </div>
      </header>

      {/* ================= メイン2ペインコンテンツ ================= */}
      <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-4 px-3 py-3 sm:px-5 lg:flex-row items-start">
        {/* ---------- 左ペイン：検索・業種ドロップダウン・銘柄リスト（下三角ボタンで表示・非表示可能） ---------- */}
        {isSidebarOpen && (
          <aside className="w-full lg:w-[320px] xl:w-[340px] shrink-0 lg:sticky lg:top-[64px] flex flex-col rounded-2xl border border-slate-800/90 bg-slate-900/50 overflow-hidden">
            {/* 左サイドバー最上部：開閉ヘッダーバー（▼/▲ ボタンで検索欄やサイドバー全体を表示・非表示） */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/90 bg-slate-950/90 px-3 py-2">
              <button
                onClick={() => setIsSidebarFilterOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-300 hover:text-emerald-200 transition cursor-pointer"
                title="検索・業種フィルター欄を表示/非表示"
              >
                {isSidebarFilterOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>銘柄一覧 ({filteredCompanies.length}社)</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsSidebarFilterOpen((v) => !v)}
                  className="inline-flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-slate-800 cursor-pointer"
                  title="検索・業種フィルター欄を折りたたむ/展開する"
                >
                  <span>{isSidebarFilterOpen ? "検索を隠す" : "検索を表示"}</span>
                  {isSidebarFilterOpen ? (
                    <ChevronUp className="h-3 w-3 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  )}
                </button>

                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  title="左サイドバー全体を非表示にしてグラフ領域を広げる"
                >
                  <span>サイドバー非表示</span>
                  <ChevronUp className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* 検索ボックス ＆ 業種・並替ドロップダウン（▼/▲ で表示・非表示可能） */}
            {isSidebarFilterOpen && (
              <div className="border-b border-slate-800/80 bg-slate-900/90 p-3 space-y-2.5">
                {/* キーワード検索 */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="コード・企業名で検索 (例: 7203, ホンダ)"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-8 pr-7 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* 業種フィルタ ＆ ソート順（シンプルな2つのセレクトボックス） */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={sectorFilter}
                    onChange={(e) =>
                      setSectorFilter(
                        e.target.value as
                          | ManufacturingSector
                          | `CAT:${ProductCategoryId}`
                          | "ALL"
                          | "WATCHLIST"
                      )
                    }
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                    title="生産品目・業種・お気に入りで絞り込み"
                  >
                    <option value="ALL">
                      全銘柄 ({PRIME_MANUFACTURING_COMPANIES.length}社)
                    </option>
                    <option value="WATCHLIST">
                      ★ お気に入り ({watchlist.length}社)
                    </option>
                    <optgroup label="🏭 20大生産品目（プロダクト別）">
                      {PRODUCT_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={`CAT:${cat.id}`}>
                          {cat.shortName} ({cat.codes.length}社)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="📊 東証16業種（セクター別）">
                      {MANUFACTURING_SECTORS.map((sec) => (
                        <option key={sec.name} value={sec.name}>
                          {sec.name} ({sectorCounts[sec.name] || 0}社)
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                    title="並び順を変更"
                  >
                    <option value="marketCap">時価総額 順</option>
                    <option value="periodGrowthDesc">
                      伸び率 高い順 ({currentTimeframeObj.shortLabel})
                    </option>
                    <option value="periodGrowthAsc">
                      伸び率 低い順 ({currentTimeframeObj.shortLabel})
                    </option>
                    <option value="changePercent">前日比 順</option>
                    <option value="code">コード 順</option>
                  </select>
                </div>
              </div>
            )}

          {/* 銘柄スクロールリスト */}
          <div className="divide-y divide-slate-800/60 overflow-y-auto max-h-[360px] lg:max-h-[calc(100vh-190px)]">
            {filteredCompanies.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                一致する銘柄がありません
              </div>
            ) : (
              filteredCompanies.map((comp) => {
                const isSelected = comp.code === selectedCode;
                const isCompared = compareCodes.includes(comp.code);
                const snapMcap =
                  liveSnapshotMap[comp.code]?.marketCapOku ?? comp.marketCapOku;
                const snapGrowth =
                  liveSnapshotMap[comp.code]?.periodGrowthPercent ??
                  comp.baseChangePercent;
                const isUp = snapGrowth >= 0;

                return (
                  <div
                    key={comp.code}
                    onClick={() => {
                      setSelectedCode(comp.code);
                      if (activeMainTab === "ranking") {
                        setActiveMainTab("individual");
                      }
                    }}
                    className={`group flex items-center justify-between gap-2 px-3.5 py-2.5 transition cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500/15 border-l-4 border-l-emerald-400"
                        : "hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-400">
                          {comp.code}
                        </span>
                        <span className="text-[11px] text-slate-500 truncate">
                          {comp.sector}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-sm font-bold text-slate-100 group-hover:text-white">
                        {comp.nameJa}
                      </div>
                    </div>

                    {/* 右側：時価総額・期間伸び率 ＆ 比較追加アイコンボタン1つ */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <div className="font-mono text-xs sm:text-sm font-extrabold text-white">
                          {formatMarketCapOku(snapMcap, 2)}
                        </div>
                        <div
                          className={`font-mono text-[11px] font-semibold ${
                            isUp ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isUp ? "+" : ""}
                          {snapGrowth.toFixed(2)}%
                        </div>
                      </div>

                      {/* 比較チャート追加/解除アイコンボタン */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompareCode(comp.code);
                        }}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border transition cursor-pointer ${
                          isCompared
                            ? "border-sky-400 bg-sky-500/25 text-sky-300"
                            : "border-slate-800 bg-slate-950 text-slate-500 hover:border-sky-500/50 hover:text-sky-300"
                        }`}
                        title={
                          isCompared
                            ? "比較対象から外す"
                            : "比較対象へ追加"
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
              })
            )}
          </div>
        </aside>
        )}

        {/* ---------- 右メインペイン：可視化領域コントロール＆期間バー ＋ 選択中のタブ画面 ---------- */}
        <section className="flex-1 min-w-0 w-full flex flex-col gap-3">
          {/* 全タブ共通：可視化領域（キャンバス）制御 ＆ 期間（時間軸）セレクタバー */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800/90 bg-slate-900/60 px-3.5 py-2">
            {/* 左：銘柄リスト開閉ボタン ＆ グラフ集中モード */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSidebarOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  !isSidebarOpen
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
                title={
                  isSidebarOpen
                    ? "左サイドバー（銘柄一覧）を非表示にしてグラフを横幅いっぱいに広げる"
                    : "左サイドバー（銘柄一覧）を表示する"
                }
              >
                {isSidebarOpen ? (
                  <>
                    <PanelLeftClose className="h-3.5 w-3.5 text-slate-400" />
                    <span>左サイドバーを隠す</span>
                    <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="h-3.5 w-3.5 text-emerald-400" />
                    <span>左サイドバーを表示 ({PRIME_MANUFACTURING_COMPANIES.length}社)</span>
                    <ChevronDown className="h-3.5 w-3.5 text-emerald-400" />
                  </>
                )}
              </button>

              <button
                onClick={toggleFocusMode}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  isFocusMode
                    ? "border-amber-400 bg-amber-500/20 text-amber-300 shadow-sm"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
                title="周辺パネルを一括収納して折れ線グラフを画面最大サイズで表示"
              >
                {isFocusMode ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
                    <span>通常レイアウトに戻す</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>グラフ最大化モード</span>
                  </>
                )}
              </button>

              {/* グラフ高さ3段階セレクター */}
              <div className="hidden xl:flex items-center rounded-xl border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
                <span className="px-2 text-slate-500 font-semibold">高さ:</span>
                {(
                  [
                    { key: "normal", label: "標準" },
                    { key: "large", label: "大" },
                    { key: "xlarge", label: "特大" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setChartSize(opt.key)}
                    className={`rounded-lg px-2 py-0.5 font-bold transition cursor-pointer ${
                      chartSize === opt.key
                        ? "bg-slate-800 text-emerald-300"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 右：9段階の期間（時間軸）ピルボタン */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[11px] font-bold text-slate-400 hidden sm:inline">
                期間:
              </span>
              {TIMEFRAMES.map((tf) => {
                const active = selectedRange === tf.key;
                return (
                  <button
                    key={tf.key}
                    onClick={() => setSelectedRange(tf.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      active
                        ? "bg-emerald-500 text-slate-950 shadow-sm"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {tf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ================= タブ1：個別推移ビュー ================= */}
          {activeMainTab === "individual" && (
            <>
              <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-4 sm:p-5 shadow-xl">
                {/* 企業ヘッダー＆時価総額KPI */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        {selectedCompany.code}
                      </span>
                      <span className="text-xs text-slate-400">
                        {selectedCompany.sector} / {selectedCompany.subCategory}
                      </span>

                      {/* お気に入りスター（アイコンのみ） */}
                      <button
                        onClick={() => toggleWatchlist(selectedCompany.code)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition cursor-pointer"
                        title="お気に入りに追加/解除"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            watchlist.includes(selectedCompany.code)
                              ? "fill-amber-400 text-amber-400"
                              : ""
                          }`}
                        />
                      </button>

                      {/* 比較へ追加して比較タブを見るボタン */}
                      <button
                        onClick={() => {
                          if (!compareCodes.includes(selectedCompany.code)) {
                            addCompareCode(selectedCompany.code);
                          }
                          setComparisonLensMode("custom_company");
                          setActiveMainTab("comparison");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition cursor-pointer"
                      >
                        <GitCompare className="h-3.5 w-3.5" />
                        <span>他社と比較する</span>
                      </button>
                    </div>

                    <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                      {selectedCompany.nameJa}
                    </h2>
                  </div>

                  {/* 時価総額 ＆ 期間変動 ＆ 株価 KPI */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    <div
                      className={`transition-colors ${
                        priceFlash ? "text-emerald-300" : ""
                      }`}
                    >
                      <div className="text-[11px] text-slate-400">
                        現在時価総額
                      </div>
                      <div className="font-mono text-2xl sm:text-3xl font-black text-white">
                        {formatMarketCapOku(latestMarketCapOku, 2)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        開始時: {formatMarketCapOku(startMarketCapOku, 2)}
                      </div>
                    </div>

                    <div className="border-l border-slate-800 pl-4 sm:pl-6">
                      <div className="text-[11px] text-slate-400">
                        期間変動 ({currentTimeframeObj.label})
                      </div>
                      <div
                        className={`font-mono text-xl sm:text-2xl font-extrabold ${
                          periodMarketCapChangePercent >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {periodMarketCapChangePercent >= 0 ? "+" : ""}
                        {periodMarketCapChangePercent.toFixed(2)}%
                      </div>
                      <div
                        className={`text-xs font-mono font-semibold ${
                          periodMarketCapChangeOku >= 0
                            ? "text-emerald-400/90"
                            : "text-rose-400/90"
                        }`}
                      >
                        {formatSignedMarketCapOku(periodMarketCapChangeOku, 2)}
                      </div>
                    </div>

                    <div className="border-l border-slate-800 pl-4 sm:pl-6">
                      <div className="text-[11px] text-slate-400">現在株価</div>
                      <div className="font-mono text-lg sm:text-xl font-bold text-white">
                        {latestPrice.toLocaleString()}円
                      </div>
                      <div
                        className={`text-xs font-mono ${
                          changePercent >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        前日比 {changeAmount >= 0 ? "+" : ""}
                        {changePercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* チャート上部コントロールバー（実額/変動率スイッチ ＆ 表示設定メニュー1つのみ） */}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-400">
                    {chartMode === "marketCap"
                      ? `時価総額の推移（${
                          marketCapAxisMode === "actual"
                            ? "実額：兆円 / 億円"
                            : "期間開始比の変動率：%"
                        }）`
                      : chartMode === "priceArea"
                      ? "株価の推移（円）"
                      : "ローソク足チャート（四本値）"}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Y軸切替：実額 vs 変動率(%) */}
                    {chartMode === "marketCap" && (
                      <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
                        <button
                          onClick={() => setMarketCapAxisMode("actual")}
                          className={`rounded-lg px-3 py-1 font-bold transition cursor-pointer ${
                            marketCapAxisMode === "actual"
                              ? "bg-emerald-500 text-slate-950"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          実額 (兆/億円)
                        </button>
                        <button
                          onClick={() => setMarketCapAxisMode("changePercent")}
                          className={`rounded-lg px-3 py-1 font-bold transition cursor-pointer ${
                            marketCapAxisMode === "changePercent"
                              ? "bg-emerald-500 text-slate-950"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          変動率 (%)
                        </button>
                      </div>
                    )}

                    {/* 表示設定ポップオーバー（チャート種別・移動平均線をこの中に収納） */}
                    <div className="relative" ref={chartSettingsRef}>
                      <button
                        onClick={() => setIsChartSettingsOpen((v) => !v)}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                          isChartSettingsOpen
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                            : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        <span>表示設定</span>
                      </button>

                      {isChartSettingsOpen && (
                        <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-slate-700 bg-slate-900/98 p-3.5 shadow-2xl backdrop-blur-xl text-xs space-y-3">
                          <div>
                            <div className="font-bold text-slate-300 mb-1.5">
                              チャート種別
                            </div>
                            <div className="space-y-1">
                              <button
                                onClick={() => setChartMode("marketCap")}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-semibold cursor-pointer ${
                                  chartMode === "marketCap"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "text-slate-300 hover:bg-slate-800"
                                }`}
                              >
                                <span>時価総額 推移（デフォルト）</span>
                                {chartMode === "marketCap" && (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => setChartMode("priceArea")}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-semibold cursor-pointer ${
                                  chartMode === "priceArea"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "text-slate-300 hover:bg-slate-800"
                                }`}
                              >
                                <span>株価 折れ線（円）</span>
                                {chartMode === "priceArea" && (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => setChartMode("candle")}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 font-semibold cursor-pointer ${
                                  chartMode === "candle"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "text-slate-300 hover:bg-slate-800"
                                }`}
                              >
                                <span>ローソク足（四本値）</span>
                                {chartMode === "candle" && (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {(chartMode !== "marketCap" ||
                            marketCapAxisMode === "actual") && (
                            <div className="border-t border-slate-800 pt-2.5">
                              <div className="font-bold text-slate-300 mb-1.5">
                                移動平均線（SMA）
                              </div>
                              <div className="space-y-1">
                                <label className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-800 cursor-pointer">
                                  <span className="text-amber-300">
                                    短期 ({currentTimeframeObj.smaLabels[0]})
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={showSmaShort}
                                    onChange={(e) =>
                                      setShowSmaShort(e.target.checked)
                                    }
                                    className="accent-emerald-500"
                                  />
                                </label>
                                <label className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-800 cursor-pointer">
                                  <span className="text-sky-300">
                                    中期 ({currentTimeframeObj.smaLabels[1]})
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={showSmaMid}
                                    onChange={(e) =>
                                      setShowSmaMid(e.target.checked)
                                    }
                                    className="accent-emerald-500"
                                  />
                                </label>
                                <label className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-slate-800 cursor-pointer">
                                  <span className="text-purple-300">
                                    長期 ({currentTimeframeObj.smaLabels[2]})
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={showSmaLong}
                                    onChange={(e) =>
                                      setShowSmaLong(e.target.checked)
                                    }
                                    className="accent-emerald-500"
                                  />
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 個別チャート本体（0秒即時描画・大型サイズ対応） */}
                <div className="mt-3">
                  <StockChart
                    primaryData={primaryData}
                    primaryName={selectedCompany.nameJa}
                    chartMode={chartMode}
                    marketCapAxisMode={marketCapAxisMode}
                    showSmaShort={showSmaShort}
                    showSmaMid={showSmaMid}
                    showSmaLong={showSmaLong}
                    isLoading={isRefreshing}
                    chartSize={chartSize}
                  />
                </div>
              </div>

              {/* ファンダメンタル指標 ＆ 企業解説（▼/▲ ボタンで表示・非表示を制御可能） */}
              <div className="rounded-2xl border border-slate-800/90 bg-slate-900/50 overflow-hidden">
                <button
                  onClick={() => setIsFundamentalsOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800/60 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-400" />
                    <span>
                      {selectedCompany.nameJa} のファンダメンタル指標・企業解説
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <span>
                      {isFundamentalsOpen ? "詳細を折りたたむ" : "詳細を展開する"}
                    </span>
                    {isFundamentalsOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {isFundamentalsOpen && (
                  <div className="border-t border-slate-800/80 p-3.5 space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>52週 時価総額レンジ</span>
                          <BarChart3 className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="mt-1.5 font-mono text-lg font-extrabold text-white">
                          {formatMarketCapOku(latestMarketCapOku, 2)}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400 font-mono">
                          {primaryData
                            ? `${formatMarketCapOku(
                                primaryData.meta.fiftyTwoWeekLowMarketCapOku,
                                1
                              )} 〜 ${formatMarketCapOku(
                                primaryData.meta.fiftyTwoWeekHighMarketCapOku,
                                1
                              )}`
                            : "---"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>PER / PBR</span>
                          <Activity className="h-4 w-4 text-sky-400" />
                        </div>
                        <div className="mt-1.5 font-mono text-lg font-extrabold text-white">
                          {selectedCompany.per.toFixed(1)}倍{" "}
                          <span className="text-slate-600">/</span>{" "}
                          <span className="text-sky-300">
                            {selectedCompany.pbr.toFixed(2)}倍
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {selectedCompany.pbr < 1.0
                            ? "PBR 1倍割れ（割安注目）"
                            : "グローバル成長評価"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>配当利回り / ROE</span>
                          <Award className="h-4 w-4 text-amber-400" />
                        </div>
                        <div className="mt-1.5 font-mono text-lg font-extrabold text-amber-300">
                          {selectedCompany.dividendYield.toFixed(2)}%{" "}
                          <span className="text-slate-600">/</span>{" "}
                          <span className="text-white">
                            {selectedCompany.roe.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          営業利益率: {selectedCompany.operatingMargin.toFixed(1)}%
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>52週 高安位置</span>
                          <span className="font-mono text-[11px] text-emerald-400">
                            {week52Pos}%
                          </span>
                        </div>
                        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"
                            style={{ width: `${week52Pos}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[11px] text-slate-400 font-mono">
                          <span>
                            安:{" "}
                            {primaryData?.meta.fiftyTwoWeekLow.toLocaleString() ??
                              "---"}
                          </span>
                          <span>
                            高:{" "}
                            {primaryData?.meta.fiftyTwoWeekHigh.toLocaleString() ??
                              "---"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-slate-300">
                          {selectedCompany.nameJa} の事業特徴・主力領域
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedCompany.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                        {selectedCompany.description}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ================= タブ2：品目・企業比較ビュー ================= */}
          {activeMainTab === "comparison" && (
            <ComparisonChart
              compareCodes={compareCodes}
              seriesList={comparisonSeriesList}
              categorySeriesList={categorySeriesList}
              selectedCategoryIds={selectedCategoryIds}
              onToggleCategoryId={toggleCategoryId}
              onSetCategoryIds={setSelectedCategoryIds}
              lensMode={comparisonLensMode}
              onChangeLensMode={setComparisonLensMode}
              selectedRange={selectedRange}
              metricMode={compareMetricMode}
              onChangeMetricMode={setCompareMetricMode}
              onAddCode={addCompareCode}
              onRemoveCode={removeCompareCode}
              onClearCodes={clearCompareCodes}
              onSetCodes={(codes) => setCompareCodesBatch(codes, false)}
              onSelectPrimaryCode={(code) => {
                setSelectedCode(code);
                setActiveMainTab("individual");
              }}
              savedViews={savedViews}
              onSaveView={handleSaveView}
              onDeleteView={handleDeleteView}
              onApplyView={handleApplyView}
              onExportViewJson={handleExportViewJson}
              onImportViewJson={handleImportViewJson}
              selectedCompanyCode={selectedCode}
              isLoading={isRefreshing}
              chartSize={chartSize}
              onChangeChartSize={setChartSize}
            />
          )}

          {/* ================= タブ3：時価総額 伸び率ランキングビュー ================= */}
          {activeMainTab === "ranking" && (
            <MarketCapRanking
              items={rankingItems}
              selectedRange={selectedRange}
              selectedSector={activeSectorForRanking}
              selectedCode={selectedCode}
              compareCodes={compareCodes}
              onSelectCompany={(code) => {
                setSelectedCode(code);
                setActiveMainTab("individual");
              }}
              onToggleCompareCode={toggleCompareCode}
              onSetCompareCodes={(codes) => {
                setComparisonLensMode("custom_company");
                setCompareCodesBatch(codes, true);
              }}
              isLoading={isRefreshing}
            />
          )}
        </section>
      </main>
    </div>
  );
}
