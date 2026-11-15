import {createHash, randomUUID} from 'node:crypto';
import {mkdir, open, readFile, rename, unlink, stat} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const executeFile = promisify(execFile);
const notificationScript = fileURLToPath(new URL('./human-request-speech.ps1', import.meta.url));

export async function speakHumanRequest(request, {platform = process.platform, run = executeFile} = {}) {
  if (platform !== 'win32') return {status: 'voice-unavailable', reason: '当前平台没有Windows中文语音组件', heardByUser: false};
  try {
    const shell = join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const {stdout} = await run(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', notificationScript,
      '-Page', request.page, '-Action', request.action], {windowsHide: true, timeout: 45000, maxBuffer: 65536, encoding: 'utf8'});
    const receipt = JSON.parse(stdout.trim());
    return {...receipt, heardByUser: false};
  } catch (error) {
    return {status: 'voice-failed', reason: error.killed ? '语音超时' : '中文语音调用失败', heardByUser: false};
  }
}

function validate(input, operation) {
  if (!/^[a-f0-9]{32}$/.test(input.projectId || '')) throw Error('请提供明确项目ID');
  if (typeof input.step !== 'string' || !input.step.trim() || input.step.length > 160) throw Error('人工事项Step无效');
  if (operation === 'request') {
    for (const key of ['page', 'action']) if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 1000) throw Error('请提供明确页面和人工操作');
    if (input.url) {
      const url = new URL(input.url);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw Error('页面入口只接受本机工作台URL');
    }
  }
  if (operation === 'resolve' && (!input.evidence || typeof input.evidence !== 'string' || input.evidence.length > 1000)) throw Error('结束等待需要实际操作依据');
}

async function readState(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function saveState(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp';
  const file = await open(temp, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2), 'utf8'); await file.sync(); }
  finally { await file.close(); }
  try { await rename(temp, path); }
  catch (error) { await unlink(temp).catch(() => {}); throw error; }
}

async function acquireLock(path, now) {
  try { return await open(path, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = await readState(path).catch(() => null);
    const age = now() - (await stat(path)).mtimeMs;
    let alive = true;
    if (previous?.pid) {
      try { process.kill(previous.pid, 0); }
      catch (check) { if (check.code === 'ESRCH') alive = false; }
    } else if (age > 120000) alive = false;
    if (!alive) { await unlink(path); return open(path, 'wx', 0o600); }
    throw Object.assign(Error('同一人工事项正在处理，请稍后读取状态'), {code: 'HUMAN_REQUEST_BUSY'});
  }
}

function response(state) {
  return {state, waiting: state?.status === 'pending', message: state ? `${state.page}：${state.action}${state.url ? '\n' + state.url : ''}` : '未找到此人工事项'};
}

export function createHumanRequests(dataRoot, {speak = speakHumanRequest, now = Date.now} = {}) {
  async function call(operation, input) {
    validate(input, operation);
    const key = createHash('sha256').update(input.projectId + '\0' + input.step).digest('hex');
    const path = join(dataRoot, 'human-requests', key + '.json');
    if (operation === 'status') return response(await readState(path));
    await mkdir(dirname(path), {recursive: true});
    const lockPath = path + '.lock';
    const lock = await acquireLock(lockPath, now);
    try {
      await lock.writeFile(JSON.stringify({pid: process.pid}));
      let state = await readState(path);
      if (operation === 'resolve') {
        if (!state) throw Error('未找到待办事项');
        state = {...state, status: 'resolved', resolvedAt: new Date(now()).toISOString(), evidence: input.evidence};
        await saveState(path, state);
        return response(state);
      }
      if (state && (state.page !== input.page || state.action !== input.action || state.url !== (input.url || ''))) throw Error('此Step已用于其他操作，请为新事项使用新Step');
      let notify = !state;
      if (!state) {
        state = {projectId: input.projectId, step: input.step, page: input.page, action: input.action, url: input.url || '',
          status: 'pending', createdAt: new Date(now()).toISOString(), lastAttemptAt: null, attempts: 0, reminderCount: 0,
          notification: {status: 'not-attempted', heardByUser: false}};
        await saveState(path, state);
      } else if (state.status === 'pending' && input.remind === true && state.reminderCount < 1 && (!state.lastAttemptAt || now() - Date.parse(state.lastAttemptAt) >= 180000)) {
        state.reminderCount++;
        notify = true;
      }
      if (notify) {
        state.attempts++;
        state.lastAttemptAt = new Date(now()).toISOString();
        state.notification = {status: 'speaking', heardByUser: false};
        await saveState(path, state);
        try { state.notification = {...await speak(state), heardByUser: false}; }
        catch { state.notification = {status: 'voice-failed', reason: '中文语音调用失败', heardByUser: false}; }
        await saveState(path, state);
      }
      return response(state);
    } finally { await lock.close(); await unlink(lockPath).catch(() => {}); }
  }
  return {request: input => call('request', input), status: input => call('status', input), resolve: input => call('resolve', input)};
}
