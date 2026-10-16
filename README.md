# SkiFit Tracker — 公開用（無料構成）

このZIPには過去の個人トレーニング履歴を含めていません。GitHub Pagesの公開リポジトリにアップロードする場合はこちらを使用してください。

## Macで公開する
1. ZIPを展開し、中にある `index.html` `app.js` `cloud.js` `sw.js` `manifest.webmanifest` `icon.svg` と `supabase` フォルダを、GitHubリポジトリのルートへアップロードします。ZIP自体ではなく展開したファイルをアップロードしてください。
2. GitHub → Settings → Pages → Deploy from a branch → main / (root) → Save。
3. Supabase Freeプロジェクトを作り、SQL Editorで `supabase/schema.sql` を実行します。RLSは無効にしないでください。
4. Supabase Authentication → URL ConfigurationにGitHub PagesのURLを設定し、Email認証を有効にします。
5. アプリの「設定」でSupabase Project URLと公開用（publishable/anon）キーを入力します。**service_role/secretキーは絶対に入力しないでください。**
6. メールでログインし、自動同期を有効化します。iPhoneとMacで同じメールアカウントを使います。
7. ChatGPT連携は「分析用データをコピー」→ChatGPTに貼り付ける方式です。APIキーや有料サービスは不要です。

## 注意
- 個人記録は初期状態で空です。以前の履歴を戻す場合は、アプリの設定にあるJSONインポートを使用してください。GitHubの公開ファイルには記録を直接書き込まないでください。
- ブラウザのローカルデータとクラウド同期は別の保存先です。バックアップを定期的にエクスポートしてください。
- 無料枠の制限・停止はSupabaseの規約に従います。有料プランには切り替えないでください。
- 同じ日付の記録を複数端末で同時に編集すると、更新時刻による競合が生じる場合があります。
