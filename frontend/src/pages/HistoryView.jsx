import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getHistory, resetHistory } from "../api";

const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  timeFrom: "",
  timeTo: "",
  minConf: 0,
};

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(rows) {
  const header = [
    "timestamp",
    "filename",
    "people",
    "avg_confidence",
    "processing_time_ms",
    "inference_time_ms",
  ];
  const body = rows.map((row) =>
    [
      row.timestamp,
      row.filename,
      row.count,
      row.avgConf == null ? "" : row.avgConf.toFixed(4),
      row.processing_time_ms.toFixed(2),
      (row.inference_time_ms ?? 0).toFixed(2),
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `detecto-history-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function HistoryView() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  async function load(signal) {
    setLoading(true);
    try {
      const data = await getHistory(1000, signal);
      setRecords(data.detections);
      setStats(data.stats);
      setError(null);
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    return records
      .map((record) => {
        const date = new Date(record.timestamp);
        const kept = record.detections.filter(
          (detection) => detection.confidence >= filters.minConf,
        );
        return {
          ...record,
          count: kept.length,
          avgConf: kept.length
            ? kept.reduce((sum, detection) => sum + detection.confidence, 0) / kept.length
            : null,
          date: date.toLocaleDateString("en-CA"), // YYYY-MM-DD, local time
          time: date.toTimeString().slice(0, 5), // HH:MM, local time
        };
      })
      .filter(
        (record) =>
          (!filters.dateFrom || record.date >= filters.dateFrom) &&
          (!filters.dateTo || record.date <= filters.dateTo) &&
          (!filters.timeFrom || record.time >= filters.timeFrom) &&
          (!filters.timeTo || record.time <= filters.timeTo),
      );
  }, [records, filters]);

  const hourly = useMemo(() => {
    const buckets = new Map();
    rows.forEach((record) => {
      const hour = new Date(record.timestamp).getHours();
      const bucket = buckets.get(hour) ?? { sum: 0, frames: 0 };
      bucket.sum += record.count;
      bucket.frames += 1;
      buckets.set(hour, bucket);
    });
    return [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, bucket]) => ({
        hour,
        average: bucket.sum / bucket.frames,
      }));
  }, [rows]);

  function setFilter(key) {
    return (event) =>
      setFilters((previous) => ({
        ...previous,
        [key]: key === "minConf" ? Number(event.target.value) : event.target.value,
      }));
  }

  async function onReset() {
    if (!window.confirm("Delete all detection history?")) return;
    try {
      await resetHistory();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1>History</h1>
          <p className="lede">
            Every analysed frame is stored locally. Filter by time or confidence,
            then export the result as CSV.
          </p>
        </div>
        <div className="filter-actions">
          <button className="button" onClick={() => downloadCsv(rows)} disabled={!rows.length}>
            Export CSV
          </button>
          <button className="button danger" onClick={onReset}>
            Clear history
          </button>
        </div>
      </header>

      {stats && (
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Frames</div>
            <div className="stat-value">{stats.frames_processed}</div>
          </div>
          <div className="stat">
            <div className="stat-label">People total</div>
            <div className="stat-value">{stats.total_detections}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Mean confidence</div>
            <div className="stat-value">
              {(stats.mean_confidence * 100).toFixed(0)}
              <small>%</small>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Avg total</div>
            <div className="stat-value">
              {stats.avg_processing_time_ms.toFixed(0)}
              <small>ms</small>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Avg inference</div>
            <div className="stat-value">
              {(stats.avg_inference_time_ms ?? 0).toFixed(0)}
              <small>ms</small>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="filters">
          <label className="field">
            <span>From date</span>
            <input type="date" value={filters.dateFrom} onChange={setFilter("dateFrom")} />
          </label>
          <label className="field">
            <span>To date</span>
            <input type="date" value={filters.dateTo} onChange={setFilter("dateTo")} />
          </label>
          <label className="field">
            <span>From time</span>
            <input type="time" value={filters.timeFrom} onChange={setFilter("timeFrom")} />
          </label>
          <label className="field">
            <span>To time</span>
            <input type="time" value={filters.timeTo} onChange={setFilter("timeTo")} />
          </label>
          <label className="field">
            <span>Min confidence · {Math.round(filters.minConf * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={filters.minConf}
              onChange={setFilter("minConf")}
            />
          </label>
          <div className="filter-actions">
            <button className="button" onClick={() => setFilters(EMPTY_FILTERS)}>
              Reset filters
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {loading && !records.length && <p className="notice">Loading history…</p>}

      {!error && !loading && rows.length === 0 && (
        <p className="empty">No detections match these filters.</p>
      )}

      {rows.length > 0 && (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="section-head">
              <h2>People over time</h2>
              <span className="muted">
                {rows.length} of {records.length} frames
              </span>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                    contentStyle={{
                      background: "#0b0b0b",
                      border: "1px solid #2b2b2b",
                      borderRadius: 10,
                      color: "#f4f4f5",
                      fontSize: 12,
                    }}
                    itemStyle={{ color: "#f4f4f5" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="People"
                    stroke="#f4f4f5"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {hourly.length > 0 && (
            <div className="panel">
              <div className="section-head">
                <h2>Average people per hour</h2>
                <span className="muted">Filtered frames</span>
              </div>
              <div className="hour-grid">
                {hourly.map(({ hour, average }) => (
                  <div className="hour-cell" key={hour}>
                    <span>{String(hour).padStart(2, "0")}:00</span>
                    <strong>{average.toFixed(1)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>File</th>
                  <th>People</th>
                  <th>Avg confidence</th>
                  <th>Total (ms)</th>
                  <th>Inference (ms)</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((record, index) => (
                  <tr key={`${record.timestamp}-${index}`}>
                    <td className="num">{new Date(record.timestamp).toLocaleString()}</td>
                    <td>{record.filename}</td>
                    <td className="num">{record.count}</td>
                    <td className="num">
                      {record.avgConf == null ? "—" : `${(record.avgConf * 100).toFixed(1)}%`}
                    </td>
                    <td className="num">{record.processing_time_ms.toFixed(0)}</td>
                    <td className="num">{(record.inference_time_ms ?? 0).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
