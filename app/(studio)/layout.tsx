import { SiteFooter } from "@/components/site-footer";
import { PortalSidebar } from "@/components/portal-sidebar";
import { PortalHeader } from "@/components/portal-header";

export default function StudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="portal portal-app-shell">
      <PortalSidebar />
      <div className="portal-main portal-shell-main">
        <PortalHeader />
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
