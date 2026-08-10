import {
    carBadgeUrl,
    cleanName,
    fetchJson,
    getRaceResults,
    getSeasonRaces,
    manufacturerName,
    Series,
    type RaceListEntry,
    type RaceResult,
    type SeriesInfo,
} from "./nascar-api";

export { Series, SeriesKeys } from "./nascar-api";
export type { SeriesInfo, SeriesKey } from "./nascar-api";

const url = "https://cf.nascar.com/cacher/drivers.json";

interface NascarDriver {
    Nascar_Driver_ID: number;
    Driver_ID: string;
    Driver_Series: string;
    First_Name: string;
    Last_Name: string;
    Full_Name: string;
    Series_Logo: string;
    Short_Name: string;
    Description: string;
    DOB: string;
    DOD: string;
    Hometown_City: string;
    Crew_Chief: string;
    Hometown_State: string;
    Hometown_Country: string;
    Rookie_Year_Series_1: string;
    Rookie_Year_Series_2: string;
    Rookie_Year_Series_3: string;
    Hobbies: string;
    Children: string;
    Twitter_Handle: string;
    Residing_City: string;
    Residing_State: string;
    Residing_Country: string;
    Badge: string;
    Badge_Image: string;
    // Manufacturer is a logo image URL, not a name — see manufacturerName().
    Manufacturer: string;
    Manufacturer_Small: string;
    Team: string;
    Image: string;
    Image_Small: string;
    Driver_Part_Time: string;
    // This feed also carries Points/Rank/No_Wins/Top5 fields, but they are all
    // "0" for every driver — season totals come from the standings feed instead.
}

interface NascarDriversResponse {
    status: number;
    message: string;
    response: NascarDriver[];
}

// One row of the driver list, shaped for FlatList (stable string key + label).
export interface DriverListItem {
    id: string;
    name: string;
}

async function getNascarDrivers(): Promise<NascarDriver[]> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data: NascarDriversResponse = await response.json();
    return data.response;
}

// Confirmed via inspection: Driver_Series is reliably populated (not blank) and
// maps 1:1 with the series logo. Counts as of 2026: cup 299, O'Reilly 324,
// Craftsman Truck 284.
function getSeriesDrivers(drivers: NascarDriver[], slug: string): NascarDriver[] {
    return drivers.filter(d => d.Driver_Series === slug);
}

// The feed carries duplicate person-records: the same Nascar_Driver_ID appears
// under multiple Driver_IDs (e.g. Brandon Brown = 4118 twice). Nascar_Driver_ID
// is the stable person identity, so dedupe on it, keeping the first occurrence.
function dedupeDrivers(drivers: NascarDriver[]): NascarDriver[] {
    const seen = new Set<number>();
    return drivers.filter(d => {
        if (seen.has(d.Nascar_Driver_ID)) return false;
        seen.add(d.Nascar_Driver_ID);
        return true;
    });
}

export async function drivernames(series: SeriesInfo = Series.cup): Promise<DriverListItem[]> {
    const drivers = await getNascarDrivers();
    const seriesDrivers = dedupeDrivers(getSeriesDrivers(drivers, series.slug));

    return seriesDrivers
        .map(d => ({ id: String(d.Nascar_Driver_ID), name: d.Full_Name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

const POINTS_RACE_TYPE_ID = 1;

// Season points standings as of a given race. `points` is the cumulative
// season total; `delta_leader` is negative (points behind the leader).
interface NascarLivePointsEntry {
    driver_id: number;
    first_name: string;
    last_name: string;
    car_number: string;
    points: number;
    points_position: number;
    points_earned_this_race: number;
    delta_leader: number;
    wins: number;
    top_5: number;
    top_10: number;
    poles: number;
    is_in_chase: boolean;
    is_rookie: boolean;
    is_points_eligible: boolean;
}

// One row of the standings table, shaped for FlatList.
export interface DriverStanding {
    id: string;
    driverId: number;
    position: number;
    name: string;
    carNumber: string;
    /** Empty when the driver has no team on record. */
    team: string;
    /** "Toyota" | "Chevrolet" | "Ford", or empty when unknown. */
    manufacturer: string;
    /** Logo URL on the Cloudflare-protected host — may fail to load; see ManufacturerBadge. */
    manufacturerBadge: string | null;
    /** Null for drivers not currently fielding a car. */
    carNumberImageUrl: string | null;
    /** Large driver photo, Cloudflare-protected host — may fail to load. Null when the feed only has a placeholder. */
    headshotUrl: string | null;
    /** ~100x120 variant of headshotUrl, same caveats. */
    headshotSmallUrl: string | null;
    points: number;
    pointsBehindLeader: number;
    pointsEarnedLastRace: number;
    wins: number;
    top5: number;
    top10: number;
    poles: number;
    isPlayoffEligible: boolean;
    isRookie: boolean;
}

// Standings live under the race they were computed after, so "current standings"
// means "the standings feed for the most recent points race". Exhibition races
// (the Clash, the Duels) pay no points and are excluded. Newest first.
function racesWithStandings(races: RaceListEntry[]): RaceListEntry[] {
    const now = Date.now();

    return races
        .filter(
            r =>
                r.race_type_id === POINTS_RACE_TYPE_ID &&
                r.actual_laps > 0 &&
                Date.parse(r.race_date) <= now
        )
        .sort((a, b) => Date.parse(b.race_date) - Date.parse(a.race_date));
}

// The manufacturer logo lives on www.nascar.com (unlike the car badges, which
// are on cf.nascar.com). That host sits behind Cloudflare and answers 403 to
// non-browser clients, so treat this URL as best-effort: ManufacturerBadge
// falls back to a drawn chip whenever the image fails to load.
function manufacturerBadgeUrl(record: NascarDriver | undefined): string | null {
    const logo = record?.Manufacturer_Small.trim() || record?.Manufacturer.trim() || "";
    return logo || null;
}

// Headshots live on www.nascar.com like the manufacturer logos (same Cloudflare
// 403 caveat), and most Cup records carry a ".../default.png" placeholder rather
// than a real photo — both cases collapse to null so the UI draws its own
// fallback plate instead of a broken image or a generic silhouette.
function usableHeadshot(value: string | undefined): string | null {
    const image = value?.trim() ?? "";
    return image && !image.includes("default.png") ? image : null;
}

// Some records leak an internal ID into the Team field (Team: "198"), which is
// worse than showing nothing.
function usableTeam(record: NascarDriver | undefined): string {
    const team = record?.Team.trim() ?? "";
    return team && !/^\d+$/.test(team) ? team : "";
}

// drivers.json repeats people under multiple Driver_IDs and the copies disagree
// about which car they drive. dedupeDrivers()' keep-the-first rule is wrong
// here: prefer the record for the car this driver is actually running now.
function pickDriverRecord(
    records: NascarDriver[] | undefined,
    carNumber: string
): NascarDriver | undefined {
    if (!records?.length) return undefined;

    const number = carNumber.trim();
    return (
        records.find(r => r.Badge.trim() === number && number !== "") ??
        records.find(r => usableTeam(r)) ??
        records[0]
    );
}

function groupByDriverId(drivers: NascarDriver[]): Map<number, NascarDriver[]> {
    const byId = new Map<number, NascarDriver[]>();

    for (const driver of drivers) {
        const existing = byId.get(driver.Nascar_Driver_ID);
        if (existing) existing.push(driver);
        else byId.set(driver.Nascar_Driver_ID, [driver]);
    }

    return byId;
}

function toStandings(
    entries: NascarLivePointsEntry[],
    driversById: Map<number, NascarDriver[]>,
    resultsByDriverId: Map<number, RaceResult>,
    seriesId: number
): DriverStanding[] {
    return entries
        .filter(e => e.is_points_eligible)
        .map(e => {
            const record = pickDriverRecord(driversById.get(e.driver_id), e.car_number);
            const result = resultsByDriverId.get(e.driver_id);

            return {
            // The Truck feed reports driver_id 0 for a handful of part-timers
            // (three of them in 2026), so driver_id alone is not unique enough
            // to key a list or a selection. Fall back to the points position,
            // which is. Anything keyed this way can never join to a live-feed
            // entry — correct, since those drivers have no id to join on.
            id: e.driver_id ? String(e.driver_id) : `pos-${e.points_position}`,
            driverId: e.driver_id,
            position: e.points_position,
            name: cleanName(e.first_name, e.last_name),
            carNumber: e.car_number,
            team: usableTeam(record) || (result?.team_name.trim() ?? ""),
            manufacturer: result?.car_make.trim() || manufacturerName(record?.Manufacturer),
            manufacturerBadge: manufacturerBadgeUrl(record),
            carNumberImageUrl: carBadgeUrl(e.car_number, seriesId),
            headshotUrl: usableHeadshot(record?.Image),
            headshotSmallUrl: usableHeadshot(record?.Image_Small),
            points: e.points,
            pointsBehindLeader: Math.abs(e.delta_leader),
            pointsEarnedLastRace: e.points_earned_this_race,
            wins: e.wins,
            top5: e.top_5,
            top10: e.top_10,
            poles: e.poles,
            isPlayoffEligible: e.is_in_chase,
            isRookie: e.is_rookie,
            };
        })
        .sort((a, b) => a.position - b.position);
}

export async function driverstandings(
    series: SeriesInfo = Series.cup,
    season: number = new Date().getFullYear()
): Promise<DriverStanding[]> {
    // Early in the calendar year the new season's race list may not be published
    // yet, so fall back to last season rather than returning nothing.
    let resolvedSeason = season;
    let candidates = racesWithStandings(await getSeasonRaces(season, series.id).catch(() => []));
    if (candidates.length === 0) {
        resolvedSeason = season - 1;
        candidates = racesWithStandings(await getSeasonRaces(resolvedSeason, series.id));
    }

    // The newest race's standings feed can lag the race list by a few minutes,
    // so walk back a couple of races before giving up.
    for (const race of candidates.slice(0, 3)) {
        try {
            // Team/manufacturer enrichment is best-effort: if either lookup feed
            // fails, still return the standings rather than losing the points.
            const [entries, drivers, results] = await Promise.all([
                fetchJson<NascarLivePointsEntry[]>(
                    `https://cf.nascar.com/live/feeds/series_${series.id}/${race.race_id}/live-points.json`
                ),
                getNascarDrivers()
                    .then(d => getSeriesDrivers(d, series.slug))
                    .catch(() => [] as NascarDriver[]),
                getRaceResults(resolvedSeason, series.id, race.race_id).catch(
                    () => [] as RaceResult[]
                ),
            ]);

            const standings = toStandings(
                entries,
                groupByDriverId(drivers),
                new Map(results.map(r => [r.driver_id, r])),
                series.id
            );
            if (standings.length > 0) return standings;
        } catch {
            // try the previous race
        }
    }

    throw new Error(`No Cup Series standings available for the ${season} season`);
}

// ---------------------------------------------------------------------------
// Recent form: how each driver finished in the last few completed races
// ---------------------------------------------------------------------------

export interface RecentFinish {
    raceId: number;
    raceName: string;
    position: number;
    /** "Running" for classified finishers; otherwise the retirement reason ("Accident", …). */
    status: string;
    isDnf: boolean;
}

export interface RecentForm {
    /** The completed races that were scanned, newest first. */
    races: { raceId: number; raceName: string; raceDate: string }[];
    /** Keyed by String(driver_id); finishes newest first. A driver missing a race simply has fewer rows. */
    byDriver: Record<string, RecentFinish[]>;
}

const EmptyForm: RecentForm = { races: [], byDriver: {} };

function completedPointsRaces(races: RaceListEntry[]): RaceListEntry[] {
    return races
        // winner_driver_id is the only reliable completion signal — actual_laps
        // is pre-populated with scheduled_laps for races that have not run yet.
        .filter(r => r.race_type_id === POINTS_RACE_TYPE_ID && r.winner_driver_id != null)
        .sort((a, b) => Date.parse(b.race_date) - Date.parse(a.race_date));
}

/**
 * Finishing positions from the last `count` completed points races, for the
 * betting deck's form strip. Best-effort throughout: a race whose results feed
 * fails is dropped rather than blanking the whole thing.
 */
export async function recentFinishes(
    series: SeriesInfo = Series.cup,
    count = 2,
    season: number = new Date().getFullYear()
): Promise<RecentForm> {
    // Same season fallback as driverstandings: early in the calendar year the
    // new season's race list may not be published yet.
    let resolvedSeason = season;
    let completed = completedPointsRaces(await getSeasonRaces(season, series.id).catch(() => []));
    if (completed.length === 0) {
        resolvedSeason = season - 1;
        completed = completedPointsRaces(
            await getSeasonRaces(resolvedSeason, series.id).catch(() => [])
        );
    }

    const recent = completed.slice(0, count);
    const settled = await Promise.allSettled(
        recent.map(r => getRaceResults(resolvedSeason, series.id, r.race_id))
    );

    const form: RecentForm = { races: [], byDriver: {} };

    settled.forEach((result, i) => {
        if (result.status !== "fulfilled") return;

        const race = recent[i];
        const raceName = race.race_name?.trim() ?? "";
        form.races.push({ raceId: race.race_id, raceName, raceDate: race.race_date });

        for (const row of result.value) {
            if (!row.driver_id) continue;
            (form.byDriver[String(row.driver_id)] ??= []).push({
                raceId: race.race_id,
                raceName,
                position: row.finishing_position,
                status: row.finishing_status,
                isDnf: row.finishing_status !== "Running",
            });
        }
    });

    return form.races.length > 0 ? form : EmptyForm;
}

async function main() {
    try {
        const names = await drivernames();
        console.log(`${names.length} unique Cup Series drivers`);
        console.log(names.map(d => d.name).join("\n"));

        const standings = await driverstandings();
        console.log(`\n${standings.length} drivers in the points standings`);
        for (const s of standings) {
            console.log(
                `${String(s.position).padStart(2)}. #${s.carNumber.padEnd(3)} ${s.name.padEnd(22)} ` +
                `${String(s.points).padStart(4)} pts  ${s.team.padEnd(26)} ` +
                `${s.manufacturer.padEnd(10)} ${s.carNumberImageUrl ?? "(no badge)"}`
            );
        }

        const form = await recentFinishes();
        console.log(`\nrecent form (${form.races.map(r => r.raceName).join(" · ") || "none"})`);
        for (const s of standings) {
            const line = (form.byDriver[s.id] ?? [])
                .map(f => (f.isDnf ? `DNF(P${f.position})` : `P${f.position}`))
                .join("  ") || "—";
            console.log(
                `  #${s.carNumber.padEnd(3)} ${s.name.padEnd(22)} ` +
                `${(s.headshotUrl ? "headshot" : "no photo").padEnd(9)} ${line}`
            );
        }
    } catch (err) {
        console.error("Failed to fetch NASCAR driver data:", err);
    }
}

// Only run as a standalone script (`npx tsx src/backend/drivers.ts`).
// `process.argv` is undefined in React Native, so importing this from a screen
// fetches nothing until `drivernames()` is actually called.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("drivers.ts")) {
    main();
}
