// Run against an isolated built server over HTTP/1, never production:
// KANBAN_QA_EMAIL=... KANBAN_QA_PASSWORD=... node scripts/test-wiki-todo-tabs.mjs
// Requires agent-browser. Creates disposable QA data in that server's database.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const base = process.env.KANBAN_QA_URL ?? 'http://127.0.0.1:3107';
const url = new URL(base);
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:' && url.port !== '3000', 'Use an isolated HTTP/1 QA server');
const email = process.env.KANBAN_QA_EMAIL;
const password = process.env.KANBAN_QA_PASSWORD;
assert(email && password, 'Set KANBAN_QA_EMAIL and KANBAN_QA_PASSWORD');
const session = `wiki-todo-tabs-${process.pid}`;
let cookie = '';
async function api(path, body) {
  const response = await fetch(`${base}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  assert(response.ok, `${path}: ${response.status}`);
  cookie ||= response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return response.json();
}
function browser(...args) {
  const result = spawnSync('agent-browser', ['--session', session, ...args, '--json'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, `${args[0]} failed: ${result.stderr || result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert(output.success, `${args[0]} failed: ${JSON.stringify(output.error)}`);
  return output.data;
}
const evaluate = (code) => browser('eval', code).result;
async function within(label, predicate, limit = 5000) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    if (predicate()) {
      console.log(`PASS ${label} (${Date.now() - start} ms)`);
      return;
    }
    await delay(100);
  }
  throw new Error(`${label} did not finish within ${limit} ms with both tabs open`);
}
const listText = () => evaluate('document.querySelector(".ak-wiki-todo")?.textContent ?? ""');
const edit = (text, draft) => {
  browser('click', `.ak-wiki-todo-item-text[aria-label="Edit item: ${text}"]`);
  browser('find', 'role', 'textbox', 'fill', '--name', 'Edit item', draft);
};
const save = async (label) => {
  browser('find', 'role', 'button', 'click', '--name', 'Save', '--exact');
  await within(label, () => evaluate('!document.querySelector(".ak-wiki-todo-edit")'));
};

try {
  await api('auth/login', { email, password });
  const stamp = Date.now().toString(36);
  const { project } = await api('projects', {
    name: `Same-browser TODO regression ${stamp}`, key: `T${stamp}`,
    folderPath: `/tmp/wiki-todo-tabs-${stamp}`, agentConcurrencyLimit: 0,
  });
  const { list } = await api(`projects/${project.id}/wiki/todo-lists`, { name: 'Same-browser TODOs' });
  await api(`wiki-todo-lists/${list.id}/items`, { text: 'Alpha' });
  await api(`wiki-todo-lists/${list.id}/items`, { text: 'Beta' });
  const content = `:::todo-list {#${list.id} label="Same-browser TODOs"} :::`;
  const { page } = await api(`projects/${project.id}/wiki/pages`, { title: 'Two-tab regression', content });
  const { page: linkedPage } = await api(`projects/${project.id}/wiki/pages`, { title: 'Linked list regression', content });
  const pageUrl = `${base}/#wiki/${project.id}/${page.id}`;
  browser('open', base);
  // Set the same test account through the real login API in this browser context.
  assert.equal(evaluate(`(async () => (await fetch('/api/auth/login', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(${JSON.stringify({ email, password })})})).status)()`), 200);
  browser('open', `${base}/?tab=first#wiki/${project.id}/${page.id}`);
  browser('wait', '--text', 'Same-browser TODOs');
  const first = browser('tab', 'list').tabs.find((tab) => tab.url.includes('tab=first')).tabId;
  browser('tab', 'new', '--label', 'second', pageUrl);
  browser('wait', '--text', 'Same-browser TODOs');
  // Allow each tab to open all of its streams before writing.
  await delay(1000);
  edit('Beta', 'Beta saved with both tabs open');
  await save('save in second tab');
  browser('tab', first);
  await within('live update in first tab', () => listText().includes('Beta saved with both tabs open'));
  edit('Alpha', 'Alpha draft in first tab');
  browser('tab', 'second');
  edit('Beta saved with both tabs open', 'Beta edited again');
  await save('repeat save in second tab');
  browser('tab', first);
  await within('remote update while draft remains open', () => listText().includes('Beta edited again'));
  assert.equal(evaluate('document.querySelector(".ak-wiki-todo-edit textarea").value'), 'Alpha draft in first tab');
  await save('save preserved draft in first tab');
  browser('tab', 'second');
  await within('first tab update arrives in second tab', () => listText().includes('Alpha draft in first tab'));
  edit('Alpha draft in first tab', 'Conflict draft kept');
  browser('tab', first);
  edit('Alpha draft in first tab', 'Alpha changed remotely');
  await save('save same-item change');
  browser('tab', 'second');
  await within('conflict appears without blocking', () => !!evaluate('document.querySelector(".ak-wiki-todo-conflict")'));
  assert.equal(evaluate('document.querySelector(".ak-wiki-todo-edit textarea").value'), 'Conflict draft kept');
  browser('find', 'role', 'button', 'click', '--name', 'Cancel', '--exact');
  browser('open', `${base}/?tab=linked#wiki/${project.id}/${linkedPage.id}`);
  browser('wait', '--text', 'Same-browser TODOs');
  browser('find', 'role', 'button', 'click', '--name', 'Edit', '--exact');
  browser('find', 'role', 'textbox', 'fill', '--name', 'New item – link a person with @ or a task with # …', 'Created from linked page');
  browser('find', 'role', 'button', 'click', '--name', 'Add', '--exact');
  await within('create from linked page', () => listText().includes('Created from linked page'));
  browser('tab', first);
  await within('creation syncs across Wiki pages', () => listText().includes('Created from linked page'));
  browser('check', 'input[aria-label="Created from linked page"]');
  browser('tab', 'second');
  await within('completion syncs across pages', () => evaluate('[...document.querySelectorAll(".ak-wiki-todo input[type=checkbox]")].find(el => el.getAttribute("aria-label") === "Created from linked page")?.checked') === true);
  browser('uncheck', 'input[aria-label="Created from linked page"]');
  browser('tab', first);
  await within('reopen syncs across pages', () => evaluate('[...document.querySelectorAll(".ak-wiki-todo input[type=checkbox]")].find(el => el.getAttribute("aria-label") === "Created from linked page")?.checked') === false);
  browser('find', 'role', 'button', 'click', '--name', 'Move TODO item up: Created from linked page', '--exact');
  browser('tab', 'second');
  await within('reordering syncs across pages', () => evaluate('[...document.querySelectorAll(".ak-wiki-todo input[type=checkbox]")][1]?.getAttribute("aria-label")') === 'Created from linked page');
  edit('Created from linked page', 'Created from linked page');
  browser('find', 'role', 'button', 'click', '--name', 'Delete', '--exact');
  browser('dialog', 'accept');
  await within('delete in second tab', () => !listText().includes('Created from linked page'));
  browser('tab', first);
  await within('deletion syncs across pages', () => !listText().includes('Created from linked page'));
  browser('tab', 'second');
  browser('back');
  await within('back navigation restores previous page', () => evaluate('location.href') === pageUrl);
  edit('Alpha changed remotely', 'Alpha after back navigation');
  await save('save after back navigation');
  browser('tab', first);
  await within('restored page sends live changes', () => listText().includes('Alpha after back navigation'));
  edit('Beta edited again', 'Beta after restore');
  await save('save to restored peer');
  browser('tab', 'second');
  await within('restored page receives live changes', () => listText().includes('Beta after restore'));
  console.log('PASS two tabs in one browser remained open for all save and synchronization assertions');
} catch (error) {
  console.error('Browser session:', session);
  console.error(browser('tab', 'list'));
  console.error(browser('network', 'requests', '--filter', '/events'));
  console.error(browser('snapshot', '-i'));
  console.error(browser('errors'));
  console.error(browser('network', 'requests', '--filter', 'wiki-todo'));
  throw error;
} finally {
  if (!process.env.KANBAN_QA_KEEP_BROWSER) browser('close');
}
