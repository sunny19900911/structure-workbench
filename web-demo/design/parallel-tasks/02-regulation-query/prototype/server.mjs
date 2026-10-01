import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiscovery } from './online-sources.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4177);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, {
        ok: true,
        mode: 'live-readonly',
        writable: false,
        sources: ['天津住建', '上海住建', '北京住建', '广东住建', '全国地方标准平台（江苏）', '浙江住建', '云南住建'],
        now: new Date().toISOString(),
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/discover') {
      const body = await readJsonBody(request);
      const province = String(body.province || '').trim();
      if (!province) return sendJson(response, 400, { error: '缺少 province' });
      const result = await runDiscovery({ province, keywords: body.keywords, asOf: body.asOf });
      return sendJson(response, 200, result);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method Not Allowed' });

    const decodedPath = decodeURIComponent(url.pathname);
    const requested = decodedPath === '/' ? '/index.html' : decodedPath.endsWith('/') ? `${decodedPath}index.html` : decodedPath;
    const filePath = resolve(root, `.${requested}`);
    if (!filePath.startsWith(resolve(root) + sep) && filePath !== resolve(root, 'index.html')) {
      return sendJson(response, 403, { error: 'Forbidden' });
    }
    const data = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': types[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    const status = error?.code === 'ENOENT' ? 404 : 500;
    sendJson(response, status, { error: String(error?.message || error) });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`WorkBuddy regulation audit: http://127.0.0.1:${port}/`);
  console.log('只读联网核查；不会写入 601 正式库。');
});

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}
