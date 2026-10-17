# Colinéaire

Site des corrections animées de mathématiques (GitHub Pages).

- `index.html` : accueil public.
- `eleves.html` : espace élèves (catalogue chiffré, mot de passe donné en classe).
- `corrections/` : les corrections animées, chacune chiffrée par mot de passe.
- `assets/` : styles et scripts du site ; `catalogue.js` est généré, ne pas le modifier.
- `outils/construire.py` : ajoute une correction et reconstruit le catalogue
  (`MATHANDCO_MDP=… python3 outils/construire.py ajouter page.html`). Le mot de passe n'est jamais écrit dans le dépôt.
