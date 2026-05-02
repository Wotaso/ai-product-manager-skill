import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function resolveOpenClawGrowthSecretsFile() {
  const explicit = process.env.OPENCLAW_GROWTH_SECRETS_FILE?.trim();
  if (explicit) return path.resolve(explicit);
  if (process.env.HOME) return path.join(process.env.HOME, '.config', 'openclaw-growth', 'secrets.env');
  return path.resolve('.openclaw-growth-secrets.env');
}

function decodeEnvValue(rawValue) {
  const value = String(rawValue || '').trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\(["\\$`])/g, '$1')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

export async function loadOpenClawGrowthSecrets() {
  const filePath = resolveOpenClawGrowthSecretsFile();
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return {
      loaded: false,
      filePath,
      keys: [],
    };
  }

  const keys = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)\s*$/);
    if (!match) continue;

    const key = match[1];
    const value = decodeEnvValue(match[2]);
    if (!process.env[key] && value) {
      process.env[key] = value;
    }
    keys.push(key);
  }

  return {
    loaded: true,
    filePath,
    keys,
  };
}
