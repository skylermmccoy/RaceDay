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

const POINTS_RACE_TYPE_ID = 1;

// Only the fields we use off race_list_basic.json — the feed carries ~45 more.
interface NascarRaceListEntry {
    race_id: number;
    race_type_id: number;
    race_date: string;
    actual_laps: number;
}

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

// Per-race entry data. Used as the fallback source for team and manufacturer
// when a driver has no usable record in drivers.json.
interface NascarRaceResult {
    driver_id: number;
    team_name: string;
    car_make: string;
}

interface NascarWeekendFeed {
    weekend_race: { results: NascarRaceResult[] }[];
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

async function fetchJson<T>(feedUrl: string): Promise<T> {
    const response = await fetch(feedUrl);

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
}

function getSeasonRaces(season: number, seriesId: number): Promise<NascarRaceListEntry[]> {
    return fetchJson(`https://cf.nascar.com/cacher/${season}/${seriesId}/race_list_basic.json`);
}

// Entry list for a single race — the only feed that knows which team and
// manufacturer a driver actually ran, so it backstops drivers.json.
async function getRaceResults(
    season: number,
    seriesId: number,
    raceId: number
): Promise<NascarRaceResult[]> {
    const feed = await fetchJson<NascarWeekendFeed>(
        `https://cf.nascar.com/cacher/${season}/${seriesId}/${raceId}/weekend-feed.json`
    );

    return feed.weekend_race[0]?.results ?? [];
}

// Standings live under the race they were computed after, so "current standings"
// means "the standings feed for the most recent points race". Exhibition races
// (the Clash, the Duels) pay no points and are excluded. Newest first.
function racesWithStandings(races: NascarRaceListEntry[]): NascarRaceListEntry[] {
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

// The feed decorates names with eligibility markers: a leading "*", a trailing
// "#" (rookie), and a trailing "(i)" (ineligible for this series' points).
// Strip them — `isRookie` already carries the rookie flag as a real boolean.
function cleanName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`
        .replace(/\(i\)/gi, "")
        .replace(/[*#]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// Car number badges are served straight off the car number, so no join with
// drivers.json is needed. Numbers with no badge on file 403 — the UI falls back
// to a plain placeholder rather than trying to detect that here.
function carBadgeUrl(carNumber: string, seriesId: number): string | null {
    const number = carNumber.trim();
    if (!number) return null;

    // Badges are per-series — the same number is a different car in each.
    return `https://cf.nascar.com/data/images/carbadges/${seriesId}/${number}.png`;
}

// The manufacturer logo lives on www.nascar.com (unlike the car badges, which
// are on cf.nascar.com). That host sits behind Cloudflare and answers 403 to
// non-browser clients, so treat this URL as best-effort: ManufacturerBadge
// falls back to a drawn chip whenever the image fails to load.
function manufacturerBadgeUrl(record: NascarDriver | undefined): string | null {
    const logo = record?.Manufacturer_Small.trim() || record?.Manufacturer.trim() || "";
    return logo || null;
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

// Manufacturer is a logo URL like ".../Toyota-180x180.png", so the make has to
// be read back out of the filename.
function manufacturerName(logoUrl: string | undefined): string {
    return /\/([A-Za-z]+)-\d+x\d+\.png/.exec(logoUrl ?? "")?.[1] ?? "";
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
    resultsByDriverId: Map<number, NascarRaceResult>,
    seriesId: number
): DriverStanding[] {
    return entries
        .filter(e => e.is_points_eligible)
        .map(e => {
            const record = pickDriverRecord(driversById.get(e.driver_id), e.car_number);
            const result = resultsByDriverId.get(e.driver_id);

            return {
            id: String(e.driver_id),
            driverId: e.driver_id,
            position: e.points_position,
            name: cleanName(e.first_name, e.last_name),
            carNumber: e.car_number,
            team: usableTeam(record) || (result?.team_name.trim() ?? ""),
            manufacturer: result?.car_make.trim() || manufacturerName(record?.Manufacturer),
            manufacturerBadge: manufacturerBadgeUrl(record),
            carNumberImageUrl: carBadgeUrl(e.car_number, seriesId),
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
                    () => [] as NascarRaceResult[]
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
