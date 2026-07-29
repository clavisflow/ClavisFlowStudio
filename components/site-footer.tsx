import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-meta">
          <nav aria-label="法的情報">
            <Link href="/privacy/">プライバシーポリシー</Link>
            <span aria-hidden="true">・</span>
            <Link href="/terms/">利用規約</Link>
            <span aria-hidden="true">・</span>
            <a href="https://clavisflow.net/contact/" target="_blank" rel="noreferrer">処理作成を相談する</a>
          </nav>
        </div>
        <a className="site-footer-wordmark" href="https://clavisflow.net/" target="_blank" rel="noreferrer" aria-label="ClavisFlow公式サイトを開く">
          ClavisFlow
        </a>
      </div>
    </footer>
  );
}
