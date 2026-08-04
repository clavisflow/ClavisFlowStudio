import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Files,
  Link2,
  Repeat2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PortalHeader } from "@/components/portal-header";
import { PortalSidebar } from "@/components/portal-sidebar";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "ClavisFlowでできること | ClavisFlow Studio",
  description: "データの形式を越えて、作った処理を何度でも使い回す。ClavisFlow Studioでデータ処理が変わる5つの理由を紹介します。",
  openGraph: {
    title: "データ処理が変わる、5つの理由。 | ClavisFlow Studio",
    description: "データの形式を越えて、作った処理を何度でも使い回す。ClavisFlow Studioでできることを紹介します。",
    images: [{ url: "/features-og.png", width: 1734, height: 907, alt: "ClavisFlow Studio データ処理が変わる5つの理由" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "データ処理が変わる、5つの理由。 | ClavisFlow Studio",
    description: "データの形式を越えて、作った処理を何度でも使い回す。ClavisFlow Studioでできることを紹介します。",
    images: ["/features-og.png"],
  },
};

const features = [
  {
    number: "01",
    icon: Files,
    shortTitle: "形式を越える",
    title: "違うデータ形式を、同じように扱える",
    description: "CSV、Excel、JSON、Googleスプレッドシートなど、入口が違っても表データとして共通のFlowへつなげられます。複数のデータをまとめて、照合や結合をすることもできます。",
    visual: (
      <KoboyoIllustration name="person-connecting-two-systems" label="異なる2つの仕組みをつなぐ人物" />
    ),
  },
  {
    number: "02",
    icon: Repeat2,
    shortTitle: "繰り返し使う",
    title: "一度作った処理を、何度でも使える",
    description: "毎月の売上集計、マスタとの照合、データの整形。一度Flowにすれば、次回からは新しいファイルを選んで実行するだけです。担当者が変わっても、同じ処理を再現できます。",
    visual: (
      <KoboyoIllustration name="person-automating-repetitive-task" label="繰り返し作業を自動化する人物" />
    ),
  },
  {
    number: "03",
    icon: Link2,
    shortTitle: "探して共有",
    title: "処理を探して使える。URLでも渡せる",
    description: "必要な処理が見つかれば、その場ですぐに実行できます。自分で作ったFlowはURLで共有でき、公開されたFlowをコピーして自分向けに変更することもできます。",
    visual: (
      <KoboyoIllustration name="sharing-screen" label="画面を共有する人物" />
    ),
  },
  {
    number: "04",
    icon: ShieldCheck,
    shortTitle: "手元で処理",
    title: "データを手元に置いたまま処理できる",
    description: "通常のCSV・Excel・JSONはブラウザ内で処理します。ファイル本体、行データ、通常の実行結果をサーバーへ送信・保存せず、専用ソフトのインストールも必要ありません。",
    visual: (
      <KoboyoIllustration name="security-analyst-screen" label="安全な画面で作業する人物" />
    ),
  },
  {
    number: "05",
    icon: Bot,
    shortTitle: "AIで道具化",
    title: "AIで作れて、確定した処理として残る",
    description: "やりたいことを日本語で伝えると、AIがDuckDB SQLの作成を支援します。完成したFlowは同じルールで繰り返し実行でき、生成されたSQLを確認・修正することもできます。",
    visual: (
      <KoboyoIllustration name="friendly-boxy-robot-shaking" label="AIロボットと握手する人物" />
    ),
  },
];

type KoboyoIllustrationName =
  | "person-connecting-two-systems"
  | "person-automating-repetitive-task"
  | "sharing-screen"
  | "security-analyst-screen"
  | "friendly-boxy-robot-shaking";

function KoboyoIllustration({ name, label }: { name: KoboyoIllustrationName; label: string }) {
  return <span className={`koboyo-illustration koboyo-${name}`} role="img" aria-label={label} />;
}

export default function FeaturesPage() {
  return (
    <div className="portal portal-app-shell">
      <PortalSidebar />
      <main className="portal-main portal-shell-main">
        <PortalHeader />

        <div className="features-content">
          <header className="features-hero">
            <p className="features-eyebrow"><Sparkles size={17} aria-hidden="true" />ClavisFlowでできること</p>
            <h1>データ処理が変わる、5つの理由。</h1>
            <p className="features-lead">データはバラバラでも、処理はひとつ。<br />ClavisFlow Studioは、形式やツールに縛られず、処理を見つけて、作って、何度でも使える場所です。</p>
          </header>

          <nav className="features-toc" aria-label="5つの理由の目次">
            <ol>
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.number}>
                    <a href={`#feature-${feature.number}`}>
                      <Icon aria-hidden="true" />
                      <span><small>{feature.number}</small>{feature.shortTitle}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="features-list">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <section className="feature-card" id={`feature-${feature.number}`} aria-labelledby={`feature-title-${feature.number}`} key={feature.number}>
                  <div className="feature-copy">
                    <div className="feature-number"><Icon aria-hidden="true" /><span>{feature.number}</span></div>
                    <h2 id={`feature-title-${feature.number}`}>{feature.title}</h2>
                    <p className="feature-description">{feature.description}</p>
                  </div>
                  <div className="feature-visual">{feature.visual}</div>
                </section>
              );
            })}
          </div>

          <section className="features-cta" aria-label="ClavisFlow Studioを試す">
            <div>
              <Link className="portal-button primary" href="/#recommended">おすすめの処理を使ってみる <ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className="portal-button secondary" href="/flows/new/">自分の処理を作る</Link>
            </div>
          </section>
        </div>

        <SiteFooter />
      </main>
    </div>
  );
}
