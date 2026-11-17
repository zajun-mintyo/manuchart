// クライアント初期描画（0秒表示）＆ APIフォールバック共通の高速チャートデータ生成エンジン
// 連続ヒストリカル波形モデルにより、期間（1D〜ALL）を切り替えるたびに
// 各銘柄・各生産品目の「左端（開始時点）の高さ・トレンド方向・波形」がリアルに変化する仕様

import {
  getCompanyByCode,
  getCompanyProductCategories,
  PRIME_MANUFACTURING_COMPANIES,
  PRODUCT_CATEGORIES,
  ProductCategoryId,
  TIMEFRAMES,
  TimeframeKey,
  ManufacturingSector,
} from "@/data/companies";
import type {
  StockCandlePoint,
  StockApiResponse,
  MarketCapRankingItem,
  MarketCapRankingResponse,
  CategoryIndexPoint,
  CategoryIndexSeries,
  CategoryIndexResponse,
} from "@/app/api/stock/route";

// 基準時刻（SSRとクライアント初回描画でズレないよう固定UNIX秒を使用）
const FIXED_BASE_SEC = 1794030000;

export function formatTimestampLabel(
  tsSec: number,
  range: TimeframeKey
): {
  short: string;
  full: string;
} {
  const d = new Date(tsSec * 1000);
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
  return {
    short: `${year}/${month}`,
    full: `${year}/${month}/${day}`,
  };
}

export function computeSMAValue(
  values: number[],
  period: number,
  index: number,
  decimals = 2
): number | null {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += values[i];
  }
  return Number((sum / period).toFixed(decimals));
}

// 生産品目ごとの固有サイクル特性（周期・位相・ボラティリティ・初期基準オフセット）
const CATEGORY_CYCLE_PROFILE: Record<
  string,
  {
    longWavePeriodDays: number;
    midWavePeriodDays: number;
    shortWavePeriodDays: number;
    phaseOffsetRad: number;
    amplitude: number;
    secularTrendPerYear: number;
  }
> = {
  auto: {
    longWavePeriodDays: 1100,
    midWavePeriodDays: 210,
    shortWavePeriodDays: 38,
    phaseOffsetRad: 0.4,
    amplitude: 0.24,
    secularTrendPerYear: 0.08,
  },
  ship: {
    longWavePeriodDays: 1800,
    midWavePeriodDays: 340,
    shortWavePeriodDays: 55,
    phaseOffsetRad: 2.1,
    amplitude: 0.38,
    secularTrendPerYear: 0.22,
  },
  aircraft: {
    longWavePeriodDays: 1500,
    midWavePeriodDays: 280,
    shortWavePeriodDays: 45,
    phaseOffsetRad: 1.25,
    amplitude: 0.31,
    secularTrendPerYear: 0.19,
  },
  semicon: {
    longWavePeriodDays: 950,
    midWavePeriodDays: 145,
    shortWavePeriodDays: 24,
    phaseOffsetRad: 3.6,
    amplitude: 0.46,
    secularTrendPerYear: 0.28,
  },
  machinetool: {
    longWavePeriodDays: 1050,
    midWavePeriodDays: 175,
    shortWavePeriodDays: 31,
    phaseOffsetRad: 4.8,
    amplitude: 0.29,
    secularTrendPerYear: 0.09,
  },
  construction: {
    longWavePeriodDays: 1250,
    midWavePeriodDays: 230,
    shortWavePeriodDays: 42,
    phaseOffsetRad: 5.5,
    amplitude: 0.25,
    secularTrendPerYear: 0.07,
  },
  heavy_energy: {
    longWavePeriodDays: 1400,
    midWavePeriodDays: 260,
    shortWavePeriodDays: 36,
    phaseOffsetRad: 1.8,
    amplitude: 0.35,
    secularTrendPerYear: 0.24,
  },
  electronics: {
    longWavePeriodDays: 880,
    midWavePeriodDays: 160,
    shortWavePeriodDays: 29,
    phaseOffsetRad: 2.9,
    amplitude: 0.28,
    secularTrendPerYear: 0.11,
  },
  materials: {
    longWavePeriodDays: 1020,
    midWavePeriodDays: 195,
    shortWavePeriodDays: 34,
    phaseOffsetRad: 0.9,
    amplitude: 0.26,
    secularTrendPerYear: 0.12,
  },
  medtech: {
    longWavePeriodDays: 1350,
    midWavePeriodDays: 250,
    shortWavePeriodDays: 48,
    phaseOffsetRad: 4.1,
    amplitude: 0.21,
    secularTrendPerYear: 0.13,
  },
  optical_cable: {
    longWavePeriodDays: 1150,
    midWavePeriodDays: 155,
    shortWavePeriodDays: 26,
    phaseOffsetRad: 2.4,
    amplitude: 0.44,
    secularTrendPerYear: 0.31,
  },
  hvac: {
    longWavePeriodDays: 1200,
    midWavePeriodDays: 180,
    shortWavePeriodDays: 33,
    phaseOffsetRad: 3.2,
    amplitude: 0.23,
    secularTrendPerYear: 0.14,
  },
  pharma: {
    longWavePeriodDays: 1600,
    midWavePeriodDays: 310,
    shortWavePeriodDays: 60,
    phaseOffsetRad: 5.1,
    amplitude: 0.27,
    secularTrendPerYear: 0.11,
  },
  personal_mobility: {
    longWavePeriodDays: 980,
    midWavePeriodDays: 190,
    shortWavePeriodDays: 35,
    phaseOffsetRad: 1.5,
    amplitude: 0.28,
    secularTrendPerYear: 0.1,
  },
  game_entertainment: {
    longWavePeriodDays: 1300,
    midWavePeriodDays: 220,
    shortWavePeriodDays: 40,
    phaseOffsetRad: 0.2,
    amplitude: 0.32,
    secularTrendPerYear: 0.16,
  },
  optics_imaging: {
    longWavePeriodDays: 1120,
    midWavePeriodDays: 205,
    shortWavePeriodDays: 37,
    phaseOffsetRad: 4.4,
    amplitude: 0.22,
    secularTrendPerYear: 0.08,
  },
  tire_bearing: {
    longWavePeriodDays: 1080,
    midWavePeriodDays: 215,
    shortWavePeriodDays: 39,
    phaseOffsetRad: 2.7,
    amplitude: 0.21,
    secularTrendPerYear: 0.09,
  },
  steel_nonferrous: {
    longWavePeriodDays: 920,
    midWavePeriodDays: 150,
    shortWavePeriodDays: 28,
    phaseOffsetRad: 5.9,
    amplitude: 0.3,
    secularTrendPerYear: 0.07,
  },
  housing_glass: {
    longWavePeriodDays: 1180,
    midWavePeriodDays: 240,
    shortWavePeriodDays: 44,
    phaseOffsetRad: 3.9,
    amplitude: 0.22,
    secularTrendPerYear: 0.05,
  },
  food_beverage: {
    longWavePeriodDays: 1700,
    midWavePeriodDays: 290,
    shortWavePeriodDays: 52,
    phaseOffsetRad: 1.1,
    amplitude: 0.16,
    secularTrendPerYear: 0.08,
  },
};

// 任意の過去時刻 tsSec における銘柄のヒストリカル株価倍率（現在値 = 1.0）を算出する連続関数
// これにより、どの期間（1D, 1W, 1M, 3M, 6M, 1Y, 5Y, 10Y, ALL）を切り出しても
// 開始時点（左端）の価格水準や直後のトレンド方向（下げてから上がる、高値から調整する等）が銘柄・期間ごとに全く異なるリアルな動きになる
function computeHistoricalPriceMultiplier(
  code: string,
  tsSec: number,
  baseChangePct: number,
  roe: number,
  baseNowSec: number = FIXED_BASE_SEC
): number {
  const codeNum = parseInt(code, 10) || 7203;
  const cats = getCompanyProductCategories(code);
  const primaryCatId = cats[0]?.id ?? "auto";
  const prof =
    CATEGORY_CYCLE_PROFILE[primaryCatId] ?? CATEGORY_CYCLE_PROFILE.auto;

  // 現在時刻からの経過日数（過去ほどマイナスではなく正の遡り日数 daysAgo >= 0）
  const daysAgo = Math.max(0, (baseNowSec - tsSec) / 86400);

  // 銘柄固有の位相ズレ（同じ品目内でも銘柄ごとに山・谷のタイミングが少しずつ異なる）
  const companyPhase1 = ((codeNum * 137) % 360) * (Math.PI / 180);
  const companyPhase2 = ((codeNum * 293) % 360) * (Math.PI / 180);
  const companyPhase3 = ((codeNum * 521) % 360) * (Math.PI / 180);

  // 1. 長期構造トレンド（過去に行くほど成長分だけ低い、あるいはシクリカルに上下）
  const yearsAgo = daysAgo / 365;
  const companyGrowthBias =
    prof.secularTrendPerYear +
    (roe - 10) * 0.005 +
    (baseChangePct - 0.5) * 0.025;
  const secularFactor = Math.exp(-companyGrowthBias * Math.min(12, yearsAgo) * 0.55);

  // 2. 大波（景気・産業サイクル：数ヶ月〜数年単位の大きな山と谷）
  const wLong =
    Math.sin(
      (2 * Math.PI * daysAgo) / prof.longWavePeriodDays +
        prof.phaseOffsetRad +
        companyPhase1 * 0.35
    ) -
    Math.sin(prof.phaseOffsetRad + companyPhase1 * 0.35);

  // 3. 中波（四半期決算・需給サイクル：1〜6ヶ月単位で高値スタートや安値スタートを作る波）
  const wMid =
    Math.sin(
      (2 * Math.PI * daysAgo) / prof.midWavePeriodDays +
        prof.phaseOffsetRad * 1.7 +
        companyPhase2 * 0.55
    ) -
    Math.sin(prof.phaseOffsetRad * 1.7 + companyPhase2 * 0.55);

  // 4. 小波（月内・週内のスイング波：1W〜3Mで開始位置のばらつきを作る波）
  const wShort =
    Math.sin(
      (2 * Math.PI * daysAgo) / prof.shortWavePeriodDays +
        prof.phaseOffsetRad * 2.3 +
        companyPhase3 * 0.7
    ) -
    Math.sin(prof.phaseOffsetRad * 2.3 + companyPhase3 * 0.7);

  // 5. ザラ場・日중波（1D, 1W で寄り付きギャップや日中の山谷を作る波）
  const wIntraday =
    Math.sin((2 * Math.PI * daysAgo) / 1.4 + companyPhase1 + prof.phaseOffsetRad) -
    Math.sin(companyPhase1 + prof.phaseOffsetRad);

  const cycleWave =
    wLong * prof.amplitude * 0.52 +
    wMid * prof.amplitude * 0.38 +
    wShort * prof.amplitude * 0.22 +
    wIntraday * 0.018;

  const mult = secularFactor * (1 + cycleWave);
  return Math.max(0.18, Math.min(3.2, mult));
}

export interface InstantEngineOptions {
  nowSec?: number;
  refreshTick?: number;
}

// 銘柄・時間軸ごとの決定論的チャートデータを瞬時（<1ms）に生成
export function generateInstantStockData(
  code: string,
  range: TimeframeKey,
  options?: InstantEngineOptions
): StockApiResponse {
  const company = getCompanyByCode(code);
  const basePrice = company?.basePrice ?? 3000;
  const baseMarketCapOku = company?.marketCapOku ?? 10000;
  const baseChangePct = company?.baseChangePercent ?? 0.5;
  const roe = company?.roe ?? 10;
  const tf = TIMEFRAMES.find((t) => t.key === range) ?? TIMEFRAMES[5];

  const countMap: Record<TimeframeKey, number> = {
    "1D": 60,
    "1W": 80,
    "1M": 22,
    "3M": 62,
    "6M": 125,
    "1Y": 160,
    "5Y": 160,
    "10Y": 200,
    ALL: 200,
  };
  const stepSecMap: Record<TimeframeKey, number> = {
    "1D": 300,
    "1W": 1800,
    "1M": 86400,
    "3M": 86400,
    "6M": 86400,
    "1Y": 86400 * 2,
    "5Y": 86400 * 11,
    "10Y": 86400 * 18,
    ALL: 86400 * 30,
  };

  const count = countMap[range];
  const stepSec = stepSecMap[range];
  const nowSec = options?.nowSec ?? FIXED_BASE_SEC;
  const refreshTick = options?.refreshTick ?? 0;

  let seed =
    parseInt(code, 10) * 16807 +
    range.charCodeAt(0) * 1013 +
    (range.charCodeAt(1) || 7) * 313 +
    (refreshTick % 100000) * 7919;
  const nextRand = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // 更新ボタン押下時（refreshTick > 0）は現在株価にもリアルな最新ティック変動を加味
  const liveTickRatio =
    refreshTick > 0
      ? Math.sin(parseInt(code, 10) * 0.73 + refreshTick * 1.37) * 0.0085
      : 0;
  const effectiveLatestBasePrice = Math.max(
    30,
    Number((basePrice * (1 + liveTickRatio)).toFixed(1))
  );

  const rawCloses: number[] = [];
  const rawOpens: number[] = [];
  const rawHighs: number[] = [];
  const rawLows: number[] = [];
  const rawVolumes: number[] = [];
  const timestamps: number[] = [];

  const barVolFactor =
    range === "1D" ? 0.003 : range === "1W" ? 0.006 : 0.012;

  for (let i = 0; i < count; i++) {
    const ts = nowSec - (count - 1 - i) * stepSec;
    timestamps.push(ts);

    const mult = computeHistoricalPriceMultiplier(
      code,
      ts,
      baseChangePct,
      roe,
      nowSec
    );
    const microNoise =
      i === count - 1 ? 0 : (nextRand() - 0.5) * barVolFactor * 0.8;
    const close =
      i === count - 1
        ? effectiveLatestBasePrice
        : Math.max(30, Number((basePrice * mult * (1 + microNoise)).toFixed(1)));

    const prevClose = i > 0 ? rawCloses[i - 1] : close * (1 + (nextRand() - 0.5) * barVolFactor);
    const open = Number(prevClose.toFixed(1));
    const high = Number(
      (Math.max(open, close) * (1 + nextRand() * barVolFactor * 0.8)).toFixed(1)
    );
    const low = Number(
      (Math.min(open, close) * (1 - nextRand() * barVolFactor * 0.8)).toFixed(1)
    );
    const vol = Math.floor(1500000 + nextRand() * 8500000);

    rawOpens.push(open);
    rawCloses.push(close);
    rawHighs.push(high);
    rawLows.push(low);
    rawVolumes.push(vol);
  }

  // ★重要：一番左（i = 0）が全銘柄・全期間で同じ「0.0%」の1点に重なってしまう問題を解消するため、
  // 表示期間に入る前の「先行基準アンカー時点（期間長の35%前の時点）」を基準アンカーとして計算する。
  // これにより、期間開始時点（一番左の i = 0）において、各銘柄・各品目がその時点で実際に位置していた
  // 高値圏（例: +22%）・中位圏（例: +4%）・安値圏（例: -14%）のバラバラの高さからリアルにスタートする！
  const totalSpanSec = (count - 1) * stepSec;
  const anchorTs = timestamps[0] - Math.max(3600 * 6, Math.round(totalSpanSec * 0.38));
  const anchorMult = computeHistoricalPriceMultiplier(
    code,
    anchorTs,
    baseChangePct,
    roe,
    nowSec
  );
  const anchorPrice = Math.max(30, Number((basePrice * anchorMult).toFixed(1)));

  const startPrice = rawCloses[0] || basePrice;
  const latestPrice = rawCloses[rawCloses.length - 1] || effectiveLatestBasePrice;
  const previousClose =
    range === "1D"
      ? startPrice
      : Number(( basePrice / (1 + baseChangePct / 100)).toFixed(1));

  // 基準株価と基準時価総額から発行済株式数係数を算出（株価変動が時価総額にも連動する）
  const sharesFactor = baseMarketCapOku / Math.max(1, basePrice);
  const rawMarketCaps = rawCloses.map((c) =>
    Number((c * sharesFactor).toFixed(1))
  );
  const anchorMarketCapOku = Number((anchorPrice * sharesFactor).toFixed(1));
  const startMarketCapOku = rawMarketCaps[0] || baseMarketCapOku;
  const latestMarketCapOku =
    rawMarketCaps[rawMarketCaps.length - 1] || baseMarketCapOku;
  const previousCloseMarketCapOku = Number(
    (previousClose * sharesFactor).toFixed(1)
  );

  const points: StockCandlePoint[] = timestamps.map((ts, idx) => {
    const { short, full } = formatTimestampLabel(ts, range);
    const close = rawCloses[idx];
    const mcap = rawMarketCaps[idx];
    // 先行基準アンカー比の騰落率・増減額（左端 i=0 でも銘柄・期間ごとに異なるスタート位置になる）
    const mcapChangeOku = Number((mcap - anchorMarketCapOku).toFixed(1));
    const mcapChangePct = Number(
      (
        ((mcap - anchorMarketCapOku) / Math.max(1, anchorMarketCapOku)) *
        100
      ).toFixed(2)
    );

    return {
      timestamp: ts,
      dateLabel: short,
      fullDateLabel: full,
      open: rawOpens[idx],
      high: rawHighs[idx],
      low: rawLows[idx],
      close,
      volume: rawVolumes[idx],
      smaShort: computeSMAValue(rawCloses, tf.smaPeriods[0], idx, 2),
      smaMid: computeSMAValue(rawCloses, tf.smaPeriods[1], idx, 2),
      smaLong: computeSMAValue(rawCloses, tf.smaPeriods[2], idx, 2),
      changeFromStartPercent: mcapChangePct,
      marketCapOku: mcap,
      marketCapSmaShort: computeSMAValue(rawMarketCaps, tf.smaPeriods[0], idx, 1),
      marketCapSmaMid: computeSMAValue(rawMarketCaps, tf.smaPeriods[1], idx, 1),
      marketCapSmaLong: computeSMAValue(rawMarketCaps, tf.smaPeriods[2], idx, 1),
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
  const fiftyTwoWeekHigh = Math.round(
    Math.max(latestPrice * 1.18, ...rawHighs)
  );
  const fiftyTwoWeekLow = Math.round(
    Math.min(latestPrice * 0.82, ...rawLows)
  );

  const isoTime = options?.nowSec
    ? new Date(options.nowSec * 1000).toISOString()
    : "2026-11-07T06:00:00.000Z";

  return {
    code,
    ticker: `${code}.T`,
    range,
    source: "FALLBACK_ENGINE",
    fetchedAt: isoTime,
    meta: {
      latestPrice,
      previousClose,
      changeAmount,
      changePercent,
      periodChangeAmount,
      periodChangePercent,
      dayHigh: Math.max(...rawHighs.slice(-10)),
      dayLow: Math.min(...rawLows.slice(-10)),
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      volume: rawVolumes[rawVolumes.length - 1] || 3200000,
      marketTime: isoTime,
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
}

// 20大生産品目の合成インデックスを瞬時に算出
export function buildInstantCategoryIndices(
  range: TimeframeKey,
  overrideDataMap?: Record<string, StockApiResponse>,
  options?: InstantEngineOptions
): CategoryIndexSeries[] {
  return PRODUCT_CATEGORIES.map((cat) => {
    const stockDataList = cat.codes.map((code) => ({
      code,
      company: getCompanyByCode(code),
      data:
        overrideDataMap?.[code] ??
        generateInstantStockData(code, range, options),
    }));

    const baseSeries = stockDataList[0]?.data.points ?? [];
    const pointCount = baseSeries.length;

    const points: CategoryIndexPoint[] = [];
    for (let i = 0; i < pointCount; i++) {
      let sumMcap = 0;
      let sumChangeMcap = 0;
      let sumPct = 0;
      let validCount = 0;

      for (const item of stockDataList) {
        const pts = item.data.points;
        if (pts.length === 0) continue;
        const mappedIdx = Math.min(
          pts.length - 1,
          Math.round((i / Math.max(1, pointCount - 1)) * (pts.length - 1))
        );
        const pt = pts[mappedIdx];
        if (!pt) continue;
        sumMcap += pt.marketCapOku;
        sumChangeMcap += pt.marketCapChangeOku;
        sumPct += pt.marketCapChangePercent;
        validCount++;
      }

      const avgPct =
        validCount > 0 ? Number((sumPct / validCount).toFixed(2)) : 0;
      const changeMcap = Number(sumChangeMcap.toFixed(1));
      const baseAnchorMcap = Math.max(1, sumMcap - sumChangeMcap);
      const weightedPct = Number(
        ((sumChangeMcap / baseAnchorMcap) * 100).toFixed(2)
      );

      points.push({
        timestamp: baseSeries[i].timestamp,
        dateLabel: baseSeries[i].dateLabel,
        fullDateLabel: baseSeries[i].fullDateLabel,
        totalMarketCapOku: Number(sumMcap.toFixed(1)),
        changeMarketCapOku: changeMcap,
        avgChangePercent: avgPct,
        weightedChangePercent: weightedPct,
      });
    }

    const memberSummaries = stockDataList
      .map((item) => ({
        code: item.code,
        nameJa: item.company?.nameJa ?? item.code,
        latestMarketCapOku: item.data.meta.latestMarketCapOku,
        growthPercent: item.data.meta.periodMarketCapChangePercent,
      }))
      .sort((a, b) => b.growthPercent - a.growthPercent);

    const topDriver = memberSummaries[0] ?? {
      code: cat.codes[0] ?? "",
      nameJa: "---",
      growthPercent: 0,
    };

    const startTotal = points[0]?.totalMarketCapOku ?? 0;
    const latestTotal = points[points.length - 1]?.totalMarketCapOku ?? 0;
    const periodChangeMcap =
      points[points.length - 1]?.changeMarketCapOku ??
      Number((latestTotal - startTotal).toFixed(1));
    const avgPeriodPct = points[points.length - 1]?.avgChangePercent ?? 0;
    const weightedPeriodPct =
      points[points.length - 1]?.weightedChangePercent ?? 0;

    return {
      categoryId: cat.id as ProductCategoryId,
      name: cat.name,
      shortName: cat.shortName,
      icon: cat.icon,
      color: cat.color,
      cycleType: cat.cycleType,
      description: cat.description,
      codes: cat.codes,
      companyCount: cat.codes.length,
      startTotalMarketCapOku: startTotal,
      latestTotalMarketCapOku: latestTotal,
      periodChangeMarketCapOku: periodChangeMcap,
      avgPeriodChangePercent: avgPeriodPct,
      weightedPeriodChangePercent: weightedPeriodPct,
      topDriver,
      memberSummaries,
      points,
    };
  });
}

// 全銘柄の時価総額伸び率ランキングを瞬時に算出
export function buildInstantRankingItems(
  range: TimeframeKey,
  overrideDataMap?: Record<string, StockApiResponse>,
  options?: InstantEngineOptions
): MarketCapRankingItem[] {
  return PRIME_MANUFACTURING_COMPANIES.map((comp) => {
    const data =
      overrideDataMap?.[comp.code] ??
      generateInstantStockData(comp.code, range, options);

    return {
      code: comp.code,
      nameJa: comp.nameJa,
      sector: comp.sector as ManufacturingSector,
      subCategory: comp.subCategory,
      startMarketCapOku: data.meta.startMarketCapOku,
      latestMarketCapOku: data.meta.latestMarketCapOku,
      changeMarketCapOku: data.meta.periodMarketCapChangeOku,
      growthPercent: data.meta.periodMarketCapChangePercent,
      latestPrice: data.meta.latestPrice,
      dayChangePercent: data.meta.changePercent,
    };
  });
}

export type { MarketCapRankingResponse, CategoryIndexResponse };
