/* Champs du simulateur — présidentielle 2027.
   Source unique : regroupement, libellé, aide (définition précise + à quoi la donnée sert), valeur d'exemple,
   conditions d'affichage selon la situation, et conversion en profil pour js/engine.js.
   Fonctions pures, sans accès au DOM : testées par `node js/champs.test.js`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Champs = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const ACTIFS = ['salarie', 'fonctionnaire', 'enseignant', 'recherche'];
  const PUBLICS = ['fonctionnaire', 'enseignant', 'recherche'];
  const TRAVAILLENT = ACTIFS.concat('etudiant'); // un étudiant peut avoir un petit salaire
  const NON_RETRAITES = ['salarie', 'fonctionnaire', 'enseignant', 'recherche', 'etudiant', 'sans_emploi'];
  const OUINON = [['0', 'Non'], ['1', 'Oui']];

  /* Ordre d'affichage : de la situation personnelle vers les dépenses, les données voisines étant regroupées. */
  const GROUPES = [
    { id: 'foyer', titre: 'Toi et ton foyer', desc: 'Qui tu es et qui vit avec toi : ces réponses décident des champs affichés ensuite et servent à l\'impôt sur le revenu.' },
    { id: 'revenus', titre: 'Revenus d\'activité', desc: 'Ce que tu gagnes en travaillant.' },
    { id: 'carriere', titre: 'Carrière et retraite', desc: 'Pour l\'âge de départ à la retraite et le montant des pensions.' },
    { id: 'aides', titre: 'Aides sociales et handicap', desc: 'Les prestations que tu reçois déjà. Laisse 0 si tu n\'es pas concerné.', facultatif: true },
    { id: 'etudes', titre: 'Études et jeunesse', desc: 'Bourses, droits d\'inscription et aides aux jeunes.' },
    { id: 'logement', titre: 'Logement', desc: 'Locataire ou propriétaire de ta résidence principale, ton loyer et ton aide au logement si tu loues, et un éventuel achat.', facultatif: true },
    { id: 'patrimoine', titre: 'Patrimoine, épargne et transmission', desc: 'Ce que tu possèdes, ce que ça te rapporte et ce que tu reçois de ta famille.', facultatif: true },
    { id: 'depenses', titre: 'Dépenses courantes', desc: 'Valeurs d\'exemple : remplace-les par les tiennes (moyenne mensuelle sur l\'année).' },
    { id: 'hypothese', titre: 'Hypothèse de calcul', desc: 'Un seul réglage, pour les mesures qui jouent sur plusieurs années.', facultatif: true }
  ];

  /* type : nombre | nombre_facultatif (vide = non renseigné) | oui_non | choix
     cle : nom dans le profil lu par le moteur ; pour : situations où le champ s'affiche ; quand : condition sur les autres champs
     sous : sous-titre du bloc ; imbrique : champ « dont » rattaché au précédent ; sert : à quoi la donnée sert dans les calculs */
  const CHAMPS = [
    /* ---------- Toi et ton foyer ---------- */
    { id: 'statut', groupe: 'foyer', cle: 'statut', type: 'choix', val: 'salarie', label: 'Ta situation principale',
      options: [['salarie', 'Salarié du privé'], ['fonctionnaire', 'Agent public (hors enseignant)'], ['enseignant', 'Enseignant'], ['recherche', 'Personnel de la recherche'], ['retraite', 'Retraité'], ['etudiant', 'Étudiant'], ['sans_emploi', 'Sans emploi']],
      tip: 'Ta situation actuelle. Salarié du privé : contrat de travail dans une entreprise. Agent public : fonctionnaire ou contractuel de l\'État, d\'une collectivité ou de l\'hôpital, hors enseignant. Enseignant : personnel de l\'Éducation nationale. Recherche : personnel de la recherche publique. Retraité : tu perçois une pension. Étudiant : en formation initiale. Sans emploi : ni en poste, ni retraité, ni étudiant.',
      sert: 'afficher les champs qui te concernent et choisir les mesures calculées pour toi.' },
    { id: 'naiss', groupe: 'foyer', cle: 'anneeNaissance', type: 'nombre', val: 1985, min: 1940, max: 2008, label: 'Année de naissance',
      tip: 'Année de ta naissance, sur quatre chiffres (par exemple 1985).',
      sert: 'ton âge légal de départ à la retraite selon ta génération, et l\'âge que tu auras en 2027 pour les mesures réservées à une tranche d\'âge (moins de 30 ans, moins de 35 ans, 18-24 ans…).' },
    { id: 'couple', groupe: 'foyer', cle: 'couple', type: 'oui_non', val: '0', options: OUINON, label: 'En couple',
      tip: 'Oui si tu fais ta déclaration d\'impôts en commun avec ton conjoint (mariage ou PACS). En concubinage, chacun déclare séparément : réponds Non.',
      sert: 'le nombre de parts de ton foyer fiscal pour l\'impôt sur le revenu.' },
    { id: 'enf', groupe: 'foyer', cle: 'enfants', type: 'nombre', val: 0, min: 0, max: 10, label: 'Enfants à charge',
      tip: 'Nombre d\'enfants rattachés à ton foyer fiscal : mineurs, ou majeurs de moins de 21 ans (25 ans s\'ils étudient).',
      sert: 'le quotient familial de l\'impôt sur le revenu, l\'exonération des familles nombreuses (Le Maire), l\'allocation familiale et l\'estimation du chèque énergie.' },
    { id: 'nais', groupe: 'foyer', cle: 'naissances', type: 'nombre', val: 0, min: 0, max: 5, label: 'Naissances prévues d\'ici 2032',
      tip: 'Nombre d\'enfants que tu comptes avoir ou adopter entre aujourd\'hui et 2032. Mets 0 si tu n\'as pas de projet.',
      sert: 'les sommes versées ou placées à la naissance (Attal, Dupont-Aignan).' },

    /* ---------- Revenus d'activité ---------- */
    { id: 'cpar', groupe: 'foyer', cle: 'moisCongeParental', type: 'nombre', val: 0, min: 0, max: 36, pour: ACTIFS, quand: v => +v.nais > 0, label: 'Congé parental à temps plein prévu (mois)',
      tip: 'Nombre de mois pendant lesquels tu comptes arrêter complètement de travailler pour t\'occuper de l\'enfant à naître, après le congé maternité ou paternité. Mets 0 si tu n\'en prévois pas.',
      sert: 'le congé parental rémunéré (Dupont-Aignan), comparé à la PreParE versée aujourd\'hui.' },
    { id: 'net', groupe: 'revenus', cle: 'salaireNetMensuel', type: 'nombre', val: 1800, min: 0, step: 10, pour: TRAVAILLENT, label: 'Salaire net mensuel (€)',
      tip: 'Ce que tu reçois réellement chaque mois : après cotisations sociales et CSG, avant impôt sur le revenu (ligne « net avant impôt sur le revenu » de la fiche de paie). Hors primes exceptionnelles et heures supplémentaires. À temps partiel, indique ce que tu touches vraiment.',
      sert: 'la comparaison avec un salaire minimum, l\'impôt sur le revenu, le taux horaire des heures supplémentaires et les hausses de salaire des enseignants.' },
    { id: 'quot', groupe: 'revenus', cle: 'quotite', type: 'nombre', val: 100, min: 10, max: 100, pour: ACTIFS, repli: 100, label: 'Quotité de travail (%)',
      tip: 'La part d\'un temps plein que tu travailles : 100 pour un temps plein, 80 pour un 4/5e, 50 pour un mi-temps.',
      sert: 'comparer ton salaire à un salaire minimum proportionnel à ton temps de travail.' },
    { id: 'hs', groupe: 'revenus', cle: 'heuresSupSemaine', type: 'nombre', val: 0, min: 0, max: 20, pour: ACTIFS, label: 'Heures supplémentaires par semaine',
      tip: 'Nombre moyen d\'heures que tu fais chaque semaine au-delà de 35 h. Le calcul suppose 46 semaines travaillées par an. Mets 0 si tu n\'en fais pas.',
      sert: 'les mesures sur la majoration, l\'exonération d\'impôt et de cotisations des heures supplémentaires.' },
    { id: 'trait', groupe: 'revenus', cle: 'traitementIndiciaire', type: 'nombre', val: 0, min: 0, step: 10, pour: PUBLICS, label: 'Traitement indiciaire brut mensuel (€)',
      tip: 'La ligne « traitement indiciaire brut » de ta fiche de paie : ton indice majoré multiplié par la valeur du point d\'indice. N\'inclus ni primes ni indemnités.',
      sert: 'la hausse du point d\'indice (Mélenchon).' },
    { id: 'conj', groupe: 'revenus', cle: 'salaireConjointNetMensuel', type: 'nombre', val: 0, min: 0, step: 10, quand: v => v.couple === '1',
      label: 'Salaire net mensuel de ton conjoint (€)',
      tip: 'Ce que ton conjoint touche chaque mois en salaire : après cotisations sociales, avant impôt sur le revenu. Mets 0 s\'il ne travaille pas.',
      sert: 'l\'impôt sur le revenu du foyer.' },
    { id: 'palim', groupe: 'revenus', cle: 'pensionAlimentaireRecueAn', type: 'nombre', val: 0, min: 0, step: 100, quand: v => +v.enf > 0, label: 'Pension alimentaire reçue pour tes enfants, par an (€)',
      tip: 'Total sur l\'année de la pension que l\'autre parent te verse pour l\'entretien et l\'éducation de vos enfants, telle que tu la déclares aux impôts. Mets 0 si tu n\'en reçois pas ou si c\'est toi qui la verses.',
      sert: 'la défiscalisation de la pension alimentaire pour le parent qui la reçoit (Attal).' },
    { id: 'arrets', groupe: 'revenus', cle: 'arretsMaladieAn', type: 'nombre', val: 0, min: 0, max: 20, pour: PUBLICS, label: 'Arrêts maladie par an',
      tip: 'Nombre moyen d\'arrêts de maladie ordinaire que tu as chaque année. Chaque nouvel arrêt compte, quelle que soit sa durée ; un arrêt prolongé sans interruption compte pour un. Mets 0 si tu n\'en as pas.',
      sert: 'le nombre de jours de carence non payés (Zemmour).' },

    /* ---------- Carrière et retraite ---------- */
    { id: 'debut', groupe: 'carriere', cle: 'anneeDebutCarriere', type: 'nombre', val: 2008, min: 1960, max: 2026, pour: NON_RETRAITES, repli: null, label: 'Année de début de carrière',
      tip: 'L\'année où tu as validé tes premiers trimestres de retraite : premier emploi, apprentissage ou stage rémunéré. Laisse vide si tu ne sais pas : seul l\'âge légal sera comparé.',
      sert: 'la durée de cotisation à atteindre et le départ anticipé pour carrière longue (début avant 20 ans).' },
    { id: 'vide', groupe: 'carriere', cle: 'anneesSansTrimestre', type: 'nombre', val: 0, min: 0, max: 30, pour: NON_RETRAITES, label: 'Années sans trimestre validé',
      tip: 'Nombre d\'années, depuis ton début de carrière, où tu n\'as validé aucun trimestre : inactivité, chômage non indemnisé, longue période sans emploi. Le chômage indemnisé et le congé maternité valident des trimestres : ne les compte pas.',
      sert: 'décaler d\'autant la date où tu atteins la durée de cotisation requise.' },
    { id: 'pension', groupe: 'carriere', cle: 'pensionNette', type: 'nombre', val: 0, min: 0, step: 10, pour: ['retraite'], label: 'Pension nette mensuelle (€)',
      tip: 'Total de toutes tes pensions de retraite par mois (régime de base, complémentaires, réversion), après cotisations et CSG, avant impôt sur le revenu.',
      sert: 'le gel, la désindexation ou le minimum des pensions (Attal, Glucksmann, Hollande, Le Maire, Lisnard).' },
    { id: 'cumul', groupe: 'carriere', cle: 'salaireCumulNet', type: 'nombre', val: 0, min: 0, step: 50, pour: ['retraite'], label: 'Salaire net mensuel en cumul emploi-retraite (€)',
      tip: 'Salaire net mensuel d\'un emploi que tu exerces en plus de ta retraite. Mets 0 si tu ne travailles plus.',
      sert: 'la suppression des cotisations du cumul emploi-retraite (Retailleau).' },

    /* ---------- Aides sociales et handicap ---------- */
    { id: 'aah', groupe: 'aides', cle: 'aah', type: 'oui_non', val: '0', options: OUINON, sous: 'Handicap', label: 'Tu perçois l\'AAH',
      tip: 'Oui si tu reçois l\'allocation aux adultes handicapés (AAH), versée par la CAF ou la MSA.',
      sert: 'les revalorisations de l\'AAH (Asselineau, Dupont-Aignan, Tondelier).' },
    { id: 'inc80', groupe: 'aides', cle: 'incapacite80', type: 'oui_non', val: '0', options: OUINON, sous: 'Handicap', quand: v => v.aah === '1', imbrique: true, label: 'Taux d\'incapacité d\'au moins 80 %',
      tip: 'Oui si la commission des droits (MDPH) t\'a reconnu un taux d\'incapacité d\'au moins 80 %. Mets Non si ton taux est entre 50 % et 79 %.',
      sert: 'la hausse de 300 € de l\'AAH de Dupont-Aignan, réservée au handicap lourd.' },
    { id: 'minima', groupe: 'aides', cle: 'minimaMensuels', type: 'nombre', val: 0, min: 0, step: 10, sous: 'Minima sociaux', label: 'RSA, prime d\'activité et ASS par mois (€)',
      tip: 'Total mensuel de ce que tu perçois en RSA, prime d\'activité et allocation de solidarité spécifique (ASS). N\'inclus ni l\'AAH ni les aides au logement, saisies à part.',
      sert: 'la fusion de ces aides (Retailleau), le plafond des aides et la garantie d\'autonomie (Mélenchon).' },

    /* ---------- Études et jeunesse ---------- */
    { id: 'bours', groupe: 'etudes', cle: 'boursier', type: 'oui_non', val: '0', options: OUINON, pour: ['etudiant'], sous: 'Tes études', label: 'Boursier',
      tip: 'Oui si tu perçois une bourse sur critères sociaux du Crous.',
      sert: 'le supplément de bourse (Cazeneuve), la gratuité des droits d\'inscription (Branco) et le revenu étudiant (Roussel).' },
    { id: 'bourse', groupe: 'etudes', cle: 'bourseMensuelle', type: 'nombre', val: 0, min: 0, step: 10, pour: ['etudiant'], quand: v => v.bours === '1', imbrique: true, sous: 'Tes études', label: 'Bourse mensuelle (€)',
      tip: 'Montant mensuel de ta bourse sur critères sociaux. Elle est versée sur 10 mois par an.',
      sert: 'comparer ta bourse au revenu étudiant de 850 € par mois sur 12 mois (Roussel).' },
    { id: 'niv', groupe: 'etudes', cle: 'niveauEtudes', type: 'choix', val: 'L1L2', options: [['L1L2', 'Licence 1 ou 2'], ['L3', 'Licence 3 ou autre cursus'], ['master', 'Master']], pour: ['etudiant'], sous: 'Tes études', label: 'Niveau d\'études',
      tip: 'Cycle que tu suis cette année : Licence 1 ou 2, Licence 3 ou autre cursus (BTS, école, doctorat…), ou Master.',
      sert: 'le supplément de bourse des deux premières années (Cazeneuve) et le montant des droits d\'inscription supprimés (178 € en licence, 255 € en master).' },
    { id: 'sdne', groupe: 'etudes', cle: 'jeuneSansDiplomeNiEmploi', type: 'oui_non', val: '0', options: OUINON, pour: ['etudiant', 'sans_emploi'], sous: 'Ta situation de jeune', label: '18-24 ans sans diplôme ni emploi',
      tip: 'Oui si tu as entre 18 et 24 ans et que tu n\'as ni diplôme ni emploi.',
      sert: 'l\'avance jeunesse de 3 000 € (Cazeneuve).' },

    /* ---------- Logement ---------- */
    { id: 'occ', groupe: 'logement', cle: 'occupation', type: 'choix', val: 'locataire', options: [['locataire', 'Locataire'], ['proprietaire', 'Propriétaire']], sous: 'Ta résidence principale', label: 'Tu es…',
      tip: 'Locataire : tu paies un loyer pour le logement où tu vis (y compris en colocation ou en location meublée). Propriétaire : tu possèdes ton logement, même si tu rembourses encore un crédit. Si tu es logé gratuitement (chez tes parents, par exemple), choisis Locataire et laisse le loyer à 0.',
      sert: 'afficher ou non les questions sur le loyer et l\'aide au logement.' },
    { id: 'loyer', groupe: 'logement', cle: 'loyerMensuel', type: 'nombre', val: 0, min: 0, step: 10, sous: 'Ta résidence principale', quand: v => v.occ === 'locataire', label: 'Loyer mensuel hors charges (€)',
      tip: 'Le loyer que tu verses chaque mois à ton propriétaire, hors charges et avant déduction de ton aide au logement.',
      sert: 'le gel des loyers (Kazib).' },
    { id: 'apl', groupe: 'logement', cle: 'aplMensuelle', type: 'nombre', val: 0, min: 0, sous: 'Ta résidence principale', quand: v => v.occ === 'locataire', label: 'Aide au logement par mois (€)',
      tip: 'Montant que la CAF ou la MSA te verse chaque mois pour ton logement (APL, ALS ou ALF), visible sur ton relevé de paiement. Mets 0 si tu n\'en perçois pas.',
      sert: 'les hausses de l\'APL (Mélenchon, Tondelier) et le plafond des aides.' },
    { id: 'prix', groupe: 'logement', cle: 'prixAchat', type: 'nombre', val: 0, min: 0, step: 1000, sous: 'Un achat de logement', label: 'Prix d\'un logement ancien que tu comptes acheter (€)',
      tip: 'Prix de vente du logement ancien que tu envisages d\'acheter, sans les frais. Mets 0 si tu n\'as pas de projet d\'achat.',
      sert: 'les frais de notaire, estimés à 7,5 % du prix, supprimés pour les acheteurs de moins de 35 ans (Philippe).' },

    /* ---------- Patrimoine, épargne et transmission ---------- */
    { id: 'pat', groupe: 'patrimoine', cle: 'patrimoine', type: 'nombre', val: 0, min: 0, step: 10000, sous: 'Ton patrimoine', label: 'Patrimoine net total (€)',
      tip: 'Valeur de tout ce que ton foyer possède au 1er janvier (immobilier, comptes, placements, assurance-vie, parts d\'entreprise) moins toutes les dettes (prêts immobiliers, crédits). L\'immobilier est compris.',
      sert: 'l\'ISF rétabli (Mélenchon, Roussel, Tondelier : indication seulement ; Villepin : calculé) et la contribution sur les très gros patrimoines (Glucksmann).' },
    { id: 'immo', groupe: 'patrimoine', cle: 'patrimoineImmo', type: 'nombre', val: 0, min: 0, step: 10000, imbrique: true, sous: 'Ton patrimoine', label: 'dont immobilier net (€)',
      tip: 'Valeur de tous tes biens immobiliers (résidence principale, secondaire, locatif, parts de SCPI) moins les prêts qui les financent. Ce montant est déjà compris dans le patrimoine net total, il ne doit pas le dépasser.',
      sert: 'calculer l\'IFI que tu paies aujourd\'hui (immobilier seul), à comparer à l\'ISF.' },
    { id: 'rp', groupe: 'patrimoine', cle: 'patrimoineRP', type: 'nombre', val: 0, min: 0, step: 10000, imbrique: true, sous: 'Ton patrimoine', label: 'dont résidence principale, valeur de marché (€)',
      tip: 'Valeur de marché de ta résidence principale, avant déduction du prêt (le prêt est déjà retiré du montant d\'immobilier net). Elle bénéficie d\'un abattement de 30 % pour l\'IFI et l\'ISF. Mets 0 si tu es locataire.',
      sert: 'appliquer l\'abattement de 30 % sur la résidence principale.' },
    { id: 'pv', groupe: 'patrimoine', cle: 'plusValuesAnnuelles', type: 'nombre', val: 0, min: 0, step: 500, sous: 'Ce que ton épargne rapporte', label: 'Plus-values réalisées par an sur titres financiers (€)',
      tip: 'Gains que tu réalises en moyenne chaque année en vendant des actions, ETF, parts de fonds ou crypto-actifs : prix de vente moins prix d\'achat. Ne compte ni l\'assurance-vie, ni l\'immobilier, ni les dividendes et intérêts.',
      sert: 'le plafond de taxation à 22 % de Lisnard, comparé à la flat tax de 31,4 %.' },
    { id: 'her', groupe: 'patrimoine', cle: 'heritage', type: 'nombre', val: 0, min: 0, step: 10000, sous: 'Ce que tu reçois de ta famille', label: 'Héritage attendu d\'un parent (€)',
      tip: 'Part nette que tu t\'attends à recevoir de la succession d\'un de tes parents, après dettes et pour toi seul (pas pour toute la fratrie). Mets 0 si aucune succession n\'est prévue.',
      sert: 'l\'abattement de succession en ligne directe (Villepin) et les mesures sur les gros héritages (Glucksmann, Mélenchon).' },
    { id: 'don', groupe: 'patrimoine', cle: 'donationRecue', type: 'nombre', val: 0, min: 0, step: 10000, sous: 'Ce que tu reçois de ta famille', label: 'Donation reçue d\'un parent (€)',
      tip: 'Montant qu\'un de tes parents te donne ou t\'a donné (argent ou bien), sans autre donation de ce parent dans les 15 dernières années. Si les deux parents donnent, ne compte que la part d\'un seul.',
      sert: 'le relèvement du plafond de donation (Dupont-Aignan) et son renouvellement tous les 10 ans (Le Pen).' },

    /* ---------- Dépenses courantes ---------- */
    { id: 'dep', groupe: 'depenses', cle: 'depensesTvaNormale', type: 'nombre', val: 1000, min: 0, step: 50, sous: 'Consommation', label: 'Dépenses à TVA 20 % par mois (€)',
      tip: 'Dépenses mensuelles de ton foyer soumises à la TVA au taux normal de 20 % : vêtements, équipement, restaurants, téléphonie, loisirs, services. Hors alimentation, loyer, santé, énergie, carburant et transports en commun. Valeur d\'exemple : modifie-la.',
      sert: 'les hausses de TVA (Hollande, Le Maire).' },
    { id: 'elec', groupe: 'depenses', cle: 'electriciteMois', type: 'nombre', val: 90, min: 0, sous: 'Énergie du logement', label: 'Électricité par mois (€)',
      tip: 'Facture mensuelle d\'électricité de ton foyer, toutes taxes comprises, en moyenne sur l\'année.',
      sert: 'les baisses de prix de l\'électricité (Dupont-Aignan, Roussel, Villepin) et la TVA sur l\'énergie (Le Pen).' },
    { id: 'gaz', groupe: 'depenses', cle: 'energieMois', type: 'nombre', val: 40, min: 0, sous: 'Énergie du logement', label: 'Gaz par mois (€)',
      tip: 'Facture mensuelle de gaz de ton foyer, toutes taxes comprises, en moyenne sur l\'année. Mets 0 si tu n\'as pas de gaz.',
      sert: 'les baisses de prix du gaz (Dupont-Aignan, Roussel) et la TVA sur l\'énergie (Le Pen).' },
    { id: 'carb', groupe: 'depenses', cle: 'carburantLitres', type: 'nombre', val: 80, min: 0, sous: 'Carburant et déplacements', label: 'Carburant par mois (litres)',
      tip: 'Nombre de litres de carburant que tu achètes en moyenne chaque mois.',
      sert: 'les baisses du prix du carburant (Dupont-Aignan, Glucksmann) et la TVA sur l\'énergie (Le Pen).' },
    { id: 'prixc', groupe: 'depenses', cle: 'prixCarburantLitre', type: 'nombre', val: 0, min: 0, step: 0.01, imbrique: true, sous: 'Carburant et déplacements', label: 'Prix payé à la pompe (€/L)',
      tip: 'Prix moyen que tu paies le litre, par exemple 1,85. Laisse 0 si tu ne veux pas calculer le blocage du prix du carburant.',
      sert: 'le prix du carburant bloqué à 1,60 € le litre (Roussel).' },
    { id: 'abo', groupe: 'depenses', cle: 'abonnementTransportMois', type: 'nombre', val: 0, min: 0, step: 5, sous: 'Carburant et déplacements', label: 'Abonnement de transport en commun par mois (€)',
      tip: 'Prix mensuel de ton abonnement (Navigo, abonnement TER ou bus), avant remboursement de ton employeur. Mets 0 sans abonnement.',
      sert: 'la gratuité des transports en commun (Arthaud, Roussel).' },
    { id: 'peages', groupe: 'depenses', cle: 'peagesMois', type: 'nombre', val: 0, min: 0, step: 5, sous: 'Carburant et déplacements', label: 'Péages d\'autoroute par mois (€)',
      tip: 'Dépense moyenne de péages par mois : le total de l\'année divisé par 12.',
      sert: 'la suppression des péages d\'ici 2030 (Dupont-Aignan).' },
    { id: 'depass', groupe: 'depenses', cle: 'depassementsAn', type: 'nombre', val: 0, min: 0, step: 10, sous: 'Santé', label: 'Dépassements d\'honoraires restant à ta charge par an (€)',
      tip: 'Total sur l\'année de ce que ton foyer paie lui-même au-delà du tarif de la Sécurité sociale (médecins en secteur 2, par exemple), après le remboursement de ta complémentaire santé. Mets 0 si tu n\'en as pas.',
      sert: 'l\'interdiction ou le plafonnement des dépassements d\'honoraires (Tondelier).' },

    /* ---------- Hypothèse de calcul ---------- */
    { id: 'infl', groupe: 'hypothese', cle: 'inflationHyp', type: 'nombre_facultatif', val: '', min: 0, max: 10, step: 0.1, ph: '1,9 puis 1,6', label: 'Inflation annuelle supposée (%)',
      tip: 'Hausse annuelle des prix que tu veux supposer de 2027 à 2032, en pourcentage. Laisse vide pour utiliser la prévision de la Banque de France : 1,9 % en 2027, puis 1,6 % par an.',
      sert: 'les mesures qui touchent l\'évolution des pensions et des loyers (gel, indexation).' }
  ];

  /* Contrôles de cohérence : renvoient un message ou null. */
  const CONTROLES = {
    patrimoine: v => (+v.immo || 0) > (+v.pat || 0) ? 'Ton immobilier net ne peut pas dépasser ton patrimoine net total, qui l\'inclut : vérifie ces deux montants.' : null,
    carriere: v => (v.debut !== '' && v.debut !== undefined && +v.naiss > 0 && +v.debut < +v.naiss + 14 && ['salarie', 'fonctionnaire', 'enseignant', 'recherche', 'sans_emploi'].includes(v.statut)) ? 'Ton début de carrière tombe avant tes 14 ans : vérifie l\'année de naissance et de début de carrière.' : null
  };

  function visible(c, valeurs) {
    if (c.pour && !c.pour.includes(valeurs.statut)) return false;
    if (c.quand && !c.quand(valeurs)) return false;
    return true;
  }

  /* valeurs : { idDuChamp: 'texte saisi' } → profil pour le moteur. Un champ masqué compte comme non renseigné. */
  function profil(valeurs) {
    const p = {};
    for (const c of CHAMPS) {
      const vis = visible(c, valeurs), raw = valeurs[c.id];
      let r;
      switch (c.type) {
        case 'oui_non': r = vis && raw === '1'; break;
        case 'choix': r = vis && raw ? raw : c.val; break;
        case 'nombre_facultatif': r = vis && raw !== '' && raw !== undefined && raw !== null ? +raw : null; break;
        default: { // nombre
          r = vis ? (+raw || 0) : 0;
          if (c.repli !== undefined && !r) r = c.repli;
        }
      }
      p[c.cle] = r;
    }
    return p;
  }

  /* ---- Situation enregistrée localement ----
     VERSION_FORMULAIRE : à augmenter quand le SENS ou l'UNITÉ d'un champ change sans changer son identifiant (ex. montant annuel
     devenu mensuel) : les situations enregistrées avant sont alors écartées au lieu d'être relues de travers.
     Champ renommé : garder l'ancien identifiant dans `ancien: ['ancienId']` du nouveau champ, la valeur est reprise.
     Champ supprimé : rien à faire (valeur ignorée), mais `node js/champs.test.js --maj-signature` doit être lancé pour l'acter. */
  const VERSION_FORMULAIRE = 1;

  /* Ne garde que des champs connus et des valeurs valides (nombre fini dans les bornes, option existante).
     brut : { idDuChamp: valeur } (anciens identifiants acceptés) → { idDuChamp: 'texte' }. */
  function nettoyer(brut, champs) {
    champs = champs || CHAMPS;
    const out = {};
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
    for (const c of champs) {
      const ids = [c.id].concat(c.ancien || []);
      const k = ids.find(i => Object.prototype.hasOwnProperty.call(brut, i));
      if (k === undefined) continue;
      const v = brut[k];
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      const s = String(v).trim();
      if (c.options) { if (c.options.some(o => o[0] === s)) out[c.id] = s; continue; }
      if (s === '') { if (c.type === 'nombre_facultatif') out[c.id] = ''; continue; }
      const x = +s;
      if (!Number.isFinite(x)) continue;
      if ((c.min !== undefined && x < c.min) || (c.max !== undefined && x > c.max)) continue;
      out[c.id] = s;
    }
    return out;
  }

  /* À enregistrer : seulement les champs que la personne a modifiés (les autres suivent les valeurs par défaut du site,
     qui peuvent évoluer). valeurs : { id: 'texte' } ; touches : ensemble d'identifiants. */
  function exporter(valeurs, touches, champs) {
    const sel = {};
    for (const c of champs || CHAMPS) if (touches.has(c.id) && c.id in valeurs) sel[c.id] = valeurs[c.id];
    return { version: VERSION_FORMULAIRE, champs: nettoyer(sel, champs) };
  }

  /* Relecture d'une donnée enregistrée (texte JSON). → { valeurs, perime } ; perime = version différente ou illisible. */
  function importer(texte, champs) {
    let o;
    try { o = JSON.parse(texte); } catch (e) { return { valeurs: {}, perime: true }; }
    if (!o || typeof o !== 'object' || o.version !== VERSION_FORMULAIRE) return { valeurs: {}, perime: true };
    return { valeurs: nettoyer(o.champs, champs), perime: false };
  }

  return { ACTIFS, GROUPES, CHAMPS, CONTROLES, VERSION_FORMULAIRE, visible, profil, nettoyer, exporter, importer };
});
