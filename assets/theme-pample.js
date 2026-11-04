/* Style « Pamplemousse » : mouvements (chargé par theme.js seulement dans ce style).
   - à l'arrivée sur une page : un pamplemousse tombe de la branche, rebondit et roule jusqu'à sortir de l'écran ;
   - au clic : quelques gouttelettes de jus ;
   - entre deux pages : le jus monte (une tranche tombe), puis redescend sur la page suivante ;
   Rien de tout cela si le système demande moins d'animations. */
(function () {
  var racine = document.documentElement;
  if (window.__pamplemousse) { window.__pamplemousse.demarrer(); return; }
  var calme = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var actif = false, delai = null;
  var TEINTES = ['#ff6f61', '#ff8e80', '#f5a83a', '#ffd2c8', '#d63d45', '#fff3de'];

  function arrivee() {
    if (calme() || document.getElementById('pp-fruit')) return;
    var b = document.createElement('div'); b.id = 'pp-branche'; b.setAttribute('aria-hidden', 'true');
    var f = document.createElement('div'); f.id = 'pp-fruit'; f.setAttribute('aria-hidden', 'true'); var bille = document.createElement('i'); bille.className = 'pp-sph'; f.appendChild(bille);
    document.body.appendChild(b); document.body.appendChild(f);
    setTimeout(function () { b.remove(); }, 2400);
    setTimeout(function () { f.remove(); }, 7200);
  }

  function gouttes(x, y) {
    if (calme()) return;
    for (var i = 0; i < 10; i++) {
      var g = document.createElement('span'); g.className = 'pp-goutte';
      g.style.left = x + 'px'; g.style.top = y + 'px'; g.style.background = TEINTES[i % TEINTES.length];
      document.body.appendChild(g);
      var a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50;
      var anim = g.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d - 14) + 'px) scale(.9)', opacity: 1, offset: .55 },
        { transform: 'translate(' + Math.cos(a) * d * 1.15 + 'px,' + (Math.sin(a) * d + 46) + 'px) scale(.25)', opacity: 0 }
      ], { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.4,1)' });
      anim.onfinish = (function (el) { return function () { el.remove(); }; })(g);
    }
  }

  function clic(ev) {
    if (!actif || ev.button !== 0) return;
    gouttes(ev.clientX, ev.clientY);
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || calme() || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download') || a.getAttribute('aria-disabled') === 'true') return;
    var u; try { u = new URL(a.href, location.href); } catch (e) { return; }
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return;
    if (u.pathname === location.pathname && u.search === location.search) return;   // ancre ou même page
    ev.preventDefault();
    try { sessionStorage.setItem('pp-entree', '1'); } catch (e) {}
    racine.classList.add('pp-sortie');
    delai = setTimeout(function () { location.href = u.href; }, 600);
  }

  // retour par le bouton « précédent » (page restaurée du cache) : on retire le jus
  window.addEventListener('pageshow', function (ev) {
    if (!ev.persisted) return;
    clearTimeout(delai); racine.classList.remove('pp-sortie', 'pp-entree');
  });


  // décor en relief : grosses tranches épaisses et boules qui suivent la souris (parallaxe) et le défilement
  var decor = null, raf = 0, cible = { x: 0, y: 0, s: 0 }, actuel = { x: 0, y: 0, s: 0 };
  var OBJETS = [
    { t: 'tr', d: 520, css: 'right:-210px;top:110px', px: 18, ps: -70, cl: 'pp-tr' },
    { t: 'tr', d: 460, css: 'left:-230px;bottom:-170px', px: 14, ps: -50, cl: 'pp-tr', r0: '8deg', r1: '-4deg' },
    { t: 'sph', d: 120, css: 'right:7%;top:62%', px: 42, ps: -150, cl: 'pp-sph', tp: '22s' },
    { t: 'sph', d: 84, css: 'left:4%;top:24%', px: 30, ps: -110, cl: 'pp-sph pp-hors-mobile', tp: '16s' },
    { t: 'sph', d: 190, css: 'left:36%;bottom:-120px', px: 60, ps: -220, cl: 'pp-sph pp-flou pp-hors-mobile', tp: '30s' },
    { t: 'sph', d: 64, css: 'right:24%;top:12%', px: 26, ps: -90, cl: 'pp-sph pp-hors-mobile', tp: '14s' }
  ];
  function creerDecor() {
    if (decor || document.getElementById('pp-decor')) return;
    decor = document.createElement('div'); decor.id = 'pp-decor'; decor.setAttribute('aria-hidden', 'true');
    OBJETS.forEach(function (o, n) {
      var obj = document.createElement('div'); obj.className = 'pp-obj ' + (o.cl.indexOf('hors-mobile') >= 0 ? 'pp-hors-mobile' : '');
      obj.style.cssText = 'position:absolute;' + o.css + ';--d:' + o.d + 'px;--px:' + o.px + ';--ps:' + o.ps;
      var bal = document.createElement('div'); bal.className = 'pp-bal'; bal.style.setProperty('--t', (12 + n * 3) + 's');
      if (o.r0) { bal.style.setProperty('--r0', o.r0); bal.style.setProperty('--r1', o.r1); }
      if (o.t === 'tr') {
        var pile = document.createElement('div'); pile.className = 'pp-tr'; pile.style.cssText = 'position:absolute;inset:0;transform-style:preserve-3d';
        for (var k = 0; k < 8; k++) { var d = document.createElement('i'); d.style.setProperty('--k', k); pile.appendChild(d); }
        bal.appendChild(pile);
      } else {
        var b = document.createElement('div'); b.className = o.cl; b.style.cssText = 'position:absolute;inset:0;--tp:' + o.tp; bal.appendChild(b);
      }
      obj.appendChild(bal); decor.appendChild(obj);
    });
    document.body.insertBefore(decor, document.body.firstChild);
    if (!calme()) { addEventListener('pointermove', bouge, { passive: true }); addEventListener('scroll', defile, { passive: true }); defile(); boucle(); }
  }
  function bouge(ev) { cible.x = ev.clientX / innerWidth * 2 - 1; cible.y = ev.clientY / innerHeight * 2 - 1; }
  function defile() { cible.s = Math.max(0, Math.min(3, scrollY / Math.max(innerHeight, 1))); }
  function boucle() {
    raf = requestAnimationFrame(boucle);
    if (document.hidden || !decor) return;
    var dx = cible.x - actuel.x, dy = cible.y - actuel.y, ds = cible.s - actuel.s;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(ds) < .0008) return;
    actuel.x += dx * .07; actuel.y += dy * .07; actuel.s += ds * .07;
    decor.style.setProperty('--mx', actuel.x.toFixed(4)); decor.style.setProperty('--my', actuel.y.toFixed(4)); decor.style.setProperty('--sc', actuel.s.toFixed(4));
  }
  function retirerDecor() {
    cancelAnimationFrame(raf); removeEventListener('pointermove', bouge); removeEventListener('scroll', defile);
    var d = document.getElementById('pp-decor'); if (d) d.remove(); decor = null;
  }

  function demarrer() {
    if (actif) return; actif = true;
    document.addEventListener('click', clic, true);
    creerDecor(); arrivee();
  }
  function arreter() {
    actif = false; document.removeEventListener('click', clic, true); clearTimeout(delai);
    racine.classList.remove('pp-sortie', 'pp-entree'); retirerDecor();
    ['pp-fruit', 'pp-branche'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
  }
  window.__pamplemousse = { demarrer: demarrer, arreter: arreter };
  var go = function () { demarrer(); setTimeout(function () { racine.classList.remove('pp-entree'); }, 1100); };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();
