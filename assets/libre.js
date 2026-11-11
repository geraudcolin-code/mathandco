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
})();
