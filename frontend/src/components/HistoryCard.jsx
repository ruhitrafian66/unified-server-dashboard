import { useState, useCallback } from 'react';
import axios from 'axios';
import HistoryChart from './HistoryChart';
import usePolling from '../hooks/usePolling';

export const HISTORY_RANGES = [
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '2d', hours: 48 },
  { label: '4d', hours: 96 },
];

/**
 * A dashboard card with range tabs and a HistoryChart, fed by
 * GET {endpoint}?hours=N (returns { samples: [{ t, v }] }). Refreshes every
 * minute, matching the server's sampling rate.
 */
export default function HistoryCard({ title, endpoint, chart, legend, formatValue }) {
  const [range, setRange] = useState(HISTORY_RANGES[0]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (hours) => {
    setLoading(true);
    try {
      const res = await axios.get(`${endpoint}?hours=${hours}`);
      setSamples(res.data.samples || []);
    } catch {
      // Keep the previous data on a failed refresh.
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  usePolling(() => load(range.hours), 60000);

  const values = samples.map((s) => s.v);
  const current = values.at(-1);
  const peak = values.length ? Math.max(...values) : null;
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return (
    <div className="card">
      <div className="card-header-row">
        <h2>{title}</h2>
        {current != null && (
          <span className="history-stats">
            now <strong>{formatValue(current)}</strong> · avg {formatValue(avg)} · peak {formatValue(peak)}
          </span>
        )}
      </div>
      <div className="mobile-tabs mb-2" role="tablist" aria-label={`${title} range`}>
        {HISTORY_RANGES.map((r) => (
          <button
            key={r.label}
            role="tab"
            aria-selected={range.hours === r.hours}
            className={`mobile-tab ${range.hours === r.hours ? 'active' : ''}`}
            onClick={() => { setRange(r); load(r.hours); }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <HistoryChart samples={samples} hours={range.hours} loading={loading && !samples.length}
        ariaLabel={`${title}, last ${range.label}`} {...chart} />
      <div className="history-legend">
        {legend.map(([color, text]) => (
          <span key={text}><span style={{ color }}>●</span> {text}</span>
        ))}
      </div>
    </div>
  );
}
