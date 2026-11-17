import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ManuChart | 東証プライム製造業 株価チャート＆セクター比較",
  description:
    "日本のモノづくり（東証プライム上場・製造業16業種）に特化した超高速株価チャート＆同業他社比較プラットフォーム。当日〜10年・全期間の9段階時間軸とワンクリック最新株価更新に対応。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        {children}
      </body>
    </html>
  );
}
