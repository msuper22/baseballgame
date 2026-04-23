export const APP_TZ = 'America/Chicago';

function parts(date: Date = new Date()): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  if (out.hour === '24') out.hour = '00';
  return out;
}

export function centralDate(date?: Date): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function centralTimeHM(date?: Date): string {
  const p = parts(date);
  return `${p.hour}:${p.minute}`;
}

export function centralStamp(date?: Date): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function centralStampFromLocal(input: string): string {
  if (!input) return centralStamp();
  const s = input.replace('T', ' ');
  if (s.length >= 19) return s.slice(0, 19);
  if (s.length >= 16) return s + ':00';
  return s;
}
