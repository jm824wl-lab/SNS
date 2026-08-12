import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProperties, type PropertyListItem, type PropertySearchParams } from "../api";
import { formatYen, sourceLabel } from "../format";

export default function PropertyList() {
  const [items, setItems] = useState<PropertyListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [layout, setLayout] = useState("");

  const runSearch = (overrides: Partial<PropertySearchParams> = {}) => {
    setLoading(true);
    setError(null);
    fetchProperties({
      q,
      transaction_type: transactionType || undefined,
      layout: layout || undefined,
      ...overrides,
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  return (
    <div>
      <h1>不動産物件リスト</h1>
      <p className="muted">
        業者から届くメール・PDFを自動で解析し、物件情報を一覧化しています。({total} 件)
      </p>

      <form className="search-bar" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="キーワード(物件名・住所・駅名)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
          <option value="">種別(賃貸/売買)</option>
          <option value="賃貸">賃貸</option>
          <option value="売買">売買</option>
        </select>
        <select value={layout} onChange={(e) => setLayout(e.target.value)}>
          <option value="">間取り</option>
          <option value="1K">1K</option>
          <option value="1LDK">1LDK</option>
          <option value="2DK">2DK</option>
          <option value="4LDK">4LDK</option>
        </select>
        <button type="submit">検索</button>
      </form>

      {loading && <p>読み込み中...</p>}
      {error && <p className="error">エラー: {error}</p>}

      <div className="card-grid">
        {items.map((item) => (
          <Link className="card" to={`/properties/${item.id}`} key={item.id}>
            <div className="card-header">
              <span className={`badge ${item.transaction_type === "売買" ? "badge-sale" : "badge-rent"}`}>
                {item.transaction_type ?? "不明"}
              </span>
              <span className="source-tag">{sourceLabel(item.source_type)}</span>
            </div>
            <h2>{item.title}</h2>
            <p className="price">{item.price_label ?? formatYen(item.price_yen)}</p>
            <p className="muted">{item.address}</p>
            <p className="muted">{item.access}</p>
            <div className="tags">
              {item.layout && <span className="tag">{item.layout}</span>}
              {item.area_sqm && <span className="tag">{item.area_sqm}㎡</span>}
              {item.built_year && <span className="tag">{item.built_year}</span>}
              {item.yield_label && <span className="tag">利回り{item.yield_label}</span>}
              {item.units && <span className="tag">{item.units}</span>}
            </div>
          </Link>
        ))}
      </div>

      {!loading && items.length === 0 && <p>該当する物件がありません。</p>}
    </div>
  );
}
