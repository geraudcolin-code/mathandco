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
