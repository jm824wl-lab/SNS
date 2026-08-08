import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ingestEmail, ingestPdf } from "../api";

const SAMPLE_EMAIL = `件名: 【新着】中野区 賃貸マンションのご案内

物件名: パレス中野
種別: 賃貸マンション
所在地: 東京都中野区中野3-1-2
最寄駅: 中野駅 徒歩6分
間取り: 1DK
専有面積: 28.4㎡
築年数: 築10年
賃料: 112,000円
管理費: 5,000円

担当: 中野エステート株式会社 高橋健`;

export default function Ingest() {
  const [rawText, setRawText] = useState(SAMPLE_EMAIL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const property = await ingestEmail(rawText);
      navigate(`/properties/${property.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const property = await ingestPdf(file);
      navigate(`/properties/${property.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>物件情報の取込(デモ)</h1>
      <p className="muted">
        本番では業者からのメールを Gmail 連携で自動取得する想定です。ここではメール本文の貼り付け、または
        PDF アップロードから、その場で自動リスト化される様子を確認できます。
      </p>

      <section>
        <h2>メール本文から取り込む</h2>
        <form onSubmit={handleEmailSubmit}>
          <textarea
            rows={14}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="業者からのメール本文を貼り付けてください"
          />
          <button type="submit" disabled={busy}>
            {busy ? "解析中..." : "自動でリスト化する"}
          </button>
        </form>
      </section>

      <section>
        <h2>PDFから取り込む</h2>
        <input type="file" accept="application/pdf" onChange={handlePdfChange} disabled={busy} />
      </section>

      {error && <p className="error">エラー: {error}</p>}
    </div>
  );
}
