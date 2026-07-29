import { PublicFlowEditLink } from "@/components/public-flow-edit-link";
import { SiteFooter } from "@/components/site-footer";
import { PortalSidebar } from "@/components/portal-sidebar";
import { PortalHeader } from "@/components/portal-header";

export default function PublicFlowLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="portal portal-app-shell">
      <PortalSidebar />
      <div className="portal-main portal-shell-main">
        <PortalHeader extra={<PublicFlowEditLink />} />
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
