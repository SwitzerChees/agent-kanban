// End-to-end recovery check against the current production build.
// Uses an isolated database and port, and never touches production.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const dataDir = mkdtempSync(path.join(tmpdir(), 'agent-kanban-realtime-restart-'));
const base = 'http://127.0.0.1:3109';
const email = 'realtime-restart@example.test';
const password = 'realtime-restart-password';
const browserSession = `realtime-restart-${process.pid}`;
let server = null;
let cookie = '';

function startServer() {
  server = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      KANBAN_DATA_DIR: dataDir,
      KANBAN_ADMIN_EMAIL: email,
      KANBAN_ADMIN_PASSWORD: password,
      PORT: '3109',
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  await Promise.race([stopped, delay(5_000).then(() => { throw new Error('QA server did not stop cleanly'); })]);
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('QA server did not start');
}

async function api(route, body) {
  const response = await fetch(`${base}/api/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`${route}: ${response.status} ${await response.text()}`);
  cookie ||= response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return response.json();
}

function browser(...args) {
  const result = spawnSync('agent-browser', ['--session', browserSession, ...args, '--json'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${args[0]} failed: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert(output.success, `${args[0]} failed: ${JSON.stringify(output.error)}`);
  return output.data;
}

const evaluate = (code) => browser('eval', code).result;

async function within(label, predicate, timeout = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (predicate()) {
      console.log(`PASS ${label} (${Date.now() - startedAt} ms)`);
      return;
    }
    await delay(100);
  }
  throw new Error(`${label} timed out`);
}

try {
  startServer();
  await waitForServer();
  await api('auth/login', { email, password });
  const stamp = Date.now().toString(36);
  const { project } = await api('projects', {
    name: `Realtime restart ${stamp}`,
    key: `X${stamp}`.slice(0, 12),
    folderPath: `/tmp/realtime-restart-project-${stamp}`,
    agentConcurrencyLimit: 0,
  });
  const { page } = await api(`projects/${project.id}/wiki/pages`, {
    title: 'Before restart',
    content: 'The offline edit must survive.',
  });

  browser('open', base);
  assert.equal(evaluate(`(async () => (await fetch('/api/auth/login', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(${JSON.stringify({ email, password })})})).status)()`), 200);
  browser('open', `${base}/?test=realtime-restart#wiki/${project.id}/${page.id}`);
  browser('wait', '--text', 'Before restart');
  await within('initial WebSocket synchronization', () => evaluate('document.body.innerText.includes("Synced live")'));
  browser('find', 'role', 'button', 'click', '--name', 'Edit', '--exact');

  await stopServer();
  await within('disconnect is shown', () => evaluate('document.body.innerText.includes("Offline")'));
  browser('find', 'role', 'textbox', 'fill', '--name', 'Page title', 'Saved after server restart');
  await within('offline update enters the persistent outbox', () => evaluate(
    'Object.keys(sessionStorage).some(key => key.includes("wiki-collaboration-outbox"))',
  ));

  startServer();
  await waitForServer();
  await within('socket reconnects and confirms the offline update', () => evaluate(
    'document.body.innerText.includes("Synced live") && !Object.keys(sessionStorage).some(key => key.includes("wiki-collaboration-outbox"))',
  ));
  const restored = await api(`wiki-pages/${page.id}`);
  assert.equal(restored.page.title, 'Saved after server restart');
  console.log('PASS persisted offline edit survived a full Node server restart');
} finally {
  try { browser('close'); } catch {}
  await stopServer().catch(() => {});
  rmSync(dataDir, { recursive: true, force: true });
}
