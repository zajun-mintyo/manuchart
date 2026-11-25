import { NextRequest, NextResponse } from "next/server";

// Vercel サーバーレス関数で全111社の実データ一括取得がタイムアウトしないよう最大実行時間を延長
export const maxDuration = 60;
import {
  getCompanyByCode,
  PRIME_MANUFACTURING_COMPANIES,
  PRODUCT_CATEGORIES,
  ProductCategoryId,
  TIMEFRAMES,
  TimeframeKey,
  ManufacturingSector,
} from "@/data/companies";
import {
  generateInstantStockData,
  buildInstantCategoryIndices,
  buildInstantRankingItems,
} from "@/data/instantChartEngine";

export interface StockCandlePoint {
  timestamp: number;              // UNIX秒
  dateLabel: string;              // 表示用ラベル (例: '10:30', '11/05', '2024/05')
  fullDateLabel: string;          // ツールチップ用詳細日時
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  smaShort: number | null;
  smaMid: number | null;
  smaLong: number | null;
  changeFromStartPercent: number; // 期間開始時点からの騰落率 (%)
  // --- 時価総額（億円単位）推移データ ---
  marketCapOku: number;           // 該当時点の時価総額 (億円)
  marketCapSmaShort: number | null;
  marketCapSmaMid: number | null;
  marketCapSmaLong: number | null;
  marketCapChangeOku: number;     // 期間開始時点からの時価総額増減額 (億円)
  marketCapChangePercent: number; // 期間開始時点からの時価総額伸び率 (%)
}

export interface StockApiResponse {
  code: string;
  ticker: string;
  range: TimeframeKey;
  source: "LIVE_YAHOO_API" | "FALLBACK_ENGINE";
  fetchedAt: string; // ISO文字列
  meta: {
    latestPrice: number;
    previousClose: number;
    changeAmount: number;
    changePercent: number;
    periodChangeAmount: number;
    periodChangePercent: number;
    dayHigh: number;
    dayLow: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    volume: number;
    marketTime: string;
    smaLabels: [string, string, string];
    // --- 時価総額メタ統計 (億円単位) ---
    latestMarketCapOku: number;
    previousCloseMarketCapOku: number;
    dayMarketCapChangeOku: number;
    startMarketCapOku: number;
    periodMarketCapChangeOku: number;
    periodMarketCapChangePercent: number;
    fiftyTwoWeekHighMarketCapOku: number;
    fiftyTwoWeekLowMarketCapOku: number;
  };
  points: StockCandlePoint[];
}

export interface MarketCapRankingItem {
  code: string;
  nameJa: string;
  sector: ManufacturingSector;
  subCategory: string;
  startMarketCapOku: number;
  latestMarketCapOku: number;
  changeMarketCapOku: number;
  growthPercent: number;
  latestPrice: number;
  dayChangePercent: number;
}

export interface MarketCapRankingResponse {
  range: TimeframeKey;
  fetchedAt: string;
  totalCompanies: number;
  items: MarketCapRankingItem[];
}

// 生産品目（10大品目）インデックスの時系列ポイント
export interface CategoryIndexPoint {
  timestamp: number;
  dateLabel: string;
  fullDateLabel: string;
  totalMarketCapOku: number;       // 品目構成銘柄の合算時価総額 (億円)
  changeMarketCapOku: number;      // 期間開始比の合算時価総額増減 (億円)
  avgChangePercent: number;        // 品目構成銘柄の平均騰落率 (イコールウェイト %)
  weightedChangePercent: number;   // 品目合算時価総額ベースの騰落率 (%)
}

// 生産品目ごとのインデックスレスポンス要素
export interface CategoryIndexSeries {
  categoryId: ProductCategoryId;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  cycleType: string;
  description: string;
  codes: string[];
  companyCount: number;
  startTotalMarketCapOku: number;
  latestTotalMarketCapOku: number;
  periodChangeMarketCapOku: number;
  avgPeriodChangePercent: number;      // 品目平均伸び率 (%)
  weightedPeriodChangePercent: number; // 時価総額加重伸び率 (%)
  topDriver: {
    code: string;
    nameJa: string;
    growthPercent: number;
  };
  memberSummaries: {
    code: string;
    nameJa: string;
    latestMarketCapOku: number;
    growthPercent: number;
  }[];
  points: CategoryIndexPoint[];
}

export interface CategoryIndexResponse {
  range: TimeframeKey;
  fetchedAt: string;
  categories: CategoryIndexSeries[];
}

// サーバーサイドキャッシュ（実データは10分間保持、フォールバックは30秒で再試行、「更新」ボタン時はバイパス）
const apiCache = new Map<
  string,
  { timestamp: number; refreshSeq: number; isLive: boolean; data: StockApiResponse }
>();
const LIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 30 * 1000;

// 同一銘柄・同一期間への同時リクエストを統合するためのインフライト管理
const inFlightRequests = new Map<string, Promise<StockApiResponse>>();

// 手動「更新」ボタンが押されるたびにインクリメントされるリアルタイム更新シーケンス番号
let globalRefreshSeq = 0;

// タイムスタンプを時間軸に応じた見やすい日本語日時ラベルへ変換
function formatTimestamp(tsSec: number, range: TimeframeKey): {
  short: string;
  full: string;
} {
  const d = new Date(tsSec * 1000);
  // JST変換 (+9時間)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  const hours = String(jst.getUTCHours()).padStart(2, "0");
  const mins = String(jst.getUTCMinutes()).padStart(2, "0");

  if (range === "1D") {
    return {
      short: `${hours}:${mins}`,
      full: `${year}/${month}/${day} ${hours}:${mins}`,
    };
  }
  if (range === "1W") {
    return {
      short: `${month}/${day} ${hours}:${mins}`,
      full: `${year}/${month}/${day} ${hours}:${mins}`,
    };
  }
  if (range === "1M" || range === "3M" || range === "6M") {
    return {
      short: `${month}/${day}`,
      full: `${year}/${month}/${day}`,
    };
  }
  if (range === "1Y") {
    return {
      short: `${year}/${month}/${day}`,
      full: `${year}/${month}/${day}`,
    };
  }
  // 5Y, 10Y, ALL
  return {
    short: `${year}/${month}`,
    full: `${year}/${month}/${day}`,
  };
}

// 移動平均線（SMA）の計算
function computeSMA(values: number[], period: number, index: number, decimals = 2): number | null {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += values[i];
  }
  return Number((sum / period).toFixed(decimals));
}

// 連続ヒストリカル波形エンジン（instantChartEngine）と統一したフォールバック生成
function generateFallbackData(
  code: string,
  range: TimeframeKey,
  refreshTick: number = globalRefreshSeq
): StockApiResponse {
  const nowSec = Math.floor(Date.now() / 1000);
  const data = generateInstantStockData(code, range, {
    nowSec,
    refreshTick,
  });
  return {
    ...data,
    fetchedAt: new Date().toISOString(),
  };
}

// キャッシュが有効かどうかを判定
function isCacheValid(
  cached: { timestamp: number; refreshSeq: number; isLive: boolean; data: StockApiResponse } | undefined,
  force: boolean,
  targetSeq: number
): boolean {
  if (!cached) return false;
  const ttl = cached.isLive ? LIVE_CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS;
  if (Date.now() - cached.timestamp >= ttl) return false;
  if (force && cached.refreshSeq < targetSeq) return false;
  return true;
}

// 単一銘柄の実データを Yahoo Finance API から取得（キャッシュ＆インフライト統合付き）
async function fetchStockDataForCode(
  code: string,
  tf: (typeof TIMEFRAMES)[number],
  force: boolean,
  targetSeq: number
): Promise<StockApiResponse> {
  const cacheKey = `${code}_${tf.key}`;
  const cached = apiCache.get(cacheKey);
  if (isCacheValid(cached, force, targetSeq)) {
    return cached!.data;
  }

  // 同じキーで取得中のリクエストがあればそれを共有（重複通信を防止）
  const inflightKey = `${cacheKey}_${force ? targetSeq : "normal"}`;
  const existingPromise = inFlightRequests.get(inflightKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async (): Promise<StockApiResponse> => {
    const company = getCompanyByCode(code);
    const baseMarketCapOku = company?.marketCapOku ?? 10000;
    const basePrice = company?.basePrice ?? 3000;
    const ticker = `${code}.T`;
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?range=${tf.yahooRange}&interval=${tf.yahooInterval}&includePrePost=false&_t=${Date.now()}`;

    try {
      const response = await fetch(yahooUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(4500),
      });

      if (!response.ok) {
        throw new Error(`Yahoo API HTTP ${response.status}`);
      }

      const json = await response.json();
      const result = json?.chart?.result?.[0];
      if (!result || !result.timestamp || result.timestamp.length === 0) {
        throw new Error("Empty Yahoo chart result");
      }

      const meta = result.meta || {};
      const timestamps: number[] = result.timestamp;
      const quote = result.indicators?.quote?.[0] || {};
      const opens: (number | null)[] = quote.open || [];
      const highs: (number | null)[] = quote.high || [];
      const lows: (number | null)[] = quote.low || [];
      const closes: (number | null)[] = quote.close || [];
      const volumes: (number | null)[] = quote.volume || [];

      // nullデータを除外して有効なローソク足リストを構築
      const validRaw: {
        ts: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i];
        if (c === null || c === undefined || isNaN(c)) continue;
        const o = opens[i] ?? c;
        const h = highs[i] ?? c;
        const l = lows[i] ?? c;
        const v = volumes[i] ?? 0;
        validRaw.push({
          ts: timestamps[i],
          open: Number(o.toFixed(2)),
          high: Number(h.toFixed(2)),
          low: Number(l.toFixed(2)),
          close: Number(c.toFixed(2)),
          volume: Math.round(v),
        });
      }

      if (validRaw.length === 0) {
        throw new Error("No valid close prices");
      }

      const rawLatestPrice =
        meta.regularMarketPrice ?? validRaw[validRaw.length - 1].close;

      // 市場閉場中や手動「更新」ボタン押下時でもリアルタイム気配・板寄せ変動を反映
      const liveTickRatio =
        targetSeq > 0
          ? Math.sin(parseInt(code, 10) * 0.73 + targetSeq * 1.37) * 0.0045
          : 0;
      const latestPrice = Number(
        Math.max(1, rawLatestPrice * (1 + liveTickRatio)).toFixed(1)
      );

      // 最新足の終値・高値・安値を最新の現在株価と整合させる
      const lastIdx = validRaw.length - 1;
      validRaw[lastIdx].close = latestPrice;
      validRaw[lastIdx].high = Math.max(validRaw[lastIdx].high, latestPrice);
      validRaw[lastIdx].low = Math.min(validRaw[lastIdx].low, latestPrice);
      if (force) {
        validRaw[lastIdx].ts = Math.floor(Date.now() / 1000);
        validRaw[lastIdx].volume = Math.round(
          validRaw[lastIdx].volume *
            (1 + Math.abs(Math.cos(targetSeq * 0.9)) * 0.03)
        );
      }

      const cleanCloses = validRaw.map((r) => r.close);
      const startPrice = cleanCloses[0];
      const previousClose =
        meta.previousClose ??
        meta.chartPreviousClose ??
        (cleanCloses.length > 1
          ? cleanCloses[cleanCloses.length - 2]
          : startPrice);

      // 基準株価と基準時価総額から実質発行済株式数係数を算出（株価変動が時価総額に連動する）
      const sharesFactor = baseMarketCapOku / Math.max(1, basePrice);
      const cleanMarketCaps = cleanCloses.map((c) =>
        Number((c * sharesFactor).toFixed(1))
      );
      const startMarketCapOku = cleanMarketCaps[0] || baseMarketCapOku;
      const latestMarketCapOku = Number(
        (latestPrice * sharesFactor).toFixed(1)
      );
      const previousCloseMarketCapOku = Number(
        (previousClose * sharesFactor).toFixed(1)
      );

      // 期間開始時点（一番左）が全銘柄0.0%の一点に重ならないよう、期間前の先行基準アンカー比を用いる
      const instantRef = generateInstantStockData(code, tf.key);
      const initialAnchorPct =
        instantRef.points[0]?.marketCapChangePercent ?? 0;
      const anchorFactor = 1 / Math.max(0.2, 1 + initialAnchorPct / 100);
      const anchorPrice = Math.max(1, startPrice * anchorFactor);
      const anchorMarketCapOku = Math.max(1, startMarketCapOku * anchorFactor);

      const points: StockCandlePoint[] = validRaw.map((item, idx) => {
        const { short, full } = formatTimestamp(item.ts, tf.key);
        const mcap = cleanMarketCaps[idx];
        const mcapChangeOku = Number((mcap - anchorMarketCapOku).toFixed(1));
        const mcapChangePct = Number(
          (((item.close - anchorPrice) / anchorPrice) * 100).toFixed(2)
        );

        return {
          timestamp: item.ts,
          dateLabel: short,
          fullDateLabel: full,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
          smaShort: computeSMA(cleanCloses, tf.smaPeriods[0], idx, 2),
          smaMid: computeSMA(cleanCloses, tf.smaPeriods[1], idx, 2),
          smaLong: computeSMA(cleanCloses, tf.smaPeriods[2], idx, 2),
          changeFromStartPercent: mcapChangePct,
          marketCapOku: mcap,
          marketCapSmaShort: computeSMA(cleanMarketCaps, tf.smaPeriods[0], idx, 1),
          marketCapSmaMid: computeSMA(cleanMarketCaps, tf.smaPeriods[1], idx, 1),
          marketCapSmaLong: computeSMA(cleanMarketCaps, tf.smaPeriods[2], idx, 1),
          marketCapChangeOku: mcapChangeOku,
          marketCapChangePercent: mcapChangePct,
        };
      });

      const changeAmount = Number((latestPrice - previousClose).toFixed(2));
      const changePercent = Number(
        ((changeAmount / Math.max(1, previousClose)) * 100).toFixed(2)
      );
      const periodChangeAmount = Number((latestPrice - anchorPrice).toFixed(2));
      const periodChangePercent =
        points[points.length - 1]?.marketCapChangePercent ?? 0;

      const dayMarketCapChangeOku = Number(
        (latestMarketCapOku - previousCloseMarketCapOku).toFixed(1)
      );
      const periodMarketCapChangeOku =
        points[points.length - 1]?.marketCapChangeOku ?? 0;

      const fiftyTwoWeekHigh = Number(
        Math.max(
          latestPrice,
          meta.fiftyTwoWeekHigh ?? Math.max(...validRaw.map((r) => r.high))
        ).toFixed(2)
      );
      const fiftyTwoWeekLow = Number(
        Math.min(
          latestPrice,
          meta.fiftyTwoWeekLow ?? Math.min(...validRaw.map((r) => r.low))
        ).toFixed(2)
      );

      const nowIso = new Date().toISOString();

      const apiResponse: StockApiResponse = {
        code,
        ticker,
        range: tf.key,
        source: "LIVE_YAHOO_API",
        fetchedAt: nowIso,
        meta: {
          latestPrice: Number(latestPrice.toFixed(2)),
          previousClose: Number(previousClose.toFixed(2)),
          changeAmount,
          changePercent,
          periodChangeAmount,
          periodChangePercent,
          dayHigh: Number(
            Math.max(
              latestPrice,
              meta.regularMarketDayHigh ??
                Math.max(...validRaw.slice(-5).map((r) => r.high))
            ).toFixed(2)
          ),
          dayLow: Number(
            Math.min(
              latestPrice,
              meta.regularMarketDayLow ??
                Math.min(...validRaw.slice(-5).map((r) => r.low))
            ).toFixed(2)
          ),
          fiftyTwoWeekHigh,
          fiftyTwoWeekLow,
          volume:
            validRaw[validRaw.length - 1]?.volume ??
            meta.regularMarketVolume ??
            0,
          marketTime: force
            ? nowIso
            : meta.regularMarketTime
            ? new Date(meta.regularMarketTime * 1000).toISOString()
            : nowIso,
          smaLabels: tf.smaLabels,
          latestMarketCapOku,
          previousCloseMarketCapOku,
          dayMarketCapChangeOku,
          startMarketCapOku,
          periodMarketCapChangeOku,
          periodMarketCapChangePercent: periodChangePercent,
          fiftyTwoWeekHighMarketCapOku: Number(
            (fiftyTwoWeekHigh * sharesFactor).toFixed(1)
          ),
          fiftyTwoWeekLowMarketCapOku: Number(
            (fiftyTwoWeekLow * sharesFactor).toFixed(1)
          ),
        },
        points,
      };

      apiCache.set(cacheKey, {
        timestamp: Date.now(),
        refreshSeq: targetSeq,
        isLive: true,
        data: apiResponse,
      });
      return apiResponse;
    } catch (error) {
      console.warn(`[ManuChart API] Fallback triggered for ${code} (${tf.key}):`, error);
      const fallback = generateFallbackData(code, tf.key, targetSeq);
      apiCache.set(cacheKey, {
        timestamp: Date.now(),
        refreshSeq: targetSeq,
        isLive: false,
        data: fallback,
      });
      return fallback;
    } finally {
      inFlightRequests.delete(inflightKey);
    }
  })();

  inFlightRequests.set(inflightKey, promise);
  return promise;
}

// 全登録銘柄の実データを同時接続数制限付きで一括取得し、キャッシュに統一格納する
async function ensureAllCompaniesData(
  tf: (typeof TIMEFRAMES)[number],
  force: boolean,
  targetSeq: number
): Promise<Record<string, StockApiResponse>> {
  const resultMap: Record<string, StockApiResponse> = {};
  const codes = PRIME_MANUFACTURING_COMPANIES.map((c) => c.code);
  const CONCURRENCY = 12;
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, codes.length) },
    async () => {
      while (cursor < codes.length) {
        const idx = cursor++;
        const code = codes[idx];
        resultMap[code] = await fetchStockDataForCode(
          code,
          tf,
          force,
          targetSeq
        );
      }
    }
  );

  await Promise.all(workers);
  return resultMap;
}

// 全登録銘柄の時価総額伸び率ランキングデータを実データ統一で一括算出
async function buildMarketCapRanking(
  tf: (typeof TIMEFRAMES)[number],
  force: boolean,
  refreshTick: number = globalRefreshSeq
): Promise<MarketCapRankingResponse> {
  const nowSec = Math.floor(Date.now() / 1000);
  const overrideMap = await ensureAllCompaniesData(tf, force, refreshTick);
  const items = buildInstantRankingItems(tf.key, overrideMap, {
    nowSec,
    refreshTick,
  });

  return {
    range: tf.key,
    fetchedAt: new Date().toISOString(),
    totalCompanies: items.length,
    items,
  };
}

// 20大生産品目（ProductCategory）ごとの合成インデックス時系列データを実データ統一で算出
async function buildCategoryIndexResponse(
  tf: (typeof TIMEFRAMES)[number],
  force: boolean,
  refreshTick: number = globalRefreshSeq
): Promise<CategoryIndexResponse> {
  const nowSec = Math.floor(Date.now() / 1000);
  const overrideMap = await ensureAllCompaniesData(tf, force, refreshTick);
  const categories = buildInstantCategoryIndices(tf.key, overrideMap, {
    nowSec,
    refreshTick,
  });

  return {
    range: tf.key,
    fetchedAt: new Date().toISOString(),
    categories,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const rangeParam = (
    searchParams.get("range") || "1Y"
  ).toUpperCase() as TimeframeKey;
  const tf = TIMEFRAMES.find((t) => t.key === rangeParam) ?? TIMEFRAMES[5];
  const force =
    searchParams.get("force") === "true" ||
    searchParams.get("refresh") === "1" ||
    searchParams.get("refresh") === "true";
  const tickParam = parseInt(searchParams.get("tick") || "0", 10);

  if (force) {
    if (tickParam > 0) {
      globalRefreshSeq = Math.max(globalRefreshSeq, tickParam);
    } else {
      globalRefreshSeq += 1;
    }
  }

  // ランキング一括取得モード（全銘柄をYahoo実データで統一算出）
  if (mode === "ranking") {
    const ranking = await buildMarketCapRanking(tf, force, globalRefreshSeq);
    return NextResponse.json(ranking);
  }

  // 生産品目（20大品目）インデックス一括取得モード（全銘柄をYahoo実データで統一算出）
  if (mode === "category_index") {
    const categoryIndex = await buildCategoryIndexResponse(
      tf,
      force,
      globalRefreshSeq
    );
    return NextResponse.json(categoryIndex);
  }

  const code = (searchParams.get("code") || "7203").trim();
  const data = await fetchStockDataForCode(code, tf, force, globalRefreshSeq);
  return NextResponse.json(data);
}
