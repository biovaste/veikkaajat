/**
 * Import historical competition CSV into hist_matches + hist_predictions.
 *
 * Usage:
 *   npx tsx scripts/import-historical.ts <path-to-csv> <competition-id>
 *
 * Examples:
 *   npx tsx scripts/import-historical.ts "data/EM08_raw.csv" EM08
 *   npx tsx scripts/import-historical.ts "data/MM10_raw.csv" MM10
 *
 * The script:
 *   1. Reads hist_players from Supabase (canonical names + aliases)
 *   2. Parses the CSV, resolves each player column to a canonical name
 *   3. Prints a full dry-run summary (unknowns highlighted)
 *   4. Asks for confirmation before inserting
 *
 * CSV format expected (see EM08_raw):
 *   #,Turnaus,Vaihe,Koti,Vieras,Tulos,Merkki,
 *   <Player>-veikkaus,<Player>-merkki,<Player>-pisteet, ...
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ─── Config ─────────────────────────────────────────────────────────────────

// Competition metadata — add a row here for each tournament you import
const COMPETITION_META: Record<
  string,
  { name: string; type: "EC" | "WC"; year: number; host?: string }
> = {
  EM08: { name: "EM 2008", type: "EC", year: 2008, host: "Austria/Switzerland" },
  MM10: { name: "MM 2010", type: "WC", year: 2010, host: "South Africa" },
  EM12: { name: "EM 2012", type: "EC", year: 2012, host: "Poland/Ukraine" },
  MM14: { name: "MM 2014", type: "WC", year: 2014, host: "Brazil" },
  EM16: { name: "EM 2016", type: "EC", year: 2016, host: "France" },
  MM18: { name: "MM 2018", type: "WC", year: 2018, host: "Russia" },
  EM20: { name: "EM 2020", type: "EC", year: 2021, host: "Multiple" },
  EM24: { name: "EM 2024", type: "EC", year: 2024, host: "Germany" },
  MM26: { name: "MM 2026", type: "WC", year: 2026, host: "USA/Canada/Mexico" },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface HistPlayer {
  id: number;
  canonical_name: string;
  aliases: string[];
}

interface ParsedRow {
  match_num: number;
  stage: string;
  home_team: string;
  away_team: string;
  home_goals: number | null;
  away_goals: number | null;
  result_sign: string | null;
  predictions: Array<{
    player_name: string; // resolved canonical name (or raw if unknown)
    home_pred: number | null;
    away_pred: number | null;
    sign_pred: string | null;
    points: number | null;
    raw_column: string; // original CSV column prefix
    unresolved: boolean;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseScore(s: string): [number | null, number | null] {
  if (!s || s.trim() === "") return [null, null];
  const m = s.trim().match(/^(\d+)-(\d+)$/);
  if (!m) return [null, null];
  return [parseInt(m[1]), parseInt(m[2])];
}

function signFromScore(home: number | null, away: number | null): string | null {
  if (home === null || away === null) return null;
  if (home > away) return "1";
  if (home < away) return "2";
  return "x";
}

function sanitizeSign(s: string): string | null {
  if (s === "1" || s === "x" || s === "2") return s;
  return null;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── CSV parsing ─────────────────────────────────────────────────────────────

function parseCSV(filePath: string): { headers: string[]; rows: string[][] } {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { headers, rows };
}

// Extract player column prefixes from headers.
// Headers after the 7th column (index 6) follow the pattern: <Name>-veikkaus, <Name>-merkki, <Name>-pisteet
function extractPlayerColumns(headers: string[]): string[] {
  const players: string[] = [];
  for (let i = 7; i < headers.length; i += 3) {
    const h = headers[i];
    const suffix = "-veikkaus";
    if (h.endsWith(suffix)) {
      players.push(h.slice(0, -suffix.length));
    }
  }
  return players;
}

// ─── Name resolution ─────────────────────────────────────────────────────────

function buildNameIndex(players: HistPlayer[]): Map<string, string> {
  const index = new Map<string, string>(); // lowercased name/alias → canonical_name
  for (const p of players) {
    index.set(p.canonical_name.toLowerCase(), p.canonical_name);
    for (const alias of p.aliases) {
      index.set(alias.toLowerCase(), p.canonical_name);
    }
  }
  return index;
}

function resolvePlayerName(
  raw: string,
  index: Map<string, string>
): { canonical: string; unresolved: boolean } {
  const found = index.get(raw.toLowerCase());
  if (found) return { canonical: found, unresolved: false };
  return { canonical: raw, unresolved: true };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const [, , csvPath, competitionId] = process.argv;

  if (!csvPath || !competitionId) {
    console.error("Usage: npx tsx scripts/import-historical.ts <csv-path> <competition-id>");
    console.error("Known competition IDs:", Object.keys(COMPETITION_META).join(", "));
    process.exit(1);
  }

  const meta = COMPETITION_META[competitionId];
  if (!meta) {
    console.error(`Unknown competition: ${competitionId}`);
    console.error("Add it to COMPETITION_META in this script.");
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  // Supabase client (service role so we can read hist_players and insert)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.");
    process.exit(1);
  }
  const db = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Load existing hist_players ─────────────────────────────────────────
  const { data: existingPlayers, error: pErr } = await db
    .from("hist_players")
    .select("id, canonical_name, aliases");
  if (pErr) throw pErr;
  const nameIndex = buildNameIndex(existingPlayers ?? []);

  // ── 2. Parse CSV ──────────────────────────────────────────────────────────
  const { headers, rows } = parseCSV(csvPath);
  const playerColumns = extractPlayerColumns(headers);

  if (playerColumns.length === 0) {
    console.error("No player columns found. Check CSV format.");
    process.exit(1);
  }

  const parsedRows: ParsedRow[] = [];
  for (const row of rows) {
    if (row.length < 7) continue;

    const matchNum = parseInt(row[0]);
    const stage = row[2];
    const homeTeam = row[3];
    const awayTeam = row[4];
    const [homeGoals, awayGoals] = parseScore(row[5]);
    const resultSign = sanitizeSign(row[6]) ?? signFromScore(homeGoals, awayGoals);

    const predictions: ParsedRow["predictions"] = [];
    let colIdx = 7;
    for (const rawName of playerColumns) {
      const veikkaus = row[colIdx] ?? "";
      const merkki = row[colIdx + 1] ?? "";
      const pisteet = row[colIdx + 2] ?? "";

      // Skip if all three cells are empty (player didn't participate in this competition)
      if (veikkaus === "" && merkki === "" && pisteet === "") {
        colIdx += 3;
        continue;
      }

      const [homePred, awayPred] = parseScore(veikkaus);
      const signPred = sanitizeSign(merkki) ?? signFromScore(homePred, awayPred);
      const points = pisteet !== "" ? parseInt(pisteet) : null;
      const { canonical, unresolved } = resolvePlayerName(rawName, nameIndex);

      predictions.push({
        player_name: canonical,
        home_pred: homePred,
        away_pred: awayPred,
        sign_pred: signPred,
        points,
        raw_column: rawName,
        unresolved,
      });
      colIdx += 3;
    }

    parsedRows.push({ match_num: matchNum, stage, home_team: homeTeam, away_team: awayTeam, home_goals: homeGoals, away_goals: awayGoals, result_sign: resultSign, predictions });
  }

  // ── 3. Dry-run report ─────────────────────────────────────────────────────
  const unresolved = new Set<string>();
  for (const row of parsedRows) {
    for (const p of row.predictions) {
      if (p.unresolved) unresolved.add(p.raw_column);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  DRY RUN: ${competitionId} (${meta.name})`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Matches:  ${parsedRows.length}`);
  console.log(`  Players found in CSV: ${playerColumns.join(", ")}`);
  console.log("");

  if (unresolved.size > 0) {
    console.log("⚠️  UNRESOLVED PLAYERS (not in hist_players table):");
    for (const name of unresolved) {
      console.log(`   • "${name}"`);
    }
    console.log("");
    console.log("For each unresolved player, choose one of:");
    console.log("  [N] Create new hist_player with this name");
    console.log("  [canonical name] Map to an existing player");
    console.log("  [skip] Skip all predictions for this player");
    console.log("");

    const resolutions: Map<string, "new" | "skip" | string> = new Map();
    for (const name of unresolved) {
      const answer = await prompt(`  "${name}" → [N=new / canonical name / skip]: `);
      const a = answer.trim();
      if (a.toLowerCase() === "n" || a === "") {
        resolutions.set(name, "new");
      } else if (a.toLowerCase() === "skip") {
        resolutions.set(name, "skip");
      } else {
        resolutions.set(name, a); // treat as canonical name to map to
      }
    }

    // Apply resolutions
    for (const row of parsedRows) {
      for (const p of row.predictions) {
        if (!p.unresolved) continue;
        const res = resolutions.get(p.raw_column);
        if (res === "new") {
          // Will create a new hist_player with this name
        } else if (res === "skip") {
          p.player_name = "__SKIP__";
        } else if (res) {
          p.player_name = res;
        }
      }
    }
  } else {
    console.log("✅  All player names resolved.");
  }

  // ── 4. Match preview ──────────────────────────────────────────────────────
  console.log("\nMatches to import:");
  for (const row of parsedRows) {
    const score = row.home_goals !== null ? `${row.home_goals}-${row.away_goals}` : "?-?";
    const players = row.predictions
      .filter((p) => p.player_name !== "__SKIP__")
      .map((p) => p.player_name)
      .join(", ");
    console.log(`  #${row.match_num} [${row.stage}] ${row.home_team} vs ${row.away_team} ${score}  — ${players}`);
  }

  const confirm = await prompt("\nProceed with insert? [y/N]: ");
  if (confirm.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  // ── 5. Insert ─────────────────────────────────────────────────────────────

  // Upsert competition
  const { error: compErr } = await db.from("competitions").upsert({
    id: competitionId,
    name: meta.name,
    type: meta.type,
    year: meta.year,
    host: meta.host ?? null,
  });
  if (compErr) throw compErr;
  console.log(`\n✅ Competition "${competitionId}" upserted.`);

  // Create new hist_players for unresolved names marked as "new"
  const newPlayerNames = new Set<string>();
  for (const row of parsedRows) {
    for (const p of row.predictions) {
      if (p.unresolved && p.player_name !== "__SKIP__") {
        newPlayerNames.add(p.player_name);
      }
    }
  }
  if (newPlayerNames.size > 0) {
    const { error: npErr } = await db.from("hist_players").insert(
      [...newPlayerNames].map((name) => ({ canonical_name: name, aliases: [] }))
    );
    if (npErr) throw npErr;
    console.log(`✅ Created ${newPlayerNames.size} new hist_player(s): ${[...newPlayerNames].join(", ")}`);
  }

  // Insert matches + predictions
  let matchCount = 0;
  let predCount = 0;
  for (const row of parsedRows) {
    const { data: matchData, error: mErr } = await db
      .from("hist_matches")
      .upsert(
        {
          competition_id: competitionId,
          match_num: row.match_num,
          stage: row.stage,
          home_team: row.home_team,
          away_team: row.away_team,
          home_goals: row.home_goals,
          away_goals: row.away_goals,
          result_sign: row.result_sign,
        },
        { onConflict: "competition_id,match_num" }
      )
      .select("id")
      .single();
    if (mErr) throw mErr;
    matchCount++;

    const preds = row.predictions.filter((p) => p.player_name !== "__SKIP__");
    if (preds.length > 0) {
      const { error: predErr } = await db.from("hist_predictions").upsert(
        preds.map((p) => ({
          match_id: matchData.id,
          player_name: p.player_name,
          home_pred: p.home_pred,
          away_pred: p.away_pred,
          sign_pred: p.sign_pred,
          points: p.points,
        })),
        { onConflict: "match_id,player_name" }
      );
      if (predErr) throw predErr;
      predCount += preds.length;
    }
  }

  console.log(`\n✅ Done: ${matchCount} matches, ${predCount} predictions inserted for ${competitionId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
