'use strict';
// Cohérence des fiches d'évaluation : clés rattachées à au moins une mesure, sources existantes, grille complète.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const rd = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const E = rd('evaluations.json');
const sources = new Set(rd('sources.json').map(s => s.id));
const cles = new Set();
for (const f of fs.readdirSync(path.join(__dirname, '..', 'data', 'mesures')))
  for (const m of rd('mesures/' + f).mesures) Object.keys(m.parametres || {}).forEach(k => cles.add(k));
let n = 0;
const test = (nom, fn) => { fn(); n++; console.log('ok', n, nom); };
const sourcesDe = o => Array.isArray(o) ? o.flatMap(sourcesDe) : o && typeof o === 'object'
  ? Object.entries(o).flatMap(([k, v]) => k === 'sources' ? v : sourcesDe(v)) : [];

test('identifiants de fiches uniques', () => {
  const ids = E.fiches.map(f => f.id); assert.strictEqual(new Set(ids).size, ids.length);
});
for (const f of E.fiches) {
  test(f.id + ' : rubriques et date', () => {
    for (const r of ['precedents', 'effets', 'couts', 'avis', 'contraintes']) assert.ok(Array.isArray(f[r]) && f[r].length, r);
    for (const r of ['etabli', 'debattu', 'inconnu']) assert.ok(f.connaissance[r], r);
    assert.match(f.verifie_le, /^\d{4}-\d{2}-\d{2}$/);
  });
  test(f.id + ' : chaque clé correspond à un paramètre de mesure', () => {
    assert.ok(f.cles.length);
    for (const k of f.cles) assert.ok(cles.has(k), 'clé sans mesure : ' + k);
  });
  test(f.id + ' : sources existantes', () => {
    const s = sourcesDe(f); assert.ok(s.length);
    for (const i of s) assert.ok(sources.has(i), 'source inconnue : ' + i);
  });
  test(f.id + ' : chaque avis a une organisation, un type et une source', () => {
    for (const a of f.avis) { assert.ok(a.organisation && a.type && a.position); assert.ok(a.sources.length); }
  });
}
console.log(n + ' tests réussis');
