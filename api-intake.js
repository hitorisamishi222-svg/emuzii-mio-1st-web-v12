import {randomBytes, createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import pg from 'pg';
import {
  intakeConfiguration, validateApplication, allowedRequest,
  requesterDigest, requestKeyDigest
} from './intake-core.js';

const {Pool} = pg;

function receiptCode(key, pepper) {
  // Reference only: never an account identifier or proof of ownership.
  const part = createHmac('sha256', pepper).update('mio-intake-receipt:' + key)
    .digest('hex').slice(0, 20).toUpperCase();
  return 'MIO-T-' + part;
}

function requesterIp(headers = {}) {
  // Vercel overwrites its own forwarded header at the edge.
  // No client-controlled fallback; if missing we must fail closed.
  const ip = headers['x-vercel-forwarded-for'];
  return typeof ip === 'string' && isIP(ip) ? ip : null;
}

const reply = (status, data) => ({status, data});
const unavailable = () => reply(503, {ok:false, error:'仮受付は現在準備中です'});
const accepted = receipt => reply(201, {
  ok:true, receipt, status:'仮受付', approved:false,
  message:'仮受付が完了しました。本人確認・正式登録・皆勤やガチャの利用許可はまだ行われていません'
});

export function createIntakeHandler({env = process.env, poolFactory = cfg =>
  new Pool({connectionString:cfg.connectionString, max:1, connectionTimeoutMillis:4000,
    idleTimeoutMillis:4000})} = {}) {

  return async function handle(req) {
    const cfg = intakeConfiguration(env);
    if (req.method === 'GET') {
      return reply(200, {ok:true, available:!!cfg, registrationApproved:false});
    }
    if (!cfg) return unavailable();
    if (!allowedRequest(req)) return reply(403, {ok:false, error:'受付できない送信方法です'});
    const application = validateApplication(req.body);
    if (!application) return reply(400, {ok:false, error:'入力内容を確認してください'});
    const ip = requesterIp(req.headers);
    const requesterHash = requesterDigest(ip, cfg.pepper);
    if (!requesterHash) return unavailable();

    const keyHash = requestKeyDigest(application.requestKey, cfg.pepper);
    const receipt = receiptCode(application.requestKey, cfg.pepper);
    let pool, client, inTransaction = false;
    try {
      pool = poolFactory(cfg);
      client = await pool.connect();
      // Both checks are essential: a mistakenly reused gallery connection must never write.
      const scope = await client.query('SELECT current_database() AS db, current_user AS role');
      if (scope.rows[0]?.db !== 'mio_intake' ||
          scope.rows[0]?.role !== 'mio_intake_writer') return unavailable();

      await client.query('BEGIN'); inTransaction = true;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [requesterHash]);

      const existing = await client.query(
        'SELECT nickname,kind,requester_hash,receipt_code FROM intake.requests WHERE idempotency_hash=$1',
        [keyHash]
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        await client.query('COMMIT'); inTransaction = false;
        if (row.nickname !== application.nickname || row.kind !== application.kind ||
            row.requester_hash !== requesterHash) {
          return reply(409, {ok:false,error:'この申請番号では内容を変更できません'});
        }
        return reply(200, accepted(row.receipt_code).data);
      }

      const hourly = await client.query(
        "SELECT COUNT(*)::integer AS n FROM intake.requests WHERE requester_hash=$1 AND created_at>now()-interval '1 hour'",
        [requesterHash]
      );
      const daily = await client.query(
        "SELECT COUNT(*)::integer AS n FROM intake.requests WHERE requester_hash=$1 AND created_at>now()-interval '24 hours'",
        [requesterHash]
      );
      if (Number(hourly.rows[0]?.n) >= 5 || Number(daily.rows[0]?.n) >= 12) {
        await client.query('ROLLBACK'); inTransaction = false;
        return reply(429, {ok:false,error:'短時間の受付回数が上限に達しました。運営へお問い合わせください'});
      }

      // Never use a MIO-ID, session cookie, approval status, or GAS write here.
      const inserted = await client.query(
        "INSERT INTO intake.requests (idempotency_hash,requester_hash,kind,nickname,receipt_code) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (idempotency_hash) DO NOTHING RETURNING receipt_code",
        [keyHash, requesterHash, application.kind, application.nickname, receipt]
      );
      if (inserted.rows.length !== 1 || inserted.rows[0].receipt_code !== receipt) {
        await client.query('ROLLBACK'); inTransaction = false;
        return reply(409, {ok:false,error:'受付状態を確認できません。運営へお問い合わせください'});
      }
      const verified = await client.query(
        'SELECT receipt_code,kind,nickname FROM intake.requests WHERE idempotency_hash=$1',
        [keyHash]
      );
      if (verified.rows.length !== 1 ||
          verified.rows[0].receipt_code !== receipt ||
          verified.rows[0].kind !== application.kind ||
          verified.rows[0].nickname !== application.nickname) {
        throw Error('intake readback mismatch');
      }
      await client.query('COMMIT'); inTransaction = false;
      return accepted(receipt);
    } catch (e) {
      if (inTransaction && client) {
        try {await client.query('ROLLBACK');} catch {}
      }
      // Avoid logging names, IPs, SQL, URLs, credentials, or request bodies.
      console.error('isolated intake unavailable', e?.code || 'unavailable');
      return unavailable();
    } finally {
      if (client) client.release();
      if (pool) await pool.end();
    }
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Vary','Origin');
  if (!['GET','POST'].includes(req.method)) {
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({ok:false,error:'対応していない操作です'});
  }
  const result = await createIntakeHandler()(req);
  return res.status(result.status).json(result.data);
}
