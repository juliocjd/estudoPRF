import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const packageRoot = path.resolve(__dirname, '..', '..');
const loadedFromFile = new Set();

function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const prev = value[i - 1];
    if ((ch === '"' || ch === "'") && prev !== '\\') {
      quote = quote === ch ? null : quote || ch;
    }
    if (ch === '#' && quote === null) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

function unquote(value) {
  const trimmed = stripInlineComment(value.trim());
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const body = trimmed.slice(1, -1);
    return trimmed[0] === '"'
      ? body.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : body.replace(/\\'/g, "'");
  }
  return trimmed;
}

export function parseEnv(content) {
  const parsed = {};
  for (const originalLine of content.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = normalized.indexOf('=');
    if (eq === -1) continue;
    const key = normalized.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    parsed[key] = unquote(normalized.slice(eq + 1));
  }
  return parsed;
}

export function loadEnvFiles(files = ['.env', '.env.local']) {
  const loaded = [];
  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.join(packageRoot, file);
    if (!fs.existsSync(abs)) continue;
    const parsed = parseEnv(fs.readFileSync(abs, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      // Variáveis já fornecidas pelo shell/secret manager vencem. Entre arquivos .env,
      // o mais específico carregado depois pode sobrescrever o anterior.
      if (process.env[key] === undefined || loadedFromFile.has(key)) {
        process.env[key] = value;
        loadedFromFile.add(key);
      }
    }
    loaded.push(abs);
  }
  return loaded;
}

export function requireEnv(name) {
  loadEnvFiles();
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

export function redactDatabaseUrl(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    if (url.username) url.username = `${url.username.slice(0, 3)}***`;
    url.hostname = '***';
    return url.toString();
  } catch {
    return String(raw).replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:***@');
  }
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}
