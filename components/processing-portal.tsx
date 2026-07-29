"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Braces,
  Check,
  CheckCircle2,
  ChevronRight,
  Combine,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Gift,
  Heart,
  Search,
  Sheet,
  Sparkles,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PortalSidebar, portalCategories as categories, type PortalCategory as Category } from "@/components/portal-sidebar";
import { PortalHeader } from "@/components/portal-header";
import { SiteFooter } from "@/components/site-footer";
import { OFFICIAL_FLOW_PREFIX } from "@/lib/demo-flow";
import { visibleSampleTemplates } from "@/lib/sample-templates";
import { flowCategoryLabels } from "@/lib/flow-categories";
import { loadPublicFlowCatalog } from "@/lib/flow-store";
import type { PublicFlowSummary } from "@/lib/flow-types";
import {
  getPortalActivityServerSnapshot,
  getPortalActivitySnapshot,
  subscribePortalActivity,
  toggleFavorite as toggleStoredFavorite,
} from "@/lib/portal-activity";
type SourceFilter = "すべて" | "ファイル" | "Googleスプレッドシート";

type PortalItem = {
  id: string;
  name: string;
  description: string;
  categories: Category[];
  required: string;
  sources: Array<"Excel" | "CSV" | "JSON" | "Googleスプレッドシート">;
  uses: number;
  tone: "green" | "amber" | "blue" | "purple";
  icon: "chart" | "table" | "combine" | "check";
};

const officialMeta: Record<string, Pick<PortalItem, "categories" | "required" | "uses" | "tone" | "icon">> = {
  "invoice-payment": { categories: ["チェック"], required: "請求番号、請求金額、入金額", uses: 1240, tone: "purple", icon: "check" },
  "sales-by-product": { categories: ["集計"], required: "商品コード、商品名、数量、売上金額", uses: 980, tone: "green", icon: "chart" },
  "attach-product-master": { categories: ["結合"], required: "商品コード", uses: 860, tone: "blue", icon: "combine" },
  "low-inventory": { categories: ["抽出"], required: "現在庫、入荷予定、発注点", uses: 720, tone: "amber", icon: "table" },
  "customer-data-check": { categories: ["整形"], required: "顧客ID、氏名、連絡先", uses: 640, tone: "purple", icon: "check" },
};

const officialItems: PortalItem[] = visibleSampleTemplates.map((sample) => ({
  id: `${OFFICIAL_FLOW_PREFIX}${sample.id}`,
  name: sample.flowName,
  description: sample.description,
  sources: ["CSV"],
  ...officialMeta[sample.id],
}));

const recommended = officialItems.slice(0, 4);

const latest = [
  { id: "multi-store", name: "複数店舗の売上データを統合", description: "店舗別データを結合し、統合した売上一覧を作成します。", categories: ["結合"] as Category[], uses: 42, tone: "green" as const, icon: Gift },
  { id: "invoice-check", name: "請求データの入力漏れをチェック", description: "必須項目の空白や不正な値を検出して一覧にします。", categories: ["チェック"] as Category[], uses: 35, tone: "blue" as const, icon: FileText },
  { id: "json-products", name: "JSONの商品データを一覧化", description: "JSON形式の商品データを扱いやすい表形式に変換します。", categories: ["変換"] as Category[], uses: 38, tone: "purple" as const, icon: Braces },
  { id: "conditional-extract", name: "指定条件でデータを抽出", description: "指定した条件に一致するデータだけを抽出します。", categories: ["抽出"] as Category[], uses: 28, tone: "amber" as const, icon: Filter },
];

function formatUses(uses: number) {
  return new Intl.NumberFormat("ja-JP").format(uses);
}

function sourceMatches(sources: PortalItem["sources"], filter: SourceFilter) {
  if (filter === "すべて") return true;
  if (filter === "Googleスプレッドシート") return sources.includes("Googleスプレッドシート");
  return sources.some((source) => source !== "Googleスプレッドシート");
}

function itemIcon(icon: PortalItem["icon"]) {
  const icons = { chart: BarChart3, table: Table2, combine: Combine, check: CheckCircle2 };
  return icons[icon];
}

export function ProcessingPortal() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "すべて">("すべて");
  const [source, setSource] = useState<SourceFilter>("すべて");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const [publishedFlows, setPublishedFlows] = useState<PublicFlowSummary[]>([]);
  const activity = useSyncExternalStore(subscribePortalActivity, getPortalActivitySnapshot, getPortalActivityServerSnapshot);
  const favoriteCount = Object.values(activity.favorites).filter((favorite) => favorite.active).length;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      const requestedQuery = parameters.get("q");
      if (requestedQuery) setQuery(requestedQuery);
      if (parameters.get("favorites") === "1") setFavoritesOnly(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    loadPublicFlowCatalog().then(setPublishedFlows).catch(() => setPublishedFlows([]));
  }, []);

  const publicItems = useMemo<PortalItem[]>(() => publishedFlows.map((flow) => ({
    id: flow.publicId,
    name: flow.name,
    description: flow.description,
    categories: flow.categories,
    required: [...new Set(flow.inputs.flatMap((input) => input.requiredColumns.filter((column) => column.required).map((column) => column.name)))].join("、") || "なし",
    sources: ["Excel", "CSV", "JSON", "Googleスプレッドシート"],
    uses: 0,
    tone: "purple",
    icon: "table",
  })), [publishedFlows]);
  const allRecommended = useMemo(() => [...publicItems, ...recommended], [publicItems]);

  const normalizedQuery = query.trim().toLocaleLowerCase("ja");
  const filteredRecommended = useMemo(
    () =>
      allRecommended.filter((item) => {
        const text = [item.name, item.description, ...item.categories.map((value) => flowCategoryLabels[value]), item.required, ...item.sources].join(" ").toLocaleLowerCase("ja");
        return (!normalizedQuery || text.includes(normalizedQuery)) &&
          (category === "すべて" || item.categories.includes(category)) &&
          (!favoritesOnly || activity.favorites[item.id]?.active) &&
          sourceMatches(item.sources, source);
      }),
    [activity.favorites, allRecommended, category, favoritesOnly, normalizedQuery, source],
  );
  const filteredLatest = latest.filter((item) => {
    const text = [item.name, item.description, ...item.categories.map((value) => flowCategoryLabels[value])].join(" ").toLocaleLowerCase("ja");
    return (!normalizedQuery || text.includes(normalizedQuery)) &&
      (category === "すべて" || item.categories.includes(category)) &&
      (!favoritesOnly || activity.favorites[item.id]?.active);
  });
  const filteredOfficial = officialItems.filter((item) => {
    const text = [item.name, item.description, ...item.categories.map((value) => flowCategoryLabels[value]), item.required].join(" ").toLocaleLowerCase("ja");
    return (!normalizedQuery || text.includes(normalizedQuery)) &&
      (category === "すべて" || item.categories.includes(category)) &&
      (!favoritesOnly || activity.favorites[item.id]?.active);
  });

  function toggleFavorite(item: Pick<PortalItem, "id" | "name" | "description">) {
    toggleStoredFavorite(item.id, { name: item.name, description: item.description, href: `/run/?flow=${encodeURIComponent(item.id)}` });
  }

  function chooseCategory(next: Category | "すべて") {
    setCategory(next);
    requestAnimationFrame(() => document.querySelector("#discover")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  function resetFilters() {
    setQuery("");
    setCategory("すべて");
    setSource("すべて");
    setFavoritesOnly(false);
  }

  return (
    <div className="portal portal-app-shell">
      <PortalSidebar onCategory={chooseCategory} onGuide={() => showNotice("使い方ガイドは準備中です")} />

      <main className="portal-main portal-shell-main" id="top">
        <PortalHeader query={query} onQueryChange={setQuery} />

        <div className="portal-content">
          <section className="portal-hero" aria-labelledby="hero-title" suppressHydrationWarning>
            <div className="portal-hero-copy">
              <p className="portal-eyebrow"><Sparkles size={15} /> みんなの処理を、すぐ自分の仕事に</p>
              <h1 id="hero-title">データを選ぶだけで、<br />面倒な処理をすぐ実行。</h1>
              <p>Excel・CSV・JSON・Googleスプレッドシートなど、<br className="portal-desktop-break" />さまざまなデータに対応しています。</p>
              <div className="portal-hero-actions">
                <a className="portal-button primary" href="#recommended" suppressHydrationWarning>おすすめの処理を使ってみる <ArrowRight size={17} /></a>
                <Link className="portal-button secondary" href="/flows/new/">自分の処理を作る</Link>
              </div>
            </div>
            <HeroMock />
          </section>

          <section className="portal-section" id="recommended" aria-labelledby="recommended-title">
            <div className="portal-section-title">
              <div><p>RECOMMENDED</p><h2 id="recommended-title">おすすめの処理</h2></div>
              <button onClick={resetFilters}>すべて見る <ChevronRight size={16} /></button>
            </div>
            {filteredRecommended.length > 0 ? (
              <div className="portal-card-grid">
                {filteredRecommended.map((item) => {
                  const Icon = itemIcon(item.icon);
                  const favorite = Boolean(activity.favorites[item.id]?.active);
                  return (
                    <article className="portal-process-card" key={item.id}>
                      <div className="portal-card-heading">
                        <span className={`portal-icon-tile ${item.tone}`}><Icon /></span>
                        <button className={`portal-favorite ${favorite ? "active" : ""}`} aria-label={`${item.name}をお気に入り${favorite ? "から削除" : "に追加"}`} aria-pressed={favorite} onClick={() => toggleFavorite(item)}><Heart /></button>
                      </div>
                      <h3>{item.name}</h3>
                      <p className="portal-card-description">{item.description}</p>
                      <div className="portal-category-tags">{item.categories.map((value) => <span className={`portal-category-tag ${item.tone}`} key={value}>{flowCategoryLabels[value]}</span>)}</div>
                      <dl><div><dt>必要な項目</dt><dd>{item.required}</dd></div><div><dt>対応入力元</dt><dd><SourceBadges sources={item.sources} /></dd></div></dl>
                      <div className="portal-card-footer">
                        <span>利用 {formatUses(item.uses + (activity.runCounts[item.id] ?? 0))} 回</span>
                        <Link href={`/run/?flow=${encodeURIComponent(item.id)}`}>使ってみる <ChevronRight size={15} /></Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <EmptyResults onReset={resetFilters} />}
          </section>

          <section className="portal-section portal-official-section" id="official" aria-labelledby="official-title">
            <div className="portal-section-title">
              <div><p>OFFICIAL</p><h2 id="official-title">公式の処理</h2></div>
            </div>
            {filteredOfficial.length > 0 ? (
              <div className="portal-official-list">
                {filteredOfficial.map((item) => {
                  const Icon = itemIcon(item.icon);
                  const favorite = Boolean(activity.favorites[item.id]?.active);
                  return (
                    <article className="portal-official-item" key={item.id}>
                      <span className={`portal-icon-tile ${item.tone}`}><Icon /></span>
                      <div><h3>{item.name}</h3><p>{item.description}</p><span className="portal-official-uses">利用 {formatUses(item.uses + (activity.runCounts[item.id] ?? 0))} 回</span></div>
                      <span className="portal-official-badge">公式</span>
                      <button className={`portal-favorite ${favorite ? "active" : ""}`} aria-label={`${item.name}をお気に入り${favorite ? "から削除" : "に追加"}`} aria-pressed={favorite} onClick={() => toggleFavorite(item)}><Heart /></button>
                      <Link href={`/run/?flow=${encodeURIComponent(item.id)}`}>使ってみる <ChevronRight size={16} /></Link>
                    </article>
                  );
                })}
              </div>
            ) : <EmptyResults onReset={resetFilters} />}
          </section>

          <section className="portal-section portal-discover" id="discover" aria-labelledby="discover-title">
            <div className="portal-section-title compact"><div><p>DISCOVER</p><h2 id="discover-title">目的から探す</h2></div></div>
            <div className="portal-filter-row">
              <div className="portal-chips" aria-label="目的で絞り込む">
                <button className={`portal-favorites-chip ${favoritesOnly ? "active" : ""}`} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((current) => !current)}><Heart />お気に入り {favoriteCount}</button>
                {categories.map((item) => <button className={category === item ? "active" : ""} aria-pressed={category === item} key={item} onClick={() => setCategory(category === item ? "すべて" : item)}>{flowCategoryLabels[item]}</button>)}
              </div>
              <div className="portal-source-filter" aria-label="入力元で絞り込む">
                <span>入力元で絞り込む</span>
                {(["すべて", "ファイル", "Googleスプレッドシート"] as SourceFilter[]).map((item) => <button className={source === item ? "active" : ""} aria-pressed={source === item} key={item} onClick={() => setSource(item)}>{item}</button>)}
              </div>
            </div>
          </section>

          <section className="portal-section portal-latest-section" id="latest" aria-labelledby="latest-title">
            <div className="portal-section-title">
              <div><p>NEW ARRIVALS</p><h2 id="latest-title">新着の処理</h2></div>
              <a href="#latest">すべて見る <ChevronRight size={16} /></a>
            </div>
            {filteredLatest.length > 0 ? (
              <div className="portal-latest-grid">
                {filteredLatest.map((item) => {
                  const Icon = item.icon;
                  const favorite = Boolean(activity.favorites[item.id]?.active);
                  return (
                    <article className="portal-latest-item" key={item.id}>
                      <span className={`portal-icon-tile small ${item.tone}`}><Icon /></span>
                      <div><div className="portal-latest-name"><h3>{item.name}</h3><span>NEW</span></div><p>{item.description}</p></div>
                      <span className="portal-latest-uses">利用 {formatUses(item.uses + (activity.runCounts[item.id] ?? 0))} 回</span>
                      <button className={`portal-favorite ${favorite ? "active" : ""}`} aria-label={`${item.name}をお気に入り${favorite ? "から削除" : "に追加"}`} aria-pressed={favorite} onClick={() => toggleFavorite(item)}><Heart /></button>
                    </article>
                  );
                })}
              </div>
            ) : <EmptyResults onReset={resetFilters} />}
          </section>
        </div>
        <SiteFooter />
      </main>
      {notice && <div className="portal-toast" role="status">{notice}</div>}
    </div>
  );
}

function HeroMock() {
  return (
    <div className="portal-hero-visual" aria-label="4種類のデータを処理して表とグラフに変換するイメージ">
      <div className="portal-file-row">
        <span className="excel"><FileSpreadsheet /><b>XLSX</b></span>
        <span className="csv"><FileText /><b>CSV</b></span>
        <span className="json"><FileJson /><b>JSON</b></span>
        <span className="sheet"><Sheet /><b>Sheets</b></span>
      </div>
      <div className="portal-flow-line"><i /><i /><i /><i /></div>
      <div className="portal-transform-row">
        <div className="portal-transform-mark"><Image src="/clavisflow-studio-icon.png" alt="" width={64} height={64} unoptimized /><Sparkles /></div>
        <ArrowRight className="portal-flow-arrow" />
        <div className="portal-result-card">
          <div className="portal-result-header"><i /><i /></div>
          <div className="portal-result-table">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
          <div className="portal-result-checks"><Check /><Check /><Check /></div>
          <div className="portal-mini-chart"><i /><i /><i /><i /></div>
        </div>
      </div>
      <span className="portal-mock-label">処理完了</span>
    </div>
  );
}

function SourceBadges({ sources }: { sources: PortalItem["sources"] }) {
  return <span className="portal-source-badges">{sources.map((source) => {
    const Icon = source === "Excel" ? FileSpreadsheet : source === "CSV" ? FileText : source === "JSON" ? FileJson : Sheet;
    const label = source === "Googleスプレッドシート" ? "スプレッドシート" : source;
    return <span key={source}><Icon />{label}</span>;
  })}</span>;
}

function EmptyResults({ onReset }: { onReset: () => void }) {
  return <div className="portal-empty"><Search /><h3>条件に合う処理が見つかりませんでした</h3><p>検索ワードや絞り込み条件を変えてお試しください。</p><button onClick={onReset}>条件をクリア</button></div>;
}
