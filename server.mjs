import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { analyzeReference } from './analyzer.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.md':'text/markdown; charset=utf-8' };
function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
const rateWindowMs = positiveInteger(process.env.RATE_WINDOW_MS,60000);
const rateLimit = positiveInteger(process.env.RATE_LIMIT,6);
const maxConcurrent = Math.min(4,positiveInteger(process.env.MAX_CONCURRENT_ANALYSES,1));
const rateBuckets = new Map();
let activeAnalyses = 0;
function installedBrowserPath() {
  if (process.platform !== 'win32') return undefined;
  const candidates = [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files','Google','Chrome','Application','chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)','Google','Chrome','Application','chrome.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files','Microsoft','Edge','Application','msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google','Chrome','Application','chrome.exe'),
  ];
  return candidates.find(candidate => candidate && existsSync(candidate));
}
const browserExecutable = process.env.CHROME_EXECUTABLE || installedBrowserPath();
let playwrightPromise;
async function loadPlaywright() {
  if (!playwrightPromise) {
    playwrightPromise = process.env.PLAYWRIGHT_MODULE
      ? import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href)
      : import('playwright');
  }
  return playwrightPromise;
}

async function readJson(req, maxBytes = 8192) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('请求内容过大。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('请求数据格式无效。'); }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(res.req?.method === 'HEAD' ? undefined : JSON.stringify(payload));
}

function clientAddress(req) {
  const trustedHops = Math.max(0, Number(process.env.TRUST_PROXY_HOPS || 0));
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(value => value.trim()).filter(Boolean);
  if (trustedHops > 0 && forwarded.length >= trustedHops) return forwarded[forwarded.length - trustedHops];
  return req.socket.remoteAddress || 'unknown';
}

function withinRateLimit(address, now = Date.now()) {
  for (const [key, bucket] of rateBuckets) if (now - bucket.startedAt >= rateWindowMs) rateBuckets.delete(key);
  const bucket = rateBuckets.get(address);
  if (!bucket || now - bucket.startedAt >= rateWindowMs) {
    rateBuckets.set(address, { startedAt:now, count:1 });
    return true;
  }
  if (bucket.count >= rateLimit) return false;
  bucket.count += 1;
  return true;
}

const server = http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (pathname === '/healthz') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res,405,{error:'仅支持 GET 请求。'});
      return sendJson(res,200,{status:'ok'});
    }
    if (pathname === '/api/analyze') {
      if (req.method !== 'POST') return sendJson(res,405,{error:'仅支持 POST 请求。'});
      const address = clientAddress(req);
      if (!withinRateLimit(address)) {
        res.setHeader('Retry-After', String(Math.ceil(rateWindowMs / 1000)));
        return sendJson(res,429,{error:'请求过于频繁，请稍后再试。'});
      }
      if (activeAnalyses >= maxConcurrent) {
        res.setHeader('Retry-After','10');
        return sendJson(res,503,{error:'当前网页分析任务繁忙，请稍后重试。'});
      }
      activeAnalyses += 1;
      try {
        const body = await readJson(req);
        if (typeof body.url !== 'string' || !body.url.trim()) return sendJson(res,400,{error:'请输入要分析的参考网页网址。'});
        if (body.url.length > 2048) return sendJson(res,400,{error:'网址长度不能超过 2048 个字符。'});
        const playwright = await loadPlaywright();
        const result = await analyzeReference(body.url.trim(),{playwright,executablePath:browserExecutable});
        return sendJson(res,200,result);
      } catch (error) {
        const status = /网址|公网|内部地址|非公网|账号密码|本地网络|解析到非公网|请求数据格式无效|请求内容过大/.test(error.message) ? 400 : /timeout|Timeout/i.test(error.message) ? 504 : 502;
        return sendJson(res,status,{error:error.message || '网页分析失败，请稍后重试。'});
      } finally { activeAnalyses -= 1; }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed'); }
    const filePath = pathname === '/' || pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const target = path.resolve(root,'.' + filePath);
    const relativePath = path.relative(root,target);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || path.basename(target).startsWith('.') || !types[path.extname(target)]) { res.writeHead(404); return res.end('Not found'); }
    const bytes = await readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)],'Cache-Control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    if (!res.headersSent) sendJson(res,400,{error:error.message || '请求失败。'});
    else res.destroy();
  }
});

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port,host,() => console.log(`网页分析生成站已启动：http://${host}:${port}`));
