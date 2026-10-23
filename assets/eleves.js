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

  // ---------- corrigé PDF : chiffré dans le dépôt (public), déchiffré ici au téléchargement ----------
  // format du .pdf.bin : « MCPDF1 », itérations PBKDF2 (4 octets), sel (16), IV (12), PDF chiffré (AES-256-GCM)
  var MDP = null;
  async function pdfClair(adresse, m) {
    var r = await fetch(adresse, { cache: 'no-cache' });
    if (!r.ok) throw new Error('absent');
    var b = new Uint8Array(await r.arrayBuffer());
    if (new TextDecoder().decode(b.slice(0, 6)) !== 'MCPDF1') throw new Error('format');
    var n = new DataView(b.buffer, b.byteOffset).getUint32(6);
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(m), 'PBKDF2', false, ['deriveKey']);
    var cle = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b.slice(10, 26), iterations: n, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(26, 38) }, cle, b.slice(38));
  }
  async function telecharger(it, bouton) {
    var lib = bouton.querySelector('.lib'), avant = lib.textContent;
    if (bouton.disabled) return;
    bouton.disabled = true; lib.textContent = 'Préparation…';
    try {
      var url = URL.createObjectURL(new Blob([await pdfClair(it.pdf, MDP || lire())], { type: 'application/pdf' }));
      var a = document.createElement('a'); a.href = url; a.download = it.pdfnom || 'corrige.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      lib.textContent = avant;
    } catch (e) {
      lib.textContent = 'Indisponible'; setTimeout(function () { lib.textContent = avant; }, 2500);
    }
    bouton.disabled = false;
  }

  // ---------- accès : une correction n'est ouverte aux élèves qu'après sa correction en classe ----------
  // acces.json (publié par la page « Espace professeur ») liste les corrections ouvertes ; les autres sont grisées.
  // Le professeur (jeton enregistré sur l'appareil par admin.html) voit tout, avec la mention « Fermée aux élèves ».
  var ACCES = null, ADMIN = false, PROF = false;
  try {
    PROF = !!JSON.parse(localStorage.getItem('colineaire.admin') || sessionStorage.getItem('colineaire.admin') || 'null');
    ADMIN = PROF && sessionStorage.getItem('colineaire.vue') !== 'eleve';
  } catch (e) {}
  function chargerAcces() {
    return fetch('acces.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('acces'); return r.json(); })
      .then(function (j) { var o = {}; (j.ouvertes || []).forEach(function (s) { o[s] = true; }); return o; })
      .catch(function () { return null; });
  }
  function identifiant(it) { return decodeURIComponent(it.href.split('/').pop()).replace(/\.html$/, ''); }
  function ouverte(it) { return !!(ACCES && ACCES[identifiant(it)]); }

  // ---------- affichage du catalogue ----------
  var DONNEES = null, filtre = 'toutes', texteRecherche = '';
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function fiche(it, chap, classe) {
    // la fiche entière ouvre l'animation ; « Corrigé PDF » (s'il existe) télécharge le corrigé
    var f = el('div', 'fiche'), a = el('a', 'fiche-lien'); a.href = it.href; f.appendChild(a);
    var ferme = !ouverte(it);
    var num = el('div', 'num');
    if (it.type === 'exercice' || it.type === 'evaluation') {
      num.appendChild(el('small', null, it.type === 'evaluation' ? 'Évaluation, ex.' : 'Exercice'));
      num.appendChild(document.createTextNode(it.numero));
    } else {
      f.classList.add('speciale');
      num.textContent = it.type === 'poly' ? 'Poly à trous' : it.type === 'flash' ? 'Questions flash' : (it.titre || it.nom);
    }
    a.appendChild(num);
    var titre = it.type === 'poly' ? 'Le cours du chapitre, complété clic par clic' : it.titre;
    if (titre) a.appendChild(el('div', 'titre', titre));
    if (it.consigne) a.appendChild(el('div', 'detail', it.consigne));
    var actions = el('div', 'fiche-actions');
    if (ferme && !ADMIN) {
      // grisée : ni animation ni corrigé ; un clic ne fait que rappeler pourquoi
      f.classList.add('ferme');
      a.removeAttribute('href'); a.setAttribute('role', 'link'); a.setAttribute('aria-disabled', 'true'); a.tabIndex = 0;
      a.setAttribute('aria-label', (it.type === 'exercice' ? 'Exercice ' + it.numero : (it.titre || it.nom)) + ' : disponible après la correction en classe');
      var refus = function (ev) { ev.preventDefault(); f.classList.remove('secoue'); void f.offsetWidth; f.classList.add('secoue'); };
      a.addEventListener('click', refus);
      a.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') refus(ev); });
      actions.appendChild(el('span', 'action verrou', 'Après la correction en classe'));
      f.appendChild(actions);
      f.dataset.cherche = norm([classe.nom, 'chapitre ' + chap.numero, chap.titre, it.type, 'exercice ' + it.numero, it.titre, it.consigne].join(' '));
      return f;
    }
    if (ferme) f.appendChild(el('span', 'badge-ferme', 'Fermée aux élèves'));
    actions.appendChild(el('span', 'action anim', 'Animation'));
    if (it.pdf) {
      var b = el('button', 'action pdf'); b.type = 'button';
      b.setAttribute('aria-label', 'Télécharger le corrigé PDF' + (it.numero ? ' de l\'exercice ' + it.numero : ''));
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="lib">Corrigé PDF</span>';
      b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); telecharger(it, b); });
      actions.appendChild(b);
    }
    f.appendChild(actions);
    f.dataset.cherche = norm([classe.nom, 'chapitre ' + chap.numero, chap.titre, it.type, 'exercice ' + it.numero, it.titre, it.consigne, it.pdf ? 'pdf corrige' : ''].join(' '));
    return f;
  }

  // ---------- rangement : un bloc par chapitre ; un clic sur le bloc affiche ses corrections ----------
  // adresse : #seconde (une classe), #seconde/3 (le chapitre 3 de Seconde ouvert) — le bouton Retour du navigateur
  // ramène aux blocs, et revenir d'une correction rouvre le même chapitre.
  var ouvert = null;          // clé « classe/numéro » du chapitre ouvert, ou null
  var pousse = false;         // le chapitre ouvert a ajouté une entrée à l'historique (le bouton « ‹ » fait alors Retour)
  function cle(c, ch) { return c.id + '/' + ch.numero; }
  function lireAdresse() {
    var h = decodeURIComponent((location.hash || '').slice(1)), p = h.split('/');
    var c = DONNEES && DONNEES.classes.filter(function (x) { return x.id === p[0]; })[0];
    if (!c) { filtre = 'toutes'; ouvert = null; return; }
    var ch = p[1] && c.chapitres.filter(function (x) { return String(x.numero) === String(+p[1]) || String(x.numero) === p[1]; })[0];
    filtre = c.id;
    ouvert = ch ? cle(c, ch) : null;
  }
  function ecrireAdresse(h, nouvelle) {
    try {
      var url = h ? '#' + h : location.pathname + location.search;
      if (nouvelle) history.pushState(null, '', url); else history.replaceState(null, '', url);
    } catch (e) {}
  }
  function transition(fn) {
    var calme = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !calme) document.startViewTransition(fn); else fn();
  }
  function ouvrirChapitre(k, depuisClic) {
    transition(function () {
      ouvert = k; ecrireAdresse(k, depuisClic); pousse = !!depuisClic; appliquer();
      var l = $('liste'); var y = l.getBoundingClientRect().top + window.scrollY - 70;
      if (window.scrollY > y) window.scrollTo(0, y);
    });
  }
  function fermerChapitre() {
    transition(function () {
      var c = ouvert ? ouvert.split('/')[0] : null;
      ouvert = null; pousse = false; ecrireAdresse(filtre !== 'toutes' ? filtre : (c || ''), false); appliquer();
    });
  }

  function tuile(c, ch) {
    var total = ch.items.length, dispo = ch.items.filter(ouverte).length;
    var b = el('button', 'ch-tuile'); b.type = 'button'; b.dataset.cle = cle(c, ch);
    if (!ADMIN && dispo === 0) b.classList.add('vide-tuile');
    b.appendChild(el('span', 'ch-tuile-n', 'Chapitre ' + ch.numero));
    b.appendChild(el('span', 'ch-tuile-titre', ch.titre || ('Chapitre ' + ch.numero)));
    var pied = el('span', 'ch-tuile-pied');
    var lib = ADMIN ? dispo + ' ouverte' + (dispo > 1 ? 's' : '') + ' sur ' + total
      : dispo === 0 ? 'Bientôt disponible'
        : dispo === total ? total + ' correction' + (total > 1 ? 's' : '')
          : dispo + ' disponible' + (dispo > 1 ? 's' : '') + ' sur ' + total;
    pied.appendChild(el('span', 'ch-tuile-compte', lib));
    pied.appendChild(el('span', 'ch-tuile-fleche', '›'));
    b.appendChild(pied);
    var barre = el('span', 'ch-tuile-barre'), plein = el('span');
    plein.style.width = (total ? Math.round(100 * dispo / total) : 0) + '%';
    barre.appendChild(plein); b.appendChild(barre);
    b.setAttribute('aria-label', 'Chapitre ' + ch.numero + ' : ' + (ch.titre || '') + ' — ' + lib);
    b.addEventListener('click', function () { ouvrirChapitre(cle(c, ch), true); });
    return b;
  }

  function construire() {
    var liste = $('liste'); liste.innerHTML = '';
    DONNEES.classes.forEach(function (c) {
      var bloc = el('section', 'classe-bloc'); bloc.id = 'classe-' + c.id; bloc.dataset.classe = c.id;
      bloc.appendChild(el('h2', null, c.nom));
      var tuiles = el('div', 'ch-tuiles');
      c.chapitres.forEach(function (ch) { tuiles.appendChild(tuile(c, ch)); });
      bloc.appendChild(tuiles);
      c.chapitres.forEach(function (ch) {
        var s = el('div', 'chapitre'); s.dataset.cle = cle(c, ch);
        var retour = el('button', 'ch-retour'); retour.type = 'button';
        retour.innerHTML = '<span aria-hidden="true">‹</span> ' + c.nom;
        retour.addEventListener('click', function () {
          if (pousse) { pousse = false; history.back(); } else fermerChapitre();
        });
        s.appendChild(retour);
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
    [{ id: 'toutes', nom: 'Toutes' }].concat(DONNEES.classes.map(function (c) { return { id: c.id, nom: c.nom }; }))
      .forEach(function (o) {
        var b = el('button', null, o.nom); b.type = 'button'; b.dataset.id = o.id;
        b.addEventListener('click', function () {
          transition(function () {
            filtre = o.id; ouvert = null; ecrireAdresse(o.id === 'toutes' ? '' : o.id, false); appliquer();
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        seg.appendChild(b);
      });
    var tous = [];
    DONNEES.classes.forEach(function (c) { c.chapitres.forEach(function (ch) { tous = tous.concat(ch.items); }); });
    var dispo = tous.filter(ouverte).length;
    $('resume').textContent = ACCES === null
      ? 'Impossible de vérifier quelles corrections sont ouvertes : rechargez la page dans un instant.'
      : ADMIN
        ? 'Vue du professeur : ' + dispo + ' corrections ouvertes aux élèves sur ' + tous.length + '. Les corrections fermées portent la mention « Fermée aux élèves ».'
        : dispo + ' corrections disponibles. Choisissez un chapitre ; les autres corrections s\'ouvrent après leur correction en classe.';
    if (PROF && !document.getElementById('vue-prof')) {
      var bv = el('button', 'bouton petit secondaire'); bv.id = 'vue-prof'; bv.type = 'button';
      bv.textContent = ADMIN ? 'Voir comme un élève' : 'Revenir à la vue du professeur';
      bv.addEventListener('click', function () {
        try { if (ADMIN) sessionStorage.setItem('colineaire.vue', 'eleve'); else sessionStorage.removeItem('colineaire.vue'); } catch (e) {}
        location.reload();
      });
      $('resume').parentNode.appendChild(bv);
      if (!ADMIN) $('resume').textContent = 'Vue élève (vous êtes professeur) : ' + $('resume').textContent;
    }
    lireAdresse();
    appliquer();
  }

  function appliquer() {
    Array.prototype.forEach.call($('segments').children, function (b) { b.setAttribute('aria-pressed', b.dataset.id === filtre ? 'true' : 'false'); });
    var q = norm(texteRecherche).trim().split(/\s+/).filter(Boolean), visibles = 0, cherche = q.length > 0;
    var liste = $('liste');
    liste.classList.toggle('mode-blocs', !cherche && !ouvert);
    liste.classList.toggle('mode-chapitre', !cherche && !!ouvert);
    liste.classList.toggle('mode-recherche', cherche);
    Array.prototype.forEach.call(document.querySelectorAll('.classe-bloc'), function (bloc) {
      var okClasse = filtre === 'toutes' || bloc.dataset.classe === filtre, nb = 0;
      if (!cherche && ouvert) okClasse = ouvert.split('/')[0] === bloc.dataset.classe;
      bloc.querySelector('.ch-tuiles').hidden = cherche || !!ouvert;
      Array.prototype.forEach.call(bloc.querySelectorAll('.chapitre'), function (ch) {
        var n = 0;
        var montre = cherche || ch.dataset.cle === ouvert;
        Array.prototype.forEach.call(ch.querySelectorAll('.fiche'), function (f) {
          var ok = okClasse && montre && q.every(function (m) { return f.dataset.cherche.indexOf(m) >= 0; });
          f.hidden = !ok; if (ok) n++;
        });
        ch.hidden = n === 0; nb += n;
        ch.querySelector('.ch-retour').hidden = cherche;
      });
      if (!cherche && !ouvert) nb = okClasse ? bloc.querySelectorAll('.ch-tuile').length : 0;
      bloc.hidden = nb === 0; visibles += nb;
      bloc.querySelector('h2').hidden = !cherche && !!ouvert;
    });
    document.querySelector('.vide').hidden = visibles > 0 || (!cherche && !ouvert);
  }
  $('recherche').addEventListener('input', function (e) { texteRecherche = e.target.value; appliquer(); });
  function suivreAdresse() { if (!DONNEES) return; pousse = false; transition(function () { lireAdresse(); appliquer(); }); }
  window.addEventListener('hashchange', suivreAdresse);
  window.addEventListener('popstate', suivreAdresse);

  function ouvrir(d) {
    DONNEES = d;
    return chargerAcces().then(function (a) {
      ACCES = a;
      $('porte').hidden = true; $('biblio').hidden = false; $('sortir').hidden = false;
      construire();
    });
  }

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (!window.crypto || !crypto.subtle) { msg.className = 'message erreur'; msg.textContent = 'Ce navigateur ne peut pas ouvrir l\'espace élèves. Essayez avec Chrome, Firefox, Safari ou Edge à jour.'; return; }
    btn.disabled = true; msg.className = 'message'; msg.textContent = 'Vérification…';
    try {
      var d = await dechiffrer(champ.value);
      MDP = champ.value;
      garder(champ.value, $('souvenir').checked);
      msg.textContent = '';
      ouvrir(d);
    } catch (e) {
      btn.disabled = false; msg.className = 'message erreur'; msg.textContent = 'Mot de passe incorrect. Vérifiez les majuscules et réessayez.';
      form.classList.remove('secoue'); void form.offsetWidth; form.classList.add('secoue'); champ.select();
    }
  });

  $('sortir').addEventListener('click', function () {
    oublier(); DONNEES = null; MDP = null; champ.value = ''; btn.disabled = false;
    $('biblio').hidden = true; $('porte').hidden = false; $('sortir').hidden = true; champ.focus();
  });

  // déjà connecté sur cet appareil : on ouvre directement
  var memo = lire();
  if (memo && window.crypto && crypto.subtle) {
    msg.textContent = 'Ouverture…';
    dechiffrer(memo).then(function (d) { MDP = memo; ouvrir(d); }).catch(function () { oublier(); msg.textContent = ''; });
  } else { champ.focus(); }
})();
