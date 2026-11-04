/* Styles du site : classique (défaut depuis le 3 nov. 2026), « Cyberpunk × Matrice » et « Pamplemousse » (4 nov. 2026).
   Se charge dans <head> (pas d'éclair au chargement). ?theme=cyber | pample | classique choisit le style ; il est retenu
   dans ce navigateur. Trois boutons « Style » en bas de page permettent de changer. */
(function () {
  var CLE = 'colineaire-theme', DEFAUT = 'classique';
  var lire = function () { try { return localStorage.getItem(CLE); } catch (e) { return null; } };
  var ecrire = function (v) { try { localStorage.setItem(CLE, v); } catch (e) {} };
  var MODES = ['classique', 'cyber', 'pample'];
  var p = new URLSearchParams(location.search).get('theme');
  if (p === 'pamplemousse') p = 'pample';
  if (MODES.indexOf(p) >= 0) ecrire(p);
  var racine = document.documentElement;
  var mode = lire(); if (MODES.indexOf(mode) < 0) mode = DEFAUT;
  if (mode !== 'classique') racine.classList.add(mode);

  var POLICES = {
    cyber: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap',
    pample: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap'
  };
  function police(m) {
    if (!POLICES[m] || document.getElementById('police-' + m)) return;
    var l = document.createElement('link'); l.id = 'police-' + m; l.rel = 'stylesheet'; l.href = POLICES[m];
    document.head.appendChild(l);
  }
  police(mode);

  var calme = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };

  // pluie binaire en fond (0, 1 et quelques octets hexadécimaux) aux couleurs du thème ; 24 images/s, arrêtée onglet caché
  var arret = null;
  function pluie() {
    if (calme() || document.getElementById('matrice')) return;
    var c = document.createElement('canvas'); c.id = 'matrice'; c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    var g = c.getContext('2d'), T = 16, cols, y, larg, haut, ratio = Math.min(window.devicePixelRatio || 1, 2);
    var SIGNES = '0101010110AF3E7C9D', TEINTES = ['#00ff9c', '#00ff9c', '#00f0ff', '#00ff9c', '#fcee09', '#00ff9c', '#ff2a6d'];
    function taille() {
      larg = innerWidth; haut = innerHeight; c.width = larg * ratio; c.height = haut * ratio;
      g.setTransform(ratio, 0, 0, ratio, 0, 0); g.font = T + 'px "Share Tech Mono", monospace';
      cols = Math.ceil(larg / T); y = Array.from({ length: cols }, function () { return Math.random() * -haut / T; });
    }
    taille(); addEventListener('resize', taille);
    var dernier = 0, id;
    function image(t) {
      id = requestAnimationFrame(image);
      if (t - dernier < 42) return; dernier = t;
      g.fillStyle = 'rgba(10, 11, 20, .16)'; g.fillRect(0, 0, larg, haut);
      for (var i = 0; i < cols; i++) {
        g.fillStyle = Math.random() < .04 ? '#eaf6ff' : TEINTES[i % TEINTES.length];
        g.fillText(SIGNES[(Math.random() * SIGNES.length) | 0], i * T, y[i] * T);
        if (y[i] * T > haut && Math.random() > .975) y[i] = 0; else y[i] += 1;
      }
    }
    id = requestAnimationFrame(image);
    var vis = function () { cancelAnimationFrame(id); if (!document.hidden) id = requestAnimationFrame(image); };
    document.addEventListener('visibilitychange', vis);
    arret = function () { cancelAnimationFrame(id); removeEventListener('resize', taille); document.removeEventListener('visibilitychange', vis); c.remove(); };
  }

  // « déchiffrement » des grands titres : des 0 et des 1 défilent puis le vrai texte se fige
  function dechiffrer() {
    if (calme()) return;
    Array.prototype.forEach.call(document.querySelectorAll('.section-tete h2, .biblio-tete h1, .porte h1, .appel h2'), function (h) {
      if (h.children.length) return;
      var vrai = h.textContent, n = 0, etapes = 14;
      h.setAttribute('aria-label', vrai);
      var t = setInterval(function () {
        n++;
        h.textContent = vrai.split('').map(function (ch, i) {
          return ch === ' ' || i < (n / etapes) * vrai.length ? ch : (Math.random() < .5 ? '0' : '1');
        }).join('');
        if (n >= etapes) { clearInterval(t); h.textContent = vrai; }
      }, 45);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (mode === 'cyber') { pluie(); dechiffrer(); }
    var pied = document.querySelector('.pied .colonne');
    if (!pied) return;
    var groupe = document.createElement('span'); groupe.className = 'theme-choix'; groupe.setAttribute('role', 'group'); groupe.setAttribute('aria-label', 'Style du site');
    groupe.appendChild(document.createTextNode('Style '));
    var NOMS = { classique: 'Classique', cyber: 'Cyberpunk', pample: 'Pamplemousse' }, boutons = {};
    MODES.forEach(function (m) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'theme-bascule'; b.textContent = NOMS[m];
      b.addEventListener('click', function () { choisir(m); });
      boutons[m] = b; groupe.appendChild(b);
    });
    function maj() { MODES.forEach(function (m) { boutons[m].setAttribute('aria-pressed', m === mode ? 'true' : 'false'); }); }
    function choisir(m) {
      if (m === mode) return;
      racine.classList.remove('cyber', 'pample'); if (m !== 'classique') racine.classList.add(m);
      if (arret) { arret(); arret = null; }
      mode = m; ecrire(m); police(m); maj();
      if (m === 'cyber') { pluie(); dechiffrer(); }
    }
    maj(); pied.appendChild(groupe);
  });
})();
