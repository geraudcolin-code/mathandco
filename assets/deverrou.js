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

  // ---------- corrigé PDF ----------
  // Si la correction a son corrigé PDF sur le site (même adresse, « .pdf.bin » : chiffré, le dépôt étant public), un bouton
  // « Corrigé PDF » apparaît dans le bandeau de la correction ; le PDF est déchiffré ici avec le mot de passe.
  var adressePdf = location.pathname.replace(/\.html?$/, '') + '.pdf.bin';
  async function pdfClair(m) {
    var r = await fetch(adressePdf, { cache: 'no-cache' });
    if (!r.ok) throw new Error('absent');
    var b = new Uint8Array(await r.arrayBuffer());
    if (new TextDecoder().decode(b.slice(0, 6)) !== 'MCPDF1') throw new Error('format');
    var n = new DataView(b.buffer, b.byteOffset).getUint32(6);
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(m), 'PBKDF2', false, ['deriveKey']);
    var cle = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b.slice(10, 26), iterations: n, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(26, 38) }, cle, b.slice(38));
  }
  function boutonPdf(m) {
    var bandeau = document.getElementById('bandeau');
    if (!bandeau || !m || document.getElementById('mc-pdf') || !window.crypto || !crypto.subtle) return;
    fetch(adressePdf, { method: 'HEAD', cache: 'no-cache' }).then(function (r) {
      if (!r.ok || document.getElementById('mc-pdf')) return;
      var s = document.createElement('style');
      s.textContent = '#mc-pdf{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border:1.5px solid #C9D3E0;' +
        'border-radius:10px;background:#fff;color:#17233A;font-family:inherit;font-weight:600;font-size:15px;line-height:1;cursor:pointer;transition:border-color .2s,color .2s}' +
        '#mc-pdf:hover{border-color:#D62828;color:#D62828}#mc-pdf[disabled]{opacity:.7;cursor:progress}#mc-pdf svg{width:17px;height:17px}';
      document.head.appendChild(s);
      var b = document.createElement('button');
      b.id = 'mc-pdf'; b.type = 'button'; b.title = 'Télécharger le corrigé de cet exercice (PDF)';
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" fill="none" stroke="currentColor" ' +
        'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Corrigé PDF</span>';
      var lib = b.querySelector('span');
      b.addEventListener('click', async function (ev) {
        ev.stopPropagation(); b.blur();
        if (b.disabled) return;
        b.disabled = true; lib.textContent = 'Préparation…';
        try {
          var url = URL.createObjectURL(new Blob([await pdfClair(m)], { type: 'application/pdf' }));
          var a = document.createElement('a'); a.href = url; a.download = (document.title || 'corrige').trim() + '.pdf';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
          lib.textContent = 'Corrigé PDF';
        } catch (e) { lib.textContent = 'Indisponible'; setTimeout(function () { lib.textContent = 'Corrigé PDF'; }, 2500); }
        b.disabled = false;
      });
      bandeau.appendChild(b);
    }).catch(function () {});
  }

  if (!carte || !champ) return;

  // ---------- accès : correction ouverte aux élèves seulement après sa correction en classe ----------
  // Tant que acces.json n'a pas répondu, ou si la correction est fermée, le mot de passe ne déverrouille rien : l'envoi du
  // formulaire est arrêté AVANT le gestionnaire de la page (écoute en phase de capture sur le document).
  var acces = 'attente', ADMIN = false;
  try { ADMIN = !!JSON.parse(localStorage.getItem('colineaire.admin') || 'null'); } catch (e) {}
  document.addEventListener('submit', function (ev) {
    if (acces !== 'ouvert') { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);
  var ident = decodeURIComponent(location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  var verifier = fetch('../acces.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('acces'); return r.json(); })
    .then(function (j) { return (j.ouvertes || []).indexOf(ident) >= 0; })
    .catch(function () { return false; })
    .then(function (ok) {
      acces = (ok || ADMIN) ? 'ouvert' : 'ferme';
      if (acces === 'ferme') fermee();
      return acces === 'ouvert';
    });
  function fermee() {
    var titre = carte.querySelector('h1');
    Array.prototype.slice.call(carte.children).forEach(function (n) { if (n !== titre) n.remove(); });
    var p = document.createElement('p');
    p.style.cssText = 'font-size:16px;line-height:1.5;color:#3A4558;margin:14px 0 6px';
    p.textContent = 'Cette correction n\'est pas encore disponible. Elle s\'ouvrira après sa correction en classe.';
    var a = document.createElement('a');
    a.href = '../eleves.html'; a.textContent = 'Retour à l\'espace élèves';
    a.style.cssText = 'display:block;margin-top:16px;padding:11px;border-radius:8px;background:#17233A;color:#fff;text-align:center;font-weight:600;text-decoration:none';
    carte.appendChild(p); carte.appendChild(a);
  }

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
    var m = champ.value || memo;
    if (document.getElementById('bandeau')) boutonPdf(m);
    else setTimeout(function () { boutonPdf(m); }, 400);
  });
  obs.observe(document.body, { childList: true });

  if (memo) champ.value = memo;
  verifier.then(function (ok) {
    if (!ok || !memo) return;
    if (carte.requestSubmit) carte.requestSubmit();
    else carte.dispatchEvent(new Event('submit', { cancelable: true }));
  });
})();
