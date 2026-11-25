const C = require('./champs.js'), fs = require('fs'), assert = require('assert');
let n = 0; const t = (nom, f) => { f(); n++; console.log('ok', nom); };
const defauts = () => Object.fromEntries(C.CHAMPS.map(c => [c.id, String(c.val)]));

t('identifiants et clés de profil uniques', () => {
  const ids = C.CHAMPS.map(c => c.id), cles = C.CHAMPS.map(c => c.cle);
  assert.strictEqual(new Set(ids).size, ids.length); assert.strictEqual(new Set(cles).size, cles.length);
});
t('chaque champ a un groupe existant, un libellé, une aide précise et un usage', () => {
  const g = new Set(C.GROUPES.map(x => x.id));
  for (const c of C.CHAMPS) {
    assert(g.has(c.groupe), c.id + ' : groupe inconnu');
    assert(c.label && c.label.length > 3, c.id + ' : libellé');
    assert(c.tip && c.tip.length >= 50, c.id + ' : aide trop courte');
    assert(c.sert && c.sert.length >= 15, c.id + ' : usage manquant');
    assert(['nombre', 'nombre_facultatif', 'oui_non', 'choix'].includes(c.type), c.id + ' : type');
    if (c.type === 'oui_non' || c.type === 'choix') assert(c.options && c.options.length >= 2, c.id + ' : options');
  }
});
t('chaque groupe contient au moins un champ, et les sous-blocs sont contigus', () => {
  for (const g of C.GROUPES) {
    const cs = C.CHAMPS.filter(c => c.groupe === g.id); assert(cs.length, g.id + ' vide');
    const vus = []; for (const c of cs) { if (vus[vus.length - 1] !== c.sous) { assert(!vus.includes(c.sous), g.id + ' : bloc « ' + c.sous + ' » coupé en deux'); vus.push(c.sous); } }
  }
});
t('le patrimoine, l\'immobilier et les plus-values sont dans le même groupe', () => {
  const g = id => C.CHAMPS.find(c => c.id === id).groupe;
  assert.strictEqual(g('pat'), g('immo')); assert.strictEqual(g('pat'), g('rp')); assert.strictEqual(g('pat'), g('pv')); assert.strictEqual(g('pat'), g('her')); assert.strictEqual(g('pat'), g('don'));
});
t('tout ce que le moteur lit dans le profil existe dans le formulaire', () => {
  const src = fs.readFileSync(require('path').join(__dirname, 'engine.js'), 'utf8');
  const lus = new Set([...src.matchAll(/\bp\.([A-Za-z0-9_]+)/g)].map(m => m[1]));
  const cles = new Set(C.CHAMPS.map(c => c.cle));
  const hors = new Set(['carburantEuros']); // champ historique jamais saisi dans le formulaire (valeur 0)
  const manque = [...lus].filter(k => !cles.has(k) && !hors.has(k));
  assert.deepStrictEqual(manque, []);
});
t('candidats cités dans l\'ordre alphabétique à l\'intérieur de chaque liste', () => {
  const noms = ['Arthaud', 'Asselineau', 'Attal', 'Branco', 'Cazeneuve', 'Dupont-Aignan', 'Glucksmann', 'Hollande', 'Kazib', 'Le Maire', 'Le Pen', 'Lisnard', 'Mélenchon', 'Philippe', 'Retailleau', 'Roussel', 'Tondelier', 'Villepin'];
  const ordre = txt => noms.map(x => [txt.indexOf(x), x]).filter(a => a[0] >= 0).sort((a, b) => a[0] - b[0]).map(a => a[1]);
  for (const c of C.CHAMPS) {
    const listes = [...c.sert.matchAll(/\(([^)]*)\)/g)].map(m => m[1]);
    for (const l of listes) for (const clause of l.split(';')) { const o = ordre(clause); assert.deepStrictEqual(o, [...o].sort((a, b) => a.localeCompare(b, 'fr')), c.id + ' : ' + clause); }
  }
});
t('profil par défaut = valeurs d\'avant la refonte', () => {
  const p = C.profil(defauts());
  assert.deepStrictEqual(p, { statut: 'salarie', anneeNaissance: 1985, couple: false, salaireConjointNetMensuel: 0, enfants: 0, naissances: 0,
    salaireNetMensuel: 1800, quotite: 100, heuresSupSemaine: 0, traitementIndiciaire: 0, anneeDebutCarriere: 2008, anneesSansTrimestre: 0, pensionNette: 0, salaireCumulNet: 0,
    aah: false, incapacite80: false, minimaMensuels: 0, boursier: false, bourseMensuelle: 0, niveauEtudes: 'L1L2', jeuneSansDiplomeNiEmploi: false,
    occupation: 'locataire', loyerMensuel: 0, aplMensuelle: 0, prixAchat: 0, patrimoine: 0, patrimoineImmo: 0, patrimoineRP: 0, plusValuesAnnuelles: 0, heritage: 0, donationRecue: 0,
    depensesTvaNormale: 1000, electriciteMois: 90, energieMois: 40, carburantLitres: 80, prixCarburantLitre: 0, abonnementTransportMois: 0, peagesMois: 0, inflationHyp: null,
    moisCongeParental: 0, pensionAlimentaireRecueAn: 0, arretsMaladieAn: 0, depassementsAn: 0 });
});
t('un champ masqué compte comme non renseigné', () => {
  const v = { ...defauts(), statut: 'retraite', net: '2000', pension: '1500', bours: '1', bourse: '300', trait: '2500', hs: '5' };
  const p = C.profil(v);
  assert.strictEqual(p.pensionNette, 1500); assert.strictEqual(p.salaireNetMensuel, 0); assert.strictEqual(p.heuresSupSemaine, 0);
  assert.strictEqual(p.boursier, false); assert.strictEqual(p.bourseMensuelle, 0); assert.strictEqual(p.traitementIndiciaire, 0); assert.strictEqual(p.quotite, 100); assert.strictEqual(p.anneeDebutCarriere, null);
});
t('champs du 25 novembre 2026 : affichage', () => {
  const vis = (id, v) => C.visible(C.CHAMPS.find(c => c.id === id), { ...defauts(), ...v });
  assert.strictEqual(vis('cpar', {}), false); assert.strictEqual(vis('cpar', { nais: '1' }), true); assert.strictEqual(vis('cpar', { nais: '1', statut: 'retraite' }), false);
  assert.strictEqual(vis('palim', {}), false); assert.strictEqual(vis('palim', { enf: '2', statut: 'sans_emploi' }), true);
  assert.strictEqual(vis('arrets', {}), false); assert.strictEqual(vis('arrets', { statut: 'enseignant' }), true);
  assert.strictEqual(vis('depass', {}), true);
});
t('affichage selon la situation', () => {
  const vis = (statut, id, extra) => C.visible(C.CHAMPS.find(c => c.id === id), { ...defauts(), statut, ...extra });
  assert(vis('retraite', 'pension')); assert(!vis('salarie', 'pension')); assert(!vis('retraite', 'net')); assert(vis('etudiant', 'net')); assert(!vis('sans_emploi', 'net'));
  assert(vis('enseignant', 'trait')); assert(!vis('salarie', 'trait')); assert(vis('salarie', 'hs')); assert(!vis('etudiant', 'hs'));
  assert(vis('etudiant', 'bours')); assert(!vis('salarie', 'bours')); assert(vis('sans_emploi', 'sdne')); assert(!vis('retraite', 'sdne'));
  assert(!vis('salarie', 'conj', { couple: '0' })); assert(vis('salarie', 'conj', { couple: '1' }));
  assert(!vis('salarie', 'inc80', { aah: '0' })); assert(vis('salarie', 'inc80', { aah: '1' }));
  assert(!vis('etudiant', 'bourse', { bours: '0' })); assert(vis('etudiant', 'bourse', { bours: '1' }));
});
t('propriétaire : loyer et aide au logement masqués et mis à 0 sans le dire', () => {
  const v = { ...defauts(), loyer: '800', apl: '150' };
  assert.strictEqual(C.profil(v).loyerMensuel, 800);
  const w = { ...v, occ: 'proprietaire' }, vis = id => C.visible(C.CHAMPS.find(c => c.id === id), w);
  assert(!vis('loyer') && !vis('apl') && vis('occ'));
  const p = C.profil(w); assert.strictEqual(p.loyerMensuel, 0); assert.strictEqual(p.aplMensuelle, 0); assert.strictEqual(p.occupation, 'proprietaire');
});
t('le salaire du conjoint est dans les revenus d\'activité', () => {
  assert.strictEqual(C.CHAMPS.find(c => c.id === 'conj').groupe, 'revenus');
});
t('contrôles de cohérence', () => {
  assert(C.CONTROLES.patrimoine({ pat: '500000', immo: '800000' })); assert.strictEqual(C.CONTROLES.patrimoine({ pat: '900000', immo: '800000' }), null);
  assert(C.CONTROLES.carriere({ statut: 'salarie', naiss: '1985', debut: '1990' })); assert.strictEqual(C.CONTROLES.carriere({ statut: 'salarie', naiss: '1985', debut: '2008' }), null);
  assert.strictEqual(C.CONTROLES.carriere({ statut: 'etudiant', naiss: '2005', debut: '2008' }), null);
});
console.log(n, 'tests');
