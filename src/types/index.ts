export type LeaderboardView = "all-time" | "trending" | "hot" | "custom";

export interface SkillItem {
  id: string;               // e.g. "vercel-labs/skills/find-skills"
  source: string;           // e.g. "vercel-labs/skills"
  skillId: string;          // e.g. "find-skills"
  name: string;             // e.g. "find-skills"
  installs: number;         // e.g. 3936802
  weeklyInstalls?: number[];// Array of 8 weekly numbers
  isOfficial?: boolean;     // Verified badge
  isCustom?: boolean;       // User created/imported
  description?: string;     // Short summary
  category?: string;        // e.g. "workflow", "coding", "testing"
  stars?: number;
  repoUrl?: string;
  markdownContent?: string;
}

export interface MultiAgentInstallCommands {
  cli: string;
  claudeCode: string;
  cursor: string;
  antigravity: string;
  windsurf: string;
  copilot: string;
}

export interface SkillDetail extends SkillItem {
  author: string;
  agentCompatibility: string[];
  installCommands: MultiAgentInstallCommands;
  securityAudits?: {
    agentTrustHub?: "Pass" | "Warn" | "Fail";
    socket?: "Pass" | "Warn" | "Fail";
    snyk?: "Pass" | "Warn" | "Fail";
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomSkillInput {
  name: string;
  source: string;
  description: string;
  category?: string;
  markdownContent?: string;
  repoUrl?: string;
}
