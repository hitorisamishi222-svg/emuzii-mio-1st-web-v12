// CI-only transport harness. Never mounted by Vercel or connected to a live DB.
import {createServer} from 'node:http';
import {createAuthApiHandlers} from '../security/mio-auth-api-adapter.mjs';
import {createAuthFlow} from '../security/mio-auth-flow.mjs';
import {checkAuthRequest} from '../security/mio-auth-request-guard.mjs';
import {createPostgresIdentifierStore} from '../security/mio-postgres-identifier-store.mjs';
import {validateLoginId} from '../mio-auth-rules-v21.js';
import {drawGachaTransaction} from '../security/mio-gacha-transaction.mjs';
import {createPasskeyService} from '../security/mio-passkey-service.mjs';
import {createTestHttpRouter} from '../security/mio-test-http-router.mjs';

export async function startTestAuthHttpServer({pool, trustedOrigin, throttle}) {
  if (process.env.CI !== 'true') throw Error('CI-only HTTP harness');
  const config = pool?.options;
  const connection = new URL(config?.connectionString || 'postgresql://invalid/');
  if (connection.hostname !== '127.0.0.1' || connection.port !== '5432' ||
      connection.username !== 'mio_test' || connection.pathname !== '/mio_ci_test' ||
      config.options !== '-c search_path=mio_http_ci,public') throw Error('isolated CI database required');
  const actual = (await pool.query('SELECT current_database() AS db,current_user AS username,current_schema() AS schema')).rows[0];
  if (actual.db !== 'mio_ci_test' || actual.username !== 'mio_test' || actual.schema !== 'mio_http_ci') throw Error('isolated CI schema required');
  checkAuthRequest({}, {trustedOrigin});
  if (typeof throttle?.allow !== 'function') throw Error('database throttle required');
  const flow = createAuthFlow(pool), api = createAuthApiHandlers(pool, {flow});
  const passkeys=createPasskeyService(pool,{origin:trustedOrigin,rpID:new URL(trustedOrigin).hostname});
  const testRouter=createTestHttpRouter({api,passkeys,trustedOrigin,throttle});
  const identifiers = createPostgresIdentifierStore(pool);
  const reads = new Set(['/test-auth/me', '/test-auth/devices']);
  const writes = new Set(['/test-auth/login', '/test-auth/logout', '/test-auth/logout-all',
    '/test-auth/revoke-device', '/test-auth/login-id', '/test-auth/gacha']);
  const server = createServer(async (req, res) => {
    function send(status, body, headers = {}) {
      res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers});
      res.end(JSON.stringify(body));
    }
    try {
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      if (!reads.has(path) && !writes.has(path) && !path.startsWith('/test-auth/passkey-')) { req.resume(); return send(404, {error: 'not_found'}); }
      if (reads.has(path)) {
        req.resume();
        if (req.method !== 'GET') return send(405, {error: 'method_not_allowed'});
        const origin = req.headers.origin;
        const fetchSite = req.headers['sec-fetch-site'];
        if ((origin && origin !== trustedOrigin) || (fetchSite && fetchSite !== 'same-origin') || (!origin && fetchSite !== 'same-origin')) return send(403, {error: 'origin_denied'});
        const result = await api[path.endsWith('/me') ? 'me' : 'devices'](req.headers.cookie);
        return send(result.status, result.body, result.headers);
      }
      const guard = checkAuthRequest({method: req.method, headers: req.headers}, {trustedOrigin});
      if (!guard.ok) { req.resume(); return send(guard.status, {error: guard.error}); }
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (path.startsWith('/test-auth/passkey-')?65536:4096)) { req.resume(); return send(413, {error: 'payload_too_large'}); }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, {error: 'invalid_json'}); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, {error: 'invalid_request'});
      if(path.startsWith('/test-auth/passkey-')){
        const result=await testRouter({path,method:req.method,headers:req.headers,body,trustedClientIp:req.socket.remoteAddress});
        return send(result.status,result.body,result.headers);
      }
      if (path === '/test-auth/login') {
        if (typeof body.identifier !== 'string' || body.identifier.length > 100 || typeof body.password !== 'string' || body.password.length > 1024 || (body.deviceLabel !== undefined && typeof body.deviceLabel !== 'string')) return send(400, {error: 'invalid_request'});
        // Socket peer only: client-supplied forwarding headers cannot bypass throttle.
        if (!await throttle.allow(req.socket.remoteAddress)) return send(429, {error: 'too_many_attempts'}, {'Retry-After': '900'});
        const result = await api.login(body); return send(result.status, result.body, result.headers);
      }
      const session = await flow.current(req.headers.cookie);
      if (!session) return send(401, {error: 'unauthorized'});
      let result;
      if (path === '/test-auth/logout') result = await api.logout(req.headers.cookie);
      if (path === '/test-auth/logout-all') result = await api.logoutAll(req.headers.cookie);
      if (path === '/test-auth/revoke-device') result = await api.revokeDevice(req.headers.cookie, body.sessionId);
      if (path === '/test-auth/login-id') {
        if (validateLoginId(body.loginId)) return send(400, {error: 'invalid_login_id'});
        try { return send(200, await identifiers.changeLoginId(session.accountId, body.loginId)); }
        catch (e) { if (e.message === 'identifier already used or retired') return send(409, {error: 'identifier_unavailable'}); throw e; }
      }
      if (path === '/test-auth/gacha') {
        if (typeof body.requestKey !== 'string' || body.requestKey.length < 12 || body.requestKey.length > 128) return send(400, {error: 'invalid_request'});
        return send(200, await drawGachaTransaction(pool, {accountId: session.accountId,
          requestKey: body.requestKey, selectPrize: async () => 'SYNTH-HTTP-N'}));
      }
      return send(result.status, result.body, result.headers);
    } catch { if (!res.headersSent) send(503, {error: 'temporarily_unavailable'}); else res.end(); }
  });
  server.requestTimeout = 5000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()))};
}
