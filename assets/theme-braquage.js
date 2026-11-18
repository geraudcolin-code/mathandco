/* Colinéaire — mouvement et images du thème « Braquage » (chargé par theme.js seulement dans ce style).
   - place les affiches « Braquage de math » (accueil, portes d'entrée, accès libre) ;
   - un hélicoptère traverse de temps en temps le coucher de soleil, projecteur allumé ;
   - quiz : bandeau « Mission réussie » / « Raté » en plus de la coche verte et de l'écran rouge. */
(function () {
  if (window.__braquage) return;
  var BASE = (document.currentScript && document.currentScript.src || '').replace(/theme-braquage\.js.*$/, '') || 'assets/';
  var IMG = { euler: BASE + 'braquage/affiche-euler.webp', pythagore: BASE + 'braquage/affiche-pythagore.webp' };
  var calme = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var poses = [], minuterie = null, helico = null, ecoute = false;

  function affiche(parent, avant, nom, classe) {
    if (!parent || parent.querySelector('.bq-affiche')) return;
    var i = document.createElement('img');
    i.className = 'bq-affiche ' + classe; i.src = IMG[nom]; i.alt = ''; i.decoding = 'async'; i.loading = 'lazy';
    parent.insertBefore(i, avant || null); poses.push(i);
  }
  function placer() {
    var hero = document.querySelector('.hero .colonne');
    if (hero) affiche(hero, null, 'euler', 'bq-affiche-hero');
    var form = document.querySelector('.porte form');
    if (form) affiche(form.parentNode, form, 'pythagore', 'bq-affiche-porte');
    if (/libre\.html/.test(location.pathname)) {
      var tete = document.querySelector('.biblio-tete');
      if (tete) affiche(tete, null, 'pythagore', 'bq-affiche-tete');
    }
  }

  function vol() {
    if (calme() || document.hidden || !document.documentElement.classList.contains('braq')) return;
    if (!helico) {
      helico = document.createElement('div'); helico.id = 'bq-helico'; helico.setAttribute('aria-hidden', 'true');
      helico.innerHTML = '<div class="faisceau"></div><svg viewBox="0 0 120 60"><g fill="#23103d">' +
        '<rect class="rotor" x="18" y="7" width="84" height="4" rx="2"/><rect x="58" y="10" width="4" height="8"/>' +
        '<path d="M40 18 h36 q16 0 18 14 q0 10 -14 10 h-36 q-10 0 -12 -12 z"/><path d="M40 26 l-34 -6 l-4 -10 l6 0 l8 8 l26 2 z"/>' +
        '<rect x="44" y="44" width="40" height="3"/><rect x="50" y="40" width="3" height="6"/><rect x="74" y="40" width="3" height="6"/></g>' +
        '<path d="M78 21 q12 1 13 11 h-13 z" fill="#ffd36b" opacity=".8"/></svg>';
      document.body.appendChild(helico);
    }
    helico.classList.remove('vol'); void helico.offsetWidth; helico.classList.add('vol');
  }

  function bandeau(type) {
    if (!document.documentElement.classList.contains('braq')) return;
    var b = document.querySelector('.bq-bandeau');
    if (!b) { b = document.createElement('div'); b.className = 'bq-bandeau'; b.setAttribute('aria-hidden', 'true'); document.body.appendChild(b); }
    b.className = 'bq-bandeau ' + (type === 'juste' ? 'reussi' : 'rate');
    b.innerHTML = type === 'juste' ? '<span>Mission réussie</span><small>Respect +</small>' : '<span>Raté</span>';
    void b.offsetWidth; b.classList.add('actif');
  }
  function surJuste() { bandeau('juste'); }
  function surFaux() { bandeau('faux'); }

  function demarrer() {
    placer();
    if (!ecoute) { document.addEventListener('quiz:juste', surJuste); document.addEventListener('quiz:faux', surFaux); ecoute = true; }
    if (!minuterie) { setTimeout(vol, 2500); minuterie = setInterval(vol, 34000); }
  }
  function arreter() {
    poses.forEach(function (i) { i.remove(); }); poses = [];
    if (minuterie) { clearInterval(minuterie); minuterie = null; }
    if (helico) { helico.remove(); helico = null; }
    var b = document.querySelector('.bq-bandeau'); if (b) b.remove();
  }
  window.__braquage = { demarrer: demarrer, arreter: arreter };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
