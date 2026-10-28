import type { NewsItem } from "../api";
import { formatRelativeTime } from "../format";

const IMPACT_LABEL: Record<NewsItem["impact"], string> = {
  high: "重要",
  medium: "中",
  low: "低",
};

interface Props {
  items: NewsItem[];
}

export default function NewsFeed({ items }: Props) {
  return (
    <ul className="news-list">
      {items.map((item) => (
        <li key={item.id} className="news-item">
          <div className="news-item-head">
            <span className={`impact-badge impact-${item.impact}`}>{IMPACT_LABEL[item.impact]}</span>
            <span className="news-source">{item.source}</span>
            <span className="news-time">{formatRelativeTime(item.published_at)}</span>
          </div>
          <div className="news-title">{item.title}</div>
          <p className="news-summary">{item.summary}</p>
          <div className="news-tags">
            {item.related_symbols.map((sym) => (
              <span key={sym} className="news-tag">
                {sym}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
