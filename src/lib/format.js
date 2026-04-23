export function fmtAvg(n) {
  if (n == null || isNaN(n)) return '.000';
  const s = Number(n).toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}

export function fmtSlg(n) {
  return fmtAvg(n);
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '0%';
  return (Number(n) * 100).toFixed(1) + '%';
}
