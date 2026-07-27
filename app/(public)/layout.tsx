import { ProductIcon } from "@/components/product-icon";
import { PublicFlowEditLink } from "@/components/public-flow-edit-link";

export default function PublicFlowLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="public-header">
        <div className="public-brand"><ProductIcon /><span>ClavisFlow Studio</span><span className="public-context">公開フロー</span></div>
        <PublicFlowEditLink />
      </header>
      {children}
    </>
  );
}
