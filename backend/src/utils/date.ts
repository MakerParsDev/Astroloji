export function getDateIdentifier(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getLocalDateIdentifier(utcOffset: number, date: Date = new Date()): string {
  return getDateIdentifier(new Date(date.getTime() + utcOffset * 3_600_000));
}

export function getMonthIdentifier(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function getWeekIdentifier(date: Date = new Date()): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function shouldSendNotificationAtUtcHour(
  targetLocalHour: number,
  utcOffset: number,
  currentUtcHour: number
): boolean {
  return ((currentUtcHour + utcOffset + 24) % 24) === targetLocalHour;
}

export function getCurrentUtcHour(date: Date = new Date()): number {
  return date.getUTCHours();
}
