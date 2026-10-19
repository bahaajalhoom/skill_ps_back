import { MultiAgentInstallCommands } from "../types/index.js";

/**
 * Generates ready-to-run installation commands for all major AI coding agents.
 */
export function generateInstallCommands(source: string, skillId: string): MultiAgentInstallCommands {
  const identifier = `${source}/${skillId}`;

  return {
    cli: `npx skills-sh add ${identifier}`,
    claudeCode: `/plugin add ${identifier}`,
    cursor: `cursor --install-skill ${identifier}`,
    antigravity: `agy install ${identifier}`,
    windsurf: `windsurf:install-skill?id=${identifier}`,
    copilot: `gh copilot skills install ${identifier}`,
  };
}
