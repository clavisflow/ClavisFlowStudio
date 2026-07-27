# ClavisFlow Studio

**毎月のデータ処理を、URLにする。**

ClavisFlow Studioは、CSVから繰り返し使えるデータ処理を作成し、ログイン不要の実行URLとして公開できるNext.jsアプリです。CSV本体はAzure、Supabase、AI APIへ送信せず、ブラウザ内だけで処理します。

## 実装済みの範囲

- Next.js App Routerの静的出力（`out/`）
- Supabase PostgreSQLの`flows` / `flow_versions`スキーマ、RLS、不変バージョントリガー
- フロー作成、更新、公開、取得、公開停止、削除、AI SQL生成のEdge Functions
- 編集トークンのSHA-256ハッシュ保存（平文は作成レスポンスで一度だけ返却）
- 公開URL `/run/?flow=<public-id>` とログイン不要の実行画面
- UTF-8、UTF-8 BOM、Shift-JIS、Windows-31J / CP932の明示選択と自動判定
- 日本語の処理指示からOpenAI Responses APIでDuckDB SQLを生成・再生成
- CSV列検証、DuckDB-Wasm実行、100行プレビュー、件数表示、全件CSVダウンロード
- 出力CSVのUTF-8、UTF-8 BOM、Shift-JIS、Windows-31J / CP932対応
- 60秒タイムアウト、キャンセル、WorkerとDuckDBの破棄
- 読取専用・単一SQLの字句／構造検査、外部readerと拡張機能の拒否
- CSV Formula Injection対策
- 文字コードと処理内容が異なる5種類のサンプルフロー
- 作成済みフローのブラウザ内一覧、公開・編集ページへの導線、削除
- プライバシーポリシー、利用規約、製品アイコン、favicon

## アーキテクチャ

ブラウザは公開FlowのJSON定義だけをSupabase Edge Functionから取得します。選択された`File`は`arrayBuffer()`として専用Workerへ移動し、文字コード変換後、Worker内からDuckDB-WasmのWorkerへ登録します。React stateにCSV本文は保持しません。結果CSVはローカルのBlob URLとして生成されます。

画面は次の責務に分離しています。

- `/`：CSV追加から始まる4ステップのFlow作成画面
- `/flows/new/`：`/`と同じFlow作成画面
- `/flows/edit/?flow=<公開ID>`：新バージョンの保存と公開管理
- `/run/?flow=<公開ID>`：ログイン不要の公開実行画面

MVPでは通常認証とユーザー単位のFlow一覧を表示しません。作成・編集したFlowの参照と編集トークンはブラウザの`localStorage`へ保持し、保存完了画面から編集用URLを取得します。Flow定義の正本はSupabaseにあり、CSV本文は`localStorage`にもSupabaseにも保存しません。Supabase未接続のローカル開発では、Flow定義だけをブラウザへ保存して画面遷移を検証できます。

Flow作成は「ファイルを追加」「処理を作成」「結果を確認」「公開」の順です。CSVの行数、列名、文字コード、列型はWeb Workerで自動解析し、ファイル本体をReact stateやサーバーへ保存しません。

SQL検査は公開時とブラウザ実行時に行います。DuckDB側でも既知拡張の自動インストール／ロードを無効化します。Wasmの仮想ファイルシステムへ登録するファイル名はFlowの検証済みテーブル名から生成します。

## ローカル開発

前提: Node.js 24、npm。Supabaseをローカル起動する場合はDockerとSupabase CLIも必要です。

```bash
npm install
copy .env.example .env.local
npm run dev
```

`npm install`後のスクリプトがDuckDBのWasmとWorkerを`public/duckdb/`へコピーします。このディレクトリは生成物のためGit管理しません。

### VS CodeでF5デバッグ

リポジトリのルートフォルダーをVS Codeで開き、`npm install`を一度実行した後に`F5`を押してください。既定の`Next.js: debug full stack (F5)`構成が開発サーバーをデバッガー付きで起動し、準備完了後にMicrosoft Edgeを自動で開きます。停止すると開発サーバーも終了します。

Supabaseを接続しない場合も、`http://localhost:3000/run/?flow=invoice-payment-check`は同梱デモ定義へフォールバックします。請求CSVには`請求番号,請求金額`、入金CSVには`請求番号,入金額`が必要です。

画面から選択・ダウンロードできる各文字コードのサンプルCSVは、次のコマンドで再生成できます。

```bash
npm run samples
```

品質確認:

```bash
npm test
npm run lint
npm run build
```

## Supabaseプロジェクト準備

1. Supabaseで新しいプロジェクトを作成します。
2. CLIをリンクし、マイグレーションを適用します。

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

3. Edge Function用シークレットを`supabase/.env`へ作成します。`SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`はSupabase側で自動提供されるため、本番用の手動登録は不要です。

```dotenv
ALLOWED_ORIGIN=http://localhost:3000,https://studio.clavisflow.net
PUBLIC_APP_URL=https://studio.clavisflow.net
RATE_LIMIT_HASH_SECRET=32文字以上のランダムな秘密値
```

AI生成を有効にする場合だけ、同じファイルへOpenAI互換APIの設定を追加します。

```dotenv
OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_API_KEY=replace-me
OPENAI_COMPATIBLE_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=low
```

AI生成はOpenAI Responses APIの構造化出力を使用します。OpenAIへ送るのは処理指示、入力テーブル名、列名、推定データ型だけです。CSVのファイル本体や行データは送信しません。`OPENAI_REASONING_EFFORT`は必要に応じて変更できますが、MVPの既定値はコストと待ち時間を抑える`low`です。

```bash
npx supabase secrets set --env-file supabase/.env
```

4. 関数を配備します。

```bash
npx supabase functions deploy create-flow
npx supabase functions deploy update-flow
npx supabase functions deploy publish-flow
npx supabase functions deploy get-public-flow
npx supabase functions deploy get-edit-flow
npx supabase functions deploy unpublish-flow
npx supabase functions deploy delete-flow
npx supabase functions deploy generate-sql
```

5. Azureビルド環境とローカルの`.env.local`へ、ブラウザ公開可能なURLだけを設定します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
```

Service RoleキーとAI APIキーには`NEXT_PUBLIC_`を付けないでください。フロントエンドのバンドルへ入れてはいけません。

### Edge Function API

| 関数 | メソッド | 認可 |
|---|---|---|
| `create-flow` | POST | 公開（ブラウザID・IP・全体件数で制限） |
| `update-flow` | POST | `x-edit-token` |
| `publish-flow` | POST | `x-edit-token` |
| `get-public-flow?id=...` | GET | 公開済みFlowのみ匿名 |
| `get-edit-flow` | POST | `x-edit-token` |
| `unpublish-flow` | POST | `x-edit-token` |
| `generate-sql` | POST | 公開（ブラウザID・IP・全体件数で制限） |

作成・更新の定義本文は`inputs`, `sql`, `output`, `duckdbVersion`です。更新は常に次の`flow_versions.version_number`を挿入し、既存公開版を変更しません。

### 匿名APIの利用回数制限

`create-flow`と`generate-sql`は、Supabase PostgreSQLの`api_rate_limit_buckets`で固定時間枠ごとの回数を管理します。フロントエンドがlocalStorageに作る匿名ブラウザIDと接続元IPを併用し、会社などで同じIPを共有する利用者を過度に制限しない構成です。識別値は`RATE_LIMIT_HASH_SECRET`を使ったHMAC-SHA-256だけをDBへ保存し、生のIPアドレスは保存しません。

| API | ブラウザ単位 | IP単位 | サービス全体 |
|---|---|---|---|
| `create-flow` | 10分3回、1日20回 | 10分10回、1日100回 | 1日500回 |
| `generate-sql` | 1分2回、1時間10回、1日30回 | 1分6回、1時間60回、1日150回 | 1日100回 |

- 超過時は`429 Too Many Requests`と`Retry-After`を返します。
- 制限判定DBが利用できない場合は、未制限で処理を続けず`503`を返します。
- 期限切れカウンターはDB関数内で確率的に削除するため、`pg_cron`は不要です。
- 制限値は`supabase/functions/_shared/rate-limit.ts`に集約しています。利用状況を確認して調整してください。
- AIの自動テストでは実APIを呼ばず、モックを使用します。AIを本番有効化する段階ではTurnstileの追加も検討します。
- 将来カウンター負荷が増えた場合は、Edge Function側の共通判定処理をUpstash Redisなどへ差し替えられます。

## Azure Static Web Appsへ配備

1. Azure Static Web Appsリソースを作成し、独自ドメイン`studio.clavisflow.net`を設定します。
2. GitHub Environment/Repositoryへ次を設定します。
   - Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Variable: `NEXT_PUBLIC_SUPABASE_URL`
3. `.github/workflows/azure-static-web-apps.yml`を有効にして`main`へpushします。

ワークフローはNode.jsで`npm ci`と`npm run build`を行い、静的成果物`out/`を配備します。`public/staticwebapp.config.json`は成果物へコピーされ、Wasm MIME、CSP、Worker、Supabase接続先を設定します。

## セキュリティ上の境界

- SQL検査は保守的な字句／構造検査です。`SELECT` / `WITH`の単一文だけを許可し、DDL、DML、`COPY`、`ATTACH`、`INSTALL`、`LOAD`、`PRAGMA`、外部readerを拒否します。
- DuckDB-WasmにはOSファイルシステムがありませんが、公開前の防御として検査を必須にしています。新しいDuckDB機能を導入する際は拒否リストとテストを更新してください。
- CSPの`connect-src`はSupabaseだけを許可します。別のSupabase互換ドメインを使う場合は`public/staticwebapp.config.json`を更新します。
- 作成とAI生成は匿名エンドポイントのため、ブラウザID・IP・サービス全体の回数制限を適用しています。bot判定が必要になった段階でTurnstileを追加してください。
- 最大入力は1ファイル250MB、最大出力は100万行です。ブラウザごとのWasmメモリ制限が先に到達する場合があります。

## MVP後の改善候補

- Playwrightなどによる主要操作のE2Eテスト
- PWA対応
- 必要に応じたTurnstileなどのbot対策
- AIによる複数ターンの対話修正
- 利用量・エラー監視と運用アラート
