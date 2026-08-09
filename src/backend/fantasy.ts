/**
 * Fantasy scoring: how a set of picked drivers is worth points against a race.
 *
 * Everything here is pure — no React, no network — so the CLI at the bottom can
 * score a real finished race and assert exact totals.
 */

import { fetchNextRace, fetchRaceFeed, type LiveRace } from "./live-race";
import type { DriverStanding } from "./drivers";

export const MaxPicks = 3;

/**
 * 1st = 100, 2nd–5th = 50, 6th–10th = 10, anything lower = 0.
 *
 * Kept as one ordered table so the rules are tunable in a single place; the
 * first tier whose `through` the finishing position reaches wins.
 */
export const PickTiers = [
    { through: 1, points: 100 },
    { through: 5, points: 50 },
    { through: 10, points: 10 },
] as const;

export function pointsForPosition(position: number): number {
    if (!Number.isFinite(position) || position < 1) return 0;

    return PickTiers.find(tier => position <= tier.through)?.points ?? 0;
}

/**
 * `out` still carries a position — NASCAR classifies a retired car at the spot
 * it ended up, so a crash on lap 3 finishes 35th rather than scoring nothing.
 * Only `not-entered` has no position at all.
 */
export type PickOutcome = "running" | "out" | "not-entered";

export interface PickScore {
    id: string;
    name: string;
    carNumber: string;
    carNumberImageUrl: string | null;
    /** Null only when the driver is not in the race's entry list. */
    position: number | null;
    points: number;
    outcome: PickOutcome;
}

export type ScoreBlocker = "ok" | "no-race" | "series-mismatch" | "not-a-race";

export interface ScoreBoard {
    /** One row per pick, in the order they were picked. */
    rows: PickScore[];
    total: number;
    scorable: boolean;
    blocker: ScoreBlocker;
}

/**
 * The live feed is global and serves whatever session is on track, so a race
 * being loaded is not enough — it has to be the right series, and an actual
 * race rather than practice or qualifying.
 */
function blockerFor(race: LiveRace | null, pickedSeriesId: number): ScoreBlocker {
    if (!race) return "no-race";
    if (race.seriesId !== pickedSeriesId) return "series-mismatch";
    if (race.runType !== "race") return "not-a-race";

    return "ok";
}

export function scorePicks(
    pickIds: string[],
    standings: DriverStanding[],
    race: LiveRace | null,
    pickedSeriesId: number
): ScoreBoard {
    const blocker = blockerFor(race, pickedSeriesId);
    const scorable = blocker === "ok";

    // LiveEntry.driverId and DriverStanding.id are the same Nascar_Driver_ID
    // space, so the string form of the former is the join key.
    const entered = new Map(
        (race?.entries ?? []).map(entry => [String(entry.driverId), entry])
    );

    const rows: PickScore[] = pickIds.map(id => {
        const entry = entered.get(id);
        // Standings carry more drivers than any single race's entry list, so
        // they backstop the name and car number when someone is not entered.
        const standing = standings.find(row => row.id === id);

        const identity = {
            id,
            name: entry?.name || standing?.name || "Unknown driver",
            carNumber: entry?.carNumber || standing?.carNumber || "",
            carNumberImageUrl: entry?.carNumberImageUrl ?? standing?.carNumberImageUrl ?? null,
        };

        if (!entry) {
            return { ...identity, position: null, points: 0, outcome: "not-entered" as const };
        }

        return {
            ...identity,
            position: entry.position,
            points: scorable ? pointsForPosition(entry.position) : 0,
            outcome: entry.isOut ? ("out" as const) : ("running" as const),
        };
    });

    return {
        rows,
        total: rows.reduce((sum, row) => sum + row.points, 0),
        scorable,
        blocker,
    };
}

// ---------------------------------------------------------------------------
// Entries: picking for a specific race, locking, and banking the result
// ---------------------------------------------------------------------------

/** One submitted set of picks, tied to the race it was entered for. */
export interface FantasyEntry {
    raceId: number;
    seriesId: number;
    raceName: string;
    picks: string[];
    submittedAt: number;
}

export interface CareerRace {
    points: number;
    raceName: string;
    scoredAt: number;
}

export interface CareerRecord {
    total: number;
    /** Keyed by raceId. Presence is what makes banking idempotent. */
    races: Record<string, CareerRace>;
}

export const EmptyCareer: CareerRecord = { total: 0, races: {} };

/**
 * `open` — still editable. `locked` — the race has started. `scored` — banked.
 */
export type EntryPhase = "open" | "locked" | "scored";

/**
 * Whether an entry can still be changed.
 *
 * Two independent signals for "the race has started", because neither alone is
 * enough: a race more than ~3 weeks out has only an approximate start time
 * inferred from race_date, while the live feed is authoritative but only says
 * anything once that race is actually the one on track.
 */
export function entryPhase(
    entry: FantasyEntry | null,
    race: LiveRace | null,
    startsAt: number | null,
    career: CareerRecord,
    now: number = Date.now()
): EntryPhase {
    if (!entry) return "open";
    if (career.races[String(entry.raceId)]) return "scored";

    const onTrack = race?.raceId === entry.raceId;
    const started = startsAt != null && Number.isFinite(startsAt) && now >= startsAt;

    return onTrack || started ? "locked" : "open";
}

/**
 * Add a finished race's score to the career total.
 *
 * Keyed on raceId and a no-op when that race is already recorded — the screen
 * re-observes the same finished race on every poll, so this will be called
 * repeatedly with the same arguments and must not double-count.
 */
export function bankEntry(
    career: CareerRecord,
    entry: FantasyEntry,
    finished: LiveRace,
    standings: DriverStanding[] = []
): CareerRecord {
    const key = String(entry.raceId);
    if (career.races[key]) return career;

    const board = scorePicks(entry.picks, standings, finished, entry.seriesId);
    if (!board.scorable) return career;

    return {
        total: career.total + board.total,
        races: {
            ...career.races,
            [key]: {
                points: board.total,
                raceName: entry.raceName || finished.runName,
                scoredAt: Date.now(),
            },
        },
    };
}

// ---------------------------------------------------------------------------
// CLI — `npx tsx src/backend/fantasy.ts`
// ---------------------------------------------------------------------------

// Brickyard 400: a completed Cup race (flag_state 9), so its finishing order is
// fixed and the expected totals below can be asserted rather than eyeballed.
const BrickyardSeriesId = 1;
const BrickyardRaceId = 5619;

function check(label: string, actual: unknown, expected: unknown): boolean {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(actual)}` +
        (ok ? "" : ` (expected ${JSON.stringify(expected)})`));

    return ok;
}

async function main() {
    const race = await fetchRaceFeed(BrickyardSeriesId, BrickyardRaceId);
    console.log(`${race.runName} — ${race.trackName} (${race.entries.length} cars, flag ${race.flag})\n`);

    // Resolve by car number so a wrong hardcoded driver id can't silently pass.
    const byCar = (number: string) => {
        const entry = race.entries.find(e => e.carNumber === number);
        if (!entry) throw new Error(`car #${number} not in the ${race.runName} field`);
        return String(entry.driverId);
    };

    const winner = byCar("67");
    const second = byCar("20");
    const ninth = byCar("77");

    for (const [label, id] of [["winner", winner], ["2nd", second], ["9th", ninth]] as const) {
        const entry = race.entries.find(e => String(e.driverId) === id)!;
        console.log(`  ${label}: P${entry.position} #${entry.carNumber} ${entry.name}`);
    }
    console.log();

    let passed = true;
    const pass = (ok: boolean) => { passed = passed && ok; };

    console.log("tiers");
    pass(check("P1", pointsForPosition(1), 100));
    pass(check("P2", pointsForPosition(2), 50));
    pass(check("P5", pointsForPosition(5), 50));
    pass(check("P6", pointsForPosition(6), 10));
    pass(check("P10", pointsForPosition(10), 10));
    pass(check("P11", pointsForPosition(11), 0));

    console.log("\nscoring a finished race");
    const scored = scorePicks([winner, second, ninth], [], race, BrickyardSeriesId);
    pass(check("total (100+50+10)", scored.total, 160));
    pass(check("points per pick", scored.rows.map(r => r.points), [100, 50, 10]));
    pass(check("positions", scored.rows.map(r => r.position), [1, 2, 9]));
    pass(check("blocker", scored.blocker, "ok"));

    console.log("\na pick who never entered");
    const absent = scorePicks([winner, "999999"], [], race, BrickyardSeriesId);
    pass(check("outcome", absent.rows[1].outcome, "not-entered"));
    pass(check("position", absent.rows[1].position, null));
    pass(check("total unaffected", absent.total, 100));

    console.log("\nwrong series on track");
    const mismatch = scorePicks([winner, second, ninth], [], race, 3);
    pass(check("blocker", mismatch.blocker, "series-mismatch"));
    pass(check("total", mismatch.total, 0));
    pass(check("rows still rendered", mismatch.rows.length, 3));

    console.log("\nno race loaded");
    const none = scorePicks([winner], [], null, BrickyardSeriesId);
    pass(check("blocker", none.blocker, "no-race"));
    pass(check("total", none.total, 0));

    const entry: FantasyEntry = {
        raceId: race.raceId,
        seriesId: race.seriesId,
        raceName: race.runName,
        picks: [winner, second, ninth],
        submittedAt: Date.now(),
    };

    console.log("\nlock phase");
    const soon = Date.now() + 60_000;
    const past = Date.now() - 60_000;
    pass(check("no entry", entryPhase(null, null, soon, EmptyCareer), "open"));
    pass(check("before start", entryPhase(entry, null, soon, EmptyCareer), "open"));
    pass(check("start passed", entryPhase(entry, null, past, EmptyCareer), "locked"));
    pass(check("race on track", entryPhase(entry, race, soon, EmptyCareer), "locked"));

    console.log("\nbanking");
    const banked = bankEntry(EmptyCareer, entry, race);
    pass(check("total", banked.total, 160));
    pass(check("recorded once", Object.keys(banked.races), [String(race.raceId)]));
    pass(check("phase after banking", entryPhase(entry, race, past, banked), "scored"));

    // The screen re-observes the same finished race on every poll, so this is
    // the guarantee that stops the career total inflating without bound.
    const twice = bankEntry(banked, entry, race);
    pass(check("banking again is a no-op", twice.total, 160));
    pass(check("same object returned", twice === banked, true));

    console.log("\naccumulating a second race");
    const iowa = await fetchRaceFeed(1, 5620);
    const iowaWinner = iowa.entries.find(e => e.position === 1)!;
    const iowaEntry: FantasyEntry = {
        raceId: iowa.raceId,
        seriesId: iowa.seriesId,
        raceName: iowa.runName,
        picks: [String(iowaWinner.driverId)],
        submittedAt: Date.now(),
    };
    const both = bankEntry(banked, iowaEntry, iowa);
    console.log(`  ${iowa.runName}: P1 ${iowaWinner.name} (+100)`);
    pass(check("career total", both.total, 260));
    pass(check("races recorded", Object.keys(both.races).length, 2));

    console.log("\nnext upcoming race");
    const next = await fetchNextRace();
    if (next) {
        console.log(`  ${next.name} — ${next.trackName} (${next.seriesLabel})`);
        console.log(`  starts ${new Date(next.startsAt).toISOString()} exact=${next.startIsExact}`);
        pass(check("is in the future", next.startsAt > Date.now(), true));
        pass(check("start time is finite", Number.isFinite(next.startsAt), true));
    } else {
        console.log("  none scheduled (season over?)");
    }

    console.log(`\n${passed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
    if (!passed) process.exitCode = 1;
}

// Only run as a standalone script. `process.argv` is undefined in React Native,
// so importing this from a screen fetches nothing.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("fantasy.ts")) {
    main().catch(err => console.error("fantasy failed:", err));
}
