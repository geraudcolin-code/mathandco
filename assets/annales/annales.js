/* Annales du bac (accès libre, Terminale) : deux entrées dans le même catalogue.
   « Par date » : les sujets du plus récent au plus ancien, chacun avec son sujet complet et ses exercices.
   « Par thème » : un chapitre choisi -> tous les exercices qui l'utilisent, du plus récent au plus ancien. */
(function () {
  var D = window.ANNALES; if (!D) return;
  var hote = document.querySelector('[data-annales]'); if (!hote) return;
  var THEME = {}; D.themes.forEach(function (t) { THEME[t.id] = t; });
  var MOIS = { janvier:1, 'février':2, mars:3, avril:4, mai:5, juin:6, juillet:7, 'août':8, septembre:9, octobre:10, novembre:11, 'décembre':12 };
  function cle(s) { var p = s.date.split(' '); return s.annee * 10000 + (MOIS[p[1]] || 0) * 100 + (+p[0] || 0) + s.jour / 10; }
  var tous = D.sujets.slice().sort(function (a, b) { return cle(b) - cle(a); });
  var voirTout = false;      /* par défaut : seulement les sujets qui ont au moins une correction */
  function fait(s) { return s.exercices.some(function (x) { return x.page; }); }
  var sujets = tous;
  function filtre() { sujets = voirTout ? tous : tous.filter(fait); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function nomSujet(s) { return s.lieu + ' · Jour ' + s.jour; }
  function lien(page, sujet, n) { return page === 'exemple' ? '#' : page; }

  function pastilles(ids, sauf) {
    var w = el('span', 'an-pastilles');
    ids.forEach(function (id) {
      if (!THEME[id]) return;
      var b = el('button', 'an-pastille' + (id === sauf ? ' ici' : ''), THEME[id].titre); b.type = 'button';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); vue('theme', id); });
      w.appendChild(b);
    });
    return w;
  }
  function ligneExo(s, x, mode, themeCourant) {
    var dispo = !!x.page;
    var a = el(dispo ? 'a' : 'div', 'an-exo' + (dispo ? '' : ' an-bientot'));
    if (dispo) a.href = lien(x.page, s, x.n);
    var tete = el('span', 'an-exo-tete');
    tete.appendChild(el('span', 'an-exo-n', 'Exercice ' + (x.label || x.n)));
    tete.appendChild(el('span', 'an-exo-pts', x.pts + ' pts'));
    if (mode === 'theme') tete.appendChild(el('span', 'an-exo-src', nomSujet(s) + ' · ' + s.date));
    a.appendChild(tete);
    a.appendChild(el('span', 'an-exo-titre', x.titre));
    if (mode !== 'date') a.appendChild(pastilles(x.themes, themeCourant));   /* par date : seulement le nom de l'exercice */
    a.appendChild(el('span', 'an-exo-etat', dispo ? 'Correction animée ›' : 'Bientôt'));
    return a;
  }

  var corps = el('div', 'an-corps');
  function parDate() {
    corps.innerHTML = '';
    if (!sujets.length) corps.appendChild(el('p', 'an-aide', 'Les premières corrections arrivent bientôt.'));
    var annee = null, grille;
    sujets.forEach(function (s) {
      if (s.annee !== annee) {
        annee = s.annee;
        corps.appendChild(el('h3', 'an-annee', 'Session ' + annee));
        grille = el('div', 'an-grille'); corps.appendChild(grille);
      }
      var c = el('article', 'an-sujet');
      var t = el('header', 'an-sujet-tete');
      var tt = el('div'); tt.appendChild(el('h4', 'an-sujet-nom', nomSujet(s))); tt.appendChild(el('p', 'an-sujet-date', s.date));
      t.appendChild(tt);
      var faits = s.exercices.filter(function (x) { return x.page; }).length, tous = faits === s.exercices.length;
      var b = el(tous ? 'a' : 'span', 'an-complet' + (tous ? '' : ' an-bientot'), tous ? 'Sujet complet ›' : faits + ' / ' + s.exercices.length + ' corrigés');
      if (tous) b.href = s.complet || '#';
      t.appendChild(b); c.appendChild(t);
      s.exercices.forEach(function (x) { c.appendChild(ligneExo(s, x, 'date')); });
      grille.appendChild(c);
    });
  }
  function parTheme(id) {
    corps.innerHTML = '';
    var compte = {};
    sujets.forEach(function (s) { s.exercices.forEach(function (x) { if (!voirTout && !x.page) return; x.themes.forEach(function (t) { compte[t] = (compte[t] || 0) + 1; }); }); });
    var choix = el('div', 'an-themes');
    D.themes.forEach(function (t) {
      var b = el('button', 'an-theme' + (t.id === id ? ' actif' : '')); b.type = 'button';
      b.setAttribute('aria-pressed', t.id === id ? 'true' : 'false');
      b.appendChild(el('span', 'an-theme-titre', t.titre));
      b.appendChild(el('span', 'an-theme-n', String(compte[t.id] || 0)));
      if (!compte[t.id]) b.disabled = true;
      b.addEventListener('click', function () { vue('theme', t.id); });
      choix.appendChild(b);
    });
    corps.appendChild(choix);
    if (!id) { corps.appendChild(el('p', 'an-aide', 'Choisis un chapitre : tous les exercices de bac qui l’utilisent s’affichent, des plus récents aux plus anciens. Sous chaque exercice, tous les chapitres dont il a besoin : vérifie que tu les as tous vus avant de t’y lancer.')); return; }
    corps.appendChild(el('h3', 'an-annee', THEME[id].titre));
    var g = el('div', 'an-liste');
    sujets.forEach(function (s) { s.exercices.forEach(function (x) { if ((voirTout || x.page) && x.themes.indexOf(id) >= 0) g.appendChild(ligneExo(s, x, 'theme', id)); }); });
    corps.appendChild(g);
  }

  var seg = el('div', 'segments an-vues'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Ranger les annales');
  var bDate = el('button', null, 'Par date'), bTheme = el('button', null, 'Par chapitre');
  [bDate, bTheme].forEach(function (b) { b.type = 'button'; seg.appendChild(b); });
  var courant = { v: 'date', t: null };
  function vue(v, t) {
    courant.v = v; if (t !== undefined) courant.t = t;
    bDate.setAttribute('aria-pressed', v === 'date'); bTheme.setAttribute('aria-pressed', v === 'theme');
    filtre();
    if (v === 'date') parDate(); else parTheme(courant.t);
    if (t) hote.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  bDate.addEventListener('click', function () { vue('date'); });
  bTheme.addEventListener('click', function () { vue('theme'); });
  if (D.maquette) hote.appendChild(el('p', 'an-maquette', 'Maquette : sujets et chapitres fictifs, pour juger la présentation.'));
  var aVenir = tous.length - tous.filter(fait).length;
  var opt = el('label', 'an-option');
  var cb = el('input'); cb.type = 'checkbox';
  cb.addEventListener('change', function () { voirTout = cb.checked; vue(courant.v); });
  opt.appendChild(cb); opt.appendChild(document.createTextNode(' Afficher aussi les sujets pas encore corrigés (' + aVenir + ')'));
  hote.appendChild(seg); if (aVenir) hote.appendChild(opt); hote.appendChild(corps); vue('date');
  /* les deux tuiles de l'onglet Terminale ouvrent le même catalogue, chacune dans sa présentation */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-annales-vue]');
    if (t) vue(t.dataset.annalesVue, t.dataset.annalesVue === 'theme' ? null : undefined);
  });
})();
