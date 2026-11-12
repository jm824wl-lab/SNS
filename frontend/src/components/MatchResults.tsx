import { useState } from "react";
import { Link } from "react-router-dom";
import type { BuyerMatch, NormalizedProperty } from "../api";
import { VERDICT_LABEL } from "../format";

const STATUS_MARK = { ok: "○", ng: "×", unknown: "?" } as const;

export function CheckList({ match }: { match: BuyerMatch }) {
  if (match.checks.length === 0) return <p className="muted">クライテリアが未設定です</p>;
  return (
    <ul className="check-list">
      {match.checks.map((check) => (
        <li key={check.label} className={`check check-${check.status}`}>
          <span className="check-mark">{STATUS_MARK[check.status]}</span>
          <span className="check-label">{check.label}</span>
          <span>{check.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function MatchCard({ match }: { match: BuyerMatch }) {
  return (
    <div className={`match-card verdict-${match.verdict}`}>
      <div className="card-header">
        <Link to={`/buyers/${match.buyer_id}`} className="match-name">
          {match.buyer_name}
        </Link>
        <span className={`badge verdict-badge-${match.verdict}`}>{VERDICT_LABEL[match.verdict]}</span>
      </div>
      {(match.contact_name || match.contact_email) && (
        <p className="muted small">
          {match.contact_name}
          {match.contact_email && (
            <>
              {match.contact_name && " / "}
              <a href={`mailto:${match.contact_email}`}>{match.contact_email}</a>
            </>
          )}
        </p>
      )}
      <CheckList match={match} />
    </div>
  );
}

export function NormalizedSummary({ normalized }: { normalized: NormalizedProperty }) {
  const items: [string, string | null][] = [
    ["種別", normalized.category],
    ["価格", normalized.price_yen !== null ? `${(normalized.price_yen / 10000).toLocaleString("ja-JP")}万円` : null],
    ["利回り", normalized.yield_pct !== null ? `${normalized.yield_pct}%` : null],
    ["築年数", normalized.age_years !== null ? `築${normalized.age_years}年` : null],
    ["構造", normalized.structure],
    ["土地", normalized.land_tsubo !== null ? `${normalized.land_tsubo}坪` : null],
    ["駅徒歩", normalized.walk_minutes !== null ? `${normalized.walk_minutes}分` : null],
  ];
  return (
    <div className="tags">
      {items.map(([label, value]) => (
        <span key={label} className={`tag ${value ? "" : "tag-missing"}`}>
          {label}: {value ?? "不明"}
        </span>
      ))}
    </div>
  );
}

export default function MatchResults({ results }: { results: BuyerMatch[] }) {
  const [showOthers, setShowOthers] = useState(false);

  if (results.length === 0) {
    return (
      <p className="muted">
        有効な会社が登録されていません。<Link to="/buyers/new">会社を登録</Link>してください。
      </p>
    );
  }

  const primary = results.filter((r) => r.verdict === "match" || r.verdict === "possible");
  const near = results.filter((r) => r.verdict === "near");
  const others = results.filter((r) => r.verdict === "unmatched");

  return (
    <div>
      <h3>
        紹介候補 <span className="muted">({primary.length}社)</span>
      </h3>
      {primary.length === 0 ? (
        <p className="muted">全条件を満たす会社はありません。</p>
      ) : (
        <div className="match-grid">
          {primary.map((m) => (
            <MatchCard key={m.buyer_id} match={m} />
          ))}
        </div>
      )}

      {near.length > 0 && (
        <>
          <h3>
            惜しい会社(1条件のみ不適合・価格交渉や条件緩和の余地を確認) <span className="muted">({near.length}社)</span>
          </h3>
          <div className="match-grid">
            {near.map((m) => (
              <MatchCard key={m.buyer_id} match={m} />
            ))}
          </div>
        </>
      )}

      {others.length > 0 && (
        <>
          <button type="button" className="link-button" onClick={() => setShowOthers((v) => !v)}>
            {showOthers ? "対象外の会社を隠す" : `対象外の会社を表示(${others.length}社)`}
          </button>
          {showOthers && (
            <div className="match-grid">
              {others.map((m) => (
                <MatchCard key={m.buyer_id} match={m} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
