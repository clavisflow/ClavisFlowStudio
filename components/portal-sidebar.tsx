"use client";

import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  Box,
  CircleHelp,
  Clock3,
  Combine,
  Home,
  LayoutGrid,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { flowCategories, flowCategoryLabels, type FlowCategory } from "@/lib/flow-categories";

export const portalCategories = flowCategories;
export type PortalCategory = FlowCategory;

const categoryIcons = [WandSparkles, BarChart3, Combine, Box, ShieldCheck, Search];

type PortalSidebarProps = {
  onCategory?: (category: PortalCategory) => void;
  onGuide?: () => void;
};

export function PortalSidebar({ onCategory, onGuide }: PortalSidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <>
      <button className="portal-mobile-menu" aria-label="メニューを開く" onClick={() => setDrawerOpen(true)}><Menu size={22} /></button>
      {drawerOpen && <button className="portal-drawer-scrim" aria-label="メニューを閉じる" onClick={closeDrawer} />}
      <aside className={`portal-sidebar ${drawerOpen ? "is-open" : ""}`} aria-label="メインメニュー">
        <div className="portal-brand">
          <Image className="portal-brand-image" src="/clavisflow-studio-icon.png" alt="" width={42} height={42} priority unoptimized />
          <div><strong>ClavisFlow</strong><span>Studio</span></div>
          <button className="portal-drawer-close" aria-label="メニューを閉じる" onClick={closeDrawer}><X size={20} /></button>
        </div>

        <nav className="portal-nav">
          <Link className="portal-nav-item" href="/" onClick={closeDrawer}><Home /><span>ホーム</span></Link>
          <Link className="portal-nav-item" href="/#recommended" onClick={closeDrawer}><LayoutGrid /><span>すべての処理</span></Link>
          <p className="portal-nav-heading">目的から探す</p>
          {portalCategories.map((item, index) => {
            const Icon = categoryIcons[index];
            return (
              <Link className="portal-nav-item" href="/#discover" key={item} onClick={() => { onCategory?.(item); closeDrawer(); }}>
                <Icon /><span>{flowCategoryLabels[item]}</span>
              </Link>
            );
          })}
          <p className="portal-nav-heading">コレクション</p>
          <Link className="portal-nav-item" href="/#recommended" onClick={closeDrawer}><Sparkles /><span>おすすめの処理</span></Link>
          <Link className="portal-nav-item" href="/#latest" onClick={closeDrawer}><Clock3 /><span>新着の処理</span></Link>
          <Link className="portal-nav-item" href="/#official" onClick={closeDrawer}><ShieldCheck /><span>公式の処理</span></Link>
        </nav>

        <div className="portal-sidebar-bottom">
          <Link className="portal-create-card" href="/flows/new/" onClick={closeDrawer}>
            <span><Plus /></span><div><strong>自分の処理を作る</strong><small>処理を作成・公開</small></div>
          </Link>
          <Link className="portal-nav-item" href="/#guide" onClick={() => { onGuide?.(); closeDrawer(); }}><CircleHelp /><span>使い方ガイド</span></Link>
        </div>
      </aside>
    </>
  );
}
