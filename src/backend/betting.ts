/**
 * Betting: a persistent points bankroll wagered on where each driver finishes.
 *
 * The shape of the game: one bet (a finishing slot plus a stake) per driver per
 * race, collected into a BetSheet. Placing the sheet escrows the total stake
 * out of the balance immediately; settlement pays winning bets back in at the
 * slot's multiplier. Going broke is not game over — settlement tops an empty
 * balance back up to a fresh bankroll.
 *
 * Everything here is pure — no React, no network — so the CLI at the bottom can
 * settle a real finished race and assert exact payouts.
 */

import { fetchRaceFeed, type LiveRace } from "./live-race";
import { getRaceResults, type RaceResult } from "./nascar-api";

export const StartingBankroll = 100;

// ---------------------------------------------------------------------------
// Slots: where a driver can finish, and what that pays
// ---------------------------------------------------------------------------

export type BetSlotKey = "win" | "top5" | "top10" | "twenties" | "thirties" | "dnf";

export interface BetSlot {
    key: BetSlotKey;
    label: string;
    /** The band as prose, for the card UI. */
    band: string;
    multiplier: number;
}

/**
 * Top tiers are inclusive (a win also cashes a Top 5 bet); 20s/30s are exact
 * bands. P11–19 is deliberately uncovered — that dead zone is the house edge.
 * A payout is the TOTAL returned: stake × multiplier, not profit on top.
 */
export const BetSlots: readonly BetSlot[] = [
    { key: "win", label: "Win", band: "P1", multiplier: 10 },
    { key: "top5", label: "Top 5", band: "P1–5", multiplier: 5 },
    { key: "top10", label: "Top 10", band: "P1–10", multiplier: 3 },
    { key: "twenties", label: "20s", band: "P20–29", multiplier: 4 },
    { key: "thirties", label: "30s", band: "P30+", multiplier: 5 },
    { key: "dnf", label: "DNF", band: "Out of the race", multiplier: 8 },
] as const;

export function slotInfo(key: BetSlotKey): BetSlot {
    return BetSlots.find(slot => slot.key === key)!;
}

/**
 * One driver's official result, reduced to what the slots test. NASCAR
 * classifies a retired car at the spot it ended up, so a lap-3 crash still
 * holds a position (and can legitimately win a 30s bet as well as a DNF bet —
 * on different sheets; a driver only carries one bet per sheet).
 */
export interface FinishRecord {
    driverId: string;
    position: number;
    isDnf: boolean;
    /** Already reflected in position (the feed demotes DQ'd cars); carried for future rules. */
    disqualified: boolean;
}

export function slotWins(slot: BetSlotKey, finish: FinishRecord): boolean {
    const p = finish.position;
    if (!Number.isFinite(p) || p < 1) return false;

    switch (slot) {
        case "win":
            return p === 1;
        case "top5":
            return p <= 5;
        case "top10":
            return p <= 10;
        case "twenties":
            return p >= 20 && p <= 29;
        case "thirties":
            return p >= 30;
        case "dnf":
            return finish.isDnf;
    }
}

// ---------------------------------------------------------------------------
// Sheets and the bankroll
// ---------------------------------------------------------------------------

export interface DriverBet {
    driverId: string;
    name: string;
    carNumber: string;
    carNumberImageUrl: string | null;
    slot: BetSlotKey;
    stake: number;
}

/** One placed set of bets, tied to the race it was entered for. */
export interface BetSheet {
    raceId: number;
    seriesId: number;
    /** Stored at submit so the settlement feed URL needs no extra race-list fetch. */
    season: number;
    raceName: string;
    bets: DriverBet[];
    /** Escrowed out of the balance when the sheet was placed. */
    staked: number;
    submittedAt: number;
}

export type BetOutcome = "won" | "lost" | "refunded";

export interface BetResult {
    driverId: string;
    name: string;
    carNumber: string;
    carNumberImageUrl: string | null;
    slot: BetSlotKey;
    stake: number;
    /** Null only when the driver never entered the race. */
    position: number | null;
    outcome: BetOutcome;
    /** Paid back to the balance: stake × multiplier on a win, the stake on a refund, 0 on a loss. */
    payout: number;
}

export interface SettledRace {
    raceName: string;
    staked: number;
    /** Sum of payouts. */
    returned: number;
    /** returned − staked, for the "how did I do" line. */
    net: number;
    settledAt: number;
    results: BetResult[];
}

export interface BankrollRecord {
    balance: number;
    /** Keyed by raceId. Presence is what makes settlement idempotent. */
    races: Record<string, SettledRace>;
}

export const EmptyBankroll: BankrollRecord = { balance: StartingBankroll, races: {} };

export function stakeTotal(bets: readonly { stake: number }[]): number {
    return bets.reduce((sum, bet) => sum + bet.stake, 0);
}

export function settleSheet(sheet: BetSheet, finishes: FinishRecord[]): SettledRace {
    const byDriver = new Map(finishes.map(f => [f.driverId, f]));

    const results: BetResult[] = sheet.bets.map(bet => {
        const identity = {
            driverId: bet.driverId,
            name: bet.name,
            carNumber: bet.carNumber,
            carNumberImageUrl: bet.carNumberImageUrl,
            slot: bet.slot,
            stake: bet.stake,
        };
        const finish = byDriver.get(bet.driverId);

        // A driver who never entered can't win or lose — the stake comes back.
        if (!finish) {
            return { ...identity, position: null, outcome: "refunded" as const, payout: bet.stake };
        }

        const won = slotWins(bet.slot, finish);
        return {
            ...identity,
            position: finish.position,
            outcome: won ? ("won" as const) : ("lost" as const),
            payout: won ? bet.stake * slotInfo(bet.slot).multiplier : 0,
        };
    });

    const returned = results.reduce((sum, r) => sum + r.payout, 0);

    return {
        raceName: sheet.raceName,
        staked: sheet.staked,
        returned,
        net: returned - sheet.staked,
        settledAt: Date.now(),
        results,
    };
}

/**
 * Pay a settled race into the bankroll.
 *
 * Keyed on raceId and a no-op when that race is already recorded — the screen
 * re-observes the same finished race on every poll, so this will be called
 * repeatedly with the same arguments and must not double-pay. The stake was
 * escrowed at submit, so only payouts move the balance here.
 */
export function applySettlement(
    bankroll: BankrollRecord,
    sheet: BetSheet,
    settled: SettledRace
): BankrollRecord {
    const key = String(sheet.raceId);
    if (bankroll.races[key]) return bankroll;

    const balance = bankroll.balance + settled.returned;

    return {
        // Losing everything shouldn't end the game: top back up for next week.
        balance: balance <= 0 ? StartingBankroll : balance,
        races: { ...bankroll.races, [key]: settled },
    };
}

// ---------------------------------------------------------------------------
// Lifecycle and drafting
// ---------------------------------------------------------------------------

/** `open` — still editable. `locked` — the race has started. `settled` — paid out. */
export type SheetPhase = "open" | "locked" | "settled";

/**
 * Whether a sheet can still be changed.
 *
 * Two independent signals for "the race has started", because neither alone is
 * enough: a race more than ~3 weeks out has only an approximate start time
 * inferred from race_date, while the live feed is authoritative but only says
 * anything once that race is actually the one on track.
 */
export function sheetPhase(
    sheet: BetSheet | null,
    race: LiveRace | null,
    startsAt: number | null,
    bankroll: BankrollRecord,
    now: number = Date.now()
): SheetPhase {
    if (!sheet) return "open";
    if (bankroll.races[String(sheet.raceId)]) return "settled";

    const onTrack = race?.raceId === sheet.raceId;
    const started = startsAt != null && Number.isFinite(startsAt) && now >= startsAt;

    return onTrack || started ? "locked" : "open";
}

/** A bet as it exists mid-deck: the stake can be dialed in before a slot is chosen. */
export interface DraftBet {
    slot: BetSlotKey | null;
    stake: number;
}

/** The most a driver's stake can be: whatever the rest of the draft hasn't claimed. */
export function maxStake(
    balance: number,
    draft: ReadonlyMap<string, DraftBet>,
    driverId: string
): number {
    let others = 0;
    for (const [id, bet] of draft) {
        if (id !== driverId) others += bet.stake;
    }

    return Math.max(0, balance - others);
}

// ---------------------------------------------------------------------------
// Result adapters
// ---------------------------------------------------------------------------

/** The official classification off weekend-feed.json — the source of truth. */
export function finishesFromResults(results: RaceResult[]): FinishRecord[] {
    return results
        .filter(r => r.driver_id)
        .map(r => ({
            driverId: String(r.driver_id),
            position: r.finishing_position,
            isDnf: r.finishing_status !== "Running",
            disqualified: r.disqualified,
        }));
}

/** Fallback when the weekend feed is unavailable: the frozen live feed's final order. */
export function finishesFromLiveRace(race: LiveRace): FinishRecord[] {
    return race.entries
        .filter(e => e.driverId)
        .map(e => ({
            driverId: String(e.driverId),
            position: e.position,
            isDnf: e.isOut,
            disqualified: false,
        }));
}

// ---------------------------------------------------------------------------
// Watching a sheet against the live feed
// ---------------------------------------------------------------------------

export type TrackBlocker = "ok" | "no-race" | "wrong-race" | "not-a-race";

export interface TrackedBet {
    bet: DriverBet;
    /** Current running position; null when the driver is not in the field. */
    position: number | null;
    isOut: boolean;
    /** Whether the bet would pay if the race ended right now. */
    hitting: boolean;
    provisionalPayout: number;
}

export interface TrackBoard {
    /** One row per bet, in the order they were placed. */
    rows: TrackedBet[];
    provisionalReturn: number;
    trackable: boolean;
    blocker: TrackBlocker;
}

/**
 * The live feed is global and serves whatever session is on track, so a race
 * being loaded is not enough — it has to be the sheet's race, and an actual
 * race rather than practice or qualifying.
 */
export function trackSheet(sheet: BetSheet, race: LiveRace | null): TrackBoard {
    const blocker: TrackBlocker = !race
        ? "no-race"
        : race.raceId !== sheet.raceId
          ? "wrong-race"
          : race.runType !== "race"
            ? "not-a-race"
            : "ok";
    const trackable = blocker === "ok";

    // LiveEntry.driverId and DriverBet.driverId are the same Nascar_Driver_ID
    // space, so the string form of the former is the join key.
    const entered = new Map((race?.entries ?? []).map(e => [String(e.driverId), e]));

    const rows: TrackedBet[] = sheet.bets.map(bet => {
        const entry = entered.get(bet.driverId);

        if (!entry || !trackable) {
            return {
                bet,
                position: entry?.position ?? null,
                isOut: entry?.isOut ?? false,
                hitting: false,
                provisionalPayout: 0,
            };
        }

        const hitting = slotWins(bet.slot, {
            driverId: bet.driverId,
            position: entry.position,
            isDnf: entry.isOut,
            disqualified: false,
        });

        return {
            bet,
            position: entry.position,
            isOut: entry.isOut,
            hitting,
            provisionalPayout: hitting ? bet.stake * slotInfo(bet.slot).multiplier : 0,
        };
    });

    return {
        rows,
        provisionalReturn: rows.reduce((sum, r) => sum + r.provisionalPayout, 0),
        trackable,
        blocker,
    };
}

// ---------------------------------------------------------------------------
// CLI — `npx tsx src/backend/betting.ts`
// ---------------------------------------------------------------------------

// Iowa Corn 350: a completed Cup race with three real Accident retirements, so
// every outcome below can be asserted against fixed official results.
const IowaSeason = 2026;
const IowaSeriesId = 1;
const IowaRaceId = 5620;

function check(label: string, actual: unknown, expected: unknown): boolean {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(actual)}` +
        (ok ? "" : ` (expected ${JSON.stringify(expected)})`));

    return ok;
}

function syntheticFinish(position: number, isDnf = false): FinishRecord {
    return { driverId: "x", position, isDnf, disqualified: false };
}

async function main() {
    let passed = true;
    const pass = (ok: boolean) => { passed = passed && ok; };

    console.log("slot band edges");
    pass(check("win P1", slotWins("win", syntheticFinish(1)), true));
    pass(check("win P2", slotWins("win", syntheticFinish(2)), false));
    pass(check("top5 P5", slotWins("top5", syntheticFinish(5)), true));
    pass(check("top5 P6", slotWins("top5", syntheticFinish(6)), false));
    pass(check("top10 P10", slotWins("top10", syntheticFinish(10)), true));
    pass(check("top10 P11", slotWins("top10", syntheticFinish(11)), false));
    pass(check("dead zone P19", BetSlots.filter(s => slotWins(s.key, syntheticFinish(19))), []));
    pass(check("20s P20", slotWins("twenties", syntheticFinish(20)), true));
    pass(check("20s P29", slotWins("twenties", syntheticFinish(29)), true));
    pass(check("20s P30", slotWins("twenties", syntheticFinish(30)), false));
    pass(check("30s P30", slotWins("thirties", syntheticFinish(30)), true));
    pass(check("dnf running", slotWins("dnf", syntheticFinish(12)), false));
    pass(check("dnf out", slotWins("dnf", syntheticFinish(35, true)), true));
    pass(check("crash classified P35 wins 30s too", slotWins("thirties", syntheticFinish(35, true)), true));

    console.log("\nofficial results");
    const results = await getRaceResults(IowaSeason, IowaSeriesId, IowaRaceId);
    const finishes = finishesFromResults(results);
    console.log(`  ${finishes.length} classified finishers`);

    // Resolve by car number so a wrong hardcoded driver id can't silently pass.
    const byCar = (number: string) => {
        const row = results.find(r => r.car_number === number);
        if (!row) throw new Error(`car #${number} not in the Iowa results`);
        return row;
    };

    const winner = byCar("54"); // Ty Gibbs, P1
    const second = byCar("20"); // Christopher Bell, P2
    const third = byCar("12"); // Ryan Blaney, P3
    const crashed = byCar("45"); // Tyler Reddick, Accident, P36
    const crashed34 = byCar("48"); // Alex Bowman, Accident, P34

    const bet = (row: RaceResult, slot: BetSlotKey, stake: number): DriverBet => ({
        driverId: String(row.driver_id),
        name: row.team_name,
        carNumber: row.car_number,
        carNumberImageUrl: null,
        slot,
        stake,
    });

    const sheet: BetSheet = {
        raceId: IowaRaceId,
        seriesId: IowaSeriesId,
        season: IowaSeason,
        raceName: "Iowa Corn 350",
        bets: [
            bet(winner, "win", 10), // ×10 → 100
            bet(second, "top5", 5), // ×5 → 25
            bet(crashed, "dnf", 10), // ×8 → 80
            bet(crashed34, "thirties", 5), // classified P34 → ×5 → 25
            bet(third, "twenties", 10), // P3 in the 20s band → lost
            { driverId: "999999", name: "Never Entered", carNumber: "0", carNumberImageUrl: null, slot: "win", stake: 7 },
        ],
        staked: 0,
        submittedAt: Date.now(),
    };
    sheet.staked = stakeTotal(sheet.bets);

    console.log("\nsettling a real race");
    pass(check("staked", sheet.staked, 47));
    const settled = settleSheet(sheet, finishes);
    pass(check("outcomes", settled.results.map(r => r.outcome),
        ["won", "won", "won", "won", "lost", "refunded"]));
    pass(check("payouts", settled.results.map(r => r.payout), [100, 25, 80, 25, 0, 7]));
    pass(check("positions", settled.results.map(r => r.position), [1, 2, 36, 34, 3, null]));
    pass(check("returned", settled.returned, 237));
    pass(check("net", settled.net, 190));

    console.log("\nbankroll");
    // Escrow happens at submit (the hook's job): 100 − 47 staked = 53 in hand.
    const escrowed: BankrollRecord = { balance: StartingBankroll - sheet.staked, races: {} };
    const paid = applySettlement(escrowed, sheet, settled);
    pass(check("balance after payout", paid.balance, 53 + 237));
    pass(check("recorded once", Object.keys(paid.races), [String(IowaRaceId)]));

    const twice = applySettlement(paid, sheet, settled);
    pass(check("settling again is a no-op", twice === paid, true));

    const ruined: BankrollRecord = { balance: 0, races: {} };
    const allLost = settleSheet(
        { ...sheet, bets: [bet(third, "win", 100)], staked: 100 },
        finishes
    );
    pass(check("bust tops back up", applySettlement(ruined, sheet, allLost).balance, StartingBankroll));

    console.log("\nphases");
    const soon = Date.now() + 60_000;
    const past = Date.now() - 60_000;
    pass(check("no sheet", sheetPhase(null, null, soon, EmptyBankroll), "open"));
    pass(check("before start", sheetPhase(sheet, null, soon, EmptyBankroll), "open"));
    pass(check("start passed", sheetPhase(sheet, null, past, EmptyBankroll), "locked"));
    pass(check("after settlement", sheetPhase(sheet, null, past, paid), "settled"));

    console.log("\ndraft stakes");
    const draft = new Map<string, DraftBet>([
        ["a", { slot: "win", stake: 30 }],
        ["b", { slot: null, stake: 20 }],
        ["c", { slot: "dnf", stake: 15 }],
    ]);
    pass(check("room left for a new driver", maxStake(100, draft, "d"), 35));
    pass(check("own stake doesn't count against itself", maxStake(100, draft, "a"), 65));
    pass(check("never negative", maxStake(10, draft, "d"), 0));

    console.log("\ntracking against the frozen live feed");
    const race = await fetchRaceFeed(IowaSeriesId, IowaRaceId);
    pass(check("race on track", sheetPhase(sheet, race, soon, EmptyBankroll), "locked"));
    const board = trackSheet(sheet, race);
    pass(check("trackable", board.blocker, "ok"));
    pass(check("hitting", board.rows.map(r => r.hitting), [true, true, true, true, false, false]));
    pass(check("provisional return", board.provisionalReturn, 230));
    const wrongRace = trackSheet({ ...sheet, raceId: 1 }, race);
    pass(check("wrong race blocked", wrongRace.blocker, "wrong-race"));
    pass(check("wrong race pays nothing", wrongRace.provisionalReturn, 0));

    console.log(`\n${passed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
    if (!passed) process.exitCode = 1;
}

// Only run as a standalone script. `process.argv` is undefined in React Native,
// so importing this from a screen fetches nothing.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("betting.ts")) {
    main().catch(err => console.error("betting failed:", err));
}
