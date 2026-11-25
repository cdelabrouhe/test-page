# Présidentielle 2027 — comparateur

Site statique : liste des candidats, programmes par thème, sources.
Données dans `data/` (candidats.json, sources.json, themes.json, mesures/*.json).

Test en local : `python3 -m http.server` puis http://localhost:8000

## Objectif (5 étapes)
1. Liste à jour des candidats (déclarés, sous condition, pressentis, retirés).
2. Liste des thèmes (`data/themes.json`).
3. Programmes / mesures par candidat et par thème (`data/mesures/<id>.json`).
4. Simulateur : un citoyen saisit sa situation et voit ce que chaque programme changerait pour lui. **Fait pour 11 domaines** (salaire minimum, âge de retraite, TVA/énergie, heures sup, impôt sur le revenu, famille, logement, patrimoine/succession, pensions des retraités, minima sociaux/handicap/étudiants, enseignants et agents publics). Le profil du citoyen a une situation (salarié, agent public, enseignant, recherche, retraité, étudiant, sans emploi). `js/engine.js` (moteur pur, testé par `node js/engine.test.js`) et `simulateur.html`.
5. Évaluation de chaque mesure : précédents (France/étranger), effets étudiés, coût et financement, avis d'experts, contraintes, niveau de connaissance (pas de probabilité chiffrée : décision de neutralité). **Fait pour 3 sujets** (âge de la retraite, SMIC, TVA) dans `data/evaluations.json` et `evaluations.html`. À étendre.

## Décisions de méthode
- **Neutralité** : candidats en ordre alphabétique, aucune mesure sans source, aucun score global par candidat, aucun avis éditorial.
- **Qui est traité** : tous les candidats déclarés (utile pour d'éventuelles primaires) et les pressentis ; seule Marine Le Pen est forcée dans la liste (incertitude judiciaire). Les candidats retirés restent dans l'historique mais pas dans le simulateur.
- **Programmes** : collectés dans tous les cas, même pour un candidat non officiellement déclaré. Si aucun programme n'existe, on relève les propositions rapportées par la presse, et `etat_programme` le dit.
- **Fiabilité de chaque mesure** (`fiabilite`) : `programme_officiel`, `presse`, `recensement_tiers`. Les contradictions entre sources vont dans `divergence` ; une mesure datant d'une campagne précédente est signalée.
- **Mesures simulables** : `simulable: true` avec des `parametres` chiffrés ; sinon la mesure est listée mais non calculée.
- **Vie privée** : le simulateur calcule dans le navigateur ; aucune donnée de citoyen n'est envoyée ni stockée.
- **Mise à jour de la liste des candidats** : manuelle, lancée par l'utilisateur (skill `maj-candidats-2027`), avec validation avant publication. Pas de tâche automatique.

## Format des données
- `candidats.json` : `id`, `nom`, `parti`, `statut` (declare, sous_condition, pressenti, retire), `traite`, `force`.
- `mesures/<id>.json` : `candidat`, `etat_programme`, `verifie_le`, `mesures[]` (`id`, `theme`, `intitule`, `detail`, `chiffres`, `sources[]`, `fiabilite`, `simulable`, `parametres`, `divergence`).
- `sources.json` : `id`, `titre`, `media`, `date`, `url`.

## État de la collecte (25 novembre 2026)
27 candidats ont des mesures (vagues 1 à 6 ; la vague 6 a complété Dupont-Aignan, Philippot, Tondelier et Bertrand depuis les pages thématiques de votons-2027.fr). Programmes souvent partiels : voir `etat_programme` de chaque fichier.
Sans fiche : Barrot, Bergé, Billetdoux, Breton, Cheve, Collovati, Durif, Egger (programme de 82 mesures signalé, non relevé), Lagarde, Lalanne, Lassalle, Legendre, Markovic, Mathieu, Mikolajczak, Mlekuz, Pigasse, Platret, Riner, Rohou, Villiers.

## Mesures simulables encore non codées (à faire)
Pension minimale de Lisnard sous condition d'âge à vérifier ; ISF 2016 de Villepin, plus-values à 22 % de Lisnard, donations de Le Pen et Dupont-Aignan, héritage plafonné de Mélenchon, contribution de Glucksmann sur 100 M€ ; carburant à −20 cts de Glucksmann (paramètre à ajouter), chèque énergie, prix bloqué du carburant de Roussel, péages et transports gratuits ; gel des loyers de Kazib ; pension alimentaire défiscalisée d'Attal ; allocation unique de Philippe ; APL et prestations selon la nationalité (Le Pen, Retailleau : décision à prendre sur le profil) ; baisses de cotisations (Le Maire, Lisnard, Villepin) et CSG de Glucksmann ; congé parental de Dupont-Aignan ; carence de Zemmour ; dépassements d'honoraires de Tondelier ; impôt à 14 tranches de Mélenchon (barème à relever).

## Publication
GitHub Pages (dépôt public, branche `main`, racine) et copie privée sur un artifact claude.ai.

## Points à garder en tête pour une nouvelle session
- **Pas de mise à jour automatique.** L'utilisateur lance lui-même le skill `maj-candidats-2027` pour mettre à jour la liste des candidats ; ne pas créer de tâche planifiée pour cela.
- **À vérifier avant toute communication large :**
  - le SMIC du simulateur (1 502 € net au 1er décembre 2026, +1,6 %) ne repose que sur un article de LCP, à confirmer sur une source officielle ;
  - plusieurs avis des fiches d'évaluation (`data/evaluations.json`) viennent de comptes rendus secondaires, par exemple le rapport de la Cour des comptes d'avril 2025 lu à travers un article, ou le projet de rapport du COR 2026 lu à travers Groupama : retourner aux documents d'origine ;
  - nouvelles références du moteur, relevées dans des sites secondaires et à confirmer sur Légifrance ou service-public.gouv.fr : AAH 1 041,59 € (deux sites donnent 1 042,61 €, écart de 0,1 % de revalorisation), RSA 651,69 €, ASPA 1 043,59 €, valeur du point d'indice 4,92278 €, taux des retenues des agents publics (11,10 % de pension civile, CSG-CRDS 9,7 % sur 98,25 %), droits d'inscription 178 € (licence) et 255 € (master), inflation 2027-2028 de la Banque de France (document d'origine lu à travers ses pages de synthèse) ;
  - les calculs sur les pensions supposent une revalorisation au 1er janvier sur l'inflation de l'année précédente, le gel de Hollande et d'Attal est supposé s'appliquer à ta pension, la désindexation de Le Maire est lue comme totale pendant cinq ans (borne haute) ;
  - le plafond du quotient familial utilisé par le moteur (1 807 € par demi-part) est déduit de l'indexation de 0,9 %, pas lu directement dans une source.
