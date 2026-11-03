import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getHistory, resetHistory } from "../api";

export default function HistoryView() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [f, setF] = useState({ dateFrom: "", dateTo: "", timeFrom: "", timeTo: "", minConf: 0 });

  async function load(signal) {
    try {
      const data = await getHistory(1000, signal);
      setRecords(data.detections);
      setStats(data.stats);
      setError(null);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    }
  }

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, []);

  const rows = useMemo(() => {
    return records
      .map(r => {
        const d = new Date(r.timestamp);
        const kept = r.detections.filter(x => x.confidence >= f.minConf);
        return {
          ...r,
          count: kept.length,
          avgConf: kept.length ? kept.reduce((s, x) => s + x.confidence, 0) / kept.length : null,
          date: d.toLocaleDateString("en-CA"),     // YYYY-MM-DD, local time
          time: d.toTimeString().slice(0, 5),      // HH:MM, local time
        };
      })
      .filter(r =>
        (!f.dateFrom || r.date >= f.dateFrom) &&
        (!f.dateTo || r.date <= f.dateTo) &&
        (!f.timeFrom || r.time >= f.timeFrom) &&
        (!f.timeTo || r.time <= f.timeTo)
      );
  }, [records, f]);

  const set = k => e => setF(prev => ({ ...prev, [k]: k === "minConf" ? Number(e.target.value) : e.target.value }));

  async function onReset() {
    if (!window.confirm("Delete all detection history?")) return;
    try { await resetHistory(); await load(); } catch (e) { setError(e.message); }
  }

  return (
    <section>
      <h1>History</h1>

      {stats && (
        <p>
          {stats.frames_processed} frames · {stats.total_detections} people total ·
          mean confidence {(stats.mean_confidence * 100).toFixed(1)}% ·
          avg {stats.avg_processing_time_ms.toFixed(0)} ms/frame
        </p>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label>From date <input type="date" value={f.dateFrom} onChange={set("dateFrom")} /></label>
        <label>To date <input type="date" value={f.dateTo} onChange={set("dateTo")} /></label>
        <label>From time <input type="time" value={f.timeFrom} onChange={set("timeFrom")} /></label>
        <label>To time <input type="time" value={f.timeTo} onChange={set("timeTo")} /></label>
        <label>Min confidence: {Math.round(f.minConf * 100)}%
          <input type="range" min="0" max="1" step="0.05" value={f.minConf} onChange={set("minConf")} />
        </label>
        <button onClick={onReset}>Clear history</button>
      </div>

      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      {!error && rows.length === 0 && <p>No detections match these filters.</p>}

      {rows.length > 0 && (
        <>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={rows}>
                <XAxis dataKey="timestamp" tickFormatter={t => new Date(t).toLocaleTimeString()} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={t => new Date(t).toLocaleString()} />
                <Line type="monotone" dataKey="count" name="People" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <table>
            <thead>
              <tr><th>Timestamp</th><th>File</th><th>People</th><th>Avg confidence</th><th>Time (ms)</th></tr>
            </thead>
            <tbody>
              {[...rows].reverse().map(r => (
                <tr key={r.timestamp}>
                  <td>{new Date(r.timestamp).toLocaleString()}</td>
                  <td>{r.filename}</td>
                  <td>{r.count}</td>
                  <td>{r.avgConf == null ? "—" : `${(r.avgConf * 100).toFixed(1)}%`}</td>
                  <td>{r.processing_time_ms.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}