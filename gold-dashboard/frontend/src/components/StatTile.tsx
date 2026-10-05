import type { Quote } from "../api";
import { formatPercent, formatPrice, formatSigned } from "../format";
import Sparkline from "./Sparkline";

interface Props {
  quote: Quote;
  sparklineValues: number[];
  emphasized?: boolean;
}

export default function StatTile({ quote, sparklineValues, emphasized }: Props) {
  const positive = quote.change >= 0;

  return (
    <div className={`stat-tile${emphasized ? " stat-tile-emphasized" : ""}`}>
      <div className="stat-tile-head">
        <span className="stat-tile-label">{quote.name_ja}</span>
        <span className="stat-tile-sublabel">{quote.name_en}</span>
      </div>
      <div className="stat-tile-value">
        {formatPrice(quote.price, quote.decimals)}
        <span className="stat-tile-unit">{quote.unit}</span>
      </div>
      <div className="stat-tile-footer">
        <span className={`stat-tile-delta ${positive ? "delta-up" : "delta-down"}`}>
          {formatSigned(quote.change, quote.decimals)} ({formatPercent(quote.change_percent)})
        </span>
        {sparklineValues.length > 1 && <Sparkline values={sparklineValues} positive={positive} />}
      </div>
    </div>
  );
}
