/* Moteur du simulateur — présidentielle 2027.
   Fonctions pures, sans accès réseau ni stockage : tout se calcule dans le navigateur.
   Chaque effet renvoyé porte : statut (calcule | annonce | non_estimable | aucune_mesure),
   valeur, formule en clair, hypothèses et mesures sources. Rien n'est agrégé en score. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- Règles actuelles (référence), avec leur source ---------- */
  const REF = {
    anneeRef: 2026,
    smic: { brutMensuel: 1867.02, netMensuel: 1477.93, source: 'service-public.gouv.fr (F2300, SMIC au 1er juin 2026)' },
    // Âge légal et durée requise par génération (LFSS 2026 : gel à 62 ans 9 mois jusqu'en janvier 2028)
    retraite: {
      // [génération: [ageLegalAnnees, ageLegalMois, trimestresTauxPlein]]
      parGeneration: {
        1960: [62, 0, 167], 1961: [62, 3, 169], 1962: [62, 6, 169], 1963: [62, 9, 170], 1964: [62, 9, 170],
        1965: [63, 0, 171], 1966: [63, 3, 172], 1967: [63, 6, 172], 1968: [63, 9, 172]
      },
      defaut: [64, 0, 172], // générations 1969 et suivantes
      avant1960: [62, 0, 167],
      source: 'service-public.gouv.fr (A18825), LFSS 2026 — pour 1965, valeurs avril-décembre (les nés au 1er trimestre partent à 62 ans 9 mois)'
    },
    tva: { normal: 20, reduit: 5.5, source: 'taux en vigueur (CGI)' },
    heuresSup: { majoration1: 25, majoration2: 50, seuilMajoration2: 8, plafondIRNet: 7500, reductionCotis: 11.31,
      source: 'Code du travail L3121-36 ; art. 81 quater CGI ; réduction de cotisations salariales de 11,31 %' },
    ratioNetBrut: 1477.93 / 1867.02,
    semainesTravaillees: 46
  };

  /* ---------- Utilitaires ---------- */
  const r2 = n => Math.round(n * 100) / 100;
  const flat = (ms, key) => {
    const out = [];
    for (const m of ms) if (m.parametres && m.parametres[key] !== undefined && m.parametres[key] !== null) out.push({ v: m.parametres[key], m });
    return out;
  };
  const first = (ms, key) => { const f = flat(ms, key); return f.length ? f[0] : null; };
  const moisTexte = mois => {
    const a = Math.floor(mois / 12), m = Math.round(mois - a * 12);
    return a + ' an' + (a > 1 ? 's' : '') + (m ? ' ' + m + ' mois' : '');
  };
  const est = (statut, extra) => Object.assign({ statut, hypotheses: [], mesures: [] }, extra);

  /* ---------- Retraite actuelle ---------- */
  function regleActuelle(anneeNaissance) {
    const R = REF.retraite;
    const t = anneeNaissance < 1960 ? R.avant1960 : (R.parGeneration[anneeNaissance] || R.defaut);
    return { ageMois: t[0] * 12 + t[1], trimestres: t[2] };
  }

  /* ---------- SMIC et salaires ---------- */
  function effetSalaire(p, ms) {
    if (p.statut !== 'salarie') return est('non_estimable', { message: 'Calcul réservé aux salariés.' });
    const q = (p.quotite || 100) / 100;
    const net = p.salaireNetMensuel;
    if (!(net > 0)) return est('non_estimable', { message: 'Renseigne ton salaire net mensuel.' });
    const planchers = []; const hyp = []; const src = [];
    const add = (m, valeur, libelle) => { planchers.push({ valeur, libelle }); src.push(m.id); };
    for (const { v, m } of flat(ms, 'smic_net_mensuel')) add(m, v, 'SMIC net à ' + v + ' €');
    for (const { v, m } of flat(ms, 'smic_brut_mensuel')) { add(m, v * REF.ratioNetBrut, 'SMIC brut à ' + v + ' € (≈ ' + Math.round(v * REF.ratioNetBrut) + ' € net)'); hyp.push('Conversion brut→net au ratio du SMIC actuel (' + r2(REF.ratioNetBrut) + ').'); }
    for (const { v, m } of flat(ms, 'smic_mensuel')) { add(m, v, 'SMIC à ' + v + ' € (brut ou net non précisé, lu comme net)'); hyp.push('Montant lu comme net : la source ne précise pas.'); }
    for (const { v, m } of flat(ms, 'revenu_min_net')) add(m, v, 'aucun revenu sous ' + v + ' € net');
    for (const { v, m } of flat(ms, 'smic_hausse_pct')) { add(m, REF.smic.netMensuel * (1 + v / 100), 'SMIC +' + v + ' % sur le quinquennat'); hyp.push('Hausse appliquée au SMIC net actuel, en euros courants et en fin de quinquennat.'); }
    const hausses = flat(ms, 'hausse_salaires');
    if (!planchers.length && !hausses.length) return est('aucune_mesure', { message: 'Aucune mesure sur le salaire minimum ou la hausse générale des salaires.' });
    const plancher = planchers.length ? Math.max(...planchers.map(x => x.valeur)) * q : 0;
    const hausse = hausses.reduce((s, x) => s + x.v, 0);
    for (const x of hausses) { src.push(x.m.id); hyp.push('Hausse de ' + x.v + ' € supposée nette et appliquée telle quelle : la source ne précise pas brut ou net.'); }
    const apres = Math.max(plancher, net + hausse);
    const gain = Math.max(0, apres - net);
    const libelle = planchers.map(x => x.libelle).concat(hausses.map(x => 'hausse de ' + x.v + ' € des salaires')).join(' ; ');
    if (q !== 1) hyp.push('Plancher proratisé à ' + Math.round(q * 100) + ' % (quotité de travail).');
    hyp.push('Le salaire est supposé augmenter sans effet de rattrapage sur les échelons supérieurs ni baisse d\'emploi.');
    return est('calcule', {
      valeurMensuelle: r2(gain), valeurAnnuelle: r2(gain * 12),
      message: gain > 0 ? '+' + r2(gain) + ' € net par mois' : 'Pas d\'effet direct : ton salaire est déjà au-dessus du plancher proposé.',
      formule: libelle, hypotheses: hyp, mesures: src
    });
  }

  /* ---------- Annonces de gain de salaire net (non personnalisables) ---------- */
  function annoncesGain(ms) {
    const mots = ['gain_moyen_mensuel', 'gain_smic_mensuel', 'gain_2000_mensuel', 'gain_median_mensuel', 'hausse_moyenne_mensuelle_nette', 'hausse_nette_mensuelle_min', 'hausse_nette_mensuelle_max'];
    return ms.filter(m => m.parametres && mots.some(k => m.parametres[k] !== undefined))
      .map(m => ({ intitule: m.intitule, chiffres: m.chiffres, mesure: m.id }));
  }

  /* ---------- Retraite ---------- */
  function effetRetraite(p, ms) {
    if (!(p.anneeNaissance > 1940)) return est('non_estimable', { message: 'Renseigne ton année de naissance.' });
    const act = regleActuelle(p.anneeNaissance);
    const debutBrut = p.anneeDebutCarriere;
    const debut = debutBrut ? debutBrut + (p.anneesSansTrimestre || 0) : null; // années sans trimestre validé repoussent la durée requise
    const hyp = ['Carrière continue à temps plein, sans trimestre manquant ni majoré.'];
    const ageLegalP = first(ms, 'age_legal'), ageMin = first(ms, 'age_minimal'), duree = first(ms, 'duree_cotisation_annees');
    const anticipe = first(ms, 'depart_anticipe_age');
    const src = [];
    const ageCand = ageLegalP && ageLegalP.v ? ageLegalP : ageMin;
    if (!ageCand && !duree) {
      const crit = first(ms, 'critere');
      if (crit) return est('non_estimable', { message: 'Programme fondé sur la durée de cotisation, sans durée chiffrée : calcul impossible.', mesures: [crit.m.id] });
      return est('aucune_mesure', { message: 'Aucune mesure sur l\'âge de départ ni la durée de cotisation.' });
    }
    const requisAnnees = act.trimestres / 4;
    const dateTauxPleinActuel = debut ? debut + requisAnnees : null;
    const departActuel = Math.max(p.anneeNaissance + act.ageMois / 12, dateTauxPleinActuel || 0);
    let ageMoisCand = ageCand ? ageCand.v * 12 : act.ageMois;
    if (ageCand) src.push(ageCand.m.id);
    let dureeCand = duree ? duree.v : requisAnnees;
    if (duree) src.push(duree.m.id);
    let departCand = Math.max(p.anneeNaissance + ageMoisCand / 12, debut ? debut + dureeCand : 0);
    const notes = [];
    if (anticipe && debutBrut && debutBrut - p.anneeNaissance < 20) {
      const dep2 = Math.max(p.anneeNaissance + anticipe.v, debut + 160 / 4);
      if (dep2 < departCand) { departCand = dep2; notes.push('Départ anticipé : carrière commencée avant 20 ans.'); }
    }
    const ageRet = a => a - p.anneeNaissance;
    const deltaMois = Math.round((departCand - departActuel) * 12);
    const ageDepartActuel = ageRet(departActuel) * 12, ageDepartCand = ageRet(departCand) * 12;
    if (p.anneesSansTrimestre) hyp.push(p.anneesSansTrimestre + ' an(s) sans trimestre validé : la durée de cotisation requise est repoussée d\'autant.');
    if (!debut) hyp.push('Année de début de carrière non renseignée : seul l\'âge légal est comparé.');
    const retr = [];
    const retailleauTP = first(ms, 'age_taux_plein');
    if (retailleauTP) { retr.push('Âge du taux plein : ' + retailleauTP.v + ' ans ; départ possible dès ' + ageMin.v + ' ans avec décote.'); src.push(retailleauTP.m.id); }
    hyp.push('Règle cible du programme appliquée à ta génération, sans calendrier de transition (voir la fiche du candidat).');
    return est('calcule', {
      actuel: { ageDepartMois: Math.round(ageDepartActuel), anneeDepart: Math.floor(departActuel), trimestres: act.trimestres },
      programme: { ageDepartMois: Math.round(ageDepartCand), anneeDepart: Math.floor(departCand) },
      deltaMois,
      message: deltaMois === 0 ? 'Pas de changement de ton âge de départ.'
        : (deltaMois > 0 ? 'Départ repoussé d\'environ ' : 'Départ avancé d\'environ ') + moisTexte(Math.abs(deltaMois)) + ' (vers ' + moisTexte(ageDepartCand) + ' au lieu de ' + moisTexte(ageDepartActuel) + ').',
      formule: 'max(âge légal, début de carrière + durée de cotisation requise)', hypotheses: hyp.concat(notes, retr), mesures: src
    });
  }

  /* ---------- TVA et prix ---------- */
  function effetTVA(p, ms) {
    const D = p.depensesTvaNormale || 0, E = p.energieMois || 0, L = p.carburantLitres || 0, El = p.electriciteMois || 0;
    const lignes = []; const hyp = []; const src = [];
    const tx = REF.tva.normal;
    const hausse = first(ms, 'hausse_tva_points'), nouv = first(ms, 'tva_normale_pct');
    if (hausse || nouv) {
      const cible = hausse ? tx + hausse.v : nouv.v;
      const m = hausse ? hausse.m : nouv.m; src.push(m.id);
      if (D > 0) lignes.push({ libelle: 'TVA normale ' + tx + ' % → ' + cible + ' %', mensuel: -D * ((1 + cible / 100) / (1 + tx / 100) - 1) });
      else hyp.push('Dépenses à TVA normale non renseignées.');
      hyp.push('Hausse de TVA supposée entièrement répercutée sur les prix, sans modification de ta consommation.');
    }
    const lePenE = first(ms, 'tva_energie_pct');
    if (lePenE) {
      src.push(lePenE.m.id);
      const base = E + El + (p.carburantEuros || 0);
      if (base > 0) { lignes.push({ libelle: 'TVA énergie ' + tx + ' % → ' + lePenE.v + ' %', mensuel: -base * ((1 + lePenE.v / 100) / (1 + tx / 100) - 1) }); hyp.push('Énergie et carburants supposés taxés à ' + tx + ' % aujourd\'hui (l\'abonnement est au taux réduit, hypothèse simplificatrice).'); }
    }
    const elec = first(ms, 'baisse_facture_elec_pct');
    if (elec && El > 0) { src.push(elec.m.id); lignes.push({ libelle: 'Facture d\'électricité −' + elec.v + ' %', mensuel: El * elec.v / 100 }); }
    const tarif = first(ms, 'baisse_tarif_energie_pct');
    if (tarif && (El > 0 || E > 0)) { src.push(tarif.m.id); lignes.push({ libelle: 'Tarifs électricité et gaz −' + tarif.v + ' %', mensuel: (El + E) * tarif.v / 100 }); }
    const carb = first(ms, 'baisse_carburant_cts');
    if (carb && L > 0) { src.push(carb.m.id); lignes.push({ libelle: 'Carburant −' + carb.v + ' cts/L sur ' + L + ' L/mois', mensuel: L * carb.v / 100 }); hyp.push('Baisse du prix supposée intégralement visible à la pompe.'); }
    const hol = first(ms, 'tva_reduite_energie_pct');
    const nonCalc = [];
    if (hol) { src.push(hol.m.id); nonCalc.push('TVA réduite à ' + hol.v + ' % sur l\'énergie et les produits de première nécessité : le texte ne dit pas quels produits sont concernés, donc non calculée.'); }
    for (const [k, txt] of [['prix_carburant_max', 'Prix maximal du carburant : dépend du prix du marché, non calculé.'], ['taxe_flottante_carburants', 'Taxe flottante sur les carburants : dépend du cours du pétrole, non calculée.'], ['tva_sociale', 'TVA sociale : taux non précisé, non calculée.']]) {
      const f = first(ms, k); if (f) { src.push(f.m.id); nonCalc.push(txt); }
    }
    if (!lignes.length && !nonCalc.length) return est('aucune_mesure', { message: 'Aucune mesure sur la TVA ou les prix de l\'énergie.' });
    if (!lignes.length) return est('non_estimable', { message: nonCalc.join(' '), mesures: src });
    const total = lignes.reduce((s, l) => s + l.mensuel, 0);
    return est('calcule', {
      valeurMensuelle: r2(total), valeurAnnuelle: r2(total * 12), lignes: lignes.map(l => ({ libelle: l.libelle, mensuel: r2(l.mensuel) })),
      message: (total >= 0 ? '+' : '') + r2(total) + ' € par mois sur tes dépenses' + (nonCalc.length ? ' (hors : ' + nonCalc.length + ' mesure non calculée)' : ''),
      formule: 'dépense × (nouveau taux ÷ ancien taux − 1)', hypotheses: hyp.concat(nonCalc), mesures: src
    });
  }

  /* ---------- Heures supplémentaires ---------- */
  function effetHS(p, ms) {
    const mel1 = first(ms, 'majoration_hs_1'), mel2 = first(ms, 'majoration_hs_2');
    const autres = [['hs_exonerees', 'Exonération d\'impôt et de charges des heures au-delà de 35 h'], ['hs_defiscalisees', 'Défiscalisation des heures supplémentaires'], ['exoneration_salariale_ir_au_dela_h_hebdo', 'Exonération salariale et d\'impôt au-delà de 35 h'], ['exoneration_cotisations', 'Exonération de cotisations'], ['hausse_salaire_exoneree_pct', 'Exonération de charges sur les hausses de salaire']];
    const hits = autres.map(([k, t]) => [first(ms, k), t]).filter(x => x[0]);
    if (!mel1 && !hits.length) return est('aucune_mesure', { message: 'Aucune mesure sur les heures supplémentaires.' });
    const h = p.heuresSupSemaine || 0;
    if (mel1) {
      const tauxHoraireBrut = (p.salaireNetMensuel / REF.ratioNetBrut) / 151.67;
      const seuil1 = 4;
      const heuresA50Cand = Math.max(0, h - seuil1);
      const heuresA50Actuel = Math.max(0, h - REF.heuresSup.seuilMajoration2);
      const extra = (heuresA50Cand - heuresA50Actuel) * tauxHoraireBrut * (mel2.v - mel1.v) / 100 * REF.semainesTravaillees;
      const hyp = ['Taux horaire brut estimé à partir de ton salaire net (ratio net/brut du SMIC).', 'Basé sur ' + REF.semainesTravaillees + ' semaines travaillées par an.', 'Montant brut, avant cotisations et impôt.'];
      return est('calcule', { valeurAnnuelle: r2(extra), valeurMensuelle: r2(extra / 12),
        message: h > 0 ? '+' + r2(extra) + ' € brut par an' : 'Renseigne tes heures supplémentaires pour voir l\'effet.',
        formule: 'majoration à ' + mel2.v + ' % dès la ' + (seuil1 + 1) + 'e heure supplémentaire au lieu de la ' + (REF.heuresSup.seuilMajoration2 + 1) + 'e', hypotheses: hyp, mesures: [mel1.m.id] });
    }
    return est('non_estimable', {
      message: 'Le dispositif existe déjà (impôt exonéré jusqu\'à ' + REF.heuresSup.plafondIRNet + ' € nets par an et réduction de cotisations de ' + REF.heuresSup.reductionCotis + ' %) : l\'effet du programme dépend de précisions qui manquent.',
      mesures: hits.map(x => x[0].m.id), hypotheses: hits.map(x => x[1]) });
  }


  /* ---------- Impôt sur le revenu (barème 2026, revenus 2025) ---------- */
  Object.assign(REF, {
    ir: { tranches: [[11600, 0], [29579, 0.11], [84577, 0.30], [181917, 0.41], [Infinity, 0.45]],
      plafondDemiPart: 1807, plafondParentIsole: 4262, decote: { seul: [1982, 897], couple: [3277, 1483], taux: 0.4525 },
      abattementSalaires: 0.10,
      source: 'service-public.gouv.fr (F1419), loi de finances pour 2026 : barème revalorisé de 0,9 % ; plafond du quotient familial et décote selon BOFiP (avril 2026)' },
    succession: { abattementLigneDirecte: 100000,
      bareme: [[8072, 0.05], [12109, 0.10], [15932, 0.15], [552324, 0.20], [902838, 0.30], [1805677, 0.40], [Infinity, 0.45]],
      source: 'impots.gouv.fr, droits de succession en ligne directe' },
    fraisAcquisitionAncien: 0.075, plancherIFI: 1300000
  });
  const progressif = (x, bareme) => { let prev = 0, tot = 0; for (const [lim, t] of bareme) { if (x > prev) tot += (Math.min(x, lim) - prev) * t; prev = lim; } return tot; };
  function irFoyer(p) {
    const couple = !!p.couple, enf = p.enfants || 0;
    const rev = ((p.salaireNetMensuel || 0) + (couple ? (p.salaireConjointNetMensuel || 0) : 0)) * 12 * (1 - REF.ir.abattementSalaires);
    const base = couple ? 2 : 1;
    let parts = base; for (let i = 1; i <= enf; i++) parts += i <= 2 ? 0.5 : 1;
    const brutAvec = progressif(rev / parts, REF.ir.tranches) * parts;
    const brutBase = progressif(rev / base, REF.ir.tranches) * base;
    const demis = (parts - base) * 2;
    let maxAvantage = demis * REF.ir.plafondDemiPart;
    if (!couple && enf > 0) maxAvantage += REF.ir.plafondParentIsole - REF.ir.plafondDemiPart; // parent isolé : 1re demi-part plafonnée à 4 262 €
    let brut = Math.max(brutAvec, brutBase - maxAvantage);
    const [seuil, forf] = couple ? REF.ir.decote.couple : REF.ir.decote.seul;
    if (brut < seuil) brut = Math.max(0, brut - (forf - REF.ir.decote.taux * brut));
    return { impot: Math.max(0, Math.round(brut)), revenuImposable: Math.round(rev), parts };
  }
  const HYP_IR = ['Revenu net imposable estimé à 90 % du salaire net annuel (abattement de 10 %), sans autre revenu, déduction ni réduction d\'impôt.'];

  function effetIR(p, ms) {
    const hits = [];
    const lm = first(ms, 'famille_nombreuse_exoneree_ir'), lp = flat(ms, 'exoneration_ir').filter(x => x.m.parametres.age_max)[0] || null;
    if (!lm && !lp) return est('aucune_mesure', { message: 'Aucune mesure simulable sur l\'impôt sur le revenu.' });
    if (!(p.salaireNetMensuel > 0)) return est('non_estimable', { message: 'Renseigne ton salaire net mensuel.' });
    const ir = irFoyer(p), src = [], hyp = HYP_IR.slice();
    let gain = 0, lib = [];
    if (lm) { src.push(lm.m.id); if ((p.enfants || 0) >= lm.v) { gain = ir.impot; lib.push('impôt supprimé pour les familles d\'au moins ' + lm.v + ' enfants'); } }
    if (lp) { src.push(lp.m.id); const age = REF.anneeRef + 1 - p.anneeNaissance;
      if (age < lp.m.parametres.age_max && !p.couple) { gain = ir.impot; lib.push('exonération pour les moins de ' + lp.m.parametres.age_max + ' ans'); hyp.push('Âge calculé en 2027. Mesure du programme de 2022, non confirmée pour 2027 ; lue comme une exonération totale.'); }
      else if (age < lp.m.parametres.age_max) return est('non_estimable', { message: 'Foyer en couple : l\'application de l\'exonération au foyer n\'est pas précisée.', mesures: src }); }
    if (!lib.length) return est('calcule', { valeurAnnuelle: 0, valeurMensuelle: 0, message: 'Pas d\'effet pour ta situation.', mesures: src });
    hyp.push('Ton impôt actuel estimé : ' + ir.impot + ' € par an (' + ir.parts + ' parts).');
    return est('calcule', { valeurAnnuelle: ir.impot, valeurMensuelle: r2(ir.impot / 12), message: ir.impot > 0 ? '+' + ir.impot + ' € par an (impôt estimé supprimé)' : 'Tu ne paies pas d\'impôt estimé : pas d\'effet.',
      formule: lib.join(' ; '), hypotheses: hyp, mesures: src });
  }

  /* ---------- Famille ---------- */
  function effetFamille(p, ms) {
    const nais = p.naissances || 0, src = [], lignes = [], hyp = [];
    const cap = first(ms, 'capital_naissance'), baby = first(ms, 'montant_par_naissance');
    const alloc = first(ms, 'montant_mensuel'), aah = first(ms, 'aah_hausse');
    let unique = 0;
    if (cap && nais > 0) { unique += cap.v * nais; src.push(cap.m.id); lignes.push(nais + ' × ' + cap.v + ' € de capital, bloqué jusqu\'à la retraite'); }
    if (baby && nais > 0) { unique += baby.v * nais; src.push(baby.m.id); lignes.push(nais + ' × ' + baby.v + ' € placés à la naissance'); }
    let mensuel = 0;
    if (aah && p.aah) { mensuel = aah.v; src.push(aah.m.id); lignes.push('hausse de l\'AAH de ' + aah.v + ' €/mois'); hyp.push('Hausse de l\'AAH lue comme mensuelle et nette.'); }
    if (unique > 0) hyp.push('Le capital est placé et non versé : tu n\'en disposes pas immédiatement.');
    if (mensuel || unique) {
      const parts = []; if (mensuel) parts.push('+' + mensuel + ' € par mois d\'AAH'); if (unique) parts.push('+' + unique.toLocaleString('fr-FR') + ' € placés pour les enfants à naître (épargne, pas du revenu disponible)');
      return est('calcule', { valeurMensuelle: mensuel, valeurAnnuelle: mensuel * 12, valeurUnique: unique, message: parts.join(' ; '), formule: lignes.join(' ; '), hypotheses: hyp, mesures: src });
    }
    if (alloc && ((p.enfants || 0) > 0 || nais > 0)) return est('indication', { message: 'Allocation familiale unique de ' + alloc.v + ' €/mois dès le premier enfant, dégressive selon les revenus. Barème non précisé : ton montant ne peut pas être calculé.', mesures: [alloc.m.id] });
    return est('aucune_mesure', { message: 'Aucune mesure calculable sur la famille pour ta situation.' });
  }

  /* ---------- Logement ---------- */
  function effetLogement(p, ms) {
    const apl = first(ms, 'apl_hausse_pct'), notaire = first(ms, 'frais_notaire_supprimes');
    const src = [], lignes = [], hyp = [];
    let mensuel = 0, unique = 0;
    if (apl && p.aplMensuelle > 0) { mensuel += p.aplMensuelle * apl.v / 100; src.push(apl.m.id); lignes.push('APL +' + apl.v + ' %'); }
    if (notaire && p.prixAchat > 0) {
      const age = REF.anneeRef + 1 - p.anneeNaissance, amax = notaire.m.parametres.age_max_acheteur;
      src.push(notaire.m.id);
      if (age < amax) { unique += p.prixAchat * REF.fraisAcquisitionAncien; lignes.push('frais de notaire supprimés (' + Math.round(REF.fraisAcquisitionAncien * 1000) / 10 + ' % du prix)'); hyp.push('Frais estimés à ' + REF.fraisAcquisitionAncien * 100 + ' % du prix d\'un logement ancien ; la mesure ne précise pas si les droits de mutation sont inclus. Âge calculé en 2027.'); }
    }
    if (!mensuel && !unique) return est('aucune_mesure', { message: 'Aucune mesure calculable sur le logement pour ta situation.' });
    const parts = [];
    if (mensuel) parts.push('+' + r2(mensuel) + ' € par mois d\'APL');
    if (unique) parts.push('jusqu\'à ' + Math.round(unique).toLocaleString('fr-FR') + ' € économisés à l\'achat');
    return est('calcule', { valeurMensuelle: r2(mensuel), valeurAnnuelle: r2(mensuel * 12), valeurUnique: Math.round(unique), message: parts.join(' ; '), formule: lignes.join(' ; '), hypotheses: hyp, mesures: src });
  }

  /* ---------- Patrimoine et succession ---------- */
  function effetPatrimoine(p, ms) {
    const succ = first(ms, 'exoneration_succession_ligne_directe_eur'), isf = first(ms, 'isf_retabli'), herit = first(ms, 'seuil_heritage_meur');
    const src = [], hyp = []; let gain = 0, calc = false; const textes = [];
    if (succ && p.heritage > 0) {
      const act = progressif(Math.max(0, p.heritage - REF.succession.abattementLigneDirecte), REF.succession.bareme);
      const cand = progressif(Math.max(0, p.heritage - succ.v), REF.succession.bareme);
      gain = act - cand; calc = true; src.push(succ.m.id);
      hyp.push('Part reçue en ligne directe, abattement actuel de 100 000 €. La mesure est lue comme un abattement de ' + succ.v.toLocaleString('fr-FR') + ' € par héritier.');
      textes.push(gain > 0 ? 'Droits de succession ramenés de ' + Math.round(act).toLocaleString('fr-FR') + ' € à ' + Math.round(cand).toLocaleString('fr-FR') + ' €' : 'Pas d\'effet : ton héritage reste sous le seuil.');
    }
    const ind = [];
    if (isf && p.patrimoine >= REF.plancherIFI) { src.push(isf.m.id); ind.push('Rétablissement de l\'ISF : avec un patrimoine net de ' + Math.round(p.patrimoine).toLocaleString('fr-FR') + ' €, tu pourrais être concerné ; seuil et taux ne sont pas relevés de façon uniforme, donc non calculé.'); }
    if (herit && p.heritage > herit.v * 1e6) { src.push(herit.m.id); ind.push('Taxation accrue des héritages supérieurs à ' + herit.v + ' M€ : ton héritage serait concerné ; taux non précisé.'); }
    if (calc) return est('calcule', { valeurUnique: Math.round(gain), valeurAnnuelle: 0, message: textes.join(' ') + (ind.length ? ' — ' + ind.join(' ') : ''), formule: 'droits(héritage − abattement actuel) − droits(héritage − seuil du candidat)', hypotheses: hyp, mesures: src, indications: ind });
    if (ind.length) return est('indication', { message: ind.join(' '), mesures: src });
    return est('aucune_mesure', { message: 'Aucune mesure calculable sur le patrimoine pour ta situation.' });
  }

  /* ---------- Orchestration ---------- */
  const DOMAINES = [
    { id: 'salaire', titre: 'Salaire minimum et salaires', fn: effetSalaire },
    { id: 'retraite', titre: 'Âge de départ à la retraite', fn: effetRetraite },
    { id: 'tva', titre: 'TVA et prix de l\'énergie', fn: effetTVA },
    { id: 'hs', titre: 'Heures supplémentaires', fn: effetHS },
    { id: 'ir', titre: 'Impôt sur le revenu', fn: effetIR },
    { id: 'famille', titre: 'Famille et naissance', fn: effetFamille },
    { id: 'logement', titre: 'Logement', fn: effetLogement },
    { id: 'patrimoine', titre: 'Patrimoine et succession', fn: effetPatrimoine }
  ];

  function simuler(profil, candidats, mesuresParCandidat) {
    const res = [];
    for (const c of candidats) {
      const ms = (mesuresParCandidat[c.id] || {}).mesures || [];
      const effets = {};
      for (const d of DOMAINES) effets[d.id] = d.fn(profil, ms);
      res.push({ id: c.id, nom: c.nom, annonces: annoncesGain(ms), effets, nbMesures: ms.length });
    }
    res.sort((a, b) => a.id.localeCompare(b.id, 'fr')); // ordre alphabétique du nom de famille (les identifiants sont construits dessus)
    return res;
  }

  return { REF, DOMAINES, simuler, irFoyer, effetIR, effetFamille, effetLogement, effetPatrimoine, regleActuelle, effetSalaire, effetRetraite, effetTVA, effetHS, annoncesGain };
});
