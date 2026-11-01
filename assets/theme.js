/* Thème d'essai « Matrice » : se charge dans <head> (pas d'éclair blanc au chargement).
   ?theme=cyber l'active, ?theme=classique le retire ; le choix est retenu dans ce navigateur.
   Un bouton « Style » en bas de page bascule de l'un à l'autre. */
(function () {
  var CLE = 'colineaire-theme', DEFAUT = 'classique';
  var lire = function () { try { return localStorage.getItem(CLE); } catch (e) { return null; } };
  var ecrire = function (v) { try { localStorage.setItem(CLE, v); } catch (e) {} };
  var p = new URLSearchParams(location.search).get('theme');
  if (p === 'cyber' || p === 'classique') ecrire(p);
  var theme = lire() || DEFAUT;
  var racine = document.documentElement;
  if (theme === 'cyber') racine.classList.add('cyber');

  var POLICE = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap';
  function police() {
    if (document.getElementById('police-cyber')) return;
    var l = document.createElement('link'); l.id = 'police-cyber'; l.rel = 'stylesheet'; l.href = POLICE;
    document.head.appendChild(l);
  }

  // pluie binaire en fond (0 et 1, quelques octets en hexadécimal), légère : 24 images par seconde, arrêtée si l'onglet est caché
  var arret = null;
  function pluie() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.createElement('canvas'); c.id = 'matrice'; c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    var g = c.getContext('2d'), T = 16, cols, y, larg, haut, ratio = Math.min(window.devicePixelRatio || 1, 2);
    var SIGNES = '0101010110AF3E7C9D';
    function taille() {
      larg = innerWidth; haut = innerHeight; c.width = larg * ratio; c.height = haut * ratio;
      g.setTransform(ratio, 0, 0, ratio, 0, 0); g.font = '600 ' + T + 'px "JetBrains Mono", monospace';
      cols = Math.ceil(larg / T); y = Array.from({ length: cols }, function () { return Math.random() * -haut / T; });
    }
    taille(); addEventListener('resize', taille);
    var dernier = 0, id;
    function image(t) {
      id = requestAnimationFrame(image);
      if (t - dernier < 42) return; dernier = t;
      g.fillStyle = 'rgba(4, 7, 10, .16)'; g.fillRect(0, 0, larg, haut);
      for (var i = 0; i < cols; i++) {
        var s = SIGNES[(Math.random() * SIGNES.length) | 0];
        g.fillStyle = Math.random() < .04 ? '#d9ffec' : (i % 7 === 0 ? '#00f0ff' : '#00ff9c');
        g.fillText(s, i * T, y[i] * T);
        if (y[i] * T > haut && Math.random() > .975) y[i] = 0; else y[i] += 1;
      }
    }
    id = requestAnimationFrame(image);
    var vis = function () { if (document.hidden) cancelAnimationFrame(id); else id = requestAnimationFrame(image); };
    document.addEventListener('visibilitychange', vis);
    arret = function () { cancelAnimationFrame(id); removeEventListener('resize', taille); document.removeEventListener('visibilitychange', vis); c.remove(); };
  }

  // « déchiffrement » des grands titres : quelques signes binaires défilent puis le vrai texte se fige
  function dechiffrer() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var titres = document.querySelectorAll('.hero h1, .section-tete h2, .biblio-tete h1, .porte h1, .appel h2');
    Array.prototype.forEach.call(titres, function (h) {
      if (h.children.length) return;                       // titre composé (logo, formule) : laissé tel quel
      var vrai = h.textContent, n = 0, etapes = 14;
      h.setAttribute('aria-label', vrai);
      var t = setInterval(function () {
        n++;
        h.textContent = vrai.split('').map(function (ch, i) {
          if (ch === ' ' || i < (n / etapes) * vrai.length) return ch;
          return Math.random() < .5 ? '0' : '1';
        }).join('');
        if (n >= etapes) { clearInterval(t); h.textContent = vrai; }
      }, 45);
    });
  }

  function bouton() {
    var pied = document.querySelector('.pied .colonne');
    if (!pied) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'theme-bascule';
    var maj = function () { b.textContent = racine.classList.contains('cyber') ? 'Style : Matrice ⇄ classique' : 'Style : classique ⇄ Matrice'; };
    maj();
    b.addEventListener('click', function () {
      var on = racine.classList.toggle('cyber'); ecrire(on ? 'cyber' : 'classique'); maj();
      if (on) { police(); pluie(); dechiffrer(); } else if (arret) { arret(); arret = null; }
    });
    pied.appendChild(b);
  }

  if (theme === 'cyber') police();
  document.addEventListener('DOMContentLoaded', function () {
    bouton();
    if (racine.classList.contains('cyber')) { pluie(); dechiffrer(); }
  });
})();
