import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBuyers, type Buyer } from "../api";
import { criteriaSummary } from "./criteriaSummary";

export default function BuyerList() {
  const [buyers, setBuyers] = useState<Buyer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBuyers()
      .then(setBuyers)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>会社クライテリア</h1>
        <Link to="/buyers/new" className="button-link">
          + 会社を追加
        </Link>
      </div>
      <p className="muted">
        各社の購入条件(種別・エリア・価格帯・利回り・築年数など)を登録しておくと、物件ごとに合う会社を自動で判定します。
      </p>

      {error && <p className="error">エラー: {error}</p>}
      {!buyers && !error && <p>読み込み中...</p>}
      {buyers && buyers.length === 0 && <p>まだ会社が登録されていません。</p>}

      <div className="card-grid">
        {buyers?.map((buyer) => (
          <Link className={`card ${buyer.active ? "" : "card-inactive"}`} to={`/buyers/${buyer.id}`} key={buyer.id}>
            <div className="card-header">
              <h2>{buyer.name}</h2>
              {!buyer.active && <span className="badge badge-inactive">停止中</span>}
            </div>
            {buyer.contact_name && <p className="muted small">担当: {buyer.contact_name}</p>}
            <div className="tags">
              {criteriaSummary(buyer.criteria).map(([label, value]) => (
                <span className="tag" key={label}>
                  {label}: {value}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
