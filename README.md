# ClavisFlow Studio

**データ処理が見つかる。なければ作れる。**

ClavisFlow Studioは、Excel・CSV・JSON・Googleスプレッドシートを使った定型処理を探し、実行し、AIに相談して作成できるデータ処理ポータルです。照合、集計、結合、変換、チェック、抽出などの処理を公開URLとして共有できます。

通常の実行用ファイルと処理結果は原則としてブラウザ内で扱います。処理定義、公開情報、お気に入り、利用回数、ログイン済み作成者が明示的に追加した公開サンプルだけをSupabaseへ保存します。

本番サイト: `https://studio.clavisflow.net/`

## 主な機能

### 処理ポータル

- 25件の内蔵公式処理と、利用者が一般公開した処理を一覧表示
- 処理名・説明・必要項目を対象にした検索
- 「データを整える」「集計する」「結合する」「変換する」「チェックする」「抽出する」のカテゴリ絞り込み
- お気に入り・公式の絞り込み
- 累計利用回数とお気に入り登録数の表示
- 直近30日の利用回数とお気に入り登録数を使ったおすすめ上位4件
- 一般公開処理は新着順で表示し、12件ずつ追加表示

おすすめスコアは、直近30日の利用回数とお気に入り登録数を対数化し、お気に入り側へ4倍の重みを付けて計算します。同点時は累計利用回数、元の表示順の順で決定します。おすすめは品質や正確性を保証するものではありません。

### 処理の作成・編集

1. Excel・CSV・JSON・Googleスプレッドシートからデータを選択
2. 「やりたいこと」を入力し、AIがDuckDB SQLと架空の編集用サンプルを生成
3. 実データまたはAIサンプルで結果を確認し、一般公開または限定公開

作成後は新しいバージョンとして編集でき、既存の公開処理をコピーして別処理を作ることもできます。コピー時の初期公開範囲は限定公開です。

AIが生成したSQLは画面から確認・修正できます。AIへ送信するのは処理指示、入力テーブル名、列名、推定データ型であり、通常の実行用ファイル本体や行データは送信しません。AIサンプルは編集用の非公開データとして保存され、利用者が公開STEPで明示的に選択しない限り公開サンプルにはなりません。

### 公開と認証

- 一般公開: ポータルと検索結果へ掲載
- 限定公開: ポータルへ掲載せず、URLを知っている人だけが実行可能
- 公開実行URL: `/run/?flow=<public-id>`
- 編集URL: `/flows/edit/?flow=<public-id>#token=<edit-token>`
- 公開処理の実行自体はログイン不要
- 限定公開、公開範囲の変更、公開サンプル追加にはGoogleログインが必要
- お気に入りは未ログイン時はブラウザ保存、ログイン時はSupabaseへ同期
- `clavisflow@gmail.com`で確認済みの管理者だけが、いたずら・テスト対策として利用者の公開処理を完全削除可能

編集トークンの平文は作成レスポンスで一度だけ返し、SupabaseにはSHA-256ハッシュだけを保存します。作成済み処理の参照情報と編集トークンはブラウザの`localStorage`にも保存します。

## 対応データ

### 入力

- CSV: UTF-8、UTF-8 BOM、Shift-JIS、Windows-31J / CP932の自動判定と明示選択
- Excel: `.xlsx`、シート選択、A1形式の範囲指定
- JSON: オブジェクト配列を表として抽出し、候補パスを選択
- Googleスプレッドシート: 「リンクを知っている全員が閲覧可」のシートをExcel形式で取得し、シートと範囲を選択
- 複数入力の並び替え、列名・行数・データ型の自動解析

通常の入力ファイルは1ファイル250MBまでです。Googleスプレッドシートは取得時20MBまで、処理結果は100万行までです。ブラウザや端末のWasmメモリ制限が先に到達する場合があります。

### 出力

- 画面上の先頭100行プレビューと全件数表示
- 全件CSVダウンロード
- UTF-8、UTF-8 BOM、Shift-JIS、Windows-31J / CP932
- 出力不要の処理にも対応
- スプレッドシート数式として解釈される値を無害化

### 公開サンプル

- CSV、Excel（`.xlsx`）、JSON
- 1ファイル5MB、1処理合計10MB
- サービス全体500MBに達した場合は新規保存を停止
- Googleログイン済みの処理作成者だけが追加可能
- 個人情報、機密情報、実在する顧客データを含めないこと

## アーキテクチャとデータの扱い

フロントエンドはNext.js App RouterとReactで構成し、処理エンジンにはDuckDB-Wasmを使用します。通常のファイルは`arrayBuffer()`として専用Web Workerへ渡し、文字コード変換後にDuckDB-Wasmへ登録します。React stateへファイル本文を保持せず、結果CSVはブラウザ内のBlob URLとして生成します。

Googleスプレッドシートだけは、入力URLから抽出したスプレッドシートIDを`/api/google-sheets`へ送り、サーバーがGoogleからExcel形式で取得してブラウザへ中継します。レスポンスはキャッシュせず、Supabaseには保存しません。

DuckDB-Wasmは最初の入力解析後にバックグラウンドで準備し、同じ画面ではデータベースを再利用します。接続、登録ファイル、TEMP VIEWは実行ごとに解放し、データベース本体も5分間利用されなければ終了します。配信用WasmはBrotli圧縮し、バージョン付きURLへ長期キャッシュを設定しています。

Supabaseは次の情報を担当します。

- Flowメタデータ、変更不可能な公開済みバージョン、編集用AIサンプル
- 一般公開・限定公開の公開範囲
- Google OAuthと作成者情報
- 公開サンプルとStorage容量制限
- お気に入り状態と登録数
- 成功実行の累計・直近30日利用回数
- 匿名APIの利用回数制限

## 画面とルート

| ルート | 内容 |
|---|---|
| `/` | 処理ポータル、おすすめ、検索、カテゴリ・お気に入り・公式フィルタ |
| `/flows/new/` | 3ステップの処理作成画面 |
| `/flows/edit/?flow=<公開ID>` | 新バージョン保存、公開管理、公開停止、削除 |
| `/run/?flow=<公開ID>` | ログイン不要の公開実行画面、公開処理のコピー |
| `/auth/callback/` | Google OAuthコールバック |
| `/privacy/` | プライバシーポリシー |
| `/terms/` | 利用規約 |

## ローカル開発

前提はNode.js 24とnpmです。Supabaseをローカル起動する場合はDockerとSupabase CLIも必要です。

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

`.env.local`にはブラウザ公開可能な値だけを設定します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Service RoleキーとAI APIキーには`NEXT_PUBLIC_`を付けないでください。フロントエンドのバンドルへ含めてはいけません。

`npm install`後のスクリプトがDuckDBのWasmとWorkerを`public/duckdb/`へコピーします。このディレクトリは生成物のためGit管理しません。

VS Codeでは、`npm install`後に`F5`を押すと、既定の`Next.js: debug full stack (F5)`構成がデバッガー付き開発サーバーを起動し、Microsoft Edgeを開きます。

公式処理用のサンプルCSVは次のコマンドで再生成できます。

```powershell
npm run samples
```

品質確認:

```powershell
npm test
npm run lint
npm run build
```

## Supabaseプロジェクト準備

1. Supabaseプロジェクトを作成し、CLIをリンクしてマイグレーションを適用します。

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

2. Supabase DashboardのAuthentication ProvidersでGoogleを有効にします。Redirect URLsには、ローカルの`http://localhost:3000/auth/callback/**`と本番の`https://studio.clavisflow.net/auth/callback/**`を追加します。

3. Edge Function用シークレットを`supabase/.env`へ作成します。`SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`はSupabase側で自動提供されるため、本番用の手動登録は不要です。

```dotenv
ALLOWED_ORIGIN=http://localhost:3000,https://studio.clavisflow.net
PUBLIC_APP_URL=https://studio.clavisflow.net
RATE_LIMIT_HASH_SECRET=32文字以上のランダムな秘密値

OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_API_KEY=replace-me
OPENAI_COMPATIBLE_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=low
```

OpenAI関連の値はAI生成を有効にする場合だけ必要です。AI生成にはOpenAI Responses APIの構造化出力を使用します。

```powershell
npx supabase secrets set --env-file supabase/.env
```

4. Edge Functionsを配備します。

```powershell
npx supabase functions deploy create-flow
npx supabase functions deploy update-flow
npx supabase functions deploy publish-flow
npx supabase functions deploy get-public-flow
npx supabase functions deploy get-edit-flow
npx supabase functions deploy list-public-flows
npx supabase functions deploy unpublish-flow
npx supabase functions deploy delete-flow
npx supabase functions deploy generate-sql
npx supabase functions deploy upload-flow-sample
npx supabase functions deploy get-flow-sample
npx supabase functions deploy flow-favorites
npx supabase functions deploy flow-usage
```

### Edge Function API

| 関数 | メソッド | 認可・用途 |
|---|---|---|
| `create-flow` | POST | 一般公開は匿名可、限定公開はログイン必須。匿名回数制限あり |
| `update-flow` | POST | `x-edit-token`。公開範囲の変更と限定公開はログイン必須 |
| `publish-flow` | POST | `x-edit-token`。公開範囲の変更と限定公開はログイン必須 |
| `get-public-flow?id=...` | GET | 公開中の一般公開・限定公開Flowを匿名取得 |
| `get-edit-flow` | POST | `x-edit-token` |
| `list-public-flows` | GET | 一般公開Flowを新着順で最大60件取得 |
| `unpublish-flow` | POST | `x-edit-token` |
| `delete-flow` | POST | `x-edit-token`、または確認済み管理者`clavisflow@gmail.com` |
| `generate-sql` | POST | 匿名可。処理指示と入力スキーマからSQL・AIサンプルを生成。回数制限あり |
| `upload-flow-sample` | POST | Googleログイン＋`x-edit-token` |
| `get-flow-sample` | GET | 公開中サンプルは匿名、編集対象は`x-edit-token` |
| `flow-favorites` | GET / POST | 件数取得は匿名、お気に入り同期はGoogleログイン必須 |
| `flow-usage` | GET / POST | 件数取得・成功実行の記録。記録は重複防止IDと回数制限を使用 |

作成・更新する定義本文は`inputs`、`sql`、`output`、`duckdbVersion`、`instruction`、`aiSamples`などです。更新は常に次の`flow_versions.version_number`を挿入し、公開済みバージョンを変更しません。

### 匿名APIの利用回数制限

`create-flow`、`generate-sql`、`flow-usage`は、Supabase PostgreSQLの`api_rate_limit_buckets`で固定時間枠ごとの回数を管理します。匿名ブラウザIDと接続元IPを併用し、識別値は`RATE_LIMIT_HASH_SECRET`を使ったHMAC-SHA-256だけを保存します。生のIPアドレスはこのテーブルへ保存しません。

| API | ブラウザ単位 | IP単位 | サービス全体 |
|---|---|---|---|
| `create-flow` | 10分3回、1日20回 | 10分10回、1日100回 | 1日500回 |
| `generate-sql` | 1分2回、1時間10回、1日30回 | 1分6回、1時間60回、1日150回 | 1日100回 |
| `flow-usage` | 1分60回、1日1,000回 | 1分300回、1日10,000回 | 1日100,000回 |

- 超過時は`429 Too Many Requests`と`Retry-After`を返します。
- 制限判定DBが利用できない場合は、未制限で続行せず`503`を返します。
- 期限切れカウンターはDB関数内で確率的に削除するため、`pg_cron`は不要です。
- 制限値は`supabase/functions/_shared/rate-limit.ts`に集約しています。

## Azure Static Web Appsへの配備

本番フロントエンドはSitesではなくAzure Static Web Appsへ配備します。`main`へのpushで`.github/workflows/azure-static-web-apps-ashy-glacier-042c61b10.yml`が起動し、Node.js 24で`npm ci`と`npm run build`を実行して`out/`をアップロードします。

GitHub Repositoryへ現在のワークフローが参照する次の値を設定します。

- Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN_ASHY_GLACIER_042C61B10`
- Variable: `NEXT_PUBLIC_SUPABASE_URL`

Googleログイン、お気に入り同期、限定公開、公開サンプル追加を本番で利用するには、`NEXT_PUBLIC_SUPABASE_ANON_KEY`もビルド時に必要です。GitHub Variableへ登録し、ワークフローの`npm run build`の`env`へ渡してください。

`public/staticwebapp.config.json`は成果物へコピーされ、Wasm MIME、Brotli、CSP、Worker、長期キャッシュを設定します。

### Googleスプレッドシート機能の配備上の注意

`/api/google-sheets`はPOSTを受けるNext.jsサーバールートです。ローカルの`next dev`では動作しますが、現在のAzureワークフローは静的成果物`out/`だけを配備するため、このAPIルートは本番成果物に含まれません。本番でGoogleスプレッドシート読込みを提供するには、Azure Functionsなどのサーバー実行環境へ移すか、Supabase Edge Functionへ移植してフロントエンドの接続先を変更する必要があります。

## セキュリティ上の境界

- SQL検査は`SELECT` / `WITH`の単一文だけを許可し、DDL、DML、`COPY`、`ATTACH`、`INSTALL`、`LOAD`、`PRAGMA`、外部readerを拒否します。
- 文字列関数の`REPLACE`など、安全な式は許可します。キーワードを含む文字列、識別子、コメントを誤検知しないよう構造検査します。
- 公開時、AI生成後、ブラウザ実行前の複数箇所でSQLを検査します。
- DuckDB側でも既知拡張の自動インストールとロードを無効化します。
- 通常の実行用ファイル、行データ、処理結果は原則としてサーバーへ保存しません。
- 公開サンプル、処理名、説明、処理指示、テーブル名、列名には個人情報・機密情報・認証情報を含めないでください。
- 限定公開は認証付き非公開ではありません。URLを知っている人は実行できます。
- 編集URLと編集トークンを知っている人は処理を変更・公開停止・削除できるため、公開URLとは分けて管理してください。
- CSPの`connect-src`はSupabaseだけを許可します。接続先を増やす場合は`public/staticwebapp.config.json`を更新してください。

## 現在の制約と改善候補

- Googleスプレッドシート用サーバールートの本番ホスティング
- Playwrightなどによる主要操作のE2Eテスト
- PWA対応
- 必要に応じたTurnstileなどのbot対策
- AIによる複数ターンの対話修正
- 利用量・エラー監視と運用アラート
