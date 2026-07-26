"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, ShieldCheck, X } from "lucide-react";

const stages = [
  {
    number: "01",
    title: "ファイルを追加する",
    descriptions: ["CSVをドラッグ＆ドロップすると、列名や文字コードをブラウザ内で読み取ります。"],
  },
  {
    number: "02",
    title: "処理を作成する",
    descriptions: ["やりたいことを日本語で指定できます。", "作成されたSQLは確認・修正できます。"],
  },
  {
    number: "03",
    title: "結果を確認して公開する",
    descriptions: ["実際のCSVで処理結果を確認し、結果をCSVとしてダウンロードできます。", "完成した処理はログイン不要のURLで共有できます。"],
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
        <CircleHelp size={17} aria-hidden="true" />できること
      </button>
      {open && (
        <div className="capabilities-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <aside id="capabilities-panel" className="capabilities-panel" role="dialog" aria-modal="true" aria-labelledby="capabilities-title">
            <header>
              <h2 id="capabilities-title">できること</h2>
              <button ref={closeRef} type="button" aria-label="閉じる" onClick={close}><X size={21} aria-hidden="true" /></button>
            </header>
            <p className="capabilities-overview">CSVから、繰り返し使えるデータ処理ページを作成できます。</p>
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
              <div><strong>CSVはブラウザ内で処理されます</strong><p>ファイル本体はサーバーへ送信されません。</p></div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
