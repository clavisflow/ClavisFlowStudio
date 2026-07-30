import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://studio.clavisflow.net"),
  title: "ClavisFlow Studio | データ処理ポータル",
  description: "Excel・CSV・JSON・Googleスプレッドシートのデータ処理を、探してすぐ実行。見つからない処理は、自分で作れます。",
  openGraph: {
    title: "ClavisFlow Studio | データ処理ポータル",
    description: "データ処理が見つかる。なければ作れる。",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "ClavisFlow Studio データ処理ポータル" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClavisFlow Studio | データ処理ポータル",
    description: "データ処理が見つかる。なければ作れる。",
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
