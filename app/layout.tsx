import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://studio.clavisflow.net"),
  title: "ClavisFlow Studio | データ処理ポータル",
  description: "Excel・CSV・JSON・Googleスプレッドシートの共有処理を選んで、面倒なデータ作業をすぐ実行。",
  openGraph: {
    title: "ClavisFlow Studio | データ処理ポータル",
    description: "データを選ぶだけで、面倒な処理をすぐ実行。",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "ClavisFlow Studio データ処理ポータル" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClavisFlow Studio | データ処理ポータル",
    description: "データを選ぶだけで、面倒な処理をすぐ実行。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body suppressHydrationWarning>
        <AuthProvider><div className="app-page">{children}</div></AuthProvider>
      </body>
    </html>
  );
}
