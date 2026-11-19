# Colinéaire

Site des corrections animées de mathématiques (GitHub Pages).

- `index.html` : accueil public.
- `eleves.html` : espace élèves (catalogue chiffré, mot de passe donné en classe).
- `corrections/` : les corrections animées, chacune chiffrée par mot de passe, et leurs corrigés PDF
  (`*.pdf.bin`, chiffrés eux aussi : le dépôt est public).
- `assets/` : styles et scripts du site ; `catalogue.js` est généré, ne pas le modifier.
- `outils/construire.py` : ajoute une correction et reconstruit le catalogue
  (`MATHANDCO_MDP=… python3 outils/construire.py ajouter page.html corrige.pdf`). Le mot de passe n'est jamais écrit dans le dépôt.
  Un PDF nommé comme la correction (`[2nd]CH02_Correction_Exercice1.pdf`) est chiffré dans `corrections/` ; l'espace élèves
  et la correction proposent alors un bouton « Corrigé PDF » (déchiffré dans le navigateur).
- `acces.json` : liste des corrections OUVERTES aux élèves ; les autres sont grisées dans l'espace élèves et leur page refuse de
  s'ouvrir. Une correction ajoutée arrive fermée. `admin.html` (Espace professeur) ouvre / ferme les corrections et publie
  `acces.json` par l'API GitHub avec la clé personnelle du professeur ; en ligne de commande :
  `python3 outils/construire.py ouvrir 2nde-ch03-exercice-5` (ou `fermer`, motifs avec `*` acceptés).
- `notes-modes.json` (19 nov. 2026) : quiz de chapitre NOTÉS (les autres sont en entraînement) et, pour chaque quiz,
  l'identifiant de ses résultats et son intitulé dans notes.html. Public (ce n'est pas un secret), lu par `assets/quiz.js`
  dans la page du quiz ; `admin.html` le change (interrupteur « Entraînement / Noté ») ; en ligne de commande :
  `python3 outils/construire.py noter term-ch02-quiz-suites` (ou `entrainer`). Absent ou illisible : chaque page de quiz
  garde le mode inscrit dans sa page chiffrée.

## Devoirs surveillés (espace élèves)

- Le bloc « Devoirs surveillés » d'un chapitre reste **fermé** (cadenas, aucun nombre d'exercices ni titre) tant qu'aucune de ses
  corrections n'est ouverte ; une fois ouvert, il montre deux sections pleine largeur, « Sujet A » et « Sujet B », avec seulement
  les exercices ouverts.
- Le catalogue des élèves ne contient **ni titre ni consigne** pour les devoirs surveillés (seulement `ds`, `sujet`, `numero`) ;
  les intitulés sont gardés dans `assets/cle.js` (chiffré avec le mot de passe professeur) pour l'Espace professeur.
  `construire.py cle` refait donc tout le catalogue.
