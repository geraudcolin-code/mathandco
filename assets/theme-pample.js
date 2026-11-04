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
    var f = document.createElement('div'); f.id = 'pp-fruit'; f.setAttribute('aria-hidden', 'true'); f.appendChild(document.createElement('i'));
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

  function demarrer() {
    if (actif) return; actif = true;
    document.addEventListener('click', clic, true);
    arrivee();
  }
  function arreter() {
    actif = false; document.removeEventListener('click', clic, true); clearTimeout(delai);
    racine.classList.remove('pp-sortie', 'pp-entree');
    ['pp-fruit', 'pp-branche'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
  }
  window.__pamplemousse = { demarrer: demarrer, arreter: arreter };
  var go = function () { demarrer(); setTimeout(function () { racine.classList.remove('pp-entree'); }, 1100); };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();
