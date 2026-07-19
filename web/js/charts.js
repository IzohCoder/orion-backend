/* ═══════════════════════════════════════════════════════════════
   charts.js — ORION Analytics Canvas Charts
   Pure HTML5 Canvas — no chart library dependency.
   ═══════════════════════════════════════════════════════════════ */

const OrionCharts = (() => {
  // ── Color palette ─────────────────────────────────────────
  const COLORS = {
    orange: '#E8571F',
    green:  '#2E8B57',
    grey:   '#A39D8E',
    border: '#1A1814',
    bg:     '#FAF8F4',
    text:   '#1A1814',
    divider:'#ECE9E1'
  };

  // ── Draw a horizontal bar chart ────────────────────────────
  function drawBarChart(canvasId, data, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Resize canvas to its display size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padLeft = 100;
    const padRight = 20;
    const padTop = 16;
    const padBottom = 20;
    const barHeight = 28;
    const barGap = 12;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    const maxVal = Math.max(...data.map(d => d.value), 1);
    const chartW = W - padLeft - padRight;

    data.forEach((item, i) => {
      const y = padTop + i * (barHeight + barGap);
      const barW = (item.value / maxVal) * chartW;

      // Bar fill
      ctx.fillStyle = item.color || COLORS.orange;
      ctx.fillRect(padLeft, y, barW, barHeight);

      // Label (left)
      ctx.fillStyle = COLORS.text;
      ctx.font = `600 11px 'Inter', sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, padLeft - 8, y + barHeight / 2);

      // Value (inside or right of bar)
      ctx.fillStyle = barW > 50 ? '#FFFFFF' : COLORS.text;
      ctx.font = `700 12px 'JetBrains Mono', monospace`;
      ctx.textAlign = barW > 50 ? 'right' : 'left';
      ctx.fillText(
        typeof item.value === 'number' && !Number.isInteger(item.value)
          ? item.value.toFixed(1)
          : item.value,
        barW > 50 ? padLeft + barW - 8 : padLeft + barW + 8,
        y + barHeight / 2
      );
    });
  }

  // ── Draw a donut / pie chart ───────────────────────────────
  function drawDonutChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const cx = W / 3;
    const cy = H / 2;
    const outerR = Math.min(cx, cy) * 0.85;
    const innerR = outerR * 0.55;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;
    data.forEach((item, i) => {
      const sliceAngle = (item.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Donut hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Center text: total
    ctx.fillStyle = COLORS.text;
    ctx.font = `900 22px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 6);
    ctx.font = `500 9px 'Inter', sans-serif`;
    ctx.fillStyle = COLORS.grey;
    ctx.fillText('TOTAL', cx, cy + 12);

    // Legend on the right
    const legendX = cx + outerR + 20;
    const legendStartY = cy - (data.length * 20) / 2;
    data.forEach((item, i) => {
      const ly = legendStartY + i * 24;
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX, ly, 12, 12);

      ctx.fillStyle = COLORS.text;
      ctx.font = `600 11px 'Inter', sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, legendX + 18, ly + 6);

      ctx.font = `600 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = COLORS.grey;
      ctx.textAlign = 'right';
      ctx.fillText(item.value, W - 16, ly + 6);
    });
  }

  // ── Main update: rebuild all 4 charts from live asset data ──
  function update(assets) {
    if (!assets || assets.length === 0) return;

    // 1. Speed distribution (per asset)
    const speedData = assets.map(a => ({
      label: a.name.split(' ')[0], // first word
      value: Math.round(a.speed),
      color: a.speed > 70 ? COLORS.orange : a.speed > 40 ? COLORS.green : COLORS.grey
    })).sort((a, b) => b.value - a.value);
    drawBarChart('chart-speed', speedData, 'km/h');

    // 2. Battery levels (per asset)
    const batteryData = assets.map(a => ({
      label: a.name.split(' ')[0],
      value: Math.round(a.battery),
      color: a.battery > 70 ? COLORS.green : a.battery > 30 ? COLORS.orange : COLORS.orange
    })).sort((a, b) => b.value - a.value);
    drawBarChart('chart-battery', batteryData, '%');

    // 3. Status breakdown (donut)
    const statusCounts = { active: 0, idle: 0, offline: 0 };
    assets.forEach(a => {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    });
    drawDonutChart('chart-status', [
      { label: 'ACTIVE',  value: statusCounts.active,  color: COLORS.green },
      { label: 'IDLE',    value: statusCounts.idle,    color: COLORS.grey },
      { label: 'OFFLINE', value: statusCounts.offline, color: COLORS.border }
    ].filter(d => d.value > 0));

    // 4. Category mix (donut)
    const catCounts = {};
    assets.forEach(a => { catCounts[a.category] = (catCounts[a.category] || 0) + 1; });
    const catColors = ['#E8571F', '#2E8B57', '#A39D8E', '#1A1814'];
    const catData = Object.entries(catCounts).map(([label, value], i) => ({
      label: label.toUpperCase(),
      value,
      color: catColors[i % catColors.length]
    }));
    drawDonutChart('chart-category', catData);
  }

  return { update };
})();
