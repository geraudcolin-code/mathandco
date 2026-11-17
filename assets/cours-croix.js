/* Polys à trous animés : la règle du cours qui monte du bas de la page se range avec une petite croix ✕
   (M. Colin, 17 nov. 2026). Elle reste rangée tant que la MÊME règle sert ; une autre règle, ou la même qui ressert
   plus loin après avoir disparu, la fait revenir. Le bouton « ▲ Règle du cours » la rouvre.
   Fichier commun, posé par outils/construire.py sur chaque page « …-poly-a-trous.html » ; il n'a besoin que de la
   carte #cours (et de son image #imgCoursBas) écrites par le moteur des polys. */
(function () {
  'use strict';
  var CSS =
    '#cours .cc-croix{position:absolute;top:6px;right:22px;width:38px;height:38px;border-radius:50%;border:1.5px solid var(--trait,#cfd6e3);' +
    'background:#fff;color:#4a5568;font:600 22px/1 system-ui,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
    'box-shadow:0 2px 8px rgba(23,35,58,.15);transition:background .15s,color .15s,transform .15s;z-index:2;padding:0}' +
    '#cours .cc-croix:hover,#cours .cc-croix:focus-visible{background:#D62828;color:#fff;border-color:#D62828;transform:scale(1.08);outline:none}' +
    '#cours .leg .masq{display:none}' +
    '#cours.cc-range{transform:translateY(110%)!important}' +
    '#ccMini{position:absolute;right:24px;bottom:10px;z-index:4;display:none;font:600 15px/1 inherit;font-family:inherit;padding:9px 14px;' +
    'border-radius:999px;border:1.5px solid var(--trait,#cfd6e3);background:#fff;color:#2F5FA8;cursor:pointer;box-shadow:0 4px 14px rgba(23,35,58,.18)}' +
    '#ccMini.on{display:block}#ccMini:hover{background:#2F5FA8;color:#fff}';

  function installer(carte) {
    if (carte.dataset.cc) return; carte.dataset.cc = '1';
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var croix = document.createElement('button');
    croix.type = 'button'; croix.className = 'cc-croix'; croix.textContent = '✕';
    croix.title = 'Masquer la règle du cours'; croix.setAttribute('aria-label', 'Masquer la règle du cours');
    carte.appendChild(croix);

    // moteur récent (TERM CH05…) : il range déjà la carte d'un clic et a son bouton #coursMini ; la croix lui suffit
    if (document.getElementById('coursMini')) { carte.style.cursor = 'default'; return; }

    var im = document.getElementById('imgCoursBas'), range = '';
    var mini = document.createElement('button');
    mini.type = 'button'; mini.id = 'ccMini'; mini.textContent = '▲ Règle du cours'; mini.title = 'Afficher la règle du cours utilisée ici';
    carte.parentNode.appendChild(mini);
    var nom = function () { return (im && im.dataset.name) || ''; };
    var maj = function () {
      var visible = carte.classList.contains('on');
      if (!visible || nom() !== range) range = '';          // règle qui ne sert plus, ou autre règle : elle revient
      carte.classList.toggle('cc-range', !!range);
      mini.classList.toggle('on', !!range && visible);
    };
    // le clic ne doit pas faire avancer l'animation (le moteur écoute les clics de la page)
    var arreter = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); };
    window.addEventListener('click', function (ev) {
      if (ev.target === croix || croix.contains(ev.target)) { arreter(ev); range = nom() || '?'; maj(); }
      else if (ev.target === mini) { arreter(ev); range = ''; maj(); }
    }, true);
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (t) {
      window.addEventListener(t, function (ev) { if (ev.target === croix || croix.contains(ev.target) || ev.target === mini) ev.stopPropagation(); }, true);
    });
    new MutationObserver(maj).observe(carte, { attributes: true, attributeFilter: ['class'] });
    if (im) new MutationObserver(maj).observe(im, { attributes: true, attributeFilter: ['data-name'] });
  }

  function chercher() { var c = document.getElementById('cours'); if (c && document.getElementById('imgCoursBas')) { installer(c); return true; } return false; }
  if (!chercher()) {
    var obs = new MutationObserver(function () { if (chercher()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
