import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

async function reservePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.listen(0,'127.0.0.1',resolve).once('error',reject));
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

test('production server exposes health checks and limits public analysis requests', async () => {
  const port = await reservePort();
  const server = spawn(process.execPath,['server.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,HOST:'127.0.0.1',PORT:String(port),RATE_LIMIT:'1',RATE_WINDOW_MS:'60000'},
    stdio:'ignore',
  });
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`Server exited with code ${server.exitCode}`);
      try {
        const response = await fetch(`${origin}/healthz`);
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve,50));
    }
    assert.equal(ready,true,'server should start and answer health checks');

    const health = await fetch(`${origin}/healthz`);
    assert.deepEqual(await health.json(),{status:'ok'});

    const page = await fetch(origin);
    assert.equal(page.status,200);
    assert.match(await page.text(),/网页分析生成站/);

    const invalid = await fetch(`${origin}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:'{' });
    assert.equal(invalid.status,400);
    const limited = await fetch(`${origin}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com'})});
    assert.equal(limited.status,429);
    assert.equal(limited.headers.get('retry-after'),'60');
  } finally {
    server.kill();
    await new Promise(resolve => server.once('exit',resolve));
  }
});
