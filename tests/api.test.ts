import { describe, it } from "node:test";
import assert from "node:assert";
import { initDb, getSkillsFromDb, saveCustomSkillToDb, deleteSkillFromDb, getDbStats } from "../src/lib/db.js";
import { generateInstallCommands } from "../src/lib/install-commands.js";

describe("Database & Logic Tests", () => {
  it("initializes SQLite database and seeds default skills", () => {
    initDb();
    const stats = getDbStats();
    assert.ok(stats.totalSkills > 0, "totalSkills should be > 0");
  });

  it("fetches skills from SQLite database with pagination", () => {
    const skills = getSkillsFromDb(5, 0);
    assert.strictEqual(skills.length, 5);
    assert.ok(skills[0].id.length > 0);
    assert.ok(skills[0].installs >= 0);
  });

  it("saves and retrieves a custom skill in SQLite", () => {
    const newSkill = saveCustomSkillToDb({
      name: "unit-test-skill",
      source: "bahaajalhoom/test-skills",
      description: "Test skill description",
      category: "testing",
      markdownContent: "# Unit Test Skill\nWorks great!",
    });

    assert.strictEqual(newSkill.name, "unit-test-skill");
    assert.strictEqual(newSkill.isCustom, true);

    const customSkills = getSkillsFromDb(10, 0, true);
    const found = customSkills.find((s) => s.id === newSkill.id);
    assert.ok(found, "Custom skill should be retrieved from SQLite");

    // Clean up
    const deleted = deleteSkillFromDb(newSkill.id);
    assert.strictEqual(deleted, true);
  });

  it("generates multi-agent install commands", () => {
    const commands = generateInstallCommands("bahaajalhoom/skill_ps", "my-skill");
    assert.ok(commands.cli.includes("npx skills-sh add"));
    assert.ok(commands.claudeCode.includes("/plugin add"));
    assert.ok(commands.cursor.includes("cursor --install-skill"));
    assert.ok(commands.antigravity.includes("agy install"));
  });
});
