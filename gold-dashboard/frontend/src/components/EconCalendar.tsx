import type { CalendarEvent } from "../api";
import { formatEventDateTime } from "../format";

const IMPORTANCE_LABEL: Record<CalendarEvent["importance"], string> = {
  high: "重要",
  medium: "中",
  low: "低",
};

interface Props {
  events: CalendarEvent[];
}

export default function EconCalendar({ events }: Props) {
  return (
    <div className="calendar-table-wrap">
      <table className="calendar-table">
        <colgroup>
          <col className="col-datetime" />
          <col className="col-country" />
          <col className="col-name" />
          <col className="col-importance" />
          <col className="col-value" />
          <col className="col-value" />
          <col className="col-note" />
        </colgroup>
        <thead>
          <tr>
            <th>日時</th>
            <th>国</th>
            <th>指標・イベント</th>
            <th>重要度</th>
            <th>前回</th>
            <th>予想</th>
            <th>金相場への影響</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id}>
              <td className="nowrap">{formatEventDateTime(ev.datetime)}</td>
              <td>{ev.country}</td>
              <td>{ev.name}</td>
              <td>
                <span className={`impact-badge impact-${ev.importance}`}>
                  {IMPORTANCE_LABEL[ev.importance]}
                </span>
              </td>
              <td className="num">{ev.previous ?? "—"}</td>
              <td className="num">{ev.forecast ?? "—"}</td>
              <td className="calendar-note">{ev.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
