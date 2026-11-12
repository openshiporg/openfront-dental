import { practiceTimeZone } from './server';

/** Today's date at the practice, as YYYY-MM-DD. Clocks on the screens are worked out from this on every read. */
export async function practiceToday(): Promise<string> {
  const tz = await practiceTimeZone();
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);
