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
    const debut = p.anneeDebutCarriere;
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
    if (anticipe && debut && debut - p.anneeNaissance < 20) {
      const dep2 = Math.max(p.anneeNaissance + anticipe.v, debut + 160 / 4);
      if (dep2 < departCand) { departCand = dep2; notes.push('Départ anticipé : carrière commencée avant 20 ans.'); }
    }
    const ageRet = a => a - p.anneeNaissance;
    const deltaMois = Math.round((departCand - departActuel) * 12);
    const ageDepartActuel = ageRet(departActuel) * 12, ageDepartCand = ageRet(departCand) * 12;
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

  /* ---------- Orchestration ---------- */
  const DOMAINES = [
    { id: 'salaire', titre: 'Salaire minimum et salaires', fn: effetSalaire },
    { id: 'retraite', titre: 'Âge de départ à la retraite', fn: effetRetraite },
    { id: 'tva', titre: 'TVA et prix de l\'énergie', fn: effetTVA },
    { id: 'hs', titre: 'Heures supplémentaires', fn: effetHS }
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

  return { REF, DOMAINES, simuler, regleActuelle, effetSalaire, effetRetraite, effetTVA, effetHS, annoncesGain };
});
