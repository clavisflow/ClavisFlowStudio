import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClavisFlow Studio",
  description: "CSVデータをアップロードせず、毎月のデータ処理をURLで共有。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body suppressHydrationWarning>
        <div className="app-page">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
