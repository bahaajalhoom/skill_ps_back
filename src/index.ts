import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  initDb,
  getSkillsFromDb,
  getSkillByIdFromDb,
  saveCustomSkillToDb,
  deleteSkillFromDb,
  getDbStats,
  incrementSkillInstallsInDb,
  recordInstallLogInDb,
  getInstallLogsFromDb,
  getTelemetryStatsFromDb,
  clearInstallLogsInDb,
} from "./lib/db.js";
import { fetchSkills, searchSkills, fetchSkillDetail } from "./lib/ecosystem-client.js";
import { extractClientIp, resolveGeoLocation, parseUserAgent, resolveDeviceUser } from "./lib/geo.js";
import { CustomSkillInput, InstallLog } from "./types/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database
initDb();

// Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
}));
app.use(express.json());

// 1. Root & Health
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "skill_ps_back",
    description: "Backend API & SQL Database for skill_ps (The Open Agent Skills Directory)",
    status: "online",
    version: "1.0.0",
    docs: {
      health: "/health",
      skills: "/api/skills?view=all-time&page=0",
      search: "/api/skills/search?q=git",
      skillDetail: "/api/skills/:owner/:repo/:skill",
      customSkills: "/api/custom-skills",
    },
    flag: "🇵🇸 Free Palestine",
  });
});

app.get("/health", (_req: Request, res: Response) => {
  const stats = getDbStats();
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      type: "SQLite (WAL Mode)",
      ...stats,
    },
  });
});

// 2. Skills Leaderboard / Directory
app.get("/api/skills", async (req: Request, res: Response) => {
  try {
    const view = (req.query.view as any) || "all-time";
    const page = parseInt(req.query.page as string, 10) || 0;

    const data = await fetchSkills(view, page);
    res.json(data);
  } catch (err: any) {
    console.error("Error in GET /api/skills:", err.message);
    res.status(500).json({ error: "Failed to fetch skills", details: err.message });
  }
});

// 3. Search Skills
app.get("/api/skills/search", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || "";
    const data = await searchSkills(q);
    res.json(data);
  } catch (err: any) {
    console.error("Error in GET /api/skills/search:", err.message);
    res.status(500).json({ error: "Failed to search skills", details: err.message });
  }
});

// 4. Skill Detail
app.get("/api/skills/:owner/:repo/:skill", async (req: Request, res: Response) => {
  try {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    const skill = String(req.params.skill);
    const detail = await fetchSkillDetail(owner, repo, skill);
    res.json(detail);
  } catch (err: any) {
    console.error(`Error in GET /api/skills/${req.params.owner}/${req.params.repo}/${req.params.skill}:`, err.message);
    res.status(500).json({ error: "Failed to fetch skill detail", details: err.message });
  }
});

// 5. Custom Skills (SQL Database CRUD)
app.get("/api/custom-skills", (_req: Request, res: Response) => {
  try {
    const custom = getSkillsFromDb(100, 0, true);
    res.json({ skills: custom, count: custom.length });
  } catch (err: any) {
    console.error("Error in GET /api/custom-skills:", err.message);
    res.status(500).json({ error: "Failed to fetch custom skills", details: err.message });
  }
});

app.post("/api/custom-skills", (req: Request, res: Response) => {
  try {
    const body: CustomSkillInput = req.body;
    if (!body || !body.name || !body.source) {
      return res.status(400).json({ error: "name and source are required fields" });
    }

    const saved = saveCustomSkillToDb(body);
    res.status(201).json({ success: true, skill: saved });
  } catch (err: any) {
    console.error("Error in POST /api/custom-skills:", err.message);
    res.status(500).json({ error: "Failed to save custom skill", details: err.message });
  }
});

app.delete("/api/custom-skills/:id(*)", (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const deleted = deleteSkillFromDb(id);
    if (!deleted) {
      return res.status(404).json({ error: "Skill not found" });
    }
    res.json({ success: true, message: `Skill ${id} deleted` });
  } catch (err: any) {
    console.error("Error in DELETE /api/custom-skills:", err.message);
    res.status(500).json({ error: "Failed to delete custom skill", details: err.message });
  }
});

// 6. Record Real Skill Install (Increment Counter & Telemetry for Custom Skills)
app.post("/api/skills/install", async (req: Request, res: Response) => {
  try {
    const id = String(req.body?.id || req.body?.skillId || "");
    const agentTarget = String(req.body?.agentTarget || "cli");

    if (!id) {
      return res.status(400).json({ error: "Skill id is required" });
    }

    // Verify if this is a custom skill in our SQL database
    const skill = getSkillByIdFromDb(id);
    if (!skill || !skill.isCustom) {
      return res.status(400).json({
        success: false,
        message: "Ecosystem skill installs are tracked upstream and cannot be overwritten.",
      });
    }

    // Increment install count in DB
    const result = incrementSkillInstallsInDb(id);
    if (!result) {
      return res.status(500).json({ error: "Failed to increment installs" });
    }

    // Extract client IP, device user & metadata
    const ip = extractClientIp(req);
    const uaRaw = req.headers["user-agent"] || "";
    const uaParsed = parseUserAgent(uaRaw);
    const geo = await resolveGeoLocation(ip, req);
    const deviceUser = await resolveDeviceUser(req, ip);

    const log: InstallLog = {
      id: `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      skillId: skill.id,
      skillName: skill.name,
      source: skill.source,
      ip,
      deviceUser,
      country: geo.country,
      countryCode: geo.countryCode,
      city: geo.city,
      region: geo.region,
      latitude: geo.latitude,
      longitude: geo.longitude,
      isp: geo.isp,
      userAgent: uaRaw,
      browser: uaParsed.browser,
      os: uaParsed.os,
      device: uaParsed.device,
      agentTarget,
      createdAt: new Date().toISOString(),
    };

    recordInstallLogInDb(log);

    res.json({
      success: true,
      id: skill.id,
      installs: result.installs,
      weeklyInstalls: result.weeklyInstalls,
      log,
    });
  } catch (err: any) {
    console.error("Error in POST /api/skills/install:", err.message);
    res.status(500).json({ error: "Failed to increment installs", details: err.message });
  }
});

// 7. Admin Analytics & Install Telemetry
app.get("/api/admin/installs", (_req: Request, res: Response) => {
  try {
    const limit = parseInt(_req.query.limit as string, 10) || 100;
    const page = parseInt(_req.query.page as string, 10) || 0;
    const offset = page * limit;
    const search = (_req.query.q as string) || "";

    const { logs, total } = getInstallLogsFromDb(limit, offset, search);
    const stats = getTelemetryStatsFromDb();

    res.json({
      success: true,
      stats,
      logs,
      total,
      page,
      limit,
    });
  } catch (err: any) {
    console.error("Error in GET /api/admin/installs:", err.message);
    res.status(500).json({ error: "Failed to fetch admin telemetry", details: err.message });
  }
});

app.delete("/api/admin/installs", (_req: Request, res: Response) => {
  try {
    clearInstallLogsInDb();
    res.json({ success: true, message: "Install logs cleared successfully" });
  } catch (err: any) {
    console.error("Error in DELETE /api/admin/installs:", err.message);
    res.status(500).json({ error: "Failed to clear install logs", details: err.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`[skill_ps_back] Server running on http://localhost:${PORT}`);
  console.log(`[skill_ps_back] Target production API: http://skill-ps-api.apps.taqat.academy/`);
});
