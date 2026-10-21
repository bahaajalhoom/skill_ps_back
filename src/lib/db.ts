import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SkillItem, CustomSkillInput, InstallLog, TelemetryStats } from "../types/index.js";
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

    CREATE TABLE IF NOT EXISTS skill_install_logs (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      source TEXT NOT NULL,
      ip TEXT NOT NULL,
      device_user TEXT DEFAULT 'unknown',
      country TEXT,
      country_code TEXT,
      city TEXT,
      region TEXT,
      latitude REAL,
      longitude REAL,
      isp TEXT,
      user_agent TEXT,
      browser TEXT,
      os TEXT,
      device TEXT,
      agent_target TEXT DEFAULT 'cli',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_install_logs_skill ON skill_install_logs (skill_id);
    CREATE INDEX IF NOT EXISTS idx_install_logs_created ON skill_install_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_install_logs_ip ON skill_install_logs (ip);
  `);

  // Migration: Ensure device_user column exists if table was created previously
  try {
    db.exec("ALTER TABLE skill_install_logs ADD COLUMN device_user TEXT DEFAULT 'unknown';");
  } catch {
    // Column already exists
  }

  // Safe merge: Always merge seed skills without overwriting existing data (INSERT OR IGNORE)
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO skills (
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
      s.isCustom ? 1 : 0,
      s.description || "",
      s.category || "workflow",
      s.stars || 0,
      s.repoUrl || `https://github.com/${s.source}`
    );
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

export function incrementSkillInstallsInDb(id: string): { installs: number; weeklyInstalls: number[] } | null {
  const getStmt = db.prepare("SELECT * FROM skills WHERE (id = ? OR skill_id = ?) AND is_custom = 1 LIMIT 1");
  const row: any = getStmt.get(id, id);
  if (!row) return null;

  const newInstalls = (row.installs || 0) + 1;
  let weekly = [0, 0, 0, 0, 0, 0, 0, 0];
  try {
    if (row.weekly_installs) {
      weekly = JSON.parse(row.weekly_installs);
    }
  } catch {
    weekly = [0, 0, 0, 0, 0, 0, 0, 0];
  }

  if (!Array.isArray(weekly) || weekly.length === 0) {
    weekly = [0, 0, 0, 0, 0, 0, 0, newInstalls];
  } else {
    weekly[weekly.length - 1] = (weekly[weekly.length - 1] || 0) + 1;
  }

  const updateStmt = db.prepare(`
    UPDATE skills SET 
      installs = ?,
      weekly_installs = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  updateStmt.run(newInstalls, JSON.stringify(weekly), row.id);

  return { installs: newInstalls, weeklyInstalls: weekly };
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

// ==========================================
// TELEMETRY & INSTALL LOGGING FOR ADMIN
// ==========================================

export function recordInstallLogInDb(log: InstallLog): void {
  const stmt = db.prepare(`
    INSERT INTO skill_install_logs (
      id, skill_id, skill_name, source, ip, device_user, country, country_code, city, region,
      latitude, longitude, isp, user_agent, browser, os, device, agent_target, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    log.id,
    log.skillId,
    log.skillName,
    log.source,
    log.ip,
    log.deviceUser || "unknown",
    log.country || "Unknown Country",
    log.countryCode || "UN",
    log.city || "Unknown City",
    log.region || "",
    log.latitude || null,
    log.longitude || null,
    log.isp || "Network Provider",
    log.userAgent || "",
    log.browser || "Unknown Browser",
    log.os || "Unknown OS",
    log.device || "Desktop",
    log.agentTarget || "cli",
    log.createdAt || new Date().toISOString()
  );
}

export function getInstallLogsFromDb(
  limit = 100,
  offset = 0,
  search?: string
): { logs: InstallLog[]; total: number } {
  let countQuery = "SELECT COUNT(*) as count FROM skill_install_logs";
  let query = "SELECT * FROM skill_install_logs";
  const params: any[] = [];

  if (search && search.trim()) {
    const s = `%${search.trim().toLowerCase()}%`;
    const whereClause = ` WHERE lower(skill_name) LIKE ? OR lower(ip) LIKE ? OR lower(device_user) LIKE ? OR lower(country) LIKE ? OR lower(city) LIKE ? OR lower(browser) LIKE ? OR lower(agent_target) LIKE ?`;
    countQuery += whereClause;
    query += whereClause;
    params.push(s, s, s, s, s, s, s);
  }

  const countStmt = db.prepare(countQuery);
  const countRow: any = params.length > 0 ? countStmt.get(...params) : countStmt.get();
  const total = countRow?.count || 0;

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  const fetchParams = [...params, limit, offset];
  const stmt = db.prepare(query);
  const rows = stmt.all(...fetchParams);

  const logs: InstallLog[] = rows.map((r: any) => ({
    id: r.id,
    skillId: r.skill_id,
    skillName: r.skill_name,
    source: r.source,
    ip: r.ip,
    deviceUser: r.device_user || "unknown",
    country: r.country,
    countryCode: r.country_code,
    city: r.city,
    region: r.region,
    latitude: r.latitude,
    longitude: r.longitude,
    isp: r.isp,
    userAgent: r.user_agent,
    browser: r.browser,
    os: r.os,
    device: r.device,
    agentTarget: r.agent_target,
    createdAt: r.created_at,
  }));

  return { logs, total };
}

export function getTelemetryStatsFromDb(): TelemetryStats {
  const totalStmt = db.prepare("SELECT COUNT(*) as count, COUNT(DISTINCT ip) as unique_ips FROM skill_install_logs");
  const totalRow: any = totalStmt.get();

  const countriesStmt = db.prepare(`
    SELECT country, country_code, COUNT(*) as count 
    FROM skill_install_logs 
    GROUP BY country, country_code 
    ORDER BY count DESC 
    LIMIT 10
  `);
  const countryRows: any[] = countriesStmt.all();

  const skillsStmt = db.prepare(`
    SELECT skill_name as name, source, COUNT(*) as installs 
    FROM skill_install_logs 
    GROUP BY skill_id, skill_name, source 
    ORDER BY installs DESC 
    LIMIT 5
  `);
  const skillRows: any[] = skillsStmt.all();

  const agentsStmt = db.prepare(`
    SELECT agent_target as agent, COUNT(*) as count 
    FROM skill_install_logs 
    GROUP BY agent_target 
    ORDER BY count DESC
  `);
  const agentRows: any[] = agentsStmt.all();

  return {
    totalInstalls: totalRow?.count || 0,
    uniqueIps: totalRow?.unique_ips || 0,
    countriesCount: countryRows.length,
    topCustomSkills: skillRows.map((s) => ({
      name: s.name,
      source: s.source,
      installs: s.installs,
    })),
    countryBreakdown: countryRows.map((c) => ({
      country: c.country,
      countryCode: c.country_code,
      count: c.count,
    })),
    agentBreakdown: agentRows.map((a) => ({
      agent: a.agent || "cli",
      count: a.count,
    })),
  };
}

export function clearInstallLogsInDb(): boolean {
  const stmt = db.prepare("DELETE FROM skill_install_logs");
  stmt.run();
  return true;
}
