import Link from "next/link";
import { Workflow } from "lucide-react";

export default function StudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="ClavisFlow Studio">
          <span className="brand-mark"><Workflow size={18} aria-hidden="true" /></span>
          <span>ClavisFlow Studio</span>
        </Link>
      </header>
      {children}
    </>
  );
}
