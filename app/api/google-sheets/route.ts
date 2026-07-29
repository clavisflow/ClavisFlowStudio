const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    const spreadsheetId = spreadsheetIdFromUrl(typeof body.url === "string" ? body.url : "");
    if (!spreadsheetId) return Response.json({ error: "GoogleスプレッドシートのURLを確認してください。" }, { status: 400 });

    const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=xlsx`;
    const response = await fetch(exportUrl, { redirect: "follow", cache: "no-store" });
    if (!response.ok) {
      return Response.json(
        { error: "スプレッドシートを読み込めませんでした。リンクを知っている全員が閲覧できる共有設定か確認してください。" },
        { status: 400 },
      );
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_WORKBOOK_BYTES) return Response.json({ error: "スプレッドシートは20MB以下にしてください。" }, { status: 413 });
    const workbook = await response.arrayBuffer();
    if (workbook.byteLength > MAX_WORKBOOK_BYTES) return Response.json({ error: "スプレッドシートは20MB以下にしてください。" }, { status: 413 });

    return new Response(workbook, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch {
    return Response.json({ error: "スプレッドシートの読み込みに失敗しました。" }, { status: 500 });
  }
}

function spreadsheetIdFromUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return;
    const match = /^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/.exec(url.pathname);
    return match?.[1];
  } catch {
    return;
  }
}
