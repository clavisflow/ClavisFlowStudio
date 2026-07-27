"use client";

import { useEffect, useRef, useState } from "react";
import { Info as CircleInfo, ShieldCheck, X } from "lucide-react";

const stages = [
  {
    number: "01",
    title: "CSVを読み込む",
    descriptions: ["CSVの列名や文字コードをブラウザ内で読み取ります。"],
  },
  {
    number: "02",
    title: "処理を作成する",
    descriptions: ["やりたいことを日本語で指定するとAIがSQLを作成します。", "作成されたSQLは確認・修正できます。"],
  },
  {
    number: "03",
    title: "結果を確かめる",
    descriptions: ["実際のCSVで処理結果を確認できます。", "結果のダウンロードも可能です。"],
  },
  {
    number: "04",
    title: "実行ページとして公開する",
    descriptions: ["作成した処理をURLとして公開して、誰でも使える実行ページにできます。"],
  },
];

export function CapabilitiesPanel() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="capabilities-trigger" aria-expanded={open} aria-controls="capabilities-panel" onClick={() => setOpen(true)}>
        <CircleInfo size={17} aria-hidden="true" />できること
      </button>
      {open && (
        <div className="capabilities-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <aside id="capabilities-panel" className="capabilities-panel" role="dialog" aria-modal="true" aria-labelledby="capabilities-title">
            <header>
              <h2 id="capabilities-title"><CircleInfo size={21} aria-hidden="true" />できること</h2>
              <button ref={closeRef} type="button" aria-label="閉じる" onClick={close}><X size={21} aria-hidden="true" /></button>
            </header>
            <p className="capabilities-overview"><span>やりたいことを日本語で指定するだけ。</span><span>CSV業務アプリを作って、そのまま公開できます。</span></p>
            <div className="capability-stages">
              {stages.map((stage) => (
                <section className="capability-stage" key={stage.number}>
                  <header><span>{stage.number}</span><h3>{stage.title}</h3></header>
                  {stage.descriptions.map((description) => <p key={description}>{description}</p>)}
                </section>
              ))}
            </div>
            <div className="capabilities-safety">
              <ShieldCheck size={18} aria-hidden="true" />
              <strong>CSVファイルはサーバーへ送信されません</strong>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
