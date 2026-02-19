import fs from 'node:fs/promises';
import path from 'node:path';
import { agentSystemsWithAgentsFile, agentsFilePath, skillDirPath } from './agent-systems.js';

export async function ensureProjectLayout(projectPath) {
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(path.join(projectPath, 'docs'), { recursive: true });

  const claudePath = path.join(projectPath, 'CLAUDE.md');
  try {
    await fs.access(claudePath);
  } catch {
    const seed = '# Claude Project Context\n\n- Add project-specific notes for Claude Code here.\n';
    await fs.writeFile(claudePath, seed, 'utf8');
  }

  const agentsPath = path.join(projectPath, 'AGENTS.md');
  let agentsSymlinkOk = false;
  try {
    const stat = await fs.lstat(agentsPath);
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(agentsPath);
      agentsSymlinkOk = target === 'CLAUDE.md' || path.resolve(projectPath, target) === claudePath;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (!agentsSymlinkOk) {
    try {
      await fs.symlink('CLAUDE.md', agentsPath);
      agentsSymlinkOk = true;
    } catch {
      // File already exists or symlink failed; leave existing files untouched.
      agentsSymlinkOk = false;
    }
  }

  // Ensure Cursor (and any other agent system) context files and dirs exist.
  for (const system of agentSystemsWithAgentsFile()) {
    if (system.id === 'claude') {
      continue; // already handled above
    }
    const filePath = agentsFilePath(projectPath, system.id, false);
    if (!filePath) {
      continue;
    }
    try {
      await fs.access(filePath);
    } catch {
      const content = system.agentsFile?.defaultContent ?? '';
      await fs.writeFile(filePath, content, 'utf8');
    }
  }

  // Ensure Cursor rules dir exists (and any other system skill dirs for consistency).
  const cursorRulesDir = skillDirPath(projectPath, 'cursor', false);
  await fs.mkdir(cursorRulesDir, { recursive: true });

  return {
    docsDir: path.join(projectPath, 'docs'),
    agentsSymlinkOk
  };
}
