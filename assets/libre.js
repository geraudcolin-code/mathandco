/* Accès libre : onglets (clic, flèches du clavier, adresse #onglet). */
(function () {
  var barre = document.getElementById('onglets');
  if (!barre) return;
  var boutons = Array.prototype.slice.call(barre.querySelectorAll('[role=tab]'));
  var panneaux = Array.prototype.slice.call(document.querySelectorAll('.panneau'));
  function choisir(id, focus) {
    boutons.forEach(function (b) {
      var actif = b.dataset.id === id;
      b.setAttribute('aria-selected', actif ? 'true' : 'false');
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
      b.tabIndex = actif ? 0 : -1;
      if (actif && focus) b.focus();
    });
    panneaux.forEach(function (p) { p.hidden = p.dataset.id !== id; });
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }
  boutons.forEach(function (b, i) {
    b.addEventListener('click', function () { choisir(b.dataset.id); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); choisir(boutons[(i + d + boutons.length) % boutons.length].dataset.id, true); }
    });
  });
  var h = location.hash.slice(1);
  choisir(boutons.some(function (b) { return b.dataset.id === h; }) ? h : boutons[0].dataset.id);

  /* tuiles : une tuile ouvre son contenu, « ‹ Première » revient aux tuiles */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-ouvre], [data-retour]');
    if (!t) return;
    var panneau = t.closest('.panneau'); if (!panneau) return;
    var tuiles = panneau.querySelector('[data-tuiles]');
    if (t.hasAttribute('data-ouvre')) {
      var bloc = document.getElementById(t.dataset.ouvre); if (!bloc) return;
      tuiles.hidden = true; bloc.hidden = false;
      var r = bloc.querySelector('[data-retour]'); if (r) r.focus({ preventScroll: true });
    } else {
      Array.prototype.forEach.call(panneau.querySelectorAll('.libre-contenu'), function (b) { b.hidden = true; });
      tuiles.hidden = false;
      if (window.mathVirtualKeyboard) try { window.mathVirtualKeyboard.hide(); } catch (err) {}
      var o = tuiles.querySelector('.ch-tuile'); if (o) o.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
