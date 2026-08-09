/**
 * Live timing & scoring off the undocumented NASCAR live feed.
 *
 * There is exactly ONE global live feed. `series_{id}/live-feed.json` (without a
 * race id) returns 403 for every series, so the feed serves whatever session is
 * on track and the app cannot choose a series. The per-race variant
 * `series_{id}/{raceId}/live-feed.json` does work, and is how a finished race is
 * loaded for the idle screen.
 *
 * The feed never empties: when nothing is running it keeps serving the last
 * session's final state. Deciding whether that state is live is the whole job of
 * classifyLiveRace() below.
 */

import {
    carBadgeUrl,
    cleanName,
    fetchFeed,
    getSeasonRaces,
    raceStartTime,
    Series,
    seriesInfoById,
    SeriesKeys,
    type RaceListEntry,
} from "./nascar-api";

export const LiveFeedUrl = "https://cf.nascar.com/live/feeds/live-feed.json";

export function raceFeedUrl(seriesId: number, raceId: number): string {
    return `https://cf.nascar.com/live/feeds/series_${seriesId}/${raceId}/live-feed.json`;
}

// ---------------------------------------------------------------------------
// Raw feed shape
// ---------------------------------------------------------------------------

interface NascarLiveVehicle {
    running_position: number;
    /** Overloaded: positive = seconds behind leader, negative = laps down. */
    delta: number;
    laps_completed: number;
    last_lap_time: number;
    last_lap_speed: number;
    best_lap_time: number;
    best_lap_speed: number;
    average_speed: number;
    vehicle_number: string;
    /** A three-letter code ("Tyt"), not a name. */
    vehicle_manufacturer: string;
    driver: {
        driver_id: number;
        full_name: string;
        first_name: string;
        last_name: string;
        is_in_chase: boolean;
    };
    laps_led: { start_lap: number; end_lap: number }[];
    /** 1 = running, 3 = out. */
    status: number;
    is_on_track: boolean;
    /** Damaged Vehicle Policy — car is in the garage on the clock. */
    is_on_dvp: boolean;
    starting_position: number;
    sponsor_name: string;
}

interface NascarLiveFeed {
    race_id: number;
    series_id: number;
    run_id: number;
    run_name: string;
    run_type: number;
    flag_state: number;
    lap_number: number;
    laps_in_race: number;
    laps_to_go: number;
    elapsed_time: number;
    track_name: string;
    track_length: number;
    number_of_caution_segments: number;
    number_of_caution_laps: number;
    number_of_lead_changes: number;
    stage: { stage_num: number; finish_at_lap: number; laps_in_stage: number } | null;
    vehicles: NascarLiveVehicle[];
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type FlagState =
    | "green"
    | "yellow"
    | "red"
    | "checkered"
    | "finished"
    | "stopped"
    | "warmup"
    | "unknown";

export type RunType = "practice" | "qualifying" | "race" | "unknown";

/**
 * 1/2/3/4/9 are confirmed against live and completed feeds; 6/8 come from
 * NASCAR's own timing docs. Anything else renders neutral and lets the
 * freshness rules decide whether the session is live.
 */
const FlagStates: Record<number, FlagState> = {
    1: "green",
    2: "yellow",
    3: "red",
    4: "checkered",
    6: "stopped",
    8: "warmup",
    9: "finished",
};

const RunTypes: Record<number, RunType> = {
    1: "practice",
    2: "qualifying",
    3: "race",
};

// The feed abbreviates the make; ManufacturerBadge keys on the full name.
const ManufacturerNames: Record<string, string> = {
    tyt: "Toyota",
    chv: "Chevrolet",
    frd: "Ford",
};

export interface LiveEntry {
    /** driver_id alone is not guaranteed unique across a weekend's entry list. */
    id: string;
    driverId: number;
    position: number;
    name: string;
    carNumber: string;
    carNumberImageUrl: string | null;
    manufacturer: string;
    sponsor: string;
    /** Seconds behind the leader. Null when lapped (the gap is in lapsDown). */
    gapSeconds: number | null;
    /** Whole laps down; 0 on the lead lap. */
    lapsDown: number;
    isLeader: boolean;
    lastLapTime: number | null;
    bestLapTime: number | null;
    lapsCompleted: number;
    lapsLed: number;
    startingPosition: number;
    /** Positive = gained places since the start. 0 when the start is unknown. */
    positionsGained: number;
    isOnTrack: boolean;
    isOut: boolean;
    isOnDvp: boolean;
}

export interface LiveRace {
    raceId: number;
    seriesId: number;
    seriesLabel: string;
    runId: number;
    runName: string;
    runType: RunType;
    flag: FlagState;
    rawFlag: number;
    lapNumber: number;
    lapsInRace: number;
    lapsToGo: number;
    trackName: string;
    trackLength: number;
    elapsedTime: number;
    cautions: number;
    cautionLaps: number;
    leadChanges: number;
    stage: { number: number; finishAtLap: number; lapsInStage: number } | null;
    entries: LiveEntry[];
    /** epoch ms from Last-Modified; null when unreadable. */
    lastModified: number | null;
    /** Server clock from the Date header. Null on web (CORS hides it). */
    serverTime: number | null;
    fetchedAt: number;
}

export interface FeedMeta {
    lastModified: number | null;
    serverTime: number | null;
    fetchedAt: number;
}

function sumLapsLed(spans: NascarLiveVehicle["laps_led"] | undefined): number {
    if (!spans?.length) return 0;

    return spans.reduce((total, span) => {
        const laps = span.end_lap - span.start_lap + 1;
        return total + (laps > 0 ? laps : 0);
    }, 0);
}

/**
 * Split the overloaded `delta` field.
 *
 * Verified live: car #77 sat at delta -2.0 while still status 1 / on track (two
 * laps down but running), and #43 at -143.0 was status 3 / off track. So the
 * sign of delta says nothing about retirement — that comes from `status`.
 */
function toGap(vehicle: NascarLiveVehicle): Pick<LiveEntry, "gapSeconds" | "lapsDown" | "isLeader"> {
    const isLeader = vehicle.running_position === 1;

    if (vehicle.delta < 0) {
        return { gapSeconds: null, lapsDown: Math.round(-vehicle.delta), isLeader };
    }

    return { gapSeconds: vehicle.delta, lapsDown: 0, isLeader };
}

function positive(value: number | undefined): number | null {
    return typeof value === "number" && value > 0 ? value : null;
}

function toEntry(vehicle: NascarLiveVehicle, seriesId: number): LiveEntry {
    const carNumber = vehicle.vehicle_number?.trim() ?? "";
    const start = vehicle.starting_position ?? 0;

    return {
        id: `${vehicle.driver.driver_id}-${carNumber}`,
        driverId: vehicle.driver.driver_id,
        position: vehicle.running_position,
        name: cleanName(vehicle.driver.first_name, vehicle.driver.last_name),
        carNumber,
        carNumberImageUrl: carBadgeUrl(carNumber, seriesId),
        manufacturer:
            ManufacturerNames[vehicle.vehicle_manufacturer?.trim().toLowerCase() ?? ""] ?? "",
        sponsor: vehicle.sponsor_name?.trim() ?? "",
        ...toGap(vehicle),
        lastLapTime: positive(vehicle.last_lap_time),
        bestLapTime: positive(vehicle.best_lap_time),
        lapsCompleted: vehicle.laps_completed ?? 0,
        lapsLed: sumLapsLed(vehicle.laps_led),
        startingPosition: start,
        positionsGained: start > 0 ? start - vehicle.running_position : 0,
        isOnTrack: vehicle.is_on_track ?? false,
        isOut: vehicle.status === 3 || vehicle.is_on_track === false,
        isOnDvp: vehicle.is_on_dvp ?? false,
    };
}

/** Pure — no network, so the CLI can exercise it against a saved payload. */
export function toLiveRace(feed: NascarLiveFeed, meta: FeedMeta): LiveRace {
    const seriesId = feed.series_id;

    return {
        raceId: feed.race_id,
        seriesId,
        seriesLabel: seriesInfoById(seriesId)?.label ?? "",
        runId: feed.run_id,
        runName: feed.run_name?.trim() ?? "",
        runType: RunTypes[feed.run_type] ?? "unknown",
        flag: FlagStates[feed.flag_state] ?? "unknown",
        rawFlag: feed.flag_state,
        lapNumber: feed.lap_number ?? 0,
        lapsInRace: feed.laps_in_race ?? 0,
        lapsToGo: feed.laps_to_go ?? 0,
        trackName: feed.track_name?.trim() ?? "",
        trackLength: feed.track_length ?? 0,
        elapsedTime: feed.elapsed_time ?? 0,
        cautions: feed.number_of_caution_segments ?? 0,
        cautionLaps: feed.number_of_caution_laps ?? 0,
        leadChanges: feed.number_of_lead_changes ?? 0,
        stage: feed.stage
            ? {
                  number: feed.stage.stage_num,
                  finishAtLap: feed.stage.finish_at_lap,
                  lapsInStage: feed.stage.laps_in_stage,
              }
            : null,
        entries: (feed.vehicles ?? [])
            .map(v => toEntry(v, seriesId))
            .sort((a, b) => a.position - b.position),
        lastModified: meta.lastModified,
        serverTime: meta.serverTime,
        fetchedAt: meta.fetchedAt,
    };
}

export function formatGap(entry: LiveEntry): string {
    if (entry.isOut) return "OUT";
    if (entry.isLeader) return "LEADER";
    if (entry.lapsDown > 0) return `${entry.lapsDown} LAP${entry.lapsDown === 1 ? "" : "S"}`;
    if (entry.gapSeconds == null) return "—";

    return `+${entry.gapSeconds.toFixed(3)}`;
}

export function formatLapTime(seconds: number | null): string {
    if (seconds == null) return "—";
    if (seconds < 60) return seconds.toFixed(3);

    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export type LiveFetch =
    | { kind: "updated"; race: LiveRace; etag: string | null }
    | { kind: "unchanged"; etag: string | null };

export async function fetchLiveRace(
    opts: { etag?: string | null; signal?: AbortSignal; url?: string } = {}
): Promise<LiveFetch> {
    const result = await fetchFeed<NascarLiveFeed>(opts.url ?? LiveFeedUrl, {
        etag: opts.etag,
        signal: opts.signal,
    });

    if (result.status === 304) return { kind: "unchanged", etag: result.etag };

    return {
        kind: "updated",
        etag: result.etag,
        race: toLiveRace(result.data, {
            lastModified: result.lastModified,
            serverTime: result.serverTime,
            fetchedAt: Date.now(),
        }),
    };
}

export async function fetchRaceFeed(
    seriesId: number,
    raceId: number,
    signal?: AbortSignal
): Promise<LiveRace> {
    const result = await fetchFeed<NascarLiveFeed>(raceFeedUrl(seriesId, raceId), { signal });

    if (result.status === 304) throw new Error("Unexpected 304 for an unconditional request");

    return toLiveRace(result.data, {
        lastModified: result.lastModified,
        serverTime: result.serverTime,
        fetchedAt: Date.now(),
    });
}

// ---------------------------------------------------------------------------
// Live / not-live classification
// ---------------------------------------------------------------------------

export type LiveStatus = "live" | "checkered" | "final" | "stalled" | "idle";

export interface ClassifyPrev {
    lastModified: number | null;
    /** When we last saw lastModified move forward. */
    advancedAt: number | null;
    status: LiveStatus | null;
}

/**
 * A feed is "fresh" if the origin wrote it recently. CloudFront caches for ~30s
 * and an `age` of 27s was observed on a fresh fetch, so apparent staleness can
 * inflate by roughly a minute through the CDN. 180s clears that comfortably
 * while staying far below the gap between sessions.
 */
const FRESH_MS = 180_000;
/** How long a live board stays up after the feed stops moving before it degrades. */
const STALL_MS = 180_000;
/** ...and how long before we give up and call it idle. */
const IDLE_MS = 600_000;

/**
 * Decide whether the feed we just pulled represents a session happening now.
 *
 * Two signals, in priority order. The *relative* one (did Last-Modified move
 * since the previous poll?) is authoritative because it needs no clock at all —
 * it compares the server against itself, so device clock skew cancels out. The
 * absolute one only carries the first render, before a second sample exists.
 *
 * The asymmetry in the grace periods is deliberate: showing a stale board for a
 * few minutes is a much smaller failure than blanking a genuinely live race.
 */
export function classifyLiveRace(race: LiveRace, prev: ClassifyPrev): LiveStatus {
    const now = Date.now();
    const advanced =
        prev.lastModified != null && race.lastModified != null && race.lastModified > prev.lastModified;
    const fresh =
        race.lastModified != null && (race.serverTime ?? now) - race.lastModified < FRESH_MS;

    // Terminal by content — no clock involved, and it catches the common case of
    // a feed frozen on the last completed race.
    if (race.flag === "finished") return fresh || advanced ? "final" : "idle";

    if (race.flag === "checkered" && (fresh || advanced)) return "checkered";

    if (advanced || fresh) return "live";

    // The feed has stopped moving. Hold the board up before demoting it — a red
    // flag or a brief origin hiccup should not look like "no race today".
    if (prev.status === "live" || prev.status === "checkered" || prev.status === "stalled") {
        const sinceAdvance = prev.advancedAt == null ? Infinity : now - prev.advancedAt;

        if (sinceAdvance < STALL_MS) return "live";
        if (sinceAdvance < IDLE_MS) return "stalled";
    }

    return "idle";
}

// ---------------------------------------------------------------------------
// Idle state: what's next, and how the last one finished
// ---------------------------------------------------------------------------

export interface UpcomingRace {
    raceId: number;
    seriesId: number;
    seriesLabel: string;
    name: string;
    trackName: string;
    startsAt: number;
    /** False when the start time was inferred from race_date — don't show seconds. */
    startIsExact: boolean;
    scheduledLaps: number;
    tv: string;
}

export interface IdleState {
    next: UpcomingRace | null;
    last: LiveRace | null;
}

function toUpcoming(race: RaceListEntry): UpcomingRace {
    const { at, exact } = raceStartTime(race);

    return {
        raceId: race.race_id,
        seriesId: race.series_id,
        seriesLabel: seriesInfoById(race.series_id)?.label ?? "",
        name: race.race_name?.trim() ?? "",
        trackName: race.track_name?.trim() ?? "",
        startsAt: at,
        startIsExact: exact,
        scheduledLaps: race.scheduled_laps ?? 0,
        tv: race.television_broadcaster?.trim() ?? "",
    };
}

const POINTS_RACE_TYPE_ID = 1;

/**
 * Next and last race across all three national series, since the live feed is
 * global and will show whichever runs next.
 *
 * `frozen` is the stale live feed the caller already has. When it is itself a
 * completed race — the usual case between weekends — it is reused as `last`,
 * saving a round trip.
 */
export async function fetchIdleState(
    frozen: LiveRace | null,
    signal?: AbortSignal
): Promise<IdleState> {
    const season = new Date().getFullYear();

    // One series 403ing must not blank the screen, so settle rather than all().
    const settled = await Promise.allSettled(
        SeriesKeys.map(key => getSeasonRaces(season, Series[key].id, signal))
    );

    const races = settled
        .flatMap(r => (r.status === "fulfilled" ? r.value : []))
        .filter(r => r.race_type_id === POINTS_RACE_TYPE_ID);

    const now = Date.now();

    const next =
        races
            .filter(r => r.winner_driver_id == null)
            .map(toUpcoming)
            .filter(r => Number.isFinite(r.startsAt) && r.startsAt > now)
            .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;

    if (frozen && frozen.runType === "race" && frozen.flag === "finished") {
        return { next, last: frozen };
    }

    // winner_driver_id is the only reliable completion signal — actual_laps is
    // pre-populated with scheduled_laps for races that have not run yet.
    const lastRun = races
        .filter(r => r.winner_driver_id != null)
        .sort((a, b) => raceStartTime(b).at - raceStartTime(a).at)[0];

    if (!lastRun) return { next, last: null };

    const last = await fetchRaceFeed(lastRun.series_id, lastRun.race_id, signal).catch(() => null);

    return { next, last };
}

// ---------------------------------------------------------------------------
// CLI — `npx tsx src/backend/live-race.ts [--url <feed>] [--watch]`
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function describe(race: LiveRace, status: LiveStatus): string {
    const lap = race.lapsInRace > 0 ? `lap ${race.lapNumber}/${race.lapsInRace}` : "no lap count";
    const stage = race.stage ? ` stage ${race.stage.number} ends L${race.stage.finishAtLap}` : "";

    return (
        `[${status.toUpperCase()}] ${race.runName} — ${race.trackName} (${race.seriesLabel})\n` +
        `  ${race.runType} · flag ${race.flag} (${race.rawFlag}) · ${lap}${stage}\n` +
        `  last-modified ${race.lastModified ? new Date(race.lastModified).toISOString() : "—"}`
    );
}

async function main() {
    const url = argValue("--url");
    const watch = process.argv.includes("--watch");

    let prev: ClassifyPrev = { lastModified: null, advancedAt: null, status: null };
    let etag: string | null = null;

    const poll = async (): Promise<LiveStatus | null> => {
        const result = await fetchLiveRace({ url, etag });

        if (result.kind === "unchanged") {
            console.log(`304 unchanged (${new Date().toISOString()})`);
            return prev.status;
        }

        etag = result.etag;
        const status = classifyLiveRace(result.race, prev);
        const advanced =
            prev.lastModified != null &&
            result.race.lastModified != null &&
            result.race.lastModified > prev.lastModified;

        prev = {
            lastModified: result.race.lastModified,
            advancedAt: advanced || prev.advancedAt == null ? Date.now() : prev.advancedAt,
            status,
        };

        console.log(describe(result.race, status));
        for (const entry of result.race.entries.slice(0, 15)) {
            console.log(
                `  ${String(entry.position).padStart(2)} #${entry.carNumber.padEnd(3)} ` +
                    `${entry.name.padEnd(22)} ${formatGap(entry).padStart(9)}  ` +
                    `last ${formatLapTime(entry.lastLapTime).padStart(8)}  ${entry.manufacturer}`
            );
        }

        return status;
    };

    if (watch) {
        while (true) {
            await poll().catch(err => console.error("poll failed:", err));
            await new Promise(resolve => setTimeout(resolve, 10_000));
        }
    }

    const status = await poll();

    if (status !== "live" && status !== "checkered") {
        console.log("\n--- idle state ---");
        const idle = await fetchIdleState(null);

        if (idle.next) {
            const when = new Date(idle.next.startsAt);
            const days = (idle.next.startsAt - Date.now()) / 86_400_000;
            console.log(
                `NEXT: ${idle.next.name} — ${idle.next.trackName} (${idle.next.seriesLabel})\n` +
                    `  ${when.toISOString()} ${idle.next.startIsExact ? "(exact)" : "(approx)"} ` +
                    `in ${days.toFixed(1)}d · ${idle.next.scheduledLaps} laps · ${idle.next.tv}`
            );
        } else {
            console.log("NEXT: none scheduled");
        }

        if (idle.last) {
            console.log(`LAST: ${idle.last.runName} — ${idle.last.trackName}`);
            for (const entry of idle.last.entries.slice(0, 5)) {
                console.log(`  ${entry.position}. #${entry.carNumber} ${entry.name}`);
            }
        }
    }
}

// Only run as a standalone script. `process.argv` is undefined in React Native,
// so importing this from a screen fetches nothing.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("live-race.ts")) {
    main().catch(err => console.error("live-race failed:", err));
}
