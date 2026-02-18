import fs from 'node:fs/promises';
import path from 'node:path';

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

export async function writeSkill(projectPath, { name, content, target }) {
  const normalizedTarget = String(target || '').trim().toLowerCase();
  if (!['codex', 'claude'].includes(normalizedTarget)) {
    throw new Error('Skill target must be codex or claude');
  }
  const slug = slugify(name);
  const normalizedContent = ensureSkillFrontmatter(name, content);
  const written = [];
  const removed = [];
  const codexSkillDir = path.join(projectPath, '.codex', 'skills', slug);
  const claudeSkillDir = path.join(projectPath, '.claude', 'skills', slug);

  if (normalizedTarget === 'codex') {
    await fs.mkdir(codexSkillDir, { recursive: true });
    const codexFile = path.join(codexSkillDir, 'SKILL.md');
    await fs.writeFile(codexFile, normalizedContent, 'utf8');
    written.push(codexFile);
  } else {
    await fs.rm(codexSkillDir, { recursive: true, force: true });
    removed.push(codexSkillDir);
  }

  if (normalizedTarget === 'claude') {
    await fs.mkdir(claudeSkillDir, { recursive: true });
    const claudeFile = path.join(claudeSkillDir, 'SKILL.md');
    await fs.writeFile(claudeFile, normalizedContent, 'utf8');
    written.push(claudeFile);
  } else {
    await fs.rm(claudeSkillDir, { recursive: true, force: true });
    removed.push(claudeSkillDir);
  }

  return { slug, written, removed };
}
