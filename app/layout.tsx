import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClavisFlow Studio",
  description: "CSVデータをアップロードせず、毎月のデータ処理をURLで共有。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
