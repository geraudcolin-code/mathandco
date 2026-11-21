/* Catalogue des annales du bac (accès libre, Terminale).
   Un sujet = une session (année, centre, jour) ; chaque exercice porte la liste des chapitres qu'il utilise
   (identifiants de THEMES, dans l'ordre de la progression, affichés SANS numéro).
   page : adresse de la correction animée de l'exercice (null tant qu'elle n'est pas faite).
   MAQUETTE du 22 nov. 2026 : sujets et thèmes ci-dessous sont des données d'essai, remplacées par l'inventaire réel. */
window.ANNALES = {
  maquette: true,
  themes: [
    { id: 'recurrence',   titre: 'Suites et récurrence' },
    { id: 'lim-suites',   titre: 'Limites de suites' },
    { id: 'lim-fonctions',titre: 'Limites de fonctions' },
    { id: 'espace',       titre: 'Vecteurs, droites et plans de l’espace' },
    { id: 'derivation',   titre: 'Compléments sur la dérivation, convexité' },
    { id: 'continuite',   titre: 'Continuité des fonctions' },
    { id: 'prod-scal',    titre: 'Produit scalaire dans l’espace, orthogonalité, distances' },
    { id: 'ln',           titre: 'Fonction logarithme népérien' },
    { id: 'param',        titre: 'Représentations paramétriques et équations cartésiennes' },
    { id: 'denombrement', titre: 'Combinatoire et dénombrement' },
    { id: 'primitives',   titre: 'Primitives et équations différentielles' },
    { id: 'bernoulli',    titre: 'Succession d’épreuves indépendantes, schéma de Bernoulli' },
    { id: 'integrale',    titre: 'Calcul intégral' },
    { id: 'sommes-va',    titre: 'Sommes de variables aléatoires' },
    { id: 'concentration',titre: 'Concentration et loi des grands nombres' },
    { id: 'trigo',        titre: 'Fonctions trigonométriques' },
    { id: 'premiere',     titre: 'Notions de Première (exponentielle, probabilités conditionnelles…)' },
    { id: 'python',       titre: 'Algorithmique et Python' }
  ],
  sujets: [
    { id: '2025-met-j2', annee: 2025, lieu: 'Métropole', jour: 2, date: '18 juin 2025', exercices: [
      { n: 1, pts: 5, titre: 'Probabilités', themes: ['premiere', 'bernoulli'], page: null },
      { n: 2, pts: 5, titre: 'Géométrie dans l’espace', themes: ['espace', 'prod-scal', 'param'], page: null },
      { n: 3, pts: 4, titre: 'Fonction et suite', themes: ['ln', 'derivation', 'recurrence'], page: null },
      { n: 4, pts: 6, titre: 'Intégrale', themes: ['integrale', 'primitives'], page: null } ] },
    { id: '2025-met-j1', annee: 2025, lieu: 'Métropole', jour: 1, date: '17 juin 2025', exercices: [
      { n: 1, pts: 4, titre: 'Vrai-faux', themes: ['lim-fonctions', 'denombrement', 'sommes-va'], page: null },
      { n: 2, pts: 5, titre: 'Suite récurrente', themes: ['recurrence', 'lim-suites', 'python'], page: null },
      { n: 3, pts: 5, titre: 'Géométrie dans l’espace', themes: ['espace', 'param'], page: null },
      { n: 4, pts: 6, titre: 'Étude de fonction', themes: ['derivation', 'ln', 'continuite'], page: null } ] },
    { id: '2024-ce-j2', annee: 2024, lieu: 'Centres étrangers', jour: 2, date: '6 juin 2024', exercices: [
      { n: 1, pts: 5, titre: 'Probabilités', themes: ['premiere', 'bernoulli', 'concentration'], page: null },
      { n: 2, pts: 5, titre: 'Fonction racine et suite', themes: ['derivation', 'recurrence', 'lim-suites'], page: 'exemple' },
      { n: 3, pts: 5, titre: 'Géométrie dans l’espace', themes: ['espace', 'prod-scal'], page: null },
      { n: 4, pts: 5, titre: 'Équation différentielle', themes: ['primitives', 'integrale'], page: null } ] },
    { id: '2023-pol-j2', annee: 2023, lieu: 'Polynésie', jour: 2, date: '14 mars 2023', exercices: [
      { n: 1, pts: 5, titre: 'Probabilités', themes: ['premiere', 'bernoulli'], page: null },
      { n: 2, pts: 5, titre: 'Géométrie dans l’espace', themes: ['espace', 'param'], page: null },
      { n: 3, pts: 5, titre: 'Convexité', themes: ['derivation', 'lim-fonctions'], page: 'exemple' },
      { n: 4, pts: 5, titre: 'Suites', themes: ['recurrence', 'lim-suites'], page: null } ] },
    { id: '2021-met-s1', annee: 2021, lieu: 'Métropole', jour: 1, date: '13 septembre 2021', exercices: [
      { n: 1, pts: 7, titre: 'Système de suites récurrentes', themes: ['recurrence', 'lim-suites', 'premiere'], page: 'exemple' },
      { n: 2, pts: 7, titre: 'Fonction logarithme', themes: ['ln', 'derivation'], page: null },
      { n: 3, pts: 7, titre: 'Géométrie dans l’espace', themes: ['espace', 'prod-scal'], page: null } ] }
  ]
};
