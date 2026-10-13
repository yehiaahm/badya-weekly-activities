// Shares the app on a temporary public HTTPS link, to show it to someone:
//   npm run demo:public              start (or restart) the demo server and the link
//   npm run demo:public -- --reset   reload fresh demo data first
//   npm run demo:public -- --stop    stop both
//
// The demo runs on this computer in production mode, on its own database
// (data/public-demo.db), so development data is never touched. Settings and the
// demo admin password live in .env.public-demo, created on first run.
// The link is a Cloudflare quick tunnel (trycloudflare.com, no account needed).
// It stays the same while this computer is on; every restart gives a new link.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const ENV_FILE = path.join(ROOT, '.env.public-demo');
const STATE_DIR = path.join(ROOT, 'data', 'public-demo');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const NODE_ARGS = [`--env-file=${ENV_FILE}`, '--disable-warning=ExperimentalWarning'];
const CLOUDFLARED_WINDOWS_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

interface DemoState {
  serverPid?: number;
  tunnelPid?: number;
  url?: string;
}

/** Saved after every step, so --stop (or a failed start) can clean up whatever is running. */
const state: DemoState = {};
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const { values } = parseArgs({ options: { stop: { type: 'boolean' }, reset: { type: 'boolean' } } });

stopPrevious();
if (values.stop) {
  console.log('Public demo stopped.');
  process.exit(0);
}

const env = loadSettings();
const port = Number(env.PORT ?? 4100);
const databasePath = path.resolve(ROOT, env.DATABASE_PATH ?? 'data/public-demo.db');
mkdirSync(STATE_DIR, { recursive: true });
const cloudflared = await findCloudflared();

if (!existsSync(path.join(ROOT, 'dist', 'client', 'index.html'))) {
  run('npm', ['run', 'build'], { shell: true });
}
if (values.reset || !existsSync(databasePath)) {
  run(process.execPath, [...NODE_ARGS, 'server/src/db/seed.ts'], { env: { ...process.env, NODE_ENV: 'development' } });
}

state.serverPid = startDetached(process.execPath, [...NODE_ARGS, 'server/src/index.ts'], 'server.log', {
  ...process.env,
  NODE_ENV: 'production',
});
saveState();
await waitFor('the demo server', 20, async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`).catch(() => null);
  return response?.ok ? true : null;
});

const url = await startTunnel();
state.url = url;
saveState();

console.log(`
Public demo link:  ${url}
Admin panel:       ${url}/admin
Admin email:       ${env.ADMIN_EMAIL}
Admin password:    ADMIN_PASSWORD in .env.public-demo

The link works while this computer is on. Running this command again gives a new link.
Logs: data/public-demo/server.log and tunnel.log`);

function loadSettings(): Record<string, string | undefined> {
  if (!existsSync(ENV_FILE)) {
    const settings = [
      '# Settings for the public demo link (npm run demo:public).',
      '# Not used by `npm run dev` or `npm start`. Keep this file private: it holds the demo admin password.',
      'PORT=4100',
      'DATABASE_PATH=data/public-demo.db',
      'TRUST_PROXY=true',
      'ADMIN_NAME=Sports Office Admin',
      'ADMIN_EMAIL=sports.admin@badyauni.edu.eg',
      `ADMIN_PASSWORD=${randomBytes(15).toString('base64url')}`,
    ];
    writeFileSync(ENV_FILE, settings.join('\n') + '\n');
    console.log('Created .env.public-demo with a new admin password.');
  }
  return parseEnv(readFileSync(ENV_FILE, 'utf8'));
}

/** cloudflared from the PATH, or a copy in data/public-demo (downloaded there on first use on Windows). */
async function findCloudflared(): Promise<string> {
  if (spawnSync('cloudflared', ['--version']).status === 0) return 'cloudflared';
  const local = path.join(STATE_DIR, 'cloudflared.exe');
  if (existsSync(local)) return local;
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    console.error('Install cloudflared first: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    process.exit(1);
  }
  console.log('Downloading cloudflared from GitHub (about 50 MB, first run only)...');
  const response = await fetch(CLOUDFLARED_WINDOWS_URL);
  if (!response.ok) {
    console.error(`Could not download cloudflared (HTTP ${response.status}).`);
    process.exit(1);
  }
  writeFileSync(local, Buffer.from(await response.arrayBuffer()));
  return local;
}

/**
 * Asking trycloudflare.com for a new tunnel can be slower than cloudflared's own
 * 15-second limit (seen on the campus network), so a few attempts are made.
 */
async function startTunnel(): Promise<string> {
  const tunnelLog = path.join(STATE_DIR, 'tunnel.log');
  for (let attempt = 1; attempt <= 3; attempt++) {
    state.tunnelPid = startDetached(cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], 'tunnel.log');
    saveState();
    // The address is printed before the tunnel can carry traffic; wait for both.
    const result = await waitFor('the public link', 60, async () => {
      const log = existsSync(tunnelLog) ? readFileSync(tunnelLog, 'utf8') : '';
      if (log.includes('failed to request quick Tunnel')) return 'retry';
      const address = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/.exec(log)?.[0];
      return address && log.includes('Registered tunnel connection') ? address : null;
    });
    if (result !== 'retry') return result;
    console.log(`Cloudflare did not answer in time (attempt ${attempt} of 3).`);
  }
  console.error('Could not open the public link. Check the internet connection and try again.');
  stopPrevious();
  process.exit(1);
}

function stopPrevious(): void {
  if (!existsSync(STATE_FILE)) return;
  const previous = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as DemoState;
  for (const pid of [previous.tunnelPid, previous.serverPid]) {
    if (!pid) continue;
    try {
      process.kill(pid);
    } catch {
      // Already gone (computer restarted, or stopped by hand).
    }
  }
  rmSync(STATE_FILE);
}

function run(command: string, args: string[], options: { shell?: boolean; env?: NodeJS.ProcessEnv } = {}): void {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed.`);
    process.exit(1);
  }
}

/** Starts a process that keeps running after this command exits. Its output replaces data/public-demo/<logName>. */
function startDetached(command: string, args: string[], logName: string, childEnv?: NodeJS.ProcessEnv): number {
  const log = openSync(path.join(STATE_DIR, logName), 'w');
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: childEnv ?? process.env,
  });
  closeSync(log);
  child.unref();
  if (child.pid === undefined) {
    console.error(`Could not start ${command}.`);
    process.exit(1);
  }
  return child.pid;
}

async function waitFor<T>(what: string, seconds: number, check: () => Promise<T | null>): Promise<T> {
  for (let i = 0; i < seconds * 2; i++) {
    const result = await check();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error(`Timed out waiting for ${what}. See the logs in data/public-demo/.`);
  stopPrevious();
  process.exit(1);
}
