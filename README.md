# Présidentielle 2027 — comparateur

Site statique : liste des candidats, programmes par thème, sources.
Données dans `data/` (candidats.json, sources.json, themes.json, mesures/*.json).

Test en local : `python3 -m http.server` puis http://localhost:8000

## Objectif (5 étapes)
1. Liste à jour des candidats (déclarés, sous condition, pressentis, retirés).
2. Liste des thèmes (`data/themes.json`).
3. Programmes / mesures par candidat et par thème (`data/mesures/<id>.json`).
4. Simulateur : un citoyen saisit sa situation et voit ce que chaque programme changerait pour lui. **Fait pour 12 domaines** (salaire minimum, âge de retraite, TVA/énergie/carburant, heures sup, impôt sur le revenu, famille, logement/loyers, patrimoine/épargne/successions/donations, pensions des retraités, minima sociaux/handicap/étudiants, enseignants et agents publics, transports et péages). Le profil du citoyen a une situation (salarié, agent public, enseignant, recherche, retraité, étudiant, sans emploi). `js/engine.js` (moteur pur, testé par `node js/engine.test.js`) et `simulateur.html`. Le formulaire est généré depuis `js/champs.js` (testé par `node js/champs.test.js`) : une seule définition par donnée saisie (groupe, libellé, bulle d'aide « ? » précisant ce que la donnée désigne et à quelles mesures elle sert, règles d'affichage selon la situation, contrôles de cohérence). Les données sont rangées par thème : foyer, revenus d'activité, carrière et retraite, aides et handicap, études, logement, patrimoine/épargne/transmission, dépenses courantes, hypothèse de calcul. Pour ajouter une donnée, l'ajouter dans `CHAMPS` avec son aide.
5. Évaluation de chaque mesure : précédents (France/étranger), effets étudiés, coût et financement, avis d'experts, contraintes, niveau de connaissance (pas de probabilité chiffrée : décision de neutralité). **Fait pour 3 sujets** (âge de la retraite, SMIC, TVA) dans `data/evaluations.json` et `evaluations.html`. À étendre.

## Décisions de méthode
- **Neutralité** : candidats regroupés par famille (champ `famille` de `candidats.json`, d'après l'étiquette du parti ; « divers » pour sans-étiquette, souverainistes et mouvements sans famille établie) puis en ordre alphabétique, aucune mesure sans source, aucun score global par candidat, aucun avis éditorial.
- **Qui est traité** : tous les candidats déclarés (utile pour d'éventuelles primaires) et les pressentis ; seule Marine Le Pen est forcée dans la liste (incertitude judiciaire). Les candidats retirés restent dans l'historique mais pas dans le simulateur.
- **Programmes** : collectés dans tous les cas, même pour un candidat non officiellement déclaré. Si aucun programme n'existe, on relève les propositions rapportées par la presse, et `etat_programme` le dit.
- **Fiabilité de chaque mesure** (`fiabilite`) : `programme_officiel`, `presse`, `recensement_tiers`. Les contradictions entre sources vont dans `divergence` ; une mesure datant d'une campagne précédente est signalée.
- **Mesures simulables** : `simulable: true` avec des `parametres` chiffrés ; sinon la mesure est listée mais non calculée.
- **Vie privée** : le simulateur calcule dans le navigateur ; aucune donnée de citoyen n'est envoyée ni stockée.
- **Mise à jour de la liste des candidats** : manuelle, lancée par l'utilisateur (skill `maj-candidats-2027`), avec validation avant publication. Pas de tâche automatique.

## Format des données
- `candidats.json` : `id`, `nom`, `parti`, `statut` (declare, sous_condition, pressenti, retire), `famille` (extreme_gauche, gauche, ecologiste, centre, droite, extreme_droite, souverainiste, divers), `traite`, `force`, et en option `photo` (chemin d'une image locale, ex. `img/candidats/attal.jpg`) avec `photo_credit` (auteur et licence) ; sans photo, la page affiche les initiales.
- `mesures/<id>.json` : `candidat`, `etat_programme`, `verifie_le`, `mesures[]` (`id`, `theme`, `intitule`, `detail`, `chiffres`, `sources[]`, `fiabilite`, `simulable`, `parametres`, `divergence`).
- `sources.json` : `id`, `titre`, `media`, `date`, `url`.

## État de la collecte (25 novembre 2026)
27 candidats ont des mesures (vagues 1 à 6 ; la vague 6 a complété Dupont-Aignan, Philippot, Tondelier et Bertrand depuis les pages thématiques de votons-2027.fr). Programmes souvent partiels : voir `etat_programme` de chaque fichier.
Sans fiche : Barrot, Bergé, Billetdoux, Breton, Cheve, Collovati, Durif, Egger (programme de 82 mesures signalé, non relevé), Lagarde, Lalanne, Lassalle, Legendre, Markovic, Mathieu, Mikolajczak, Mlekuz, Pigasse, Platret, Riner, Rohou, Villiers.

## Mesures simulables encore non codées (à faire)
Allocation unique de Philippe (barème de dégressivité absent) ; pension alimentaire défiscalisée d'Attal (sens de la mesure ambigu : payeur ou bénéficiaire) ; APL et prestations selon la nationalité (Le Pen, Retailleau : décision à prendre sur le profil) ; baisses de cotisations (Le Maire, Lisnard, Villepin) et CSG de Glucksmann, à répartir au prorata de la masse salariale ; congé parental de Dupont-Aignan (montant de la source tierce à confirmer) ; carence de Zemmour ; dépassements d'honoraires de Tondelier ; impôt à 14 tranches de Mélenchon (barème à relever) ; ISF de Mélenchon, Roussel et Tondelier (taux et seuils à relever) ; chèque énergie de Glucksmann (seuils de revenu non publiés, seule une indication est affichée) ; encadrement des loyers de Tondelier (effet non chiffrable).

## Publication
GitHub Pages (dépôt public, branche `main`, racine) et copie privée sur un artifact claude.ai.

## Points à garder en tête pour une nouvelle session
- **Pas de mise à jour automatique.** L'utilisateur lance lui-même le skill `maj-candidats-2027` pour mettre à jour la liste des candidats ; ne pas créer de tâche planifiée pour cela.
- **À vérifier avant toute communication large :**
  - le SMIC du simulateur (1 502 € net au 1er décembre 2026, +1,6 %) est annoncé par le gouvernement (code.travail.gouv.fr), mais le décret n'était pas paru au 25 novembre 2026 : vérifier le taux horaire au Journal officiel ;
  - plusieurs avis des fiches d'évaluation (`data/evaluations.json`) viennent de comptes rendus secondaires, par exemple le rapport de la Cour des comptes d'avril 2025 lu à travers un article, ou le projet de rapport du COR 2026 lu à travers Groupama : retourner aux documents d'origine ;
  - l'ISF de Villepin est calculé « barème 2016 » (identique au barème de l'IFI actuel) : un autre relevé parle d'un impôt unique dès 2,2 M€, la divergence est signalée dans la fiche ;
  - les calculs sur les pensions supposent une revalorisation au 1er janvier sur l'inflation de l'année précédente, le gel de Hollande et d'Attal est supposé s'appliquer à ta pension, la désindexation de Le Maire est lue comme totale pendant cinq ans (borne haute) ;

## Vérification des valeurs de référence (25 novembre 2026)
Toutes les valeurs de `REF` dans `js/engine.js` ont été vérifiées sur des sources officielles : barème de l'impôt, plafond du quotient familial et décote (economie.gouv.fr, BOFiP du 7 avril 2026), âge légal et durée requise par génération (service-public.gouv.fr A18825), flat tax à 31,4 % (entreprendre.service-public.gouv.fr), IFI et sa décote (service-public.gouv.fr F138), droits de succession (F35794), chèque énergie (energie-info.fr), AAH, RSA, ASPA (service-public.gouv.fr, CAF, solidarites.gouv.fr), point d'indice (gelé à 4,92278 €), retenue pour pension de 11,10 % (retraitesdeletat.gouv.fr), droits d'inscription 2026-2027 (service-public.gouv.fr A17481), plafond des heures supplémentaires, prise en charge de 50 % de l'abonnement de transport (entreprendre.service-public.gouv.fr F37900), inflation 2027-2028 (Banque de France, 15 septembre 2026).

Correction : la génération 1961 passe de 62 ans 3 mois et 169 trimestres à 62 ans et 168 trimestres. Ce sont les valeurs des personnes nées de janvier à août, la majorité de l'année ; celles nées de septembre à décembre gardent 62 ans 3 mois et 169 trimestres. Pour l'AAH, la valeur de 1 041,59 € est confirmée (revalorisation de 0,8 %), les 1 042,61 € cités par certains sites supposaient 0,9 %.

Reste à surveiller : le décret SMIC de décembre 2026, et le PLF 2027, qui revaloriserait le barème de 2,1 % (plafond du quotient familial à 1 845 €, décote à 915 € et 1 513 €) et doublerait le plafond d'exonération des heures supplémentaires ; ces mesures ne sont pas en vigueur.
