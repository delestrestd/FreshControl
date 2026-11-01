/* Tempo — serveur maison (remplace Supabase), sans dépendance : Node 24 + SQLite intégré.
   • Parle la même langue que le module Sync de l'appli (mêmes adresses /auth, /rest, /storage),
     donc l'appli n'a qu'à changer d'adresse de serveur.
   • Page d'administration des accès (IAM) : /admin
   • Copie quotidienne vers le NAS (« lake ») si LAKE_DIR est joignable.
   Réglages (variables d'environnement ou server/config.json) :
     PORT (8787), DATA_DIR (D:\TEMPO-SERVEUR\data), LAKE_DIR (vide = pas de copie), ORIGINS (liste séparée par des virgules)
   Créer / réinitialiser un compte admin :
     node tempo-server.js --admin email motdepasse */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
process.removeAllListeners('warning');            // avertissement « SQLite experimental »
const { DatabaseSync } = require('node:sqlite');

/* ── Configuration ── */
let cfg = {};
try{ cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').replace(/^﻿/, '')); }catch(e){}
const PORT = +(process.env.PORT || cfg.port || 8787);
const DATA_DIR = process.env.DATA_DIR || cfg.dataDir || 'D:\\TEMPO-SERVEUR\\data';
const LAKE_DIR = process.env.LAKE_DIR || cfg.lakeDir || '';
const ORIGINS = (process.env.ORIGINS || cfg.origins || 'https://fresh-control.vercel.app,http://localhost:8138').split(',').map(s => s.trim()).filter(Boolean);
const ACCESS_TTL = 3600, REFRESH_TTL = 60 * 24 * 3600;       // jeton 1 h, reconnexion auto 60 jours
const ROLES = ['admin', 'commercial', 'magasin', 'employe'], STATUSES = ['pending', 'active', 'blocked'];

fs.mkdirSync(path.join(DATA_DIR, 'media'), { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'tempo.db'));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pw TEXT NOT NULL, name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'commercial', status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER, last_login INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, kind TEXT, user_id TEXT, device TEXT, ua TEXT, ip TEXT, created_at INTEGER, expires_at INTEGER, last_seen INTEGER);
CREATE TABLE IF NOT EXISTS kv(user_id TEXT, k TEXT, v TEXT, rev INTEGER, device TEXT, updated_at INTEGER, PRIMARY KEY(user_id, k));
CREATE TABLE IF NOT EXISTS audit(at INTEGER, actor TEXT, action TEXT, target TEXT, detail TEXT, ip TEXT);
`);
const q = sql => db.prepare(sql);
const now = () => Date.now();

/* ── Mots de passe (scrypt) et jetons ── */
function hashPw(pw){ const salt = crypto.randomBytes(16); return 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync(pw, salt, 32).toString('hex'); }
function checkPw(pw, h){
  const [, s, d] = String(h).split('$'); if(!s || !d) return false;
  const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 32), b = Buffer.from(d, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const tok = () => crypto.randomBytes(32).toString('base64url');
function audit(actor, action, target, detail, ip){ q('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(now(), actor || '', action, target || '', detail || '', ip || ''); }

// Anti-force brute : 8 essais ratés / 15 min par IP + e-mail
const fails = new Map();
function tooMany(key){ const f = fails.get(key); return f && f.n >= 8 && now() - f.t < 15 * 60e3; }
function failed(key){ const f = fails.get(key); if(!f || now() - f.t > 15 * 60e3) fails.set(key, { n: 1, t: now() }); else f.n++; }

function issue(user, device, ua, ip){
  const at = tok(), rt = tok(), t = now();
  q('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?)').run(at, 'access', user.id, device || '', ua || '', ip || '', t, t + ACCESS_TTL * 1000, t);
  q('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?)').run(rt, 'refresh', user.id, device || '', ua || '', ip || '', t, t + REFRESH_TTL * 1000, t);
  return { access_token: at, refresh_token: rt, token_type: 'bearer', expires_in: ACCESS_TTL, user: { id: user.id, email: user.email } };
}
function userFromToken(req){
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); if(!m) return null;
  const s = q("SELECT * FROM sessions WHERE token=? AND kind='access'").get(m[1]);
  if(!s || s.expires_at < now()) return null;
  return q('SELECT * FROM users WHERE id=?').get(s.user_id) || null;
}
const active = u => u && u.status === 'active';
const isAdmin = u => active(u) && u.role === 'admin';

/* ── Comptes ── */
function createUser(email, pw, role, status, name){
  const id = crypto.randomUUID();
  q('INSERT INTO users(id,email,pw,name,role,status,created_at) VALUES(?,?,?,?,?,?,?)').run(id, email.toLowerCase().trim(), hashPw(pw), name || '', role, status, now());
  return q('SELECT * FROM users WHERE id=?').get(id);
}
const countUsers = () => q('SELECT COUNT(*) n FROM users').get().n;

/* ── Outils HTTP ── */
function cors(req, res){
  const o = req.headers.origin;
  if(o && (ORIGINS.includes(o) || ORIGINS.includes('*'))){
    res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, x-upsert, prefer');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    // Chrome : site public → adresse Tailscale (réseau privé) sur un appareil du tailnet
    if(req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}
function send(res, code, body, type){
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(s);
}
function readBody(req, max = 30 * 1024 * 1024){
  return new Promise((ok, ko) => {
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if(n > max){ ko(new Error('trop gros')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts).toString('utf8'))); req.on('error', ko);
  });
}
const json = async req => { try{ return JSON.parse(await readBody(req) || '{}'); }catch(e){ return {}; } };
// Requête tapée sur ce PC (pas relayée par Tailscale, qui ajoute X-Forwarded-For)
const isLocal = req => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '') && !req.headers['x-forwarded-for']
  && !req.headers['tailscale-user-login'] && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
const ipOf = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const safeName = s => /^[A-Za-z0-9_-]{1,400}$/.test(s);
const mediaDir = uid => path.join(DATA_DIR, 'media', uid);

/* ── Routes de l'appli (compatibles avec le module Sync) ── */
async function appRoutes(req, res, url){
  const p = url.pathname, ip = ipOf(req);

  if(p === '/auth/v1/token' && req.method === 'POST'){
    const b = await json(req), gt = url.searchParams.get('grant_type');
    if(gt === 'password'){
      const email = String(b.email || '').toLowerCase().trim(), key = ip + '|' + email;
      if(tooMany(key)) return send(res, 429, { msg: 'Too many attempts' });
      const u = q('SELECT * FROM users WHERE email=?').get(email);
      if(!u || !checkPw(String(b.password || ''), u.pw)){ failed(key); audit(email, 'connexion refusée', email, '', ip); return send(res, 400, { error: 'invalid_grant', msg: 'Invalid login credentials' }); }
      q('UPDATE users SET last_login=? WHERE id=?').run(now(), u.id);
      audit(u.email, 'connexion', u.email, req.headers['user-agent'] || '', ip);
      return send(res, 200, issue(u, '', req.headers['user-agent'], ip));
    }
    if(gt === 'refresh_token'){
      const s = q("SELECT * FROM sessions WHERE token=? AND kind='refresh'").get(String(b.refresh_token || ''));
      if(!s || s.expires_at < now()) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid Refresh Token: not found' });
      const u = q('SELECT * FROM users WHERE id=?').get(s.user_id);
      if(!u) return send(res, 400, { error: 'invalid_grant', msg: 'Invalid Refresh Token: not found' });
      q('DELETE FROM sessions WHERE token=?').run(s.token);           // jeton à usage unique
      return send(res, 200, issue(u, s.device, req.headers['user-agent'], ip));
    }
    return send(res, 400, { msg: 'grant_type inconnu' });
  }
  if(p === '/auth/v1/signup' && req.method === 'POST'){
    const b = await json(req), email = String(b.email || '').toLowerCase().trim(), pw = String(b.password || '');
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { msg: 'Adresse e-mail invalide' });
    if(pw.length < 8) return send(res, 400, { msg: 'Password should be at least 8 characters' });
    if(q('SELECT 1 FROM users WHERE email=?').get(email)) return send(res, 400, { msg: 'User already registered' });
    const first = countUsers() === 0;                                  // le tout premier compte est admin
    const u = createUser(email, pw, first ? 'admin' : 'commercial', first ? 'active' : 'pending');
    audit(email, 'inscription', email, first ? 'premier compte : admin' : 'en attente', ip);
    return send(res, 200, issue(u, '', req.headers['user-agent'], ip));
  }
  if(p === '/auth/v1/logout' && req.method === 'POST'){
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if(m){ const s = q('SELECT user_id, created_at FROM sessions WHERE token=?').get(m[1]); if(s) q('DELETE FROM sessions WHERE user_id=? AND created_at=?').run(s.user_id, s.created_at); }
    return send(res, 204, '');
  }

  const u = userFromToken(req);
  if(!u) return send(res, 401, { msg: 'JWT expired' });
  q("UPDATE sessions SET last_seen=? WHERE token=?").run(now(), (req.headers.authorization || '').slice(7));

  if(p === '/rest/v1/members' && req.method === 'GET'){
    const own = url.searchParams.get('user_id');
    if(own === 'eq.' + u.id) return send(res, 200, [{ status: u.status, role: u.role }]);
    if(!isAdmin(u)) return send(res, 200, []);
    return send(res, 200, q('SELECT id user_id, email, role, status, created_at FROM users ORDER BY created_at DESC').all()
      .map(x => Object.assign(x, { created_at: new Date(x.created_at).toISOString() })));
  }
  if(p === '/rest/v1/members' && req.method === 'PATCH'){
    if(!isAdmin(u)) return send(res, 403, { msg: 'Réservé à l’administrateur' });
    const id = String(url.searchParams.get('user_id') || '').replace(/^eq\./, ''), b = await json(req);
    if(id === u.id) return send(res, 403, { msg: 'Pas sur votre propre compte' });
    const t = q('SELECT * FROM users WHERE id=?').get(id); if(!t) return send(res, 404, { msg: 'Compte introuvable' });
    if(b.role && ROLES.includes(b.role)) q('UPDATE users SET role=? WHERE id=?').run(b.role, id);
    if(b.status && STATUSES.includes(b.status)) q('UPDATE users SET status=? WHERE id=?').run(b.status, id);
    audit(u.email, 'modification', t.email, JSON.stringify(b), ip);
    return send(res, 204, '');
  }

  if(!active(u)) return send(res, 403, { msg: 'Compte non actif' });

  if(p === '/rest/v1/kv' && req.method === 'GET'){
    const sel = url.searchParams.get('select') || 'k,rev', inq = /^in\.\((.*)\)$/.exec(url.searchParams.get('k') || '');
    let rows = q('SELECT k, v, rev FROM kv WHERE user_id=?').all(u.id);
    if(inq){ const want = new Set(inq[1].split(',')); rows = rows.filter(r => want.has(r.k)); }
    if(!sel.split(',').includes('v')) rows = rows.map(r => ({ k: r.k, rev: r.rev }));
    return send(res, 200, rows);
  }
  if(p === '/rest/v1/rpc/kv_put' && req.method === 'POST'){
    const b = await json(req), k = String(b.p_k || ''); if(!k) return send(res, 400, { msg: 'clé manquante' });
    let out = -1;
    db.exec('BEGIN IMMEDIATE');
    try{
      const cur = q('SELECT rev FROM kv WHERE user_id=? AND k=?').get(u.id, k), crev = cur ? cur.rev : 0;
      if(crev === +b.p_rev){
        out = crev + 1;
        q('INSERT INTO kv VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v, rev=excluded.rev, device=excluded.device, updated_at=excluded.updated_at')
          .run(u.id, k, String(b.p_v ?? ''), out, String(b.p_device || ''), now());
      }
      db.exec('COMMIT');
    }catch(e){ db.exec('ROLLBACK'); throw e; }
    return send(res, 200, String(out));
  }

  // Photos : /storage/v1/object/media/<uid>/<nom>, .../list/media, .../authenticated/media/<uid>/<nom>
  if(p === '/storage/v1/object/list/media' && req.method === 'POST'){
    const b = await json(req), off = +b.offset || 0, lim = Math.min(+b.limit || 1000, 1000);
    let names = []; try{ names = fs.readdirSync(mediaDir(u.id)).sort(); }catch(e){}
    return send(res, 200, names.slice(off, off + lim).map(name => ({ name })));
  }
  const mm = /^\/storage\/v1\/object\/(?:authenticated\/)?media\/([^/]+)\/([^/]+)$/.exec(p);
  if(mm){
    if(mm[1] !== u.id || !safeName(mm[2])) return send(res, 403, { msg: 'Accès refusé' });
    const f = path.join(mediaDir(u.id), mm[2]);
    if(req.method === 'POST' || req.method === 'PUT'){
      fs.mkdirSync(mediaDir(u.id), { recursive: true });
      fs.writeFileSync(f, await readBody(req));
      return send(res, 200, { Key: 'media/' + u.id + '/' + mm[2] });
    }
    if(req.method === 'GET'){
      if(!fs.existsSync(f)) return send(res, 404, { msg: 'introuvable' });
      return send(res, 200, fs.readFileSync(f, 'utf8'), 'text/plain; charset=utf-8');
    }
  }
  return send(res, 404, { msg: 'Adresse inconnue' });
}

/* ── API de la page d'administration (/admin/api/...) ── */
async function adminRoutes(req, res, url){
  const p = url.pathname.slice('/admin/api'.length), ip = ipOf(req);
  if(p === '/setup' && req.method === 'GET') return send(res, 200, { empty: countUsers() === 0 });
  if(p === '/setup' && req.method === 'POST'){
    if(countUsers() !== 0) return send(res, 403, { msg: 'Déjà configuré' });
    const b = await json(req);
    if(String(b.password || '').length < 8) return send(res, 400, { msg: 'Mot de passe : 8 caractères minimum' });
    const u = createUser(String(b.email || ''), String(b.password), 'admin', 'active', b.name);
    audit(u.email, 'création du premier admin', u.email, '', ip);
    return send(res, 200, issue(u, 'admin', req.headers['user-agent'], ip));
  }
  // Identifiant « admin » : sur ce PC, admin / admin ; depuis Internet, admin + le vrai mot de passe de l'administrateur
  if(p === '/login' && req.method === 'POST'){
    const b = await json(req), id = String(b.user || '').trim().toLowerCase(), pw = String(b.password || ''), key = ip + '|' + id;
    if(tooMany(key)) return send(res, 429, { msg: 'Trop de tentatives, réessayez dans 15 minutes' });
    const u = id === 'admin' ? q("SELECT * FROM users WHERE role='admin' AND status='active' ORDER BY created_at LIMIT 1").get() : q('SELECT * FROM users WHERE email=?').get(id);
    const ok = u && (checkPw(pw, u.pw) || (id === 'admin' && pw === 'admin' && isLocal(req)));
    if(!ok || !isAdmin(u)){ failed(key); audit(id, 'connexion admin refusée', id, '', ip); return send(res, 400, { msg: 'Identifiant ou mot de passe incorrect' }); }
    audit(u.email, 'connexion admin', id, isLocal(req) ? 'sur le PC' : 'à distance', ip);
    return send(res, 200, issue(u, 'admin', req.headers['user-agent'], ip));
  }
  const me = userFromToken(req);
  if(!isAdmin(me)) return send(res, 401, { msg: 'Connexion administrateur requise' });

  if(p === '/overview' && req.method === 'GET'){
    const users = q('SELECT id, email, name, role, status, created_at, last_login FROM users ORDER BY created_at').all().map(x => {
      const kv = q('SELECT COUNT(*) n, COALESCE(SUM(LENGTH(v)),0) sz, MAX(updated_at) last, (SELECT device FROM kv k2 WHERE k2.user_id=kv.user_id ORDER BY updated_at DESC LIMIT 1) dev FROM kv WHERE user_id=?').get(x.id);
      let photos = 0, psz = 0; try{ for(const f of fs.readdirSync(mediaDir(x.id))){ photos++; psz += fs.statSync(path.join(mediaDir(x.id), f)).size; } }catch(e){}
      const sess = q("SELECT ua, ip, MAX(last_seen) seen, COUNT(*) n FROM sessions WHERE user_id=? AND kind='refresh' AND expires_at>? GROUP BY ua, ip ORDER BY seen DESC").all(x.id, now());
      return Object.assign(x, { keys: kv.n, size: kv.sz + psz, lastSync: kv.last, lastDevice: kv.dev, photos, sessions: sess });
    });
    return send(res, 200, { me: me.id, users, lake: lakeState(), roles: ROLES });
  }
  if(p === '/users' && req.method === 'POST'){
    const b = await json(req), email = String(b.email || '').toLowerCase().trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { msg: 'Adresse e-mail invalide' });
    if(String(b.password || '').length < 8) return send(res, 400, { msg: 'Mot de passe : 8 caractères minimum' });
    if(q('SELECT 1 FROM users WHERE email=?').get(email)) return send(res, 400, { msg: 'Ce compte existe déjà' });
    const u = createUser(email, String(b.password), ROLES.includes(b.role) ? b.role : 'commercial', 'active', b.name);
    audit(me.email, 'création de compte', u.email, u.role, ip);
    return send(res, 200, { id: u.id });
  }
  const um = /^\/users\/([0-9a-f-]{36})(\/[a-z-]+)?$/.exec(p);
  if(um){
    const t = q('SELECT * FROM users WHERE id=?').get(um[1]); if(!t) return send(res, 404, { msg: 'Compte introuvable' });
    const act = um[2] || '';
    if(act === '' && req.method === 'PATCH'){
      const b = await json(req);
      if(t.id === me.id && (b.role && b.role !== 'admin' || b.status && b.status !== 'active')) return send(res, 400, { msg: 'Vous ne pouvez pas retirer vos propres droits' });
      if(b.role && ROLES.includes(b.role)) q('UPDATE users SET role=? WHERE id=?').run(b.role, t.id);
      if(b.status && STATUSES.includes(b.status)){ q('UPDATE users SET status=? WHERE id=?').run(b.status, t.id); if(b.status === 'blocked') q('DELETE FROM sessions WHERE user_id=?').run(t.id); }
      if(typeof b.name === 'string') q('UPDATE users SET name=? WHERE id=?').run(b.name.slice(0, 80), t.id);
      audit(me.email, 'modification', t.email, JSON.stringify(b), ip);
      return send(res, 204, '');
    }
    if(act === '/password' && req.method === 'POST'){
      const b = await json(req); if(String(b.password || '').length < 8) return send(res, 400, { msg: 'Mot de passe : 8 caractères minimum' });
      q('UPDATE users SET pw=? WHERE id=?').run(hashPw(String(b.password)), t.id);
      if(t.id !== me.id) q('DELETE FROM sessions WHERE user_id=?').run(t.id);
      audit(me.email, 'nouveau mot de passe', t.email, '', ip);
      return send(res, 204, '');
    }
    if(act === '/sessions' && req.method === 'DELETE'){
      q('DELETE FROM sessions WHERE user_id=?').run(t.id);
      audit(me.email, 'déconnexion de tous les appareils', t.email, '', ip);
      return send(res, 204, '');
    }
    if(act === '/export' && req.method === 'GET'){
      const out = { compte: t.email, exporte_le: new Date().toISOString(), donnees: {} };
      for(const r of q('SELECT k, v FROM kv WHERE user_id=?').all(t.id)) out.donnees[r.k] = r.v;
      audit(me.email, 'export des données', t.email, '', ip);
      res.setHeader('Content-Disposition', 'attachment; filename="tempo-' + t.email.replace(/[^a-z0-9.]/gi, '_') + '.json"');
      return send(res, 200, out);
    }
    if(act === '' && req.method === 'DELETE'){
      if(t.id === me.id) return send(res, 400, { msg: 'Vous ne pouvez pas supprimer votre propre compte' });
      q('DELETE FROM sessions WHERE user_id=?').run(t.id); q('DELETE FROM kv WHERE user_id=?').run(t.id); q('DELETE FROM users WHERE id=?').run(t.id);
      fs.rmSync(mediaDir(t.id), { recursive: true, force: true });
      audit(me.email, 'suppression du compte et des données', t.email, '', ip);
      return send(res, 204, '');
    }
  }
  if(p === '/audit' && req.method === 'GET') return send(res, 200, q('SELECT * FROM audit ORDER BY at DESC LIMIT 300').all());
  if(p === '/lake' && req.method === 'POST'){ const r = snapshot(); audit(me.email, 'copie vers le NAS', '', r.msg, ip); return send(res, r.ok ? 200 : 400, r); }
  return send(res, 404, { msg: 'Adresse inconnue' });
}

/* ── Lake : copie quotidienne vers le NAS ──
   LAKE_DIR/AAAA-MM-JJ/tempo.db (copie cohérente de la base) + LAKE_DIR/media (photos, ajout seulement)
   + LAKE_DIR/AAAA-MM-JJ/<email>/<clé>.json (données lisibles, une fiche par clé). */
let lastLake = { at: 0, ok: false, msg: LAKE_DIR ? 'Pas encore fait' : 'NAS non configuré (LAKE_DIR)' };
function lakeState(){ return Object.assign({ dir: LAKE_DIR }, lastLake); }
function snapshot(){
  if(!LAKE_DIR) return lastLake = { at: now(), ok: false, msg: 'NAS non configuré (LAKE_DIR)' };
  try{
    if(!fs.existsSync(LAKE_DIR)) throw new Error('NAS injoignable : ' + LAKE_DIR);
    const day = new Date().toISOString().slice(0, 10), dir = path.join(LAKE_DIR, day);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, 'tempo.db'); try{ fs.rmSync(tmp); }catch(e){}
    db.exec("VACUUM INTO '" + tmp.replace(/'/g, "''") + "'");
    for(const u of q('SELECT id, email FROM users').all()){
      const ud = path.join(dir, u.email.replace(/[^a-z0-9.@_-]/gi, '_')); fs.mkdirSync(ud, { recursive: true });
      for(const r of q('SELECT k, v, rev, device, updated_at FROM kv WHERE user_id=?').all(u.id))
        fs.writeFileSync(path.join(ud, r.k + '.json'), JSON.stringify({ cle: r.k, revision: r.rev, appareil: r.device, modifie_le: new Date(r.updated_at).toISOString(), valeur: (() => { try{ return JSON.parse(r.v); }catch(e){ return r.v; } })() }, null, 1));
      const src = mediaDir(u.id), dst = path.join(LAKE_DIR, 'media', u.id);
      if(fs.existsSync(src)){ fs.mkdirSync(dst, { recursive: true }); for(const f of fs.readdirSync(src)) if(!fs.existsSync(path.join(dst, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f)); }
    }
    return lastLake = { at: now(), ok: true, msg: 'Copie du ' + day + ' faite' };
  }catch(e){ return lastLake = { at: now(), ok: false, msg: e.message }; }
}
setInterval(() => { if(LAKE_DIR && now() - lastLake.at > 24 * 3600e3) snapshot(); }, 30 * 60e3);
// Ménage : sessions expirées
setInterval(() => q('DELETE FROM sessions WHERE expires_at<?').run(now()), 3600e3);

/* ── L'appli elle-même (copie publiée par publier-app.js dans APP_DIR) ──
   Même adresse que l'API : pas de blocage « réseau local » de Chrome sur les appareils du tailnet. */
const APP_DIR = process.env.APP_DIR || cfg.appDir || path.join(path.dirname(DATA_DIR), 'app');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
let appHeaders = null;      // en-têtes de sécurité repris de vercel.json (CSP, etc.)
function headersFor(p){
  if(!appHeaders){ appHeaders = []; try{ appHeaders = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'vercel.json'), 'utf8').replace(/^﻿/, '')).headers || []; }catch(e){} }
  const out = {};
  // vercel.json n'utilise que « /(.*) » (tout) et des chemins exacts
  for(const h of appHeaders) if(h.source === '/(.*)' || h.source === p) for(const x of h.headers) out[x.key] = x.value;
  return out;
}
function serveStatic(req, res, url){
  if(req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { msg: 'Méthode non permise' });
  let p = decodeURIComponent(url.pathname); if(p === '/') p = '/index.html';
  const f = path.normalize(path.join(APP_DIR, p));
  if(!f.startsWith(path.normalize(APP_DIR + path.sep)) || /[\\/]\./.test(p)) return send(res, 404, { msg: 'Introuvable' });
  let st; try{ st = fs.statSync(f); }catch(e){}
  if(!st || !st.isFile()) return send(res, 404, { msg: 'Introuvable' });
  const h = Object.assign({ 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size,
    'Cache-Control': /\.(html|js|json)$/.test(f) ? 'no-cache' : 'public, max-age=3600' }, headersFor(p === '/index.html' ? '/' : p));
  if(p === '/index.html') Object.assign(h, headersFor('/index.html'));
  res.writeHead(200, h);
  if(req.method === 'HEAD') return res.end();
  fs.createReadStream(f).pipe(res);
}

/* ── Serveur ── */
const ADMIN_HTML = path.join(__dirname, 'admin.html');
const server = http.createServer(async (req, res) => {
  try{
    cors(req, res);
    if(req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if(url.pathname === '/admin' || url.pathname === '/admin/'){
      res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
      return send(res, 200, fs.readFileSync(ADMIN_HTML, 'utf8'), 'text/html; charset=utf-8');
    }
    if(url.pathname.startsWith('/admin/api/')) return await adminRoutes(req, res, url);
    if(url.pathname === '/health') return send(res, 200, { ok: true, users: countUsers() });
    if(/^\/(auth|rest|storage)\/v1\//.test(url.pathname)) return await appRoutes(req, res, url);
    return serveStatic(req, res, url);
  }catch(e){
    console.error(new Date().toISOString(), e);
    if(!res.headersSent) send(res, 500, { msg: 'Erreur serveur' });
  }
});

if(process.argv[2] === '--admin'){
  const [email, pw] = process.argv.slice(3);
  if(!email || !pw || pw.length < 8){ console.log('Usage : node tempo-server.js --admin email motdepasse(8+)'); process.exit(1); }
  const u = q('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
  if(u) q("UPDATE users SET pw=?, role='admin', status='active' WHERE id=?").run(hashPw(pw), u.id);
  else createUser(email, pw, 'admin', 'active');
  console.log('Compte admin prêt : ' + email.toLowerCase()); process.exit(0);
}
server.listen(PORT, () => console.log(`Tempo serveur : http://localhost:${PORT}/admin  (données : ${DATA_DIR}${LAKE_DIR ? ', NAS : ' + LAKE_DIR : ''})`));
