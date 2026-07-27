import type { Metadata } from "next";

export const metadata: Metadata = { title: "プライバシーポリシー | ClavisFlow Studio" };

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article>
        <p className="legal-product">ClavisFlow Studio</p>
        <h1>プライバシーポリシー</h1>
        <p className="legal-lead">ClavisFlowは、ClavisFlow Studioの提供に必要な範囲で情報を取り扱い、利用者のデータとプライバシーの保護に努めます。</p>
        <p className="legal-date">制定日：2026年7月27日</p>

        <section>
          <h2>1. CSVファイルの取扱い</h2>
          <p>利用者が選択したCSVファイルは、ブラウザ内で読み込み、文字コードの判定、列の解析、DuckDB-Wasmによる処理を行います。CSVファイル本体およびCSVに含まれる行データを、ClavisFlow Studioのサーバー、SupabaseまたはAI APIへ送信・保存しません。</p>
          <p>処理結果のプレビューとCSV出力もブラウザ内で作成されます。ページを閉じた後に、当サービスがCSVファイルや処理結果を復元することはできません。</p>
        </section>

        <section>
          <h2>2. 保存するフロー情報</h2>
          <p>フローを保存または公開した場合、サービス提供、編集、公開、バージョン管理のため、次の情報をSupabaseへ保存します。</p>
          <ul>
            <li>フロー名、説明、処理内容の指示</li>
            <li>入力ファイルの識別名、列名、推定データ型、文字コード、区切り文字などの入力定義</li>
            <li>DuckDB SQL、出力設定、公開状態、バージョン</li>
            <li>公開ID、編集用トークンのハッシュ、作成日時、更新日時</li>
          </ul>
          <p>編集用トークンの平文はデータベースへ保存しません。同じブラウザで作成済みフローを表示するため、公開ID、編集用トークン、フローの概要をブラウザのlocalStorageへ保存します。</p>
        </section>

        <section>
          <h2>3. AI生成時に送信する情報</h2>
          <p>AIによるSQL生成を利用した場合、入力した処理内容、SQL内のテーブル名、CSVから取得した列名および推定データ型を、Supabase Edge Functionsを経由してOpenAI APIへ送信します。CSVファイル本体と行データは送信しません。</p>
          <p>処理内容や列名へ個人情報、機密情報、認証情報を入力しないでください。AI APIへ送信された情報は、提供事業者のデータ利用方針に従って処理されます。</p>
        </section>

        <section>
          <h2>4. アクセスログとブラウザ保存情報</h2>
          <p>サービスの運用、安全確保、不正利用防止、障害調査のため、アクセス日時、アクセス先、IPアドレス、ブラウザや端末に関する情報などが、Azure Static Web Apps、Supabaseその他の基盤サービスに記録される場合があります。</p>
          <p>匿名APIの利用回数制限では、ブラウザのlocalStorageに保存する匿名ブラウザIDと接続元IPを使用します。アプリケーションのデータベースには、生のIPアドレスではなく秘密鍵を用いたハッシュ値を保存します。</p>
          <p>当サービスでは現在、広告配信またはアクセス解析を目的とした独自のCookieを使用していません。localStorageの情報は、ブラウザのサイトデータを削除することで消去できます。</p>
        </section>

        <section>
          <h2>5. 利用目的</h2>
          <ul>
            <li>フローの保存、編集、公開および実行機能を提供するため</li>
            <li>AIによるSQL生成機能を提供するため</li>
            <li>不正利用の防止、セキュリティの確保、障害対応のため</li>
            <li>利用状況を把握し、サービスを改善するため</li>
            <li>お問い合わせへの回答と必要な連絡のため</li>
          </ul>
        </section>

        <section>
          <h2>6. 外部サービス</h2>
          <p>当サービスは、配信基盤としてMicrosoft Azure、フロー情報の保存とAPI実行にSupabase、AIによるSQL生成にOpenAI APIを利用します。各サービス上の情報は、それぞれの利用条件およびプライバシー方針に従って取り扱われます。</p>
        </section>

        <section>
          <h2>7. 情報の削除</h2>
          <p>作成済みフローの削除操作を行うと、対象フローの公開データ、保存済み定義およびバージョンを削除します。ブラウザに保存された情報は、作成済みフローからの削除またはブラウザのサイトデータ削除により消去できます。法令上またはセキュリティ上必要なログは、各基盤サービスの保持期間に従って保存される場合があります。</p>
        </section>

        <section>
          <h2>8. ポリシーの変更</h2>
          <p>法令、利用する外部サービスまたはClavisFlow Studioの機能変更に応じて、本ポリシーを改定することがあります。重要な変更は、本サービス上で分かりやすくお知らせします。</p>
        </section>

        <section>
          <h2>9. お問い合わせ窓口</h2>
          <p>本ポリシーや情報の取扱いに関するお問い合わせは、<a href="https://clavisflow.net/contact/" target="_blank" rel="noreferrer">ClavisFlowお問い合わせフォーム</a>からご連絡ください。</p>
        </section>
      </article>
    </main>
  );
}
