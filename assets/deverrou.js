/* Colinéaire : ouverture automatique d'une correction protégée quand l'élève a déjà saisi le mot de passe dans
   l'espace élèves (ou dans une autre correction). Ajouté à la fin de chaque correction par outils/construire.py. */
(function () {
  'use strict';
  var CLE = 'mathandco.mdp';
  var carte = document.getElementById('carte'), champ = document.getElementById('mdp');

  // ---------- téléphone ----------
  // Les corrections sont une scène de 1600 × 900 mise à l'échelle de l'écran. Sur téléphone, la scène débordait de
  // la page : le navigateur dézoomait et la correction sortait de l'écran. On la contient dans la page, et en
  // vertical on invite à tourner le téléphone (la scène 16:9 y serait minuscule).
  var st = document.createElement('style');
  st.textContent =
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}' +
    'body{position:relative;width:100%;height:100%;overflow:hidden}' +
    '#mc-tourner{position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;' +
    'padding:24px max(24px,env(safe-area-inset-right,0px)) 24px max(24px,env(safe-area-inset-left,0px));text-align:center;' +
    'background:rgba(16,22,38,.94);color:#fff;font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    '#mc-tourner[hidden]{display:none}' +
    '#mc-tourner b{font-size:21px}' +
    '#mc-tourner p{margin:0;max-width:30ch;opacity:.82}' +
    '#mc-tourner svg{width:74px;height:74px;animation:mc-pivot 2.4s ease-in-out infinite}' +
    '@keyframes mc-pivot{0%,25%{transform:rotate(0)}55%,85%{transform:rotate(-90deg)}100%{transform:rotate(0)}}' +
    '@media (prefers-reduced-motion:reduce){#mc-tourner svg{animation:none;transform:rotate(-90deg)}}' +
    '#mc-tourner button{margin-top:8px;font:inherit;font-size:15px;color:#fff;background:transparent;border:1px solid rgba(255,255,255,.5);' +
    'border-radius:999px;padding:10px 18px;cursor:pointer}';
  document.head.appendChild(st);

  var telephone = window.matchMedia && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  if (telephone) {
    var voile = document.createElement('div');
    voile.id = 'mc-tourner';
    voile.setAttribute('role', 'dialog');
    voile.setAttribute('aria-label', 'Tournez votre téléphone');
    voile.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="20" y="6" width="24" height="52" rx="5" fill="none" stroke="#fff" stroke-width="3"/>' +
      '<line x1="28" y1="51" x2="36" y2="51" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>' +
      '<b>Tournez votre téléphone</b><p>La correction s\'affiche en grand à l\'horizontale.</p>' +
      '<button type="button">Continuer à la verticale</button>';
    document.body.appendChild(voile);
    var ignore = false;
    voile.querySelector('button').addEventListener('click', function () { ignore = true; voile.hidden = true; });
    var orientation = matchMedia('(orientation: portrait)');
    var maj = function () { voile.hidden = ignore || !orientation.matches; if (!orientation.matches) ignore = false; };
    if (orientation.addEventListener) orientation.addEventListener('change', maj); else orientation.addListener(maj);
    maj();
  }
  // la scène se recale quand la barre d'adresse du téléphone apparaît ou disparaît
  var recaler = function () { window.dispatchEvent(new Event('resize')); };
  if (window.visualViewport) visualViewport.addEventListener('resize', function () { setTimeout(recaler, 50); });
  window.addEventListener('orientationchange', function () { setTimeout(recaler, 300); });

  if (!carte || !champ) return;

  // lien de retour sur l'écran de mot de passe
  var retour = document.createElement('a');
  retour.href = '../eleves.html';
  retour.textContent = 'Retour à l\'espace élèves';
  retour.style.cssText = 'display:block;margin-top:12px;font-size:14px;color:#0a5fd1;text-decoration:none;text-align:center';
  carte.appendChild(retour);

  var memo = null, longtemps = false;
  try { memo = localStorage.getItem(CLE); longtemps = !!memo; if (!memo) memo = sessionStorage.getItem(CLE); } catch (e) {}

  // mot de passe saisi ici avec succès : on le garde pour la suite de la séance
  var obs = new MutationObserver(function () {
    if (document.getElementById('verrou')) return;
    obs.disconnect();
    try { if (!longtemps && champ.value) sessionStorage.setItem(CLE, champ.value); } catch (e) {}
  });
  obs.observe(document.body, { childList: true });

  if (memo) {
    champ.value = memo;
    if (carte.requestSubmit) carte.requestSubmit();
    else carte.dispatchEvent(new Event('submit', { cancelable: true }));
  }
})();
