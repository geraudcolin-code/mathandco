/* Thème d'essai « Cyberpunk » : se charge dans <head> (pas d'éclair au chargement).
   ?theme=cyber l'active, ?theme=classique le retire ; le choix est retenu dans ce navigateur.
   Un bouton « Style » en bas de page bascule de l'un à l'autre. */
(function () {
  var CLE = 'colineaire-theme', DEFAUT = 'classique';
  var lire = function () { try { return localStorage.getItem(CLE); } catch (e) { return null; } };
  var ecrire = function (v) { try { localStorage.setItem(CLE, v); } catch (e) {} };
  var p = new URLSearchParams(location.search).get('theme');
  if (p === 'cyber' || p === 'classique') ecrire(p);
  var racine = document.documentElement;
  if ((lire() || DEFAUT) === 'cyber') racine.classList.add('cyber');

  var POLICE = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap';
  function police() {
    if (document.getElementById('police-cyber')) return;
    var l = document.createElement('link'); l.id = 'police-cyber'; l.rel = 'stylesheet'; l.href = POLICE;
    document.head.appendChild(l);
  }
  if (racine.classList.contains('cyber')) police();

  document.addEventListener('DOMContentLoaded', function () {
    var pied = document.querySelector('.pied .colonne');
    if (!pied) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'theme-bascule';
    var maj = function () { b.textContent = racine.classList.contains('cyber') ? 'Style : Cyberpunk ⇄ classique' : 'Style : classique ⇄ Cyberpunk'; };
    maj();
    b.addEventListener('click', function () {
      var on = racine.classList.toggle('cyber'); ecrire(on ? 'cyber' : 'classique'); maj();
      if (on) police();
    });
    pied.appendChild(b);
  });
})();
