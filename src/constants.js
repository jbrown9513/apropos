import os from 'node:os';
import path from 'node:path';

export const APROPOS_HOME = process.env.APROPOS_HOME || path.join(os.homedir(), '.apropos');
export const CONFIG_PATH = path.join(APROPOS_HOME, 'config.json');
export const EVENT_LOG_PATH = path.join(APROPOS_HOME, 'events.log.jsonl');

export const DEFAULT_PORT = Number(process.env.PORT || 4311);

export const DEFAULT_MCP_REPO = 'https://github.com/modelcontextprotocol/servers';

export const DEFAULT_MCP_CATALOG = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    repo: DEFAULT_MCP_REPO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    description: 'Read and write files in approved paths.'
  },
  {
    id: 'git',
    name: 'Git',
    repo: DEFAULT_MCP_REPO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    description: 'Git-aware actions for local repositories.'
  },
  {
    id: 'fetch',
    name: 'Fetch',
    repo: DEFAULT_MCP_REPO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    description: 'HTTP retrieval and structured web fetching.'
  },
  {
    id: 'memory',
    name: 'Memory',
    repo: DEFAULT_MCP_REPO,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    description: 'Longer-lived memory state for workflows.'
  }
];

export const DEFAULT_MCP_REPOSITORIES = [
  // Intentionally empty. Repositories are user-configured.
];

export const DEFAULT_PROXY_TARGETS = {
  codex: process.env.CODEX_MCP_URL || 'http://127.0.0.1:4312/mcp',
  claude: process.env.CLAUDE_MCP_URL || 'http://127.0.0.1:4313/mcp',
  cursor: process.env.CURSOR_MCP_URL || 'http://127.0.0.1:4314/mcp'
};

export const DEFAULT_MEMORY_SETTINGS = {
  autoCaptureMcp: true,
  vectorStore: {
    provider: 'local',
    endpoint: '',
    collection: 'apropos_memory',
    autoStartOnboarding: true,
    dockerContainer: 'apropos-qdrant',
    dockerImage: 'qdrant/qdrant:latest',
    dockerPort: 6333
  }
};

export const PROJECT_COLORS = [
  '#0f766e',
  '#0b5cff',
  '#b45309',
  '#166534',
  '#be123c',
  '#1d4ed8',
  '#6d28d9',
  '#0369a1'
];
