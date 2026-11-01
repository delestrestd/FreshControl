/* Publie l'appli sur le serveur maison : copie les fichiers suivis par git (comme Vercel),
   sauf ceux de .vercelignore et le dossier server/, vers APP_DIR (D:\TEMPO-SERVEUR\app).
   À relancer après chaque mise à jour de l'appli :  node server/publier-app.js */
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const repo = path.resolve(__dirname, '..');
let cfg = {}; try{ cfg = JSON.parse(fs.readFileSync('D:\\TEMPO-SERVEUR\\config.json', 'utf8').replace(/^\uFEFF/, '')); }catch(e){}
const dest = process.env.APP_DIR || cfg.appDir || 'D:\\TEMPO-SERVEUR\\app';

// Motifs .vercelignore (sous-ensemble : *.ext et dossier/)
const ign = fs.readFileSync(path.join(repo, '.vercelignore'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const ignored = f => f.startsWith('server/') || ign.some(p => p.endsWith('/') ? f.startsWith(p) : p.startsWith('*.') ? f.toLowerCase().endsWith(p.slice(1).toLowerCase()) : f === p);

const files = execSync('git ls-files', { cwd: repo, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).filter(f => !ignored(f));
fs.rmSync(dest, { recursive: true, force: true });
for(const f of files){
  const to = path.join(dest, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(repo, f), to);
}
console.log(files.length + ' fichiers publiés dans ' + dest);
