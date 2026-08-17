import { useRef, useEffect, useCallback } from 'react';

// Colour stops matching the dashboard's existing progress-bar palette
const colour = (pct) =>
  pct > 80 ? '#f44336' : pct > 60 ? '#ff9800' : '#4caf50';

// Format a unix-second timestamp as a short time/date label
const fmtLabel = (ts, hours) => {
  const d = new Date(ts * 1000);
  if (hours <= 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

// How many x-axis tick marks look good for each range
const tickCount = (hours) => {
  if (hours <= 6)  return 6;
  if (hours <= 12) return 6;
  if (hours <= 24) return 8;
  return 8;
};

export default function CpuChart({ samples, hours, loading }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Resolve actual pixel dimensions (handles devicePixelRatio internally via CSS sizing)
    const W = canvas.width;
    const H = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Drawing margins
    const ml = Math.round(34 * dpr); // left  – room for y-axis labels
    const mr = Math.round(8  * dpr); // right
    const mt = Math.round(8  * dpr); // top
    const mb = Math.round(28 * dpr); // bottom – room for x-axis labels
    const chartW = W - ml - mr;
    const chartH = H - mt - mb;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, W, H);

    const fontSize = Math.round(9 * dpr);
    ctx.font = `${fontSize}px system-ui, sans-serif`;

    // --- Y axis grid lines + labels (0, 25, 50, 75, 100) ---
    const yLevels = [0, 25, 50, 75, 100];
    yLevels.forEach((pct) => {
      const y = mt + chartH - (pct / 100) * chartH;

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = dpr;
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(ml, y);
      ctx.lineTo(ml + chartW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#666680';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pct}%`, ml - 4 * dpr, y);
    });

    // --- Loading / empty state ---
    if (loading || !samples || samples.length === 0) {
      ctx.fillStyle = '#666680';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(11 * dpr)}px system-ui, sans-serif`;
      ctx.fillText(
        loading ? 'Loading…' : 'No data yet — check back in a minute',
        ml + chartW / 2,
        mt + chartH / 2
      );
      return;
    }

    // --- X axis ticks ---
    const ticks = tickCount(hours);
    const nowTs  = samples[samples.length - 1].t;
    const spanTs = hours * 3600;
    const startTs = nowTs - spanTs;

    for (let i = 0; i <= ticks; i++) {
      const ts = startTs + (spanTs / ticks) * i;
      const x  = ml + (i / ticks) * chartW;

      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(x, mt);
      ctx.lineTo(x, mt + chartH);
      ctx.stroke();

      ctx.fillStyle = '#555570';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.fillText(fmtLabel(ts, hours), x, mt + chartH + 4 * dpr);
    }

    // --- Line chart ---
    // Map each sample to canvas coords
    const pts = samples.map((s) => ({
      x: ml + ((s.t - startTs) / spanTs) * chartW,
      y: mt + chartH - (s.v / 100) * chartH,
      v: s.v,
    }));

    // Filled area under the line — use a vertical gradient
    const grad = ctx.createLinearGradient(0, mt, 0, mt + chartH);
    grad.addColorStop(0,   'rgba(102,126,234,0.35)');
    grad.addColorStop(0.6, 'rgba(102,126,234,0.08)');
    grad.addColorStop(1,   'rgba(102,126,234,0.00)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, mt + chartH);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, mt + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Coloured line — segment-by-segment so colour reflects the value
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = colour(pts[i].v);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x,     pts[i].y);
      ctx.stroke();
    }

    // Current value dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = colour(last.v);
    ctx.fill();

  }, [samples, hours, loading]);

  // Re-draw whenever data or range changes
  useEffect(() => { draw(); }, [draw]);

  // Re-draw on resize (ResizeObserver avoids polling)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      canvas.width  = Math.round(width  * dpr);
      canvas.height = Math.round(height * dpr);
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '180px', display: 'block', borderRadius: '8px' }}
    />
  );
}
