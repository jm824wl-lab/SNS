import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteBuyer, fetchBuyer, fetchBuyerMatches, type Buyer, type BuyerPropertyMatch } from "../api";
import { CheckList } from "../components/MatchResults";
import { formatYen, VERDICT_LABEL } from "../format";
import { criteriaSummary } from "./criteriaSummary";

export default function BuyerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [matches, setMatches] = useState<BuyerPropertyMatch[] | null>(null);
  const [includePossible, setIncludePossible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchBuyer(id)
      .then(setBuyer)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setMatches(null);
    fetchBuyerMatches(id, includePossible)
      .then(setMatches)
      .catch((err) => setError(err.message));
  }, [id, includePossible]);

  const handleDelete = async () => {
    if (!buyer || !window.confirm(`「${buyer.name}」を削除しますか?`)) return;
    try {
      await deleteBuyer(buyer.id);
      navigate("/buyers");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (error) return <p className="error">エラー: {error}</p>;
  if (!buyer) return <p>読み込み中...</p>;

  const summary = criteriaSummary(buyer.criteria);

  return (
    <div>
      <Link to="/buyers" className="back-link">
        ← 会社一覧に戻る
      </Link>
      <div className="page-header">
        <h1>
          {buyer.name}
          {!buyer.active && <span className="badge badge-inactive">停止中</span>}
        </h1>
        <div className="form-actions">
          <Link to={`/buyers/${buyer.id}/edit`} className="button-link">
            編集
          </Link>
          <button type="button" className="danger" onClick={handleDelete}>
            削除
          </button>
        </div>
      </div>

      <table className="detail-table">
        <tbody>
          <tr>
            <th>担当者</th>
            <td>{buyer.contact_name ?? "-"}</td>
          </tr>
          <tr>
            <th>連絡先</th>
            <td>
              {buyer.contact_email ? <a href={`mailto:${buyer.contact_email}`}>{buyer.contact_email}</a> : "-"}
              {buyer.contact_phone && ` / ${buyer.contact_phone}`}
            </td>
          </tr>
          {summary.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{value}</td>
            </tr>
          ))}
          {summary.length === 0 && (
            <tr>
              <th>クライテリア</th>
              <td className="muted">未設定(全物件が候補になります)</td>
            </tr>
          )}
          <tr>
            <th>メモ</th>
            <td className="pre-line">{buyer.notes || "-"}</td>
          </tr>
        </tbody>
      </table>

      <div className="page-header">
        <h2>
          この会社に合う物件 {matches && <span className="muted">({matches.length}件)</span>}
        </h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includePossible}
            onChange={(e) => setIncludePossible(e.target.checked)}
          />
          情報不足で要確認の物件も含める
        </label>
      </div>

      {!matches && <p>照合中...</p>}
      {matches && matches.length === 0 && <p className="muted">条件に合う取込済み物件はありません。</p>}
      <div className="match-grid">
        {matches?.map(({ property, match }) => (
          <div className={`match-card verdict-${match.verdict}`} key={property.id}>
            <div className="card-header">
              <Link to={`/properties/${property.id}`} className="match-name">
                {property.title}
              </Link>
              <span className={`badge verdict-badge-${match.verdict}`}>{VERDICT_LABEL[match.verdict]}</span>
            </div>
            <p className="price">{property.price_label ?? formatYen(property.price_yen)}</p>
            <p className="muted small">
              {property.address} {property.access && ` / ${property.access}`}
            </p>
            <CheckList match={match} />
          </div>
        ))}
      </div>
    </div>
  );
}
