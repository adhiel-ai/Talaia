#!/usr/bin/env node
/*
 * Talaia · eina del banc de preguntes
 * Treballa directament sobre ../index.html (la font de veritat de l'app).
 *
 *   node tools/talaia-bank.js stats
 *   node tools/talaia-bank.js temes
 *   node tools/talaia-bank.js check  noves.json [informe.md]
 *   node tools/talaia-bank.js add    noves.json [--tots] [--sense-rotar]
 *   node tools/talaia-bank.js remove id1,id2,...
 *
 * Format de noves.json: una llista de preguntes
 *   [{ "q": "Enunciat?", "o": ["A", "*Correcta", "C", "D"], "e": "Explicació amb l'article",
 *      "p": "c3coordinacio", "n": 2, "amb": "C", "src": "Flou B3 p. 24" }, ...]
 *   - exactament una opció marcada amb * (la correcta)
 *   - p ha de ser un període existent (mira `temes`); amb es dedueix de p si no hi és
 *   - n = nivell 1 bàsic, 2 mitjà, 3 avançat (per defecte 2)
 *   - flashcards: { "front": "...", "back": "...", "p": "..." } (sense "o")
 *
 * `check` classifica cada pregunta contra el banc (Tc), les targetes (Fc) i les proves
 * oficials: DUPLICADA, CONFLICTE (mateix enunciat, resposta diferent: cal revisar-la
 * contra la norma), SEMBLANT i NOVA. També detecta repetides dins del mateix lot.
 * `add` només afegeix les NOVES (i les SEMBLANTS si passes --tots), mai duplicades ni conflictes.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), FILE = path.join(ROOT, 'index.html');

function litSpan(src, name) {
  const re = new RegExp('[,;\\s]' + name.replace('$', '\\$') + '=([\\[{])', 'g');
  const m = re.exec(src); if (!m) throw new Error('no trobo ' + name);
  if (re.exec(src)) throw new Error('ambigu ' + name);
  let i = m.index + m[0].length - 1, d = 0, s = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (s) { if (c === '\\') { j++; continue; } if (c === s) s = null; continue; }
    if (c === '"' || c === "'" || c === '`') { s = c; continue; }
    if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') { d--; if (d === 0) return [i, j + 1]; }
  }
  throw new Error('literal sense tancar ' + name);
}
const ser = v => JSON.stringify(v).replace(/<\//g, '<\\/').replace(/[\u2028]/g, '\\u2028').replace(/[\u2029]/g, '\\u2029');
function load() {
  const html = fs.readFileSync(FILE, 'utf8');
  const get = n => { const [a, b] = litSpan(html, n); return Function('return ' + html.slice(a, b))(); };
  const D = { html, Tc: get('Tc'), Fc: get('Fc'), PeriodTema: get('PeriodTema'), Temes: get('Temes'), Os: get('Os') };
  const m = html.match(/<script[^>]*id="tl-oficials"[^>]*>([\s\S]*?)<\/script>/);
  D.Of = m ? JSON.parse(m[1]).exams : [];
  return D;
}
function save(D) {
  let html = D.html;
  for (const n of ['Tc', 'Fc']) { const [a, b] = litSpan(html, n); html = html.slice(0, a) + ser(D[n]) + html.slice(b); }
  fs.writeFileSync(FILE, html);
}

/* ---------- normalització i semblança ---------- */
const STOP = new Set(('de la el les els a en i que es per un una del dels al quin quina quins quines qui com on amb no o d l s pot cal ' +
  'segons article art seu seva seus seves aquest aquesta aquests aquestes son sera ha han hi ho li lo ser te tenen fa fan mes pel pels ' +
  'entre sobre quan quant quants quantes any anys des fins tot tots tota totes altre altres guia estudi idees forca').split(' '));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/l·l/g, 'll').replace(/[^a-z0-9 ]/g, ' ');
const toks = s => new Set(norm(s).split(/\s+/).filter(w => (w.length > 2 || /\d/.test(w)) && !STOP.has(w)));
function dice(A, B) { if (!A.size || !B.size) return 0; let k = 0; for (const x of A) if (B.has(x)) k++; return 2 * k / (A.size + B.size); }
function contain(A, B) { if (!A.size || !B.size) return 0; let k = 0; for (const x of A) if (B.has(x)) k++; return k / Math.min(A.size, B.size); }
const ansSame = (a, b) => { const x = norm(a).trim(), y = norm(b).trim(); if (x && x === y) return true; return dice(toks(a), toks(b)) >= 0.6; };

function bankItems(D) {
  const it = [];
  for (const q of D.Tc) it.push({ id: q.id, kind: 'Tc', q: q.q, a: q.o[q.c], o: q.o });
  for (const f of D.Fc) it.push({ id: f.id, kind: 'Fc', q: f.front, a: f.back });
  for (const e of D.Of) for (const q of e.q) it.push({ id: 'of-' + e.k + '-' + q.n, kind: 'oficial ' + e.l, q: q.q, a: q.o[q.c], o: q.o });
  for (const x of it) { x.tq = toks(x.q); x.ta = toks(x.a); x.tqa = toks(x.q + ' ' + x.a); }
  return it;
}
function parseIncoming(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(raw) ? raw : (raw.preguntes || raw.items || []);
  return arr.map((x, i) => {
    const y = Object.assign({}, x); y._i = i + 1;
    if (y.o) {
      const st = y.o.map((o, k) => String(o)[0] === '*' ? k : -1).filter(k => k >= 0);
      if (st.length === 1) { y.o = y.o.map(o => String(o)[0] === '*' ? String(o).slice(1).trim() : String(o).trim()); y.c = st[0]; }
      else if (typeof y.c !== 'number') y._err = 'cal exactament una opció amb *';
      if (y.o.length !== 4) y._err = 'cal tenir 4 opcions';
      y._a = y.o[y.c];
    } else if (y.front) { y.q = y.front; y._a = y.back; }
    else y._err = 'ni opcions (o) ni targeta (front/back)';
    return y;
  });
}
function classify(D, inc) {
  const bank = bankItems(D), out = [];
  const seen = [];
  for (const x of inc) {
    const r = { x, verdict: 'NOVA', best: null, sim: 0, note: '' };
    if (x._err) { r.verdict = 'ERROR'; r.note = x._err; out.push(r); continue; }
    if (x.p && !D.PeriodTema[x.p]) { r.verdict = 'ERROR'; r.note = 'període desconegut: ' + x.p + ' (mira `temes`)'; out.push(r); continue; }
    const tq = toks(x.q), ta = toks(x._a), tqa = toks(x.q + ' ' + x._a);
    let best = null, bs = 0;
    for (const b of bank) {
      const sq = Math.max(dice(tq, b.tq), 0.9 * contain(tq, b.tq));
      const sqa = dice(tqa, b.tqa);
      const s = Math.max(sq, sqa);
      if (s > bs) { bs = s; best = { b, sq, same: ansSame(x._a, b.a) }; }
    }
    r.best = best; r.sim = bs;
    if (best) {
      if (best.sq >= 0.8 && best.same) r.verdict = 'DUPLICADA';
      else if (best.sq >= 0.8 && !best.same && best.b.kind !== 'Fc') { r.verdict = 'CONFLICTE'; r.note = 'enunciat gairebé igual però una altra resposta'; }
      else if (bs >= 0.55) r.verdict = 'SEMBLANT';
    }
    const twin = seen.find(s => dice(s.t, tqa) >= 0.85);
    if (twin) { if (r.verdict === 'NOVA') r.verdict = 'REPETIDA AL LOT'; r.note = (r.note ? r.note + ' · ' : '') + 'repetida dins del lot (igual que la núm. ' + twin.i + ')'; r.twin = twin.i; }
    seen.push({ t: tqa, i: x._i });
    out.push(r);
  }
  return out;
}
function report(res) {
  const by = {}; res.forEach(r => (by[r.verdict] = by[r.verdict] || []).push(r));
  const L = ['# Informe de revisió del lot', '', 'Resum: ' + Object.keys(by).map(k => k + ' ' + by[k].length).join(' · '), ''];
  for (const k of ['ERROR', 'CONFLICTE', 'DUPLICADA', 'REPETIDA AL LOT', 'SEMBLANT', 'NOVA']) {
    if (!by[k]) continue;
    L.push('## ' + k + ' (' + by[k].length + ')', '');
    for (const r of by[k]) {
      L.push('- **#' + r.x._i + '** ' + r.x.q + (r.x._a ? '  \n  ✔ ' + r.x._a : '') + (r.note ? '  \n  ⚠ ' + r.note : ''));
      if (r.best && k !== 'NOVA') L.push('  \n  ↳ ' + r.best.b.id + ' (' + r.best.b.kind + ', ' + Math.round(r.sim * 100) + '%): ' + r.best.b.q + '  \n  ✔ ' + r.best.b.a);
    }
    L.push('');
  }
  return L.join('\n');
}

/* ---------- ordres ---------- */
const [cmd, a1, a2] = process.argv.slice(2);
const flags = new Set(process.argv.slice(2).filter(s => s.startsWith('--')));
const D = load();
const ambOf = p => { const t = D.PeriodTema[p] || ''; return /^[BCD]/.test(t) ? t[0] : 'A'; };

if (cmd === 'stats') {
  const cnt = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
  console.log('Preguntes (Tc):', D.Tc.length, cnt(D.Tc, q => q.amb || 'A'));
  console.log('Targetes (Fc):', D.Fc.length, cnt(D.Fc, q => q.amb || 'A'));
  console.log('Per tema:', cnt(D.Tc, q => D.PeriodTema[q.p] || q.p));
  console.log('Proves oficials:', D.Of.map(e => e.k + ' (' + e.q.length + ')').join(', '));
  const r = q => { const L = q.o.map(o => o.length); const m = Math.max(...L.filter((_, i) => i !== q.c)); return L[q.c] / m; };
  console.log('Correcta = la més llarga:', Math.round(100 * D.Tc.filter(q => r(q) > 1).length / D.Tc.length) + '%', '· >1,3x:', D.Tc.filter(q => r(q) > 1.3).length);
} else if (cmd === 'temes') {
  for (const t of Object.keys(D.Temes)) {
    console.log(D.Temes[t].ca);
    for (const p of Object.keys(D.PeriodTema).filter(p => D.PeriodTema[p] === t)) console.log('   ' + p.padEnd(18) + ((D.Os[p] && D.Os[p].ca) || ''));
  }
} else if (cmd === 'check') {
  const res = classify(D, parseIncoming(a1));
  const md = report(res);
  const outF = a2 || a1.replace(/\.json$/, '') + '.informe.md';
  fs.writeFileSync(outF, md);
  const by = {}; res.forEach(r => by[r.verdict] = (by[r.verdict] || 0) + 1);
  console.log(by); console.log('Informe: ' + outF);
} else if (cmd === 'add') {
  const inc = parseIncoming(a1), res = classify(D, inc);
  const ok = res.filter(r => !r.twin && (r.verdict === 'NOVA' || (flags.has('--tots') && r.verdict === 'SEMBLANT')));
  const used = new Set([...D.Tc.map(q => q.id), ...D.Fc.map(f => f.id)]);
  const nextId = (p, card) => { const pre = (p.match(/^[a-d]\d/) ? p.slice(0, 2) : p.slice(0, 3)) + (card ? 'f' : 'q'); let n = 1; while (used.has(pre + String(n).padStart(2, '0'))) n++; const id = pre + String(n).padStart(2, '0'); used.add(id); return id; };
  let nq = 0, nf = 0;
  for (const r of ok) {
    const x = r.x;
    if (!x.p) { console.log('  sense període, no l\'afegeixo: #' + x._i); continue; }
    const amb = x.amb || ambOf(x.p);
    if (x.o) {
      let o = x.o.slice(), c = x.c;
      if (!flags.has('--sense-rotar') && !o.every(s => /^(Art\. )?\d/.test(s))) { let h = 0; for (const ch of x.q) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const k = h % 4; if (k) { const cor = o[c]; o = o.slice(k).concat(o.slice(0, k)); c = o.indexOf(cor); } }
      const q = { id: x.id && !used.has(x.id) ? x.id : nextId(x.p), p: x.p, n: x.n || 2, q: x.q, o, c, e: x.e || '' };
      used.add(q.id); if (amb !== 'A') q.amb = amb; if (x.src) q.src = x.src;
      D.Tc.push(q); nq++;
    } else {
      const f = { id: x.id && !used.has(x.id) ? x.id : nextId(x.p, true), p: x.p, front: x.front, back: x.back };
      used.add(f.id); if (amb !== 'A') f.amb = amb; D.Fc.push(f); nf++;
    }
  }
  save(D);
  const skipped = res.length - ok.length;
  console.log('Afegides: ' + nq + ' preguntes i ' + nf + ' targetes · descartades/pendents: ' + skipped + ' (mira l\'informe amb `check`)');
} else if (cmd === 'remove') {
  const ids = new Set(String(a1 || '').split(',').filter(Boolean));
  const b = D.Tc.length + D.Fc.length;
  D.Tc = D.Tc.filter(q => !ids.has(q.id)); D.Fc = D.Fc.filter(f => !ids.has(f.id));
  save(D); console.log('Esborrades:', b - D.Tc.length - D.Fc.length);
} else {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 25).join('\n'));
}
