/**
 * Shared plumbing for the undocumented cf.nascar.com feeds.
 *
 * This is a leaf module: it must not import from drivers.ts or live-race.ts.
 * Both of those are entry points that also run as standalone scripts, so the
 * helpers they have in common live here instead of in either one of them.
 *
 * Modules under src/backend/ import each other with relative paths, not the
 * `@/` alias — drivers.ts and live-race.ts run under `npx tsx`, where alias
 * resolution is not guaranteed and would break the CLI silently.
 */

/**
 * The three national series the feeds cover. `id` keys every feed URL and the
 * car-badge path; `slug` is what drivers.json puts in Driver_Series.
 *
 * The Whelen Modified Tour appears in drivers.json but has no race or standings
 * feed, so it is deliberately absent. Series ids above 3 return 403.
 */
export const Series = {
    cup: { id: 1, slug: 'nascar-cup-series', label: 'Cup' },
    oreilly: { id: 2, slug: 'nascar-oreilly-auto-parts-series', label: "O'Reilly" },
    truck: { id: 3, slug: 'nascar-craftsman-truck-series', label: 'Trucks' },
} as const;

export type SeriesKey = keyof typeof Series;
export type SeriesInfo = (typeof Series)[SeriesKey];

export const SeriesKeys = Object.keys(Series) as SeriesKey[];

/** The live feed reports a numeric series_id; map it back to a label. */
export function seriesInfoById(id: number): SeriesInfo | null {
    return SeriesKeys.map(key => Series[key]).find(s => s.id === id) ?? null;
}

// Only the fields we use off race_list_basic.json — the feed carries ~30 more.
export interface RaceListEntry {
    race_id: number;
    series_id: number;
    race_season: number;
    race_name: string;
    race_type_id: number;
    track_id: number;
    track_name: string;
    /** Naive local-to-the-track time. Never Date.parse() this directly — see raceStartTime(). */
    race_date: string;
    scheduled_laps: number;
    /**
     * Pre-populated with scheduled_laps for races that have not run yet, so this
     * is NOT a completion test. Use winner_driver_id for that.
     */
    actual_laps: number;
    stage_1_laps: number;
    stage_2_laps: number;
    stage_3_laps: number;
    television_broadcaster: string;
    radio_broadcaster: string;
    /** Null until the race is complete. The only reliable "has it run" signal. */
    winner_driver_id: number | null;
    /** Absent for races more than ~3 weeks out (10 of 40 Cup races as of 2026). */
    schedule?: { event_name: string; start_time_utc: string; run_type: number }[];
}

const RUN_TYPE_RACE = 3;

/** Day-of-month of the nth Sunday in a month (month is 1-based). */
function nthSunday(year: number, month: number, n: number): number {
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
}

/**
 * US Eastern UTC offset for a naive date string. NASCAR reports race_date in
 * track-local time with no zone, and the calendar straddles the DST boundary
 * (races run from February to November), so the offset has to be computed
 * rather than assumed. DST: second Sunday in March → first Sunday in November.
 */
function easternOffset(naiveDate: string): string {
    const [year, month, day] = naiveDate.slice(0, 10).split('-').map(Number);
    const at = Date.UTC(year, month - 1, day);
    const dstStart = Date.UTC(year, 2, nthSunday(year, 3, 2));
    const dstEnd = Date.UTC(year, 10, nthSunday(year, 11, 1));

    return at >= dstStart && at < dstEnd ? '-04:00' : '-05:00';
}

/**
 * Green-flag time as epoch ms.
 *
 * `schedule[run_type === 3].start_time_utc` is the real thing, but it is missing
 * for races more than ~3 weeks out. The fallback reads race_date as Eastern,
 * which is right for most of the calendar but observably off by an hour for a
 * few events — hence `exact`, so the UI can decline to show a to-the-second
 * countdown it cannot back up.
 */
export function raceStartTime(race: RaceListEntry): { at: number; exact: boolean } {
    const scheduled = race.schedule?.find(s => s.run_type === RUN_TYPE_RACE);

    if (scheduled?.start_time_utc) {
        // Naive but documented as UTC, so pin the zone before parsing. Bare
        // Date.parse() on a naive string is device-local per ES2016+.
        const at = Date.parse(`${scheduled.start_time_utc}Z`);
        if (Number.isFinite(at)) return { at, exact: true };
    }

    return {
        at: Date.parse(`${race.race_date}${easternOffset(race.race_date)}`),
        exact: false,
    };
}

export async function fetchJson<T>(feedUrl: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(feedUrl, { signal });

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
}

export function getSeasonRaces(
    season: number,
    seriesId: number,
    signal?: AbortSignal
): Promise<RaceListEntry[]> {
    return fetchJson(
        `https://cf.nascar.com/cacher/${season}/${seriesId}/race_list_basic.json`,
        signal
    );
}

export type FeedResult<T> =
    | {
          status: 200;
          data: T;
          etag: string | null;
          /** epoch ms, or null when the header is unreadable. */
          lastModified: number | null;
          /** Server clock from the Date header — null on web, where CORS hides it. */
          serverTime: number | null;
      }
    | { status: 304; etag: string | null };

/**
 * Conditional GET for the polled live feeds.
 *
 * Three things this does that plain fetchJson cannot:
 *  - 304 is not `response.ok`, so fetchJson would throw on the cheap path that
 *    makes polling viable at all. Here it is a first-class result.
 *  - `cache: 'no-cache'` forces revalidation. The feeds send no Cache-Control
 *    at all, so browsers fall back to heuristic freshness (a fraction of the
 *    time since Last-Modified) and would happily serve a frozen feed for hours.
 *    React Native's XHR-backed fetch ignores the option harmlessly.
 *  - It surfaces Last-Modified and Date, which is how staleness is judged.
 *    Last-Modified is CORS-safelisted so it survives on web; Date does not,
 *    because the feeds send no Access-Control-Expose-Headers.
 */
export async function fetchFeed<T>(
    url: string,
    opts: { etag?: string | null; signal?: AbortSignal } = {}
): Promise<FeedResult<T>> {
    const response = await fetch(url, {
        cache: 'no-cache',
        signal: opts.signal,
        headers: opts.etag ? { 'If-None-Match': opts.etag } : undefined,
    });

    const etag = response.headers.get('etag');

    if (response.status === 304) return { status: 304, etag };

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return {
        status: 200,
        data: (await response.json()) as T,
        etag,
        lastModified: parseHttpDate(response.headers.get('last-modified')),
        serverTime: parseHttpDate(response.headers.get('date')),
    };
}

function parseHttpDate(value: string | null): number | null {
    if (!value) return null;
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : null;
}

// The feed decorates names with eligibility markers: a leading "*", a trailing
// "#" (rookie), and a trailing "(i)" (ineligible for this series' points).
// Strip them — the standings carry the rookie flag as a real boolean.
export function cleanName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`
        .replace(/\(i\)/gi, '')
        .replace(/[*#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Car number badges are served straight off the car number, so no join with
// drivers.json is needed. Numbers with no badge on file 403 — the UI falls back
// to a plain placeholder rather than trying to detect that here.
export function carBadgeUrl(carNumber: string, seriesId: number): string | null {
    const number = carNumber.trim();
    if (!number) return null;

    // Badges are per-series — the same number is a different car in each.
    return `https://cf.nascar.com/data/images/carbadges/${seriesId}/${number}.png`;
}

// drivers.json stores Manufacturer as a logo URL like ".../Toyota-180x180.png",
// so the make has to be read back out of the filename.
export function manufacturerName(logoUrl: string | undefined): string {
    return /\/([A-Za-z]+)-\d+x\d+\.png/.exec(logoUrl ?? '')?.[1] ?? '';
}
