/* mathandco : barre de navigation, apparitions au défilement, page de cahier animée de l'accueil. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // barre de navigation : filet dès qu'on a défilé
  var nav = document.getElementById('nav');
  function surDefilement() {
    if (nav) nav.classList.toggle('defile', window.scrollY > 8);
  }
  window.addEventListener('scroll', surDefilement, { passive: true });
  surDefilement();

  // apparitions : les blocs restent visibles, ils glissent seulement un peu en entrant
  if ('IntersectionObserver' in window && !calme) {
    var blocs = document.querySelectorAll('.revele');
    var vus = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.remove('attend'); vus.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    blocs.forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (r.top > window.innerHeight) { b.classList.add('attend'); vus.observe(b); }
    });
  }

  // ---------- page de cahier : double distributivité ----------
  var zone = document.getElementById('zone');
  if (!zone) return;
  var svg = document.getElementById('fleches');
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };
  var etapeTxt = $('etape'), barre = $('barre'), cahier = $('cahier');

  function couleur(nom) { return getComputedStyle(document.documentElement).getPropertyValue(nom).trim(); }

  // flèche courbe du facteur vers le terme, au-dessus (haut = true) ou au-dessous ; tracée de gauche à droite,
  // en ralentissant, la pointe n'apparaissant qu'à l'arrivée
  function fleche(de, vers, haut, coul) {
    var z = zone.getBoundingClientRect(), a = $(de).getBoundingClientRect(), b = $(vers).getBoundingClientRect();
    var s = z.width / zone.offsetWidth || 1; // la feuille peut être légèrement mise à l'échelle
    var x1 = (a.left + a.width / 2 - z.left) / s, x2 = (b.left + b.width / 2 - z.left) / s;
    var y1 = ((haut ? a.top : a.bottom) - z.top) / s + (haut ? 4 : -4), y2 = ((haut ? b.top : b.bottom) - z.top) / s + (haut ? 4 : -4);
    var h = Math.min(46, 16 + Math.abs(x2 - x1) * .18) * (haut ? -1 : 1);
    var cx = (x1 + x2) / 2, cy = Math.min(y1, y2) + h;
    if (!haut) cy = Math.max(y1, y2) + h;
    var g = document.createElementNS(NS, 'g');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M' + x1 + ' ' + y1 + ' Q' + cx + ' ' + cy + ' ' + x2 + ' ' + y2);
    p.setAttribute('stroke', coul);
    g.appendChild(p);
    // pointe : tangente en fin de courbe
    var ang = Math.atan2(y2 - cy, x2 - cx), L = 9, o = .45;
    var pt = document.createElementNS(NS, 'path');
    pt.setAttribute('d', 'M' + (x2 - L * Math.cos(ang - o)) + ' ' + (y2 - L * Math.sin(ang - o)) + ' L' + x2 + ' ' + y2 + ' L' +
      (x2 - L * Math.cos(ang + o)) + ' ' + (y2 - L * Math.sin(ang + o)));
    pt.setAttribute('stroke', coul);
    pt.style.opacity = 0;
    g.appendChild(pt);
    svg.appendChild(g);
    var lg = p.getTotalLength();
    p.style.strokeDasharray = lg;
    p.style.strokeDashoffset = calme ? 0 : lg;
    if (!calme && p.animate) {
      var an = p.animate([{ strokeDashoffset: lg }, { strokeDashoffset: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
      an.onfinish = function () { pt.style.opacity = 1; };
    } else { pt.style.opacity = 1; }
    return g;
  }
  function effacerFleches() {
    Array.prototype.forEach.call(svg.querySelectorAll('g'), function (g) {
      if (g.animate && !calme) { g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = function () { g.remove(); }; }
      else g.remove();
    });
  }
  var montrer = function (id) { $(id).classList.remove('cache'); };

  var bleu = function () { return couleur('--bleu'); }, violet = function () { return couleur('--violet'); };
  // une action par clic, comme dans les corrections
  var etapes = [
    function () { fleche('a1', 'b1', true, bleu()); },
    function () { montrer('e2'); montrer('p1'); },
    function () { fleche('a1', 'b2', true, bleu()); },
    function () { montrer('p2'); },
    function () { fleche('a2', 'b1', false, violet()); },
    function () { montrer('p3'); },
    function () { fleche('a2', 'b2', false, violet()); },
    function () { montrer('p4'); effacerFleches(); },
    function () { $('p2').classList.add('sur-vert'); $('p3').classList.add('sur-vert'); },
    function () { montrer('e3'); montrer('r1'); },
    function () { montrer('r2'); $('r2').classList.add('sur-vert'); },
    function () { montrer('r3'); },
    function () { $('res').classList.add('on'); }
  ];
  var n = 0, minuteur = null;
  function maj() {
    etapeTxt.textContent = 'Étape ' + n + ' / ' + etapes.length;
    barre.style.width = (100 * n / etapes.length) + '%';
  }
  function reinitialiser() {
    clearTimeout(minuteur); n = 0; svg.innerHTML = '';
    ['e2', 'p1', 'p2', 'p3', 'p4', 'e3', 'r1', 'r2', 'r3'].forEach(function (id) { $(id).classList.add('cache'); $(id).classList.remove('sur-vert'); });
    $('res').classList.remove('on'); maj();
  }
  function suivante() {
    if (n >= etapes.length) return;
    etapes[n](); n++; maj();
    if (n < etapes.length) minuteur = setTimeout(suivante, n === 8 ? 1100 : 820);
  }
  function jouer() { reinitialiser(); minuteur = setTimeout(suivante, 500); }
  function toutAfficher() {
    reinitialiser();
    for (var i = 0; i < etapes.length; i++) { if (i === 7) { montrer('p4'); svg.innerHTML = ''; continue; } if ([0, 2, 4, 6].indexOf(i) < 0) etapes[i](); }
    n = etapes.length; maj();
  }
  $('rejouer').addEventListener('click', function () { calme ? toutAfficher() : jouer(); });

  if (calme) { toutAfficher(); }
  else if ('IntersectionObserver' in window) {
    var parti = false;
    var obs = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting && !parti) { parti = true; obs.disconnect(); jouer(); }
    }, { threshold: .35 });
    obs.observe(cahier);
  } else { jouer(); }

  // la feuille se redresse légèrement en entrant dans l'écran
  if (!calme) {
    var tic = false;
    var redresser = function () {
      tic = false;
      var r = cahier.getBoundingClientRect(), h = window.innerHeight;
      var p = Math.max(0, Math.min(1, (h - r.top) / (h * .75)));
      cahier.style.transform = 'scale(' + (.93 + .07 * p).toFixed(4) + ')';
    };
    window.addEventListener('scroll', function () { if (!tic) { tic = true; requestAnimationFrame(redresser); } }, { passive: true });
    redresser();
  }
  // à la rotation ou au redimensionnement, les flèches déjà tracées ne tombent plus juste : on rejoue
  var largeur = window.innerWidth;
  window.addEventListener('resize', function () {
    if (Math.abs(window.innerWidth - largeur) > 40) { largeur = window.innerWidth; if (n > 0 && n < etapes.length) jouer(); }
  });
})();
