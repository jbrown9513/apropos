import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AGENT_SYSTEM_IDS,
  getAgentSystem,
  isValidSkillTarget,
  skillFilePath,
  skillDirPath
} from './agent-systems.js';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'skill';
}

function ensureSkillFrontmatter(name, content) {
  const raw = String(content || '');
  if (/^\s*---\s*\n[\s\S]*?\n---\s*(\n|$)/.test(raw)) {
    return raw;
  }

  const slug = slugify(name);
  const description = `Project skill: ${String(name || slug).trim()}`;
  const escapedDescription = JSON.stringify(description);
  return [
    '---',
    `name: ${slug}`,
    `description: ${escapedDescription}`,
    '---',
    '',
    raw.trimStart()
  ].join('\n');
}

/**
 * Write a skill/rule for a single agent system. Cursor uses plain markdown in .cursor/rules/<slug>.md;
 * frontmatter is optional but we keep it for consistency.
 */
export async function writeSkill(projectPath, { name, content, target }) {
  const normalizedTarget = String(target || '').trim().toLowerCase();
  if (!isValidSkillTarget(normalizedTarget)) {
    throw new Error(`Skill target must be one of: ${AGENT_SYSTEM_IDS.join(', ')}`);
  }
  const slug = slugify(name);
  const system = getAgentSystem(normalizedTarget);
  const normalizedContent = ensureSkillFrontmatter(name, content);
  const written = [];
  const removed = [];

  for (const systemId of AGENT_SYSTEM_IDS) {
    const filePath = skillFilePath(projectPath, systemId, slug, false);
    if (!filePath) {
      continue;
    }
    if (systemId === normalizedTarget) {
      const dir = skillDirPath(projectPath, systemId, false);
      if (system.skills.layout === 'subdir') {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
      } else {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(filePath, normalizedContent, 'utf8');
      written.push(filePath);
    } else {
      try {
        if (getAgentSystem(systemId).skills.layout === 'subdir') {
          await fs.rm(path.dirname(filePath), { recursive: true, force: true });
          removed.push(path.dirname(filePath));
        } else {
          await fs.rm(filePath, { force: true });
          removed.push(filePath);
        }
      } catch {
        // ignore missing
      }
    }
  }

  return { slug, written, removed };
}
