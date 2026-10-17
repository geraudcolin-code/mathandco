/* Colinéaire : espace élèves. Le catalogue est chiffré (AES-256-GCM, clé tirée du mot de passe) : il ne se lit qu'avec
   le mot de passe des corrections, qui est ensuite gardé sur l'appareil pour ouvrir les corrections directement. */
(function () {
  'use strict';
  var CLE = 'mathandco.mdp';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('formulaire'), champ = $('mdp'), msg = $('message'), btn = $('entrer');
  var nav = $('nav');
  window.addEventListener('scroll', function () { nav.classList.toggle('defile', window.scrollY > 8); }, { passive: true });

  function lire() {
    try { return localStorage.getItem(CLE) || sessionStorage.getItem(CLE); } catch (e) { return null; }
  }
  function garder(m, longtemps) {
    try {
      localStorage.removeItem(CLE); sessionStorage.removeItem(CLE);
      (longtemps ? localStorage : sessionStorage).setItem(CLE, m);
    } catch (e) { /* stockage indisponible : il faudra resaisir le mot de passe dans chaque correction */ }
  }
  function oublier() { try { localStorage.removeItem(CLE); sessionStorage.removeItem(CLE); } catch (e) {} }

  function octets(b64) { var t = atob(b64), u = new Uint8Array(t.length); for (var k = 0; k < t.length; k++) u[k] = t.charCodeAt(k); return u; }
  async function dechiffrer(m) {
    var P = window.CATALOGUE;
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(m), 'PBKDF2', false, ['deriveKey']);
    var cle = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: octets(P.s), iterations: P.n, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: octets(P.i) }, cle, octets(P.c));
    return JSON.parse(new TextDecoder().decode(clair));
  }

  // ---------- affichage du catalogue ----------
  var DONNEES = null, filtre = 'toutes', texteRecherche = '';
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function fiche(it, chap, classe) {
    var a = el('a', 'fiche'); a.href = it.href;
    var num = el('div', 'num');
    if (it.type === 'exercice' || it.type === 'evaluation') {
      num.appendChild(el('small', null, it.type === 'evaluation' ? 'Évaluation, ex.' : 'Exercice'));
      num.appendChild(document.createTextNode(it.numero));
    } else {
      a.classList.add('speciale');
      num.textContent = it.type === 'poly' ? 'Poly à trous' : it.type === 'flash' ? 'Questions flash' : (it.titre || it.nom);
    }
    a.appendChild(num);
    var titre = it.type === 'poly' ? 'Le cours du chapitre, complété clic par clic' : it.titre;
    if (titre) a.appendChild(el('div', 'titre', titre));
    if (it.consigne) a.appendChild(el('div', 'detail', it.consigne));
    a.dataset.cherche = norm([classe.nom, 'chapitre ' + chap.numero, chap.titre, it.type, 'exercice ' + it.numero, it.titre, it.consigne].join(' '));
    return a;
  }

  function construire() {
    var liste = $('liste'); liste.innerHTML = '';
    DONNEES.classes.forEach(function (c) {
      var bloc = el('section', 'classe-bloc'); bloc.id = 'classe-' + c.id; bloc.dataset.classe = c.id;
      bloc.appendChild(el('h2', null, c.nom));
      c.chapitres.forEach(function (ch) {
        var s = el('div', 'chapitre');
        var t = el('div', 'chapitre-tete');
        t.appendChild(el('span', 'n', 'Chapitre ' + ch.numero));
        t.appendChild(el('h3', null, ch.titre));
        s.appendChild(t);
        var g = el('div', 'grille');
        ch.items.forEach(function (it) { g.appendChild(fiche(it, ch, c)); });
        s.appendChild(g);
        bloc.appendChild(s);
      });
      liste.appendChild(bloc);
    });
    liste.appendChild(el('p', 'vide', 'Aucune correction ne correspond à cette recherche.'));
    // segments
    var seg = $('segments'); seg.innerHTML = '';
    [{ id: 'toutes', nom: 'Toutes' }].concat(DONNEES.classes.map(function (c) { return { id: c.id, nom: c.nom.replace(' spécialité', '') }; }))
      .forEach(function (o) {
        var b = el('button', null, o.nom); b.type = 'button'; b.dataset.id = o.id;
        b.addEventListener('click', function () { filtre = o.id; try { history.replaceState(null, '', o.id === 'toutes' ? location.pathname : '#' + o.id); } catch (e) {} appliquer(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        seg.appendChild(b);
      });
    var total = DONNEES.classes.reduce(function (n, c) { return n + c.chapitres.reduce(function (m, ch) { return m + ch.items.length; }, 0); }, 0);
    $('resume').textContent = total + ' corrections animées. Choisissez votre classe, puis l\'exercice.';
    var h = (location.hash || '').slice(1);
    if (DONNEES.classes.some(function (c) { return c.id === h; })) filtre = h;
    appliquer();
  }

  function appliquer() {
    Array.prototype.forEach.call($('segments').children, function (b) { b.setAttribute('aria-pressed', b.dataset.id === filtre ? 'true' : 'false'); });
    var q = norm(texteRecherche).trim().split(/\s+/).filter(Boolean), visibles = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.classe-bloc'), function (bloc) {
      var okClasse = filtre === 'toutes' || bloc.dataset.classe === filtre, nb = 0;
      Array.prototype.forEach.call(bloc.querySelectorAll('.chapitre'), function (ch) {
        var n = 0;
        Array.prototype.forEach.call(ch.querySelectorAll('.fiche'), function (f) {
          var ok = okClasse && q.every(function (m) { return f.dataset.cherche.indexOf(m) >= 0; });
          f.hidden = !ok; if (ok) n++;
        });
        ch.hidden = n === 0; nb += n;
      });
      bloc.hidden = nb === 0; visibles += nb;
    });
    document.querySelector('.vide').hidden = visibles > 0;
  }
  $('recherche').addEventListener('input', function (e) { texteRecherche = e.target.value; appliquer(); });
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').slice(1);
    if (DONNEES && DONNEES.classes.some(function (c) { return c.id === h; })) { filtre = h; appliquer(); }
  });

  function ouvrir(d) {
    DONNEES = d;
    $('porte').hidden = true; $('biblio').hidden = false; $('sortir').hidden = false;
    construire();
  }

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (!window.crypto || !crypto.subtle) { msg.className = 'message erreur'; msg.textContent = 'Ce navigateur ne peut pas ouvrir l\'espace élèves. Essayez avec Chrome, Firefox, Safari ou Edge à jour.'; return; }
    btn.disabled = true; msg.className = 'message'; msg.textContent = 'Vérification…';
    try {
      var d = await dechiffrer(champ.value);
      garder(champ.value, $('souvenir').checked);
      msg.textContent = '';
      ouvrir(d);
    } catch (e) {
      btn.disabled = false; msg.className = 'message erreur'; msg.textContent = 'Mot de passe incorrect. Vérifiez les majuscules et réessayez.';
      form.classList.remove('secoue'); void form.offsetWidth; form.classList.add('secoue'); champ.select();
    }
  });

  $('sortir').addEventListener('click', function () {
    oublier(); DONNEES = null; champ.value = ''; btn.disabled = false;
    $('biblio').hidden = true; $('porte').hidden = false; $('sortir').hidden = true; champ.focus();
  });

  // déjà connecté sur cet appareil : on ouvre directement
  var memo = lire();
  if (memo && window.crypto && crypto.subtle) {
    msg.textContent = 'Ouverture…';
    dechiffrer(memo).then(ouvrir).catch(function () { oublier(); msg.textContent = ''; });
  } else { champ.focus(); }
})();
