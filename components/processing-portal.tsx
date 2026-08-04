"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  Heart,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth-provider";
import { PortalSidebar, portalCategories as categories, portalCategoryIcons, type PortalCategory as Category } from "@/components/portal-sidebar";
import { PortalHeader } from "@/components/portal-header";
import { SiteFooter } from "@/components/site-footer";
import { OFFICIAL_FLOW_PREFIX } from "@/lib/demo-flow";
import { visibleSampleTemplates } from "@/lib/sample-templates";
import { flowCategoryLabels } from "@/lib/flow-categories";
import { loadFavoriteCounts, syncPortalFavorites, type FavoriteCounts } from "@/lib/favorite-store";
import { loadPublicFlowCatalog } from "@/lib/flow-store";
import type { PublicFlowSummary } from "@/lib/flow-types";
import { loadFlowUsageCounts, type FlowUsageCounts } from "@/lib/usage-store";
import {
  getPortalActivityServerSnapshot,
  getPortalActivitySnapshot,
  retainFavoriteRecordsForOwner,
  subscribePortalActivity,
  toggleFavorite as toggleStoredFavorite,
} from "@/lib/portal-activity";

const INITIAL_PROCESS_COUNT = 12;

type PortalItem = {
  id: string;
  name: string;
  description: string;
  categories: Category[];
  required: string[];
};

const categoryColorClasses: Record<Category, string> = {
  整形: "format",
  集計: "summary",
  結合: "combine",
  変換: "transform",
  チェック: "check",
  抽出: "extract",
};

const officialMeta: Record<string, Pick<PortalItem, "required">> = {
  "invoice-payment": { required: ["照合キー", "基準金額", "実績金額"] },
  "sales-by-product": { required: ["集計キー", "項目名", "数量", "金額"] },
  "attach-product-master": { required: ["照合キー"] },
  "low-inventory": { required: ["現在値", "予定値", "基準値"] },
  "customer-data-check": { required: ["ID", "名称", "必須項目"] },
  "latest-record-by-key": { required: ["ID", "更新日"] },
  "remove-duplicate-rows": { required: ["列構成は自由"] },
  "compare-data-differences": { required: ["照合キー", "比較値"] },
  "replace-values-from-map": { required: ["変換対象値", "変換前", "変換後"] },
  "append-same-format-files": { required: ["同じ列構成"] },
  "add-date-parts": { required: ["日付"] },
  "normalize-text": { required: ["文字列"] },
  "find-invalid-values": { required: ["ID", "数値項目", "日付項目"] },
  "calculate-elapsed-days": { required: ["ID", "開始日", "終了日"] },
  "find-missing-master-keys": { required: ["ID", "照合キー"] },
  "wide-to-long": { required: ["ID", "横に並んだ値の列"] },
  "long-to-wide": { required: ["ID", "区分", "値"] },
  "previous-value-difference": { required: ["ID", "日付", "値"] },
  "find-overlapping-periods": { required: ["ID", "対象キー", "開始日", "終了日"] },
  "summarize-input-status": { required: ["列構成は自由"] },
  "summarize-duplicate-keys": { required: ["照合キー"] },
  "find-sequence-gaps": { required: ["グループキー", "連番", "日付"] },
  "split-delimited-values": { required: ["ID", "値一覧"] },
  "find-numeric-outliers": { required: ["ID", "値"] },
  "add-subtotals-grand-total": { required: ["集計キー", "金額"] },
};

const officialItems: PortalItem[] = visibleSampleTemplates.map((sample) => ({
  id: `${OFFICIAL_FLOW_PREFIX}${sample.id}`,
  name: sample.flowName,
  description: sample.description,
  categories: sample.categories,
  ...officialMeta[sample.id],
}));

const officialProcessIds = new Set(officialItems.map((item) => item.id));

export function ProcessingPortal() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "すべて">("すべて");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [visibleProcessCount, setVisibleProcessCount] = useState(INITIAL_PROCESS_COUNT);
  const [publishedFlows, setPublishedFlows] = useState<PublicFlowSummary[]>([]);
  const [favoriteCounts, setFavoriteCounts] = useState<FavoriteCounts>({});
  const [usageCounts, setUsageCounts] = useState<FlowUsageCounts>({});
  const favoriteSyncRequest = useRef(0);
  const activity = useSyncExternalStore(subscribePortalActivity, getPortalActivitySnapshot, getPortalActivityServerSnapshot);
  const favoriteCount = Object.values(activity.favorites).filter((favorite) => favorite.active).length;
  const favoriteRevision = useMemo(
    () => Object.entries(activity.favorites).map(([key, favorite]) => `${key}:${favorite.active ? 1 : 0}:${favorite.updatedAt}:${favorite.ownerId ?? ""}`).sort().join("|"),
    [activity.favorites],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      const requestedQuery = parameters.get("q");
      if (requestedQuery) {
        setQuery(requestedQuery);
        requestAnimationFrame(() => document.querySelector("#discover")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      if (parameters.get("favorites") === "1") setFavoritesOnly(true);
      if (parameters.get("official") === "1") setOfficialOnly(true);
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
    required: [...new Set(flow.inputs.flatMap((input) => input.requiredColumns.filter((column) => column.required).map((column) => column.name)))],
  })), [publishedFlows]);
  const allProcesses = useMemo(() => [...publicItems, ...officialItems], [publicItems]);
  const allProcessKeys = useMemo(
    () => allProcesses.map((item) => item.id),
    [allProcesses],
  );

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    const requestId = ++favoriteSyncRequest.current;
    if (!userId) retainFavoriteRecordsForOwner();
    const request = userId ? syncPortalFavorites(allProcessKeys, userId) : loadFavoriteCounts(allProcessKeys);
    request.then((counts) => {
      if (active && requestId === favoriteSyncRequest.current) setFavoriteCounts(counts);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [allProcessKeys, authLoading, favoriteRevision, userId]);

  useEffect(() => {
    let active = true;
    loadFlowUsageCounts(allProcessKeys).then((counts) => {
      if (active) setUsageCounts(counts);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [allProcessKeys]);

  const recommendedItems = useMemo(() => allProcesses.map((item, index) => ({
    item,
    index,
    score: Math.log1p(usageCounts[item.id]?.recent ?? 0) + 4 * Math.log1p(favoriteCounts[item.id] ?? 0),
  })).sort((left, right) => right.score - left.score || (usageCounts[right.item.id]?.total ?? 0) - (usageCounts[left.item.id]?.total ?? 0) || left.index - right.index).slice(0, 4).map(({ item }) => item), [allProcesses, favoriteCounts, usageCounts]);

  const normalizedQuery = query.trim().toLocaleLowerCase("ja");
  const filteredProcesses = useMemo(
    () =>
      allProcesses.filter((item) => {
        const text = [item.name, item.description, ...item.categories.map((value) => flowCategoryLabels[value]), ...item.required].join(" ").toLocaleLowerCase("ja");
        return (!normalizedQuery || text.includes(normalizedQuery)) &&
          (category === "すべて" || item.categories.includes(category)) &&
          (!favoritesOnly || activity.favorites[item.id]?.active) &&
          (!officialOnly || officialProcessIds.has(item.id));
      }),
    [activity.favorites, allProcesses, category, favoritesOnly, normalizedQuery, officialOnly],
  );
  const visibleProcesses = filteredProcesses.slice(0, visibleProcessCount);

  function toggleFavorite(item: Pick<PortalItem, "id" | "name" | "description">) {
    const active = toggleStoredFavorite(item.id, { name: item.name, description: item.description, href: `/run/?flow=${encodeURIComponent(item.id)}` }, userId);
    if (userId) {
      setFavoriteCounts((current) => ({
        ...current,
        [item.id]: Math.max(0, (current[item.id] ?? 0) + (active ? 1 : -1)),
      }));
    }
  }

  function chooseCategory(next: Category | "すべて") {
    setCategory(next);
    setFavoritesOnly(false);
    setOfficialOnly(false);
    setVisibleProcessCount(INITIAL_PROCESS_COUNT);
    requestAnimationFrame(() => document.querySelector("#discover")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function showFavorites() {
    setQuery("");
    setCategory("すべて");
    setFavoritesOnly(true);
    setOfficialOnly(false);
    setVisibleProcessCount(INITIAL_PROCESS_COUNT);
    requestAnimationFrame(() => document.querySelector("#discover")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function showOfficial() {
    setQuery("");
    setCategory("すべて");
    setFavoritesOnly(false);
    setOfficialOnly(true);
    setVisibleProcessCount(INITIAL_PROCESS_COUNT);
    requestAnimationFrame(() => document.querySelector("#discover")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function changeQuery(next: string) {
    const startsSearch = !query.trim() && Boolean(next.trim());
    setQuery(next);
    setVisibleProcessCount(INITIAL_PROCESS_COUNT);
    if (next.trim()) {
      setCategory("すべて");
      setFavoritesOnly(false);
      setOfficialOnly(false);
      if (startsSearch) requestAnimationFrame(() => document.querySelector("#discover")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function showSearchResults() {
    setCategory("すべて");
    setFavoritesOnly(false);
    setOfficialOnly(false);
    setVisibleProcessCount(INITIAL_PROCESS_COUNT);
    requestAnimationFrame(() => document.querySelector("#discover")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function resetFilters() {
    setQuery("");
    setCategory("すべて");
    setFavoritesOnly(false);
    setOfficialOnly(false);
    setVisibleProcessCount(INITIAL_PROCESS_COUNT);
  }

  return (
    <div className="portal portal-app-shell">
      <PortalSidebar onCategory={chooseCategory} onAllProcesses={resetFilters} onFavorites={showFavorites} onOfficial={showOfficial} />

      <main className="portal-main portal-shell-main" id="top">
        <PortalHeader query={query} onQueryChange={changeQuery} onSearchSubmit={showSearchResults} />

        <div className="portal-content">
          <section className="portal-hero" aria-labelledby="hero-title" suppressHydrationWarning>
            <div className="portal-hero-copy">
              <p className="portal-eyebrow"><Sparkles size={15} /> みんなの処理を、自分の仕事に</p>
              <h1 id="hero-title">データ処理が見つかる。<br />なければ作れる。</h1>
              <div className="portal-hero-actions">
                <Link className="portal-button primary" href="/features/">Studioでできること<ArrowRight size={17} /></Link>
              </div>
            </div>
            <HeroVisual />
          </section>

          <section className="portal-section" id="recommended" aria-labelledby="recommended-title">
            <div className="portal-section-title">
              <div><p>RECOMMENDED</p><h2 id="recommended-title">おすすめの処理</h2></div>
            </div>
            <div className="portal-card-grid">
              {recommendedItems.map((item) => {
                const favorite = Boolean(activity.favorites[item.id]?.active);
                return <ProcessCard item={item} official={officialProcessIds.has(item.id)} favorite={favorite} onToggle={() => toggleFavorite(item)} key={item.id} />;
              })}
            </div>
          </section>

          <section className="portal-section portal-discover" id="discover" aria-labelledby="discover-title">
            <div className="portal-section-title compact"><div><p>DISCOVER</p><h2 id="discover-title">処理を探す</h2></div></div>
            <div className="portal-browse-toolbar">
              <div className="portal-chips" aria-label="目的で絞り込む">
                <button className={category === "すべて" && !favoritesOnly && !officialOnly ? "active" : ""} aria-pressed={category === "すべて" && !favoritesOnly && !officialOnly} onClick={resetFilters}>すべて</button>
                <button className={`portal-favorites-chip ${favoritesOnly ? "active" : ""}`} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((current) => !current); setOfficialOnly(false); setCategory("すべて"); setVisibleProcessCount(INITIAL_PROCESS_COUNT); }}><Heart />お気に入り {favoriteCount}</button>
                <button className={`portal-officials-chip ${officialOnly ? "active" : ""}`} aria-pressed={officialOnly} onClick={() => { setOfficialOnly((current) => !current); setFavoritesOnly(false); setCategory("すべて"); setVisibleProcessCount(INITIAL_PROCESS_COUNT); }}><BadgeCheck />公式</button>
                {categories.map((item) => <button className={category === item && !favoritesOnly && !officialOnly ? "active" : ""} aria-pressed={category === item && !favoritesOnly && !officialOnly} key={item} onClick={() => chooseCategory(item)}>{flowCategoryLabels[item]}</button>)}
              </div>
              <span className="portal-results-summary" aria-live="polite">{filteredProcesses.length}件</span>
            </div>
            {visibleProcesses.length > 0 ? (
              <>
                <div className="portal-card-grid portal-browse-grid">
                  {visibleProcesses.map((item) => {
                    const favorite = Boolean(activity.favorites[item.id]?.active);
                    return <ProcessCard item={item} official={officialProcessIds.has(item.id)} favorite={favorite} onToggle={() => toggleFavorite(item)} key={item.id} />;
                  })}
                </div>
                {visibleProcessCount < filteredProcesses.length && (
                  <button className="portal-load-more" type="button" onClick={() => setVisibleProcessCount((current) => current + INITIAL_PROCESS_COUNT)}>さらに{Math.min(INITIAL_PROCESS_COUNT, filteredProcesses.length - visibleProcessCount)}件表示</button>
                )}
              </>
            ) : <EmptyResults onReset={resetFilters} />}
          </section>
        </div>
        <SiteFooter />
      </main>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="portal-hero-visual">
      <Image
        className="portal-hero-image"
        src="/hero-data-flow-compact.png"
        alt="XLSX・CSV・JSON・Google SheetsのデータをClavisFlowで表に変換するイメージ"
        width={2172}
        height={724}
        sizes="(min-width: 1181px) 42vw, 1px"
        priority
        unoptimized
      />
    </div>
  );
}

function ProcessCard({ item, official, favorite, onToggle }: { item: PortalItem; official: boolean; favorite: boolean; onToggle: () => void }) {
  return (
    <article className="portal-process-card">
      <div className="portal-card-heading">
        <CategoryIcons categories={item.categories} />
        {official && <span className="portal-card-badges"><span className="official">公式</span></span>}
      </div>
      <h3><Link className="portal-card-link" href={`/run/?flow=${encodeURIComponent(item.id)}`}>{item.name}</Link></h3>
      <p className="portal-card-description">{item.description}</p>
      <RequiredFieldTags items={item.required} />
      <div className="portal-card-footer">
        <FavoriteButton favorite={favorite} name={item.name} onToggle={onToggle} />
      </div>
    </article>
  );
}

function CategoryIcons({ categories: values }: { categories: Category[] }) {
  if (values.length === 0) return null;
  const label = values.map((value) => flowCategoryLabels[value]).join("、");
  return (
    <span className="portal-category-icons" role="img" aria-label={`カテゴリ: ${label}`}>
      {values.map((value) => {
        const Icon = portalCategoryIcons[value];
        return <span className={`portal-category-icon ${categoryColorClasses[value]}`} title={flowCategoryLabels[value]} aria-hidden="true" key={value}><Icon /></span>;
      })}
    </span>
  );
}

function RequiredFieldTags({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const visibleItems = items.slice(0, 4);
  const remaining = items.length - visibleItems.length;
  return (
    <ul className="portal-required-fields" aria-label={`必要な項目: ${items.join("、")}`}>
      {visibleItems.map((item) => <li key={item}>{item}</li>)}
      {remaining > 0 && <li className="more" aria-label={`他${remaining}項目`}>+{remaining}</li>}
    </ul>
  );
}

function FavoriteButton({ favorite, name, onToggle }: { favorite: boolean; name: string; onToggle: () => void }) {
  return (
    <button className={`portal-favorite-stat ${favorite ? "active" : ""}`} type="button" aria-label={`${name}をお気に入り${favorite ? "から削除" : "に追加"}`} aria-pressed={favorite} onClick={onToggle}><Heart aria-hidden="true" /></button>
  );
}

function EmptyResults({ onReset }: { onReset: () => void }) {
  return <div className="portal-empty"><Search /><h3>条件に合う処理が見つかりませんでした</h3><p>検索ワードや絞り込み条件を変えてお試しください。</p><button onClick={onReset}>条件をクリア</button></div>;
}
