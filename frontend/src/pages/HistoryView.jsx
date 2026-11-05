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

const HOUR_LABELS = [
  "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00",
];

function buildHourlyData(rows) {
  const buckets = new Array(24).fill(0);
  const counts = new Array(24).fill(0);
  rows.forEach((record) => {
    const hour = new Date(record.timestamp).getHours();
    buckets[hour] += record.count;
    counts[hour] += 1;
  });
  return buckets.map((sum, hour) => ({
    hour: HOUR_LABELS[hour],
    avg: counts[hour] ? sum / counts[hour] : 0,
    count: sum,
    frames: counts[hour],
  }));
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
          date: date.toLocaleDateString("en-CA"),
          time: date.toTimeString().slice(0, 5),
          hour: date.getHours(),
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

  const hourly = useMemo(() => buildHourlyData(rows), [rows]);

  const maxHourlyAvg = useMemo(
    () => Math.max(...hourly.map((h) => h.avg), 0),
    [hourly],
  );

  function setFilter(key) {
    return (event) =>
      setFilters((previous) => ({
        ...previous,
        [key]: key === "minConf" ? Number(event.target.value) : event.target.value,
      }));
  }

  function onResetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  async function onResetHistory() {
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
          <button className="button danger" onClick={onResetHistory}>
            Reset history
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="panel filter-bar">
        <div className="filter-row">
          <div className="filter-group">
            <label className="filter-label">From</label>
            <input
              type="date"
              className="filter-input"
              value={filters.dateFrom}
              onChange={setFilter("dateFrom")}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">To</label>
            <input
              type="time"
              className="filter-input"
              value={filters.timeFrom}
              onChange={setFilter("timeFrom")}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">To</label>
            <input
              type="date"
              className="filter-input"
              value={filters.dateTo}
              onChange={setFilter("dateTo")}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">To</label>
            <input
              type="time"
              className="filter-input"
              value={filters.timeTo}
              onChange={setFilter("timeTo")}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Min confidence</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={filters.minConf}
              onChange={setFilter("minConf")}
              className="filter-range"
            />
            <span className="filter-value">{Math.round(filters.minConf * 100)}%</span>
          </div>
          <div className="filter-actions">
            <button className="button" onClick={onResetFilters}>
              Clear filters
            </button>
            <button className="button primary" onClick={() => {}}>
              Apply
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

      {!error && !loading && rows.length > 0 && (
        <div className="dashboard-grid">
          {/* Stat cards */}
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Detections</div>
              <div className="stat-value">{stats?.total_detections ?? 0}</div>
            </div>
            <div className="stat-card avg-crowd">
              <div className="stat-label">Avg Crowd</div>
              <div className="stat-value">
                {(stats?.avg_crowd ?? 0).toFixed(1)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Peak</div>
              <div className="stat-value">{stats?.peak ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Confidence</div>
              <div className="stat-value">
                {(stats?.mean_confidence ?? 0) * 100}.0%
              </div>
            </div>
          </div>

          {/* Average crowd size by hour - horizontal bars */}
          <div className="panel chart-panel">
            <h2>Average crowd size by hour</h2>
            <div className="hour-bar-chart">
              {hourly
                .filter((h) => h.frames > 0)
                .map((h) => {
                  const pct = maxHourlyAvg > 0 ? (h.avg / maxHourlyAvg) * 100 : 0;
                  return (
                    <div key={h.hour} className="hour-bar-row">
                      <span className="hour-label">{h.hour}</span>
                      <div className="hour-bar-track">
                        <div
                          className="hour-bar-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="hour-value">{h.avg.toFixed(1)}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Crowd over time - line chart */}
          <div className="panel chart-panel">
            <h2>Crowd over time</h2>
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
                    stroke="#6ee7a8"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detections table */}
          <div className="panel table-panel">
            <div className="panel-header">
              <h2>Detections</h2>
              <span className="muted">{rows.length} of {records.length} frames</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>People</th>
                    <th>Avg confidence</th>
                    <th>Inference</th>
                    <th>File</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((record, index) => (
                    <tr key={`${record.timestamp}-${index}`}>
                      <td className="num">
                        {new Date(record.timestamp).toLocaleString()}
                      </td>
                      <td className="num">{record.count}</td>
                      <td className="num">
                        {record.avgConf == null ? "—" : `${(record.avgConf * 100).toFixed(1)}%`}
                      </td>
                      <td className="num">
                        {(record.inference_time_ms ?? 0).toFixed(0)} ms
                      </td>
                      <td>{record.filename}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
