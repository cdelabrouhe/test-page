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
    smic: { brutMensuel: 1896.89, netMensuel: 1502, source: 'SMIC annoncé au 1er décembre 2026 (+1,6 % : 1 502 € net, LCP) ; au 1er juin 2026 : 1 867,02 € brut et 1 477,93 € net (service-public.gouv.fr)' },
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
    heuresSup: { majoration1: 25, majoration2: 50, seuilMajoration2: 8, plafondIRNet: 7500, reductionCotis: 11.31, tauxCsgCrds: 0.0953,
      source: 'Code du travail L3121-36 ; art. 81 quater CGI (plafond de 7 500 € ; le doublement voté en première lecture du PLF 2027 n\'est pas en vigueur) ; réduction de cotisations salariales de 11,31 % ; CSG-CRDS 9,7 % sur 98,25 % du brut' },
    ratioNetBrut: 1477.93 / 1867.02,
    semainesTravaillees: 46
  };

  const ACTIFS = ['salarie', 'fonctionnaire', 'enseignant', 'recherche'];
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
    if (!ACTIFS.includes(p.statut)) return est('aucune_mesure', { message: 'Calcul réservé aux personnes qui travaillent.' });
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
    if (p.statut === 'retraite') return est('aucune_mesure', { message: 'Déjà à la retraite : voir les mesures sur les pensions.' });
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
    const gaz = first(ms, 'baisse_gaz_pct');
    if (gaz && E > 0) { src.push(gaz.m.id); lignes.push({ libelle: 'Prix du gaz −' + gaz.v + ' %', mensuel: E * gaz.v / 100 }); }
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
    if (!ACTIFS.includes(p.statut)) return est('aucune_mesure', { message: 'Heures supplémentaires : réservé aux personnes qui travaillent.' });
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
    // Mesures d'exonération : le salarié ne paie déjà aucune cotisation vieillesse sur ses heures sup (réduction de 11,31 %),
    // seule reste la CSG-CRDS. L'effet calculable porte donc sur l'impôt de la part au-delà du plafond de 7 500 € nets.
    const exo = hits.filter(([x]) => x.m.parametres.hausse_salaire_exoneree_pct === undefined);
    if (!exo.length) return est('non_estimable', { message: 'Exonération de charges sur les hausses de salaire : elle dépend de ce que décide l\'employeur, effet individuel non calculable.', mesures: hits.map(x => x[0].m.id) });
    if (!(p.salaireNetMensuel > 0)) return est('non_estimable', { message: 'Renseigne ton salaire net mensuel.', mesures: exo.map(x => x[0].m.id) });
    if (!(h > 0)) return est('calcule', { valeurAnnuelle: 0, valeurMensuelle: 0, message: 'Renseigne tes heures supplémentaires pour voir l\'effet.', mesures: exo.map(x => x[0].m.id), hypotheses: [] });
    const hsNet = hsNetAnnuel(p.salaireNetMensuel, h);
    const m0 = exo[0][0].m, plafH = m0.parametres.plafond_h;
    const hsHeuresAn = h * REF.semainesTravaillees;
    const exonereCand = plafH ? hsNet * Math.min(1, plafH / hsHeuresAn) : hsNet;
    const imposableAct = Math.max(0, hsNet - REF.heuresSup.plafondIRNet), imposableCand = Math.max(0, hsNet - Math.max(exonereCand, REF.heuresSup.plafondIRNet));
    const irAct = irFoyer(p, { revenuAnnuelSupp: imposableAct }).impot, irCand = irFoyer(p, { revenuAnnuelSupp: imposableCand }).impot;
    const gain = Math.max(0, irAct - irCand);
    const hyp = ['Heures sup nettes estimées à ' + Math.round(hsNet).toLocaleString('fr-FR') + ' € par an : ' + h + ' h par semaine sur ' + REF.semainesTravaillees + ' semaines, majorées de 25 % jusqu\'à 8 h puis 50 %, au taux horaire net tiré de ton salaire.',
      'Aujourd\'hui : impôt exonéré jusqu\'à ' + REF.heuresSup.plafondIRNet.toLocaleString('fr-FR') + ' € nets par an et aucune cotisation salariale vieillesse (réduction de ' + String(REF.heuresSup.reductionCotis).replace('.', ',') + ' %) ; la CSG-CRDS reste due.',
      'Les cotisations patronales supprimées par certains programmes ne changent pas directement ta paie.'].concat(HYP_IR);
    if (plafH) hyp.push('Exonération limitée à ' + plafH + ' heures par an.');
    if (m0.parametres.csg_crds_maintenues) hyp.push('Le programme précise que la CSG et la CRDS restent dues.');
    else { const csg = hsNet / (1 - REF.heuresSup.tauxCsgCrds) * REF.heuresSup.tauxCsgCrds; hyp.push('Si la CSG-CRDS était aussi supprimée (le texte dit « charges » sans préciser), il faudrait ajouter environ ' + Math.round(csg).toLocaleString('fr-FR') + ' € par an.'); }
    if (m0.parametres.duree_annuelle_h) hyp.push('Le passage à ' + m0.parametres.duree_annuelle_h + ' h annuelles n\'est pas pris en compte : son effet sur la paie dépend des accords d\'entreprise.');
    return est('calcule', { valeurAnnuelle: Math.round(gain), valeurMensuelle: r2(gain / 12),
      message: gain > 0 ? '+' + Math.round(gain).toLocaleString('fr-FR') + ' € par an d\'impôt en moins sur tes heures sup' : 'Pas d\'effet : tes heures sup restent sous le plafond d\'exonération actuel (' + REF.heuresSup.plafondIRNet.toLocaleString('fr-FR') + ' € nets) ou tu n\'es pas imposable.',
      formule: 'impôt actuel (heures sup imposées au-delà de 7 500 €) − impôt avec heures sup exonérées', hypotheses: hyp, mesures: exo.map(x => x[0].m.id) });
  }
  function hsNetAnnuel(netMensuel, h) {
    const tauxNet = netMensuel / 151.67;
    return (Math.min(h, REF.heuresSup.seuilMajoration2) * (1 + REF.heuresSup.majoration1 / 100) + Math.max(0, h - REF.heuresSup.seuilMajoration2) * (1 + REF.heuresSup.majoration2 / 100)) * tauxNet * REF.semainesTravaillees;
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
  function irFoyer(p, opts) {
    const plafDemi = (opts && opts.plafondDemiPart) || REF.ir.plafondDemiPart;
    const couple = !!p.couple, enf = p.enfants || 0;
    const supp = (opts && opts.revenuAnnuelSupp) || 0; // revenu net annuel imposable en plus (ex. heures sup au-delà du plafond)
    const rev = (((p.salaireNetMensuel || 0) + (couple ? (p.salaireConjointNetMensuel || 0) : 0)) * 12 + supp) * (1 - REF.ir.abattementSalaires);
    const base = couple ? 2 : 1;
    let parts = base; for (let i = 1; i <= enf; i++) parts += i <= 2 ? 0.5 : 1;
    const brutAvec = progressif(rev / parts, REF.ir.tranches) * parts;
    const brutBase = progressif(rev / base, REF.ir.tranches) * base;
    const demis = (parts - base) * 2;
    let maxAvantage = demis * plafDemi;
    if (!couple && enf > 0) maxAvantage += Math.max(0, REF.ir.plafondParentIsole - REF.ir.plafondDemiPart); // parent isolé : 1re demi-part plafonnée à 4 262 €
    let brut = Math.max(brutAvec, brutBase - maxAvantage);
    const [seuil, forf] = couple ? REF.ir.decote.couple : REF.ir.decote.seul;
    if (brut < seuil) brut = Math.max(0, brut - (forf - REF.ir.decote.taux * brut));
    return { impot: Math.max(0, Math.round(brut)), revenuImposable: Math.round(rev), parts };
  }
  const HYP_IR = ['Revenu net imposable estimé à 90 % du salaire net annuel (abattement de 10 %), sans autre revenu, déduction ni réduction d\'impôt.'];

  function effetIR(p, ms) {
    const hits = [];
    const qf = first(ms, 'plafond_demi_part');
    const lm = first(ms, 'famille_nombreuse_exoneree_ir'), lp = flat(ms, 'exoneration_ir').filter(x => x.m.parametres.age_max)[0] || null;
    if (!lm && !lp && !qf) return est('aucune_mesure', { message: 'Aucune mesure simulable sur l\'impôt sur le revenu.' });
    if (!(p.salaireNetMensuel > 0)) return est('non_estimable', { message: 'Renseigne ton salaire net mensuel.' });
    const ir = irFoyer(p), src = [], hyp = HYP_IR.slice();
    let gain = 0, lib = [];
    if (lm) { src.push(lm.m.id); if ((p.enfants || 0) >= lm.v) { gain = ir.impot; lib.push('impôt supprimé pour les familles d\'au moins ' + lm.v + ' enfants'); } }
    if (lp) { src.push(lp.m.id); const age = REF.anneeRef + 1 - p.anneeNaissance;
      if (age < lp.m.parametres.age_max && !p.couple) { gain = ir.impot; lib.push('exonération pour les moins de ' + lp.m.parametres.age_max + ' ans'); hyp.push('Âge calculé en 2027. Mesure du programme de 2022, non confirmée pour 2027 ; lue comme une exonération totale.'); }
      else if (age < lp.m.parametres.age_max) return est('non_estimable', { message: 'Foyer en couple : l\'application de l\'exonération au foyer n\'est pas précisée.', mesures: src }); }
    if (qf && (p.enfants || 0) > 0) { src.push(qf.m.id); const ir2 = irFoyer(p, { plafondDemiPart: qf.v }); const g = Math.max(0, ir.impot - ir2.impot); if (g > 0) { gain = Math.max(gain, g); lib.push('plafond du quotient familial relevé à ' + qf.v + ' € par demi-part'); hyp.push('Seul le plafond du quotient familial est modifié ; les autres paramètres du barème sont inchangés.'); } else src.push(qf.m.id); }
    if (!lib.length) return est('calcule', { valeurAnnuelle: 0, valeurMensuelle: 0, message: 'Pas d\'effet pour ta situation.', mesures: src });
    hyp.push('Ton impôt actuel estimé : ' + ir.impot + ' € par an (' + ir.parts + ' parts).');
    return est('calcule', { valeurAnnuelle: Math.round(gain), valeurMensuelle: r2(gain / 12), message: gain > 0 ? '+' + Math.round(gain).toLocaleString('fr-FR') + ' € par an d\'impôt en moins (' + lib.join(' ; ') + ')' : 'Pas d\'effet : ton impôt estimé est déjà nul ou non modifié.',
      formule: lib.join(' ; '), hypotheses: hyp, mesures: src });
  }

  /* ---------- Famille ---------- */
  function effetFamille(p, ms) {
    const nais = p.naissances || 0, src = [], lignes = [], hyp = [];
    const cap = first(ms, 'capital_naissance'), baby = first(ms, 'montant_par_naissance');
    const alloc = first(ms, 'montant_mensuel');
    let unique = 0;
    if (cap && nais > 0) { unique += cap.v * nais; src.push(cap.m.id); lignes.push(nais + ' × ' + cap.v + ' € de capital, bloqué jusqu\'à la retraite'); }
    if (baby && nais > 0) { unique += baby.v * nais; src.push(baby.m.id); lignes.push(nais + ' × ' + baby.v + ' € placés à la naissance'); }
    const mensuel = 0; // l'AAH est traitée dans le domaine « minima sociaux, handicap, jeunes »
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

  /* ---------- Références 2026 : minima, pensions, fonction publique ---------- */
  Object.assign(REF, {
    aah: { max: 1041.59, source: 'AAH à taux plein au 1er avril 2026 (décret n° 2026-229 du 30 mars 2026)' },
    rsa: { seul: 651.69, source: 'RSA personne seule au 1er avril 2026 (décret n° 2026-220 du 30 mars 2026)' },
    aspa: { seul: 1043.59, source: 'ASPA personne seule au 1er janvier 2026 (Cnav)' },
    inflation: { parAnnee: { 2027: 1.9, 2028: 1.6 }, defaut: 1.6,
      source: 'Banque de France, projections du 15 septembre 2026 (1,9 % en 2027, 1,6 % en 2028) ; 1,6 % prolongé ensuite par hypothèse' },
    pointIndice: { mensuel: 4.92278, source: 'valeur mensuelle du point, gelée depuis le 1er juillet 2023 (DGAFP)' },
    retenuesFP: { pensionCivile: 0.111, csgCrds: 0.0953, source: 'retenue pour pension civile 11,10 % ; CSG-CRDS 9,7 % sur 98,25 % du traitement' },
    fraisInscription: { licence: 178, master: 255, source: 'droits d\'inscription 2026-2027 (service-public.gouv.fr, universités) ; boursiers exonérés' }
  });
  const age2027 = p => REF.anneeRef + 1 - p.anneeNaissance;
  const fmt = n => Math.round(n).toLocaleString('fr-FR');
  const inflationAn = (annee, p) => (typeof p.inflationHyp === 'number' && p.inflationHyp >= 0) ? p.inflationHyp : (REF.inflation.parAnnee[annee] ?? REF.inflation.defaut);
  // n revalorisations au 1er janvier, de 2028 à 2027 + n, chacune sur l'inflation de l'année précédente ; taux(i, k) = taux du programme
  function indexCumul(p, n, taux) {
    let a = 1, b = 1;
    for (let k = 0; k < n; k++) { const i = inflationAn(2027 + k, p); a *= 1 + i / 100; b *= 1 + taux(i, k) / 100; }
    return { statuQuo: a, programme: b };
  }
  const resultat = (lignes, hyp, src, ind, unique, extra) => {
    const total = lignes.reduce((s, l) => s + l.mensuel, 0);
    const parts = [];
    if (lignes.length) parts.push(total === 0 ? 'Pas d\'effet mensuel' : (total > 0 ? '+' : '−') + fmt(Math.abs(total)) + ' € par mois' + ((extra && extra.suffixe) || ''));
    if (unique) parts.push('+' + fmt(unique) + ' € en une fois');
    return est('calcule', Object.assign({ valeurMensuelle: r2(total), valeurAnnuelle: r2(total * 12), valeurUnique: Math.round(unique || 0),
      lignes: lignes.map(l => ({ libelle: l.libelle, mensuel: r2(l.mensuel) })), message: parts.join(' ; ') + (ind.length ? ' — ' + ind.join(' ') : ''),
      formule: lignes.map(l => l.libelle).join(' ; '), hypotheses: hyp, mesures: src, indications: ind }, extra || {}));
  };

  /* ---------- Pensions des retraités ---------- */
  function effetPension(p, ms) {
    const gel = first(ms, 'revalorisation_pct'), plaf = first(ms, 'indexation_pensions_pct'), des = first(ms, 'desindexation_pensions'), sous = first(ms, 'seuil_sous_indexation');
    const mins = flat(ms, 'pension_minimale'), cumul = first(ms, 'cumul_sans_cotisations');
    if (!gel && !plaf && !des && !sous && !mins.length && !cumul) return est('aucune_mesure', { message: 'Aucune mesure sur le montant des pensions.' });
    if (p.statut !== 'retraite') return est('aucune_mesure', { message: 'Mesures sur les pensions : choisis « retraité » pour les voir.' });
    const P = p.pensionNette;
    if (!(P > 0)) return est('non_estimable', { message: 'Renseigne ta pension nette mensuelle.' });
    const lignes = [], hyp = [], src = [], ind = [];
    const N = 5; let indexe = false;
    if (gel) {
      const r = indexCumul(p, N, (i, k) => k === 0 ? gel.v : i);
      lignes.push({ libelle: 'Pensions gelées en ' + gel.m.parametres.annee, mensuel: -P * (r.statuQuo - r.programme) }); src.push(gel.m.id); indexe = true;
      hyp.push('Les « petites retraites » seraient épargnées, mais le seuil n\'est pas précisé : le calcul suppose que ta pension est concernée.');
    } else if (plaf) {
      const n = plaf.m.parametres.duree_annees || N, r = indexCumul(p, n, () => plaf.v);
      lignes.push({ libelle: 'Pensions revalorisées de ' + plaf.v + ' % par an pendant ' + n + ' ans', mensuel: -P * (r.statuQuo - r.programme) }); src.push(plaf.m.id); indexe = true;
      hyp.push('Une désindexation plus forte au-delà d\'un seuil de revenus est évoquée sans chiffre : non prise en compte.');
    } else if (des) {
      const r = indexCumul(p, N, () => 0);
      lignes.push({ libelle: 'Pensions non revalorisées sur le quinquennat', mensuel: -P * (r.statuQuo - r.programme) }); src.push(des.m.id); indexe = true;
      hyp.push('Désindexation lue comme totale pendant cinq ans : c\'est une borne haute, le programme ne précise ni la durée ni l\'ampleur.');
    }
    if (indexe) hyp.push('Écart sur ta pension mensuelle en 2032, par rapport à une revalorisation sur l\'inflation chaque 1er janvier de 2028 à 2032. Inflation retenue : ' +
      (typeof p.inflationHyp === 'number' && p.inflationHyp >= 0 ? String(p.inflationHyp).replace('.', ',') + ' % par an (ta valeur)' : '1,9 % en 2027 puis 1,6 % par an (Banque de France, septembre 2026, prolongé)') + '.');
    if (sous && P > sous.v) { src.push(sous.m.id); ind.push('Revalorisation sous l\'inflation des pensions au-dessus de ' + fmt(sous.v) + ' €/mois si les comptes restent déséquilibrés : taux non précisé, non calculé.'); }
    for (const { v, m } of mins) {
      src.push(m.id);
      const amin = m.parametres.age;
      if (amin && age2027(p) < amin) { ind.push('Pension minimale de ' + fmt(v) + ' € à partir de ' + amin + ' ans : pas encore applicable à ton âge.'); break; }
      const g = Math.max(0, v - P);
      lignes.push({ libelle: 'Pension minimale de ' + fmt(v) + ' €', mensuel: g });
      hyp.push('Ta pension est comparée au minimum, ASPA comprise si tu la touches. L\'ASPA garantit déjà ' + String(REF.aspa.seul).replace('.', ',') + ' € à une personne seule de 65 ans et plus, sous condition de ressources et récupérable sur la succession. Minimum lu comme net et mensuel ; conditions d\'accès : voir la fiche du candidat.');
      break;
    }
    if (cumul && p.salaireCumulNet > 0) {
      const brut = p.salaireCumulNet / REF.ratioNetBrut;
      lignes.push({ libelle: 'Cumul emploi-retraite sans cotisation retraite', mensuel: brut * REF.heuresSup.reductionCotis / 100 }); src.push(cumul.m.id);
      hyp.push('Cotisations salariales vieillesse (' + String(REF.heuresSup.reductionCotis).replace('.', ',') + ' % du brut) supprimées ; la cotisation chômage salariale est déjà nulle. En contrepartie, ces revenus ne créeraient plus de droits à une seconde pension, ce que les règles en vigueur au 1er janvier 2027 permettent sous conditions.');
    } else if (cumul) ind.push('Cumul emploi-retraite sans cotisations : renseigne ton salaire en cumul pour voir l\'effet.');
    if (!lignes.length) return ind.length ? est('indication', { message: ind.join(' '), mesures: src }) : est('aucune_mesure', { message: 'Aucune mesure calculable sur ta pension.' });
    return resultat(lignes, hyp, src, ind, 0, { suffixe: indexe ? ' (écart en 2032)' : '' });
  }

  /* ---------- Minima sociaux, handicap, jeunes ---------- */
  function effetMinima(p, ms) {
    const age = age2027(p), lignes = [], hyp = [], src = [], ind = [];
    let unique = 0;
    const revenusActivite = ['salarie', 'fonctionnaire', 'enseignant', 'recherche'].includes(p.statut) ? (p.salaireNetMensuel || 0) : 0;
    // AAH
    const aahE = first(ms, 'aah_hausse'), aahP = first(ms, 'aah_hausse_pct');
    if (p.aah && aahE) {
      src.push(aahE.m.id);
      if (aahE.m.parametres.aah_condition === 'handicap_lourd' && !p.incapacite80) ind.push('Hausse de l\'AAH de ' + aahE.v + ' € réservée au handicap lourd : pas d\'effet pour toi si ton taux d\'incapacité est inférieur à 80 %.');
      else { lignes.push({ libelle: 'AAH +' + aahE.v + ' €', mensuel: aahE.v }); hyp.push('Hausse de l\'AAH lue comme mensuelle et nette.'); if (aahE.m.parametres.aah_condition) hyp.push('« Handicap lourd » lu comme un taux d\'incapacité d\'au moins 80 %.'); }
    }
    if (p.aah && aahP) {
      src.push(aahP.m.id);
      const g = REF.aah.max * aahP.v / 100;
      lignes.push({ libelle: 'AAH +' + aahP.v + ' % (maximum porté de ' + String(REF.aah.max).replace('.', ',') + ' € à ' + fmt(REF.aah.max + g) + ' €)', mensuel: g });
      hyp.push('Hausse appliquée au montant maximal ; l\'AAH étant différentielle, ton gain est le même tant que tu restes éligible.');
      if (aahP.m.parametres.deconjugalisation) hyp.push('La fin de la prise en compte des revenus du conjoint est déjà en vigueur depuis octobre 2023 : pas d\'effet supplémentaire.');
    }
    // RSA, prime d'activité, ASS
    const ria = first(ms, 'ria_socle');
    if (ria && p.minimaMensuels > 0) {
      src.push(ria.m.id);
      lignes.push({ libelle: 'RSA, prime d\'activité et ASS fusionnés, réduits de ' + ria.m.parametres.baisse_pct + ' %', mensuel: -p.minimaMensuels * ria.m.parametres.baisse_pct / 100 });
      hyp.push('Baisse de ' + ria.m.parametres.baisse_pct + ' % appliquée au total que tu perçois. Une autre source donne des montants forfaitaires (' + ria.v + ' € sans revenu, ' + ria.m.parametres.ria_insertion + ' € en insertion) : la règle exacte n\'est pas tranchée. ' + ria.m.parametres.heures_activite_hebdo + ' heures d\'activité par semaine seraient exigées.');
    }
    const plaf = first(ms, 'plafond_aides_pct_smic_net');
    if (plaf) {
      const aides = (p.minimaMensuels || 0) + (p.aplMensuelle || 0) + (p.aah ? REF.aah.max : 0), seuil = REF.smic.netMensuel * plaf.v / 100;
      if (aides > seuil) { src.push(plaf.m.id); ind.push('Plafond des aides à ' + plaf.v + ' % du SMIC net (environ ' + fmt(seuil) + ' €) : avec environ ' + fmt(aides) + ' € d\'aides par mois, ton foyer pourrait être concerné. La règle par foyer n\'est pas précisée (l\'exemple du candidat, 1 685 € pour un couple avec deux enfants, dépasse 70 % d\'un SMIC), donc non calculé.'); }
    }
    const ga = first(ms, 'garantie_autonomie');
    if (ga && age >= 18) {
      const rev = revenusActivite + (p.pensionNette || 0) + (p.minimaMensuels || 0) + (p.aah ? REF.aah.max : 0);
      if (rev < ga.v) { src.push(ga.m.id); ind.push('Garantie d\'autonomie au seuil de pauvreté (' + fmt(ga.v) + ' €/mois) : public et conditions non précisés dans la source ; si elle s\'appliquait à toi, elle compléterait tes revenus d\'environ ' + fmt(ga.v - rev) + ' € par mois.'); }
    }
    const rsa18 = first(ms, 'rsa_des_18_ans');
    if (rsa18 && age >= 18 && age < 25 && p.statut !== 'etudiant' && p.statut !== 'retraite') {
      src.push(rsa18.m.id);
      const g = Math.max(0, REF.rsa.seul - revenusActivite);
      lignes.push({ libelle: 'RSA ouvert dès 18 ans', mensuel: g });
      hyp.push('Mesure lue comme l\'ouverture du RSA aux 18-24 ans. Montant d\'une personne seule sans aide au logement (' + String(REF.rsa.seul).replace('.', ',') + ' €), diminué de tes revenus d\'activité ; la prime d\'activité n\'est pas calculée.');
    }
    // Étudiants et jeunes
    const bs = first(ms, 'bourse_supplement'), av = first(ms, 'avance_jeunesse'), re = first(ms, 'revenu_etudiant'), gu = first(ms, 'gratuite_universite'), r1 = first(ms, 'repas_1_euro'), per = first(ms, 'abondement_premier_emploi');
    if (p.statut === 'etudiant') {
      if (bs && p.boursier && p.niveauEtudes === 'L1L2') { src.push(bs.m.id); lignes.push({ libelle: '+' + fmt(bs.v) + ' € par an pour les boursiers de 1re et 2e année', mensuel: bs.v / 12 }); hyp.push('Supplément lu comme annuel, versé chacune des deux premières années.'); }
      if (re) {
        src.push(re.m.id);
        const bourse = p.boursier ? (p.bourseMensuelle || 0) : 0;
        lignes.push({ libelle: 'Revenu étudiant de ' + re.v + ' €/mois', mensuel: (re.v * 12 - bourse * 10) / 12 });
        hyp.push('Revenu versé 12 mois, en remplacement de la bourse (versée 10 mois). Mesure relevée dans une source de 2022.');
      }
      if (gu && !p.boursier) {
        src.push(gu.m.id);
        const f = p.niveauEtudes === 'master' ? REF.fraisInscription.master : REF.fraisInscription.licence;
        lignes.push({ libelle: 'Droits d\'inscription supprimés (' + f + ' € par an)', mensuel: f / 12 });
        hyp.push('Droits d\'inscription 2026-2027 en ' + (p.niveauEtudes === 'master' ? 'master' : 'licence') + ' ; la CVEC (105 €) n\'est pas comptée. Les boursiers en sont déjà exonérés.');
      }
      if (r1) { src.push(r1.m.id); ind.push('Repas à 1 € pour tous les étudiants : déjà en vigueur depuis le 4 mai 2026, pas d\'effet supplémentaire.'); }
    }
    if (av && p.jeuneSansDiplomeNiEmploi && age >= 18 && age <= 24) { src.push(av.m.id); unique += av.v; hyp.push('Avance jeunesse de ' + fmt(av.v) + ' € : modalités de remboursement non précisées.'); }
    if (per && age <= 26 && (p.statut === 'etudiant' || p.statut === 'sans_emploi')) { src.push(per.m.id); unique += per.v; hyp.push(per.v + ' € versés par l\'État sur un plan d\'épargne retraite au premier emploi : épargne bloquée jusqu\'à la retraite.'); }
    if (!lignes.length && !unique) return ind.length ? est('indication', { message: ind.join(' '), mesures: src }) : est('aucune_mesure', { message: 'Aucune mesure calculable pour ta situation.' });
    return resultat(lignes, hyp, src, ind, unique);
  }

  /* ---------- Enseignants et agents publics ---------- */
  function effetFonction(p, ms) {
    const pi = first(ms, 'point_indice_pct');
    const cibles = ms.filter(m => m.parametres && ['enseignants', 'recherche'].includes(m.parametres.public));
    if (!pi && !cibles.length) return est('aucune_mesure', { message: 'Aucune mesure sur la rémunération des agents publics.' });
    if (!['fonctionnaire', 'enseignant', 'recherche'].includes(p.statut)) return est('aucune_mesure', { message: 'Mesures réservées aux agents publics.' });
    const lignes = [], hyp = [], src = [], ind = [];
    let max = null;
    if (pi) {
      src.push(pi.m.id);
      if (p.traitementIndiciaire > 0) {
        const R = REF.retenuesFP, g = p.traitementIndiciaire * pi.v / 100 * (1 - R.pensionCivile - R.csgCrds);
        lignes.push({ libelle: 'Point d\'indice +' + pi.v + ' %', mensuel: g });
        hyp.push('Hausse appliquée à ton traitement indiciaire brut (les primes ne suivent pas le point), puis convertie en net : retenue pour pension civile de 11,10 % et CSG-CRDS.');
      } else ind.push('Point d\'indice +' + pi.v + ' % : renseigne ton traitement indiciaire brut (sur ta fiche de paie) pour voir l\'effet.');
    }
    const pub = p.statut === 'enseignant' ? 'enseignants' : p.statut === 'recherche' ? 'recherche' : null;
    const m = pub && cibles.find(x => x.parametres.public === pub);
    if (m) {
      src.push(m.id);
      const P = m.parametres, net = p.salaireNetMensuel || 0;
      if (P.hausse_nette_mensuelle_min) {
        lignes.push({ libelle: 'Revalorisation de ' + P.hausse_nette_mensuelle_min + ' à ' + P.hausse_nette_mensuelle_max + ' € net selon l\'avancement', mensuel: P.hausse_nette_mensuelle_min });
        max = P.hausse_nette_mensuelle_max - P.hausse_nette_mensuelle_min;
        hyp.push('Montant le plus bas de la fourchette retenu (début de carrière) ; jusqu\'à ' + P.hausse_nette_mensuelle_max + ' € en milieu de carrière.');
      } else if (net > 0) {
        const pmin = P.hausse_pct ?? P.hausse_pct_min, pmax = P.hausse_pct_max;
        lignes.push({ libelle: (P.hausse_pct_min && !pmax ? 'Au moins +' : '+') + pmin + (pmax ? ' à ' + pmax : '') + ' % de salaire', mensuel: net * pmin / 100 });
        if (pmax) { max = net * (pmax - pmin) / 100; hyp.push('Bas de la fourchette retenu ; jusqu\'à +' + fmt(net * pmax / 100) + ' € avec ' + pmax + ' %.'); }
        hyp.push('Hausse appliquée à ton salaire net actuel, primes comprises, et atteinte en fin de quinquennat ; aucune autre évolution de carrière.' + (P.hausse_nette ? '' : ' Le texte ne dit pas brut ou net : appliquée au net.'));
      } else ind.push('Renseigne ton salaire net mensuel.');
    }
    if (!lignes.length) return ind.length ? est('indication', { message: ind.join(' '), mesures: src }) : est('aucune_mesure', { message: 'Aucune mesure pour ton métier.' });
    const r = resultat(lignes, hyp, src, ind, 0);
    if (max) r.message = r.message.replace(' € par mois', ' € par mois (jusqu\'à +' + fmt(r.valeurMensuelle + max) + ' €)');
    return r;
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
    { id: 'patrimoine', titre: 'Patrimoine et succession', fn: effetPatrimoine },
    { id: 'pension', titre: 'Pensions des retraités', fn: effetPension },
    { id: 'minima', titre: 'Minima sociaux, handicap, jeunes et étudiants', fn: effetMinima },
    { id: 'fonction', titre: 'Enseignants et agents publics', fn: effetFonction }
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

  return { REF, DOMAINES, simuler, irFoyer, effetIR, effetFamille, effetLogement, effetPatrimoine, regleActuelle, effetSalaire, effetRetraite, effetTVA, effetHS, effetPension, effetMinima, effetFonction, annoncesGain };
});
