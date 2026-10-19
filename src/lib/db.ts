import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SkillItem, CustomSkillInput } from "../types/index.js";
import { SEED_SKILLS } from "../data/seed-skills.js";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "skills.db");
const db = new DatabaseSync(DB_PATH);

// Run Pragmas for high performance
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

export function initDb(): void {
  // Schema Migration
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      name TEXT NOT NULL,
      installs INTEGER DEFAULT 0,
      weekly_installs TEXT,
      is_official INTEGER DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      description TEXT,
      category TEXT DEFAULT 'workflow',
      markdown_content TEXT,
      stars INTEGER DEFAULT 0,
      repo_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_skills_installs ON skills (installs DESC);
    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills (name);
    CREATE INDEX IF NOT EXISTS idx_skills_custom ON skills (is_custom);
  `);

  // Seed default skills if empty
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM skills");
  const result: any = countStmt.get();

  if (!result || result.count === 0) {
    console.log("Seeding initial SQL database with verified agent skills...");
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO skills (
        id, source, skill_id, name, installs, weekly_installs, is_official, is_custom, description, category, stars, repo_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of SEED_SKILLS) {
      insertStmt.run(
        s.id,
        s.source,
        s.skillId,
        s.name,
        s.installs,
        JSON.stringify(s.weeklyInstalls || [0, 0, 0, 0, 0, 0, 0, 0]),
        s.isOfficial ? 1 : 0,
        0,
        s.description || "",
        s.category || "workflow",
        s.stars || 0,
        s.repoUrl || `https://github.com/${s.source}`
      );
    }
    console.log(`Seeded ${SEED_SKILLS.length} verified skills in SQL database.`);
  }
}

export function getSkillsFromDb(limit = 50, offset = 0, customOnly = false): SkillItem[] {
  let query = "SELECT * FROM skills";
  if (customOnly) {
    query += " WHERE is_custom = 1";
  }
  query += " ORDER BY installs DESC LIMIT ? OFFSET ?";

  const stmt = db.prepare(query);
  const rows = stmt.all(limit, offset);

  return rows.map((r: any) => ({
    id: r.id,
    source: r.source,
    skillId: r.skill_id,
    name: r.name,
    installs: r.installs,
    weeklyInstalls: r.weekly_installs ? JSON.parse(r.weekly_installs) : [],
    isOfficial: Boolean(r.is_official),
    isCustom: Boolean(r.is_custom),
    description: r.description,
    category: r.category,
    stars: r.stars,
    repoUrl: r.repo_url,
    markdownContent: r.markdown_content,
  }));
}

export function searchSkillsInDb(queryStr: string, limit = 50): SkillItem[] {
  const param = `%${queryStr.trim()}%`;
  const stmt = db.prepare(`
    SELECT * FROM skills 
    WHERE name LIKE ? OR description LIKE ? OR source LIKE ?
    ORDER BY installs DESC
    LIMIT ?
  `);

  const rows = stmt.all(param, param, param, limit);
  return rows.map((r: any) => ({
    id: r.id,
    source: r.source,
    skillId: r.skill_id,
    name: r.name,
    installs: r.installs,
    weeklyInstalls: r.weekly_installs ? JSON.parse(r.weekly_installs) : [],
    isOfficial: Boolean(r.is_official),
    isCustom: Boolean(r.is_custom),
    description: r.description,
    category: r.category,
    stars: r.stars,
    repoUrl: r.repo_url,
  }));
}

export function getSkillByIdFromDb(id: string): SkillItem | null {
  const stmt = db.prepare("SELECT * FROM skills WHERE id = ? OR skill_id = ? LIMIT 1");
  const r: any = stmt.get(id, id);
  if (!r) return null;

  return {
    id: r.id,
    source: r.source,
    skillId: r.skill_id,
    name: r.name,
    installs: r.installs,
    weeklyInstalls: r.weekly_installs ? JSON.parse(r.weekly_installs) : [],
    isOfficial: Boolean(r.is_official),
    isCustom: Boolean(r.is_custom),
    description: r.description,
    category: r.category,
    stars: r.stars,
    repoUrl: r.repo_url,
    markdownContent: r.markdown_content,
  };
}

export function saveCustomSkillToDb(input: CustomSkillInput): SkillItem {
  const skillId = input.name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "-");
  const source = input.source.trim();
  const id = `${source}/${skillId}`;
  const repoUrl = input.repoUrl || (source.includes("/") ? `https://github.com/${source}` : "");
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO skills (
      id, source, skill_id, name, installs, weekly_installs, is_official, is_custom, description, category, markdown_content, stars, repo_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description,
      category = excluded.category,
      markdown_content = excluded.markdown_content,
      repo_url = excluded.repo_url,
      updated_at = excluded.updated_at
  `);

  const weekly = JSON.stringify([1, 2, 4, 8, 12, 16, 20, 25]);
  stmt.run(
    id,
    source,
    skillId,
    input.name.trim(),
    1,
    weekly,
    0,
    1,
    input.description.trim(),
    input.category || "custom",
    input.markdownContent || `# ${input.name}`,
    1,
    repoUrl,
    now,
    now
  );

  return {
    id,
    source,
    skillId,
    name: input.name.trim(),
    installs: 1,
    weeklyInstalls: [1, 2, 4, 8, 12, 16, 20, 25],
    isOfficial: false,
    isCustom: true,
    description: input.description.trim(),
    category: input.category || "custom",
    markdownContent: input.markdownContent,
    stars: 1,
    repoUrl,
  };
}

export function deleteSkillFromDb(id: string): boolean {
  const stmt = db.prepare("DELETE FROM skills WHERE id = ? OR skill_id = ?");
  const result: any = stmt.run(id, id);
  return result.changes > 0;
}

export function getDbStats(): { totalSkills: number; customSkills: number } {
  const totalStmt = db.prepare("SELECT COUNT(*) as c FROM skills");
  const customStmt = db.prepare("SELECT COUNT(*) as c FROM skills WHERE is_custom = 1");
  const total: any = totalStmt.get();
  const custom: any = customStmt.get();

  return {
    totalSkills: total?.c || 0,
    customSkills: custom?.c || 0,
  };
}
