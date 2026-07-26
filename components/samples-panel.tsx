"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FlaskConical, Play, X } from "lucide-react";
import { sampleTemplates } from "@/lib/sample-templates";

export function SamplesPanel() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
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
      <button ref={triggerRef} type="button" className="samples-trigger" aria-expanded={open} aria-controls="samples-panel" onClick={() => setOpen(true)}>
        <FlaskConical size={17} aria-hidden="true" />サンプル
      </button>
      {open && (
        <div className="samples-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <aside id="samples-panel" className="samples-panel" role="dialog" aria-modal="true" aria-labelledby="samples-title">
            <header>
              <h2 id="samples-title">サンプル</h2>
              <button ref={closeRef} type="button" aria-label="閉じる" onClick={close}><X size={21} aria-hidden="true" /></button>
            </header>
            <p className="samples-overview">処理例を選ぶと、サンプルCSVを使って通常のフロー作成を始められます。</p>
            <div className="sample-list">
              {sampleTemplates.map((sample) => (
                <article className="sample-row" key={sample.id}>
                  <header><h3>{sample.title}</h3><span>{sample.inputSummary}</span></header>
                  <p>{sample.processingSummary}</p>
                  <div className="sample-actions">
                    <a className="sample-start-link" href={`/?sample=${encodeURIComponent(sample.id)}`}><Play size={15} aria-hidden="true" />このサンプルで試す</a>
                    <div className="sample-downloads" aria-label={`${sample.title}のCSV`}>
                      <span><Download size={14} aria-hidden="true" />CSV</span>
                      {sample.files.map((file) => <a key={file.url} href={file.url} download={file.name}>{file.label}<small>{file.encodingLabel}</small></a>)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
