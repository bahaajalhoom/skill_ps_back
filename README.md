# skill_ps_back 🇵🇸

**skill_ps_back** is the high-performance backend API and SQL database engine powering **skill_ps** — the open, community-first AI Agent Skills Directory & Marketplace.

Target deployment API: `http://skill-ps-api.apps.taqat.academy/`

---

## ✨ Features

- **Native SQL Engine (`node:sqlite`):** Powered by Node 24 native SQLite (`DatabaseSync`) with WAL (Write-Ahead Logging) mode, zero external binary dependencies, and sub-millisecond query performance.
- **Full Agent Skills Ecosystem:** Live sync with the 1.4M+ ecosystem (`all-time`, `trending`, `hot`) with resilient fallback to seeded database records.
- **Custom Skills CRUD:** Create, store, and manage user/community skills with persistent SQL storage.
- **Multi-Agent Install Command Generator:** Generates commands for CLI, Claude Code, Cursor, Antigravity, Windsurf, and Copilot.
- **Universal CORS:** Pre-configured for unrestricted API consumption by `skill_ps` frontend or any external client.
- **Container Ready:** Includes production multi-stage `Dockerfile` and `docker-compose.yml` with persistent volume management.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development
```bash
npm run dev
```
The server will start at `http://localhost:3000`.

### 3. Run Tests
```bash
npm test
```

### 4. Build & Production Run
```bash
npm run build
npm start
```

---

## 🐳 Docker Deployment

To run on your server (`http://skill-ps-api.apps.taqat.academy/`):

```bash
docker compose up -d --build
```

---

## 📡 API Reference

### Health & Status
- `GET /` — Service metadata and available endpoints
- `GET /health` — Service uptime and SQL database statistics

### Skills Directory
- `GET /api/skills?view=all-time&page=0` — Paginated leaderboard (`all-time`, `trending`, `hot`, `custom`)
- `GET /api/skills/search?q=query` — Fast multi-field search across skills and categories
- `GET /api/skills/:owner/:repo/:skill` — Detailed skill metadata, `SKILL.md` content, and install commands

### Custom Skills Persistence
- `GET /api/custom-skills` — List all custom skills stored in SQLite
- `POST /api/custom-skills` — Save or import a new skill
  ```json
  {
    "name": "my-agent-skill",
    "source": "my-org/my-repo",
    "description": "Custom workflow for autonomous agents",
    "category": "workflow",
    "markdownContent": "# My Agent Skill\n..."
  }
  ```
- `DELETE /api/custom-skills/:id` — Delete a custom skill

---

## 📄 License
MIT © [Bahaa Jalhoom](https://github.com/bahaajalhoom)
