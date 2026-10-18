/* Colinéaire : espace professeur. Ouvre ou ferme chaque correction aux élèves.
   L'état est le fichier acces.json du dépôt GitHub (liste des corrections ouvertes) ; « Publier » l'enregistre par l'API
   GitHub avec la clé personnelle du professeur (jeton « fine-grained », droit Contents en écriture sur ce seul dépôt).
   La clé ne quitte pas l'appareil : elle n'est envoyée qu'à api.github.com. */
(function () {
  'use strict';
  var DEPOT = 'geraudcolin-code/mathandco', BRANCHE = 'main', FICHIER = 'acces.json';
  var API = 'https://api.github.com/repos/' + DEPOT + '/contents/' + FICHIER;
  var CLE_ADMIN = 'colineaire.admin', CLE_ELEVE = 'mathandco.mdp';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('formulaire'), msg = $('message'), btn = $('entrer');
  window.addEventListener('scroll', function () { $('nav').classList.toggle('defile', window.scrollY > 8); }, { passive: true });

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function octets(b64) { var t = atob(b64), u = new Uint8Array(t.length); for (var k = 0; k < t.length; k++) u[k] = t.charCodeAt(k); return u; }
  async function dechiffrer(m) {
    var P = window.CATALOGUE;
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(m), 'PBKDF2', false, ['deriveKey']);
    var cle = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: octets(P.s), iterations: P.n, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: octets(P.i) }, cle, octets(P.c))));
  }
  function b64utf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function utf8b64(s) { return decodeURIComponent(escape(atob(s.replace(/\s/g, '')))); }

  // ---------- GitHub ----------
  var JETON = null, SHA = null;
  function entetes() {
    return { 'Authorization': 'Bearer ' + JETON, 'Accept': 'application/vnd.github+json' };
  }
  async function lireDepot() {
    var r = await fetch(API + '?ref=' + BRANCHE + '&t=' + Date.now(), { headers: entetes(), cache: 'no-store' });
    if (r.status === 401) throw new Error('La clé GitHub est refusée (mal copiée ou expirée). Créez-en une nouvelle.');
    if (r.status === 403 || r.status === 404) throw new Error('La clé GitHub n\'a pas accès au dépôt mathandco. Vérifiez « Repository access » et « Contents ».');
    if (!r.ok) throw new Error('GitHub ne répond pas (erreur ' + r.status + '). Réessayez dans un instant.');
    var j = await r.json();
    SHA = j.sha;
    return JSON.parse(utf8b64(j.content));
  }
  async function ecrireDepot(ouvertes, message) {
    var corps = JSON.stringify({ maj: new Date().toISOString(), ouvertes: ouvertes.slice().sort() }, null, 1) + '\n';
    var r = await fetch(API, {
      method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, entetes()),
      body: JSON.stringify({ message: message, content: b64utf8(corps), sha: SHA, branch: BRANCHE })
    });
    if (r.status === 409 || r.status === 422) return 'conflit';
    if (r.status === 401) throw new Error('La clé GitHub est refusée (expirée ?). Reconnectez-vous avec une nouvelle clé.');
    if (r.status === 403 || r.status === 404) throw new Error('La clé GitHub ne permet pas d\'écrire : donnez-lui « Contents : Read and write ».');
    if (!r.ok) throw new Error('GitHub a refusé l\'enregistrement (erreur ' + r.status + ').');
    SHA = (await r.json()).content.sha;
    return 'ok';
  }

  // ---------- état ----------
  var DONNEES = null, PUBLIE = {}, VOULU = {}, filtre = 'toutes', texte = '';
  function ident(it) { return decodeURIComponent(it.href.split('/').pop()).replace(/\.html$/, ''); }
  function items() { var t = []; DONNEES.classes.forEach(function (c) { c.chapitres.forEach(function (ch) { t = t.concat(ch.items); }); }); return t; }
  function changements() { return items().map(ident).filter(function (s) { return !!VOULU[s] !== !!PUBLIE[s]; }); }
  function libelle(it) {
    if (it.type === 'exercice') return 'Exercice ' + it.numero;
    if (it.type === 'evaluation') return 'Évaluation, exercice ' + it.numero;
    if (it.type === 'poly') return 'Poly à trous';
    if (it.type === 'flash') return 'Questions flash';
    return it.titre || it.nom;
  }

  function interrupteur(s) {
    var b = el('button', 'interrupteur'); b.type = 'button'; b.setAttribute('role', 'switch');
    var lib = el('span', 'lib'); b.appendChild(lib); b.appendChild(el('span', 'piste'));
    b.maj = function () {
      b.setAttribute('aria-checked', VOULU[s] ? 'true' : 'false');
      lib.textContent = VOULU[s] ? 'Ouverte' : 'Fermée';
      b.closest('.ligne-acces').classList.toggle('modifiee', !!VOULU[s] !== !!PUBLIE[s]);
    };
    b.addEventListener('click', function () { VOULU[s] = !VOULU[s]; b.maj(); bilan(); });
    return b;
  }

  function construire() {
    var liste = $('liste'); liste.innerHTML = '';
    DONNEES.classes.forEach(function (c) {
      var bloc = el('section', 'classe-bloc'); bloc.dataset.classe = c.id;
      bloc.appendChild(el('h2', null, c.nom));
      c.chapitres.forEach(function (ch) {
        var s = el('div', 'chapitre'), t = el('div', 'chapitre-tete');
        t.appendChild(el('span', 'n', 'Chapitre ' + ch.numero));
        t.appendChild(el('h3', null, ch.titre));
        var acts = el('div', 'chap-actions'), lignes = el('div', 'lignes');
        [['Tout ouvrir', true], ['Tout fermer', false]].forEach(function (o) {
          var b = el('button', null, o[0]); b.type = 'button';
          b.addEventListener('click', function () {
            Array.prototype.forEach.call(lignes.children, function (l) { if (!l.hidden) { VOULU[l.dataset.id] = o[1]; l.querySelector('.interrupteur').maj(); } });
            bilan();
          });
          acts.appendChild(b);
        });
        t.appendChild(acts); s.appendChild(t);
        ch.items.forEach(function (it) {
          var id = ident(it), l = el('div', 'ligne-acces'); l.dataset.id = id;
          var nom = el('div', 'nom'); nom.appendChild(el('b', null, libelle(it)));
          if (it.titre && it.type !== 'poly') nom.appendChild(el('span', null, it.titre));
          l.appendChild(nom);
          var ap = el('a', 'apercu', 'Aperçu'); ap.href = it.href; ap.target = '_blank'; ap.rel = 'noopener'; l.appendChild(ap);
          var sw = interrupteur(id); l.appendChild(sw);
          l.dataset.cherche = norm([c.nom, 'chapitre ' + ch.numero, ch.titre, libelle(it), it.titre, it.consigne].join(' '));
          lignes.appendChild(l); sw.maj();
        });
        s.appendChild(lignes); bloc.appendChild(s);
      });
      liste.appendChild(bloc);
    });
    var seg = $('segments'); seg.innerHTML = '';
    [{ id: 'toutes', nom: 'Toutes' }].concat(DONNEES.classes.map(function (c) { return { id: c.id, nom: c.nom.replace(' spécialité', '') }; }))
      .forEach(function (o) {
        var b = el('button', null, o.nom); b.type = 'button'; b.dataset.id = o.id;
        b.addEventListener('click', function () { filtre = o.id; appliquer(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        seg.appendChild(b);
      });
    appliquer(); bilan();
  }
  function appliquer() {
    Array.prototype.forEach.call($('segments').children, function (b) { b.setAttribute('aria-pressed', b.dataset.id === filtre ? 'true' : 'false'); });
    var q = norm(texte).trim().split(/\s+/).filter(Boolean);
    Array.prototype.forEach.call(document.querySelectorAll('.classe-bloc'), function (bloc) {
      var okC = filtre === 'toutes' || bloc.dataset.classe === filtre, nb = 0;
      Array.prototype.forEach.call(bloc.querySelectorAll('.chapitre'), function (ch) {
        var n = 0;
        Array.prototype.forEach.call(ch.querySelectorAll('.ligne-acces'), function (l) {
          var ok = okC && q.every(function (m) { return l.dataset.cherche.indexOf(m) >= 0; });
          l.hidden = !ok; if (ok) n++;
        });
        ch.hidden = n === 0; nb += n;
      });
      bloc.hidden = nb === 0;
    });
  }
  $('recherche').addEventListener('input', function (e) { texte = e.target.value; appliquer(); });

  function bilan(msgEtat, cls) {
    var tous = items(), ouv = tous.filter(function (it) { return PUBLIE[ident(it)]; }).length, ch = changements();
    $('resume').textContent = ouv + ' corrections ouvertes aux élèves sur ' + tous.length + '. Les nouvelles corrections arrivent fermées.';
    var e = $('etat');
    e.className = 'etat' + (cls ? ' ' + cls : '');
    e.textContent = msgEtat || (ch.length ? ch.length + (ch.length > 1 ? ' modifications à publier.' : ' modification à publier.') : 'Aucune modification.');
    $('publier').disabled = !ch.length; $('annuler').disabled = !ch.length;
  }
  $('annuler').addEventListener('click', function () {
    VOULU = Object.assign({}, PUBLIE);
    document.querySelectorAll('.interrupteur').forEach(function (b) { b.maj(); });
    bilan();
  });
  $('publier').addEventListener('click', async function () {
    var ch = changements(); if (!ch.length) return;
    var pb = $('publier'); pb.disabled = true; $('annuler').disabled = true;
    bilan('Publication…');
    var ouvre = ch.filter(function (s) { return VOULU[s]; }), ferme = ch.filter(function (s) { return !VOULU[s]; });
    var message = 'Accès : ' + [ouvre.length ? 'ouvre ' + ouvre.join(', ') : '', ferme.length ? 'ferme ' + ferme.join(', ') : ''].filter(Boolean).join(' ; ');
    try {
      for (var essai = 0; essai < 3; essai++) {
        // repartir de l'état du dépôt (une autre modification a pu passer) et n'y appliquer que nos changements
        var j = await lireDepot(), ens = {};
        (j.ouvertes || []).forEach(function (s) { ens[s] = true; });
        ouvre.forEach(function (s) { ens[s] = true; }); ferme.forEach(function (s) { delete ens[s]; });
        if (await ecrireDepot(Object.keys(ens), message) === 'ok') {
          PUBLIE = ens; VOULU = Object.assign({}, ens);
          document.querySelectorAll('.interrupteur').forEach(function (b) { b.maj(); });
          bilan('Publié. Les élèves le verront d\'ici une à deux minutes.', 'ok');
          return;
        }
      }
      throw new Error('Le fichier change en même temps ailleurs : réessayez.');
    } catch (e) {
      bilan(e.message, 'erreur'); pb.disabled = false; $('annuler').disabled = false;
    }
  });

  // ---------- connexion ----------
  async function entrer(mdp, jeton, garder) {
    DONNEES = await dechiffrer(mdp).catch(function () { throw new Error('Mot de passe des corrections incorrect.'); });
    JETON = jeton;
    var j = await lireDepot();
    PUBLIE = {}; (j.ouvertes || []).forEach(function (s) { PUBLIE[s] = true; });
    VOULU = Object.assign({}, PUBLIE);
    try {
      var st = garder ? localStorage : sessionStorage;
      st.setItem(CLE_ADMIN, JSON.stringify({ jeton: jeton }));
      st.setItem(CLE_ELEVE, mdp);   // le professeur ouvre les aperçus sans retaper le mot de passe
    } catch (e) {}
    $('porte').hidden = true; $('tableau').hidden = false; $('sortir').hidden = false;
    construire();
  }
  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (!window.crypto || !crypto.subtle) { msg.className = 'message erreur'; msg.textContent = 'Ce navigateur ne permet pas la connexion.'; return; }
    btn.disabled = true; msg.className = 'message'; msg.textContent = 'Connexion…';
    try { await entrer($('mdp').value, $('jeton').value.trim(), $('souvenir').checked); msg.textContent = ''; }
    catch (e) { btn.disabled = false; msg.className = 'message erreur'; msg.textContent = e.message; }
  });
  $('sortir').addEventListener('click', function () {
    try { [localStorage, sessionStorage].forEach(function (st) { st.removeItem(CLE_ADMIN); }); } catch (e) {}
    location.reload();
  });
  window.addEventListener('beforeunload', function (ev) {
    if (DONNEES && changements().length) { ev.preventDefault(); ev.returnValue = ''; }
  });

  // déjà connecté sur cet appareil
  var memo = null, mdp = null;
  try {
    memo = JSON.parse(localStorage.getItem(CLE_ADMIN) || sessionStorage.getItem(CLE_ADMIN) || 'null');
    mdp = localStorage.getItem(CLE_ELEVE) || sessionStorage.getItem(CLE_ELEVE);
  } catch (e) {}
  if (memo && memo.jeton && mdp) {
    msg.textContent = 'Connexion…';
    entrer(mdp, memo.jeton, !!localStorage.getItem(CLE_ADMIN)).then(function () { msg.textContent = ''; })
      .catch(function (e) { msg.className = 'message erreur'; msg.textContent = e.message; });
  }
})();
