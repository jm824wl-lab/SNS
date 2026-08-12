import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchProperty, type PropertyDetail as PropertyDetailType } from "../api";
import { formatDate, formatYen, sourceLabel } from "../format";

export default function PropertyDetail() {
  const { id } = useParams();
  const [property, setProperty] = useState<PropertyDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchProperty(Number(id))
      .then(setProperty)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="error">エラー: {error}</p>;
  if (!property) return <p>読み込み中...</p>;

  const fields: [string, string | number | null][] = [
    ["取引種別", property.transaction_type],
    ["種別", property.property_type],
    ["価格・賃料", property.price_label ?? formatYen(property.price_yen)],
    ["所在地", property.address],
    ["アクセス", property.access],
    ["間取り", property.layout],
    ["専有面積", property.area_sqm ? `${property.area_sqm}㎡` : null],
    ["築年数", property.built_year],
    ["土地面積", property.land_tsubo_label],
    ["建物面積", property.building_tsubo_label],
    ["構造", property.structure],
    ["総戸数", property.units],
    ["利回り", property.yield_label],
    ["担当", property.agent_name],
    ["ステータス", property.status],
    ["取込元", sourceLabel(property.source_type)],
    ["受信日時", formatDate(property.received_at)],
  ];

  return (
    <div>
      <Link to="/" className="back-link">
        ← 一覧に戻る
      </Link>
      <h1>{property.title}</h1>

      <table className="detail-table">
        <tbody>
          {fields.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{value ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>取込元テキスト(自動抽出のもと)</h2>
      <pre className="raw-text">{property.raw_text}</pre>
    </div>
  );
}
