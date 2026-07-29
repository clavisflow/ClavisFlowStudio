"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { editUrl, listManagedFlows, publicRunUrl, setManagedFlowPublished } from "@/lib/flow-store";
import type { ManagedFlow } from "@/lib/flow-types";

const statusLabels = { draft: "下書き", published: "公開中", unpublished: "公開停止" } as const;

export function FlowDashboard() {
  const [flows, setFlows] = useState<ManagedFlow[]>([]);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setFlows(listManagedFlows());
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  async function togglePublication(flow: ManagedFlow) {
    setBusyId(flow.publicId);
    setError(undefined);
    try {
      await setManagedFlowPublished(flow, flow.status !== "published");
      setFlows(listManagedFlows());
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "公開状態を変更できませんでした。");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <main className="studio-shell">
      <div className="page-heading-row">
        <div><h1>処理一覧</h1><p>作成したデータ処理の編集と公開管理を行います。</p></div>
        <Link className="button primary" href="/flows/new/">自分の処理を作る</Link>
      </div>

      {error && <div className="error-message">{error}</div>}
      {ready && flows.length === 0 && (
        <section className="empty-state">
          <h2>処理はまだありません</h2>
          <p>CSVの入力定義とSQLを設定して、最初の処理を作成してください。</p>
          <Link className="button primary" href="/flows/new/">自分の処理を作る</Link>
        </section>
      )}

      {flows.length > 0 && (
        <div className="flow-table-wrap">
          <table className="flow-table">
            <thead><tr><th>処理名</th><th>状態</th><th>バージョン</th><th>更新日時</th><th>操作</th></tr></thead>
            <tbody>
              {flows.map((flow) => (
                <tr key={flow.publicId}>
                  <td><strong>{flow.name}</strong><span>{flow.description || "説明なし"}</span></td>
                  <td><span className={`status-label ${flow.status}`}>{statusLabels[flow.status]}</span></td>
                  <td>{flow.version}</td>
                  <td>{formatDate(flow.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <Link href={editUrl(flow)}>編集</Link>
                      {flow.status === "published" && <Link href={publicRunUrl(flow.publicId)} target="_blank">公開画面</Link>}
                      <button disabled={busyId === flow.publicId} onClick={() => void togglePublication(flow)}>{flow.status === "published" ? "公開停止" : "公開する"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
