import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'entries.json');
const hostPin = process.env.HOST_PIN || '2468';
const hostToken = crypto.randomBytes(32).toString('hex');
const port = Number(process.env.PORT || 3000);

await mkdir(dataDir, { recursive: true });
if (!existsSync(dataFile)) await writeFile(dataFile, '[]', 'utf8');

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(payload);
}

function sendJson(res, status, body, headers = {}) {
  send(res, status, body, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
}

async function readEntries() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch {
    return [];
  }
}

async function saveEntries(entries) {
  await writeFile(dataFile, JSON.stringify(entries, null, 2), 'utf8');
}

async function parseBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

function cleanText(value, max = 80) {
  return String(value || '').trim().slice(0, max);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function validUtcTime(value) {
  return /^([01][0-9]|2[0-3]):(00|30)$/.test(String(value || ''));
}

function isHost(req) {
  const cookie = req.headers.cookie || '';
  return cookie.split(';').map(part => part.trim()).includes('host_session=' + hostToken);
}

function csvEscape(value) {
  return '"' + String(value ?? '').replaceAll('"', '""') + '"';
}

function selectedSortModes(value = 'createdAt') {
  const allowed = new Set([
    'createdAt',
    'utcTime',
    'totalSpeedups',
    'generalSpeedups',
    'constructionSpeedups',
    'researchSpeedups',
    'trainingSpeedups'
  ]);
  const modes = String(value || '')
    .split(',')
    .map(mode => mode.trim())
    .filter(mode => allowed.has(mode));
  return modes.length ? modes : ['createdAt'];
}

function sortedEntries(entries, mode = 'createdAt') {
  const total = entry => Number(entry.generalSpeedups || 0) + Number(entry.constructionSpeedups || 0) + Number(entry.researchSpeedups || 0) + Number(entry.trainingSpeedups || 0);
  const modes = selectedSortModes(mode);
  const compareByMode = (a, b, sortMode) => {
    if (sortMode === 'createdAt') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortMode === 'utcTime') return String(a.utcTime || '').localeCompare(String(b.utcTime || ''));
    const aValue = sortMode === 'totalSpeedups' ? total(a) : Number(a[sortMode] || 0);
    const bValue = sortMode === 'totalSpeedups' ? total(b) : Number(b[sortMode] || 0);
    return bValue - aValue;
  };
  return [...entries].sort((a, b) => {
    for (const sortMode of modes) {
      const result = compareByMode(a, b, sortMode);
      if (result) return result;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) return send(res, 403, 'Forbidden');
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    send(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/entries') {
    const body = await parseBody(req);
    const entry = {
      id: crypto.randomUUID(),
      playerName: cleanText(body.playerName, 40),
      playerId: cleanText(body.playerId, 24),
      utcTime: cleanText(body.utcTime, 5),
      fireCrystals: cleanNumber(body.fireCrystals),
      generalSpeedups: cleanNumber(body.generalSpeedups),
      constructionSpeedups: cleanNumber(body.constructionSpeedups),
      researchSpeedups: cleanNumber(body.researchSpeedups),
      trainingSpeedups: cleanNumber(body.trainingSpeedups),
      language: cleanText(body.language, 12),
      createdAt: new Date().toISOString()
    };
    if (!entry.playerName || !entry.playerId || !validUtcTime(entry.utcTime)) {
      return sendJson(res, 400, { error: 'Missing required guest information.' });
    }
    const entries = await readEntries();
    entries.unshift(entry);
    await saveEntries(entries);
    return sendJson(res, 201, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    const body = await parseBody(req);
    if (String(body.pin || '') !== hostPin) return sendJson(res, 401, { error: 'Incorrect PIN.' });
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'host_session=' + hostToken + '; HttpOnly; SameSite=Lax; Path=/' });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'host_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (!isHost(req)) return sendJson(res, 401, { error: 'Host login required.' });

    if (req.method === 'GET' && url.pathname === '/api/admin/entries') {
      const mode = url.searchParams.get('sort') || 'createdAt';
      return sendJson(res, 200, { entries: sortedEntries(await readEntries(), mode) });
    }

    if (req.method === 'DELETE' && url.pathname === '/api/admin/entries') {
      await saveEntries([]);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/export.csv') {
      const mode = url.searchParams.get('sort') || 'createdAt';
      const headers = ['player_name','player_id','utc_time','fire_crystals','general_speedups_days','construction_speedups_days','research_speedups_days','troop_training_speedups_days','submitted_at'];
      const rows = sortedEntries(await readEntries(), mode).map(entry => [entry.playerName, entry.playerId, entry.utcTime, entry.fireCrystals, entry.generalSpeedups, entry.constructionSpeedups, entry.researchSpeedups, entry.trainingSpeedups, entry.createdAt]);
      const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="whiteout-survival-guests.csv"', 'Cache-Control': 'no-store' });
      return res.end(csv);
    }
  }

  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 405, 'Method not allowed');
});

server.listen(port, () => {
  console.log('Whiteout Survival signup app running on http://localhost:' + port);
});
