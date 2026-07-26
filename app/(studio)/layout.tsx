import { CapabilitiesPanel } from "@/components/capabilities-panel";
import { SavedFlowsPanel } from "@/components/saved-flows-panel";
import { SamplesPanel } from "@/components/samples-panel";
import { StudioHomeLink } from "@/components/studio-home-link";

export default function StudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="studio-header">
        <StudioHomeLink />
        <div className="header-tools"><SavedFlowsPanel /><SamplesPanel /><CapabilitiesPanel /></div>
      </header>
      {children}
    </>
  );
}
