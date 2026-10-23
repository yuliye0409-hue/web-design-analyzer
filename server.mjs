import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { analyzeReference } from './analyzer.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.md':'text/markdown; charset=utf-8' };
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
  res.end(JSON.stringify(payload));
}

http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (pathname === '/api/analyze') {
      if (req.method !== 'POST') return sendJson(res,405,{error:'仅支持 POST 请求。'});
      const body = await readJson(req);
      if (typeof body.url !== 'string' || !body.url.trim()) return sendJson(res,400,{error:'请输入要分析的参考网页网址。'});
      try {
        const playwright = await loadPlaywright();
        const result = await analyzeReference(body.url.trim(),{playwright,executablePath:process.env.CHROME_EXECUTABLE});
        return sendJson(res,200,result);
      } catch (error) {
        const status = /网址|公网|内部地址|非公网|账号密码|本地网络|解析到非公网/.test(error.message) ? 400 : /timeout|Timeout/i.test(error.message) ? 504 : 502;
        return sendJson(res,status,{error:error.message || '网页分析失败，请稍后重试。'});
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed'); }
    const filePath = pathname === '/' || pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const target = path.resolve(root,'.' + filePath);
    if (!target.startsWith(root) || path.basename(target).startsWith('.') || !types[path.extname(target)]) { res.writeHead(404); return res.end('Not found'); }
    const bytes = await readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)],'Cache-Control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    if (!res.headersSent) sendJson(res,400,{error:error.message || '请求失败。'});
    else res.destroy();
  }
}).listen(Number(process.env.PORT || 4173),'127.0.0.1',() => console.log('网页分析生成站已启动：http://127.0.0.1:' + (process.env.PORT || 4173)));
