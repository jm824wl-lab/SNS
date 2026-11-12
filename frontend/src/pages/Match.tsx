import { useState } from "react";
import { matchText, type TextMatchResponse } from "../api";
import MatchResults, { NormalizedSummary } from "../components/MatchResults";

const SAMPLE = `物件名：○○ハイツ
種別：一棟アパート
所在地：神奈川県横浜市港北区綱島西1-2-3
交通：東急東横線「綱島」駅 徒歩8分
価格：1億2,000万円
利回り：8.2%
構造：木造2階建
築年数：築20年
土地：45.2坪`;

export default function Match() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<TextMatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    matchText(text)
      .then(setResult)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <h1>物件から紹介先を探す</h1>
      <p className="muted">
        業者メールの本文や物件概要を貼り付けると、各社のクライテリアと照合して紹介候補の会社を表示します。
        (ここでの照合は物件一覧には登録されません。取込済み物件は物件詳細ページからも確認できます)
      </p>

      <form onSubmit={run}>
        <textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={SAMPLE}
        />
        <div className="form-actions">
          <button type="submit" disabled={loading || !text.trim()}>
            {loading ? "照合中..." : "紹介先を探す"}
          </button>
          <button type="button" className="secondary" onClick={() => setText(SAMPLE)}>
            サンプルを入力
          </button>
        </div>
      </form>

      {error && <p className="error">エラー: {error}</p>}

      {result && (
        <section>
          <h2>読み取った物件情報</h2>
          <p>
            <strong>{String(result.extracted.title ?? "")}</strong>{" "}
            <span className="muted">{String(result.extracted.address ?? "")}</span>
          </p>
          <NormalizedSummary normalized={result.normalized} />
          <p className="muted small">
            「不明」の項目に関する条件は「要確認」として扱います。読み取りが不正確な場合は本文に「価格：」「所在地：」等のラベルを付けて再実行してください。
          </p>
          <MatchResults results={result.results} />
        </section>
      )}
    </div>
  );
}
