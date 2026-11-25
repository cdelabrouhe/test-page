# Présidentielle 2027 — comparateur

Site statique : liste des candidats, programmes par thème, sources.
Données dans `data/` (candidats.json, sources.json, themes.json, mesures/*.json).

Test en local : `python3 -m http.server` puis http://localhost:8000

## Objectif (5 étapes)
1. Liste à jour des candidats (déclarés, sous condition, pressentis, retirés).
2. Liste des thèmes (`data/themes.json`).
3. Programmes / mesures par candidat et par thème (`data/mesures/<id>.json`).
4. Simulateur : un citoyen saisit sa situation (âge, famille, revenus, début de carrière, patrimoine…) et voit ce que chaque programme changerait pour lui. **À faire.**
5. Évaluation de chaque mesure : précédents (France/étranger), probabilité de réussite, financement, avis d'experts. **À faire.**

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
28 candidats ont des mesures (vagues 1 à 5). Programmes souvent partiels : voir `etat_programme` de chaque fichier.
Sans fiche : Barrot, Bergé, Billetdoux, Breton, Cheve, Collovati, Durif, Egger (programme de 82 mesures signalé, non relevé), Lagarde, Lalanne, Lassalle, Legendre, Markovic, Mathieu, Mikolajczak, Mlekuz, Pigasse, Platret, Riner, Rohou, Villiers.

## Publication
GitHub Pages (dépôt public, branche `main`, racine) et copie privée sur un artifact claude.ai.
