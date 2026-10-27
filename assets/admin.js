/* Colinéaire : espace professeur. Ouvre ou ferme chaque correction aux élèves.
   L'état est le fichier acces.json (liste des corrections ouvertes). Une correction FERMÉE est chiffrée avec le mot de
   passe du professeur, une correction OUVERTE avec celui des élèves (lu dans assets/cle.js, où il est chiffré par le
   mot de passe du professeur). « Publier » rechiffre ici, dans le navigateur, la page et le PDF de chaque correction
   ouverte ou fermée, puis enregistre le tout (et acces.json) en un seul envoi, avec la clé d'accès du professeur, qui
   reste sur l'appareil. */
(function () {
  'use strict';
  var DEPOT = 'geraudcolin-code/mathandco', BRANCHE = 'main', FICHIER = 'acces.json';
  var API = 'https://api.github.com/repos/' + DEPOT;
  var CLE_ADMIN = 'colineaire.admin', CLE_ELEVE = 'mathandco.mdp', CLE_PROF = 'colineaire.prof';
  var ITER = 600000;
  var $ = function (id) { return document.getElementById(id); };
  var form = $('formulaire'), msg = $('message'), btn = $('entrer');
  window.addEventListener('scroll', function () { $('nav').classList.toggle('defile', window.scrollY > 8); }, { passive: true });

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function octets(b64) { var t = atob(b64), u = new Uint8Array(t.length); for (var k = 0; k < t.length; k++) u[k] = t.charCodeAt(k); return u; }
  async function cleDe(m, sel, n, usage) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(m), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations: n, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, usage);
  }
  async function ouvrirP(P, m) {   // objet {s, i, n, c} (base64) -> octets en clair
    var cle = await cleDe(m, octets(P.s), P.n, ['decrypt']);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: octets(P.i) }, cle, octets(P.c));
  }
  async function dechiffrer(m) { return JSON.parse(new TextDecoder().decode(await ouvrirP(window.CATALOGUE, m))); }
  function b64(buf) {
    var u = new Uint8Array(buf), t = '', k = 0x8000;
    for (var i = 0; i < u.length; i += k) t += String.fromCharCode.apply(null, u.subarray(i, i + k));
    return btoa(t);
  }
  function b64utf8(s) { return btoa(unescape(encodeURIComponent(s))); }

  // ---------- enregistrement ----------
  var JETON = null, MDP_ELEVES = null, MDP_PROF = null;
  function entetes(accept) {
    return { 'Authorization': 'Bearer ' + JETON, 'Accept': accept || 'application/vnd.github+json' };
  }
  async function api(chemin, opts) {
    opts = opts || {};
    var r = await fetch(API + chemin, { method: opts.method || 'GET', cache: 'no-store',
      headers: Object.assign(opts.body ? { 'Content-Type': 'application/json' } : {}, entetes(opts.accept)),
      body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (opts.conflit && (r.status === 409 || r.status === 422)) return null;
    if (r.status === 401) throw new Error('La clé d’accès est refusée (mal copiée ou expirée).');
    if (r.status === 403 || r.status === 404) throw new Error('La clé d’accès n’a pas les droits nécessaires.');
    if (!r.ok) throw new Error('Le serveur ne répond pas (erreur ' + r.status + '). Réessayez dans un instant.');
    return opts.accept ? r.arrayBuffer() : r.json();
  }
  function brut(chemin, ref) {
    return api('/contents/' + chemin.split('/').map(encodeURIComponent).join('/') + '?ref=' + ref + '&t=' + Date.now(),
      { accept: 'application/vnd.github.raw' });
  }
  async function lireAcces(ref) { return JSON.parse(new TextDecoder().decode(await brut(FICHIER, ref || BRANCHE))); }

  // Rechiffrement : une clé par mot de passe et par publication (sel commun), un IV neuf par fichier.
  async function cible(vers) {
    var sel = crypto.getRandomValues(new Uint8Array(16));
    return { mdp: vers, sel: sel, cle: await cleDe(vers, sel, ITER, ['encrypt']) };
  }
  async function essayer(fn, mdps) {   // -> [mot de passe qui ouvre, clair]
    for (var k = 0; k < mdps.length; k++) { try { return [mdps[k], await fn(mdps[k])]; } catch (e) {} }
    throw new Error('Un fichier ne s’ouvre avec aucun des deux mots de passe.');
  }
  var PAT = /const P = \{s:'([^']+)', i:'([^']+)', n:(\d+), c:'([^']+)'\}/;
  async function rechiffrerPage(octetsPage, C) {   // -> nouveaux octets, ou null s'il l'est déjà avec C.mdp
    var t = new TextDecoder().decode(octetsPage), m = PAT.exec(t);
    if (!m) return null;
    var P = { s: m[1], i: m[2], n: +m[3], c: m[4] };
    var r = await essayer(function (k) { return ouvrirP(P, k); }, [C.mdp, MDP_ELEVES, MDP_PROF]);
    if (r[0] === C.mdp) return null;
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, C.cle, r[1]);
    var nv = "const P = {s:'" + b64(C.sel) + "', i:'" + b64(iv) + "', n:" + ITER + ", c:'" + b64(c) + "'}";
    return new TextEncoder().encode(t.slice(0, m.index) + nv + t.slice(m.index + m[0].length));
  }
  async function rechiffrerPdf(buf, C) {
    var b = new Uint8Array(buf);
    if (new TextDecoder().decode(b.slice(0, 6)) !== 'MCPDF1') throw new Error('Corrigé PDF illisible.');
    var n = new DataView(b.buffer, b.byteOffset).getUint32(6);
    var r = await essayer(async function (k) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(26, 38) }, await cleDe(k, b.slice(10, 26), n, ['decrypt']), b.slice(38));
    }, [C.mdp, MDP_ELEVES, MDP_PROF]);
    if (r[0] === C.mdp) return null;
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, C.cle, r[1]));
    var out = new Uint8Array(38 + c.length);
    out.set(new TextEncoder().encode('MCPDF1'), 0); new DataView(out.buffer).setUint32(6, ITER); out.set(C.sel, 10); out.set(iv, 26); out.set(c, 38);
    return out;
  }

  // Une publication = un seul envoi (commit) : acces.json + les pages et PDF rechiffrés.
  async function publier(ouvre, ferme, message, progres) {
    var href = {}; items().forEach(function (it) { href[ident(it)] = it; });
    for (var essai = 0; essai < 3; essai++) {
      var c0 = (await api('/git/ref/heads/' + BRANCHE)).object.sha;
      var arbre0 = (await api('/git/commits/' + c0)).tree.sha;
      var j = await lireAcces(c0), ens = {};
      (j.ouvertes || []).forEach(function (s) { ens[s] = true; });
      ouvre.forEach(function (s) { ens[s] = true; }); ferme.forEach(function (s) { delete ens[s]; });
      var CS = await cible(MDP_ELEVES), CP = await cible(MDP_PROF), entrees = [];
      var lot = ouvre.map(function (s) { return [s, CS]; }).concat(ferme.map(function (s) { return [s, CP]; }));
      for (var k = 0; k < lot.length; k++) {
        var s = lot[k][0], C = lot[k][1], it = href[s];
        progres('Rechiffrement ' + (k + 1) + ' / ' + lot.length + '…');
        var page = 'corrections/' + s + '.html', nv = await rechiffrerPage(await brut(page, c0), C);
        if (nv) entrees.push([page, nv]);
        if (it && it.pdf) {
          var np = await rechiffrerPdf(await brut(it.pdf, c0), C);
          if (np) entrees.push([it.pdf, np]);
        }
      }
      progres('Enregistrement…');
      var corps = JSON.stringify({ maj: new Date().toISOString(), ouvertes: Object.keys(ens).sort() }, null, 1) + '\n';
      entrees.push([FICHIER, new TextEncoder().encode(corps)]);
      var arbre = [];
      for (var e = 0; e < entrees.length; e++) {
        var bl = await api('/git/blobs', { method: 'POST', body: { content: b64(entrees[e][1]), encoding: 'base64' } });
        arbre.push({ path: entrees[e][0], mode: '100644', type: 'blob', sha: bl.sha });
      }
      var t = await api('/git/trees', { method: 'POST', body: { base_tree: arbre0, tree: arbre } });
      var c = await api('/git/commits', { method: 'POST', body: { message: message, tree: t.sha, parents: [c0] } });
      if (await api('/git/refs/heads/' + BRANCHE, { method: 'PATCH', body: { sha: c.sha, force: false }, conflit: true })) return ens;
    }
    throw new Error('Le site change en même temps ailleurs : réessayez.');
  }

  // ---------- état ----------
  var DONNEES = null, PUBLIE = {}, VOULU = {}, filtre = 'toutes', texte = '', EN_COURS = false;
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
        if (ch.dossier) s.classList.add('dossier', 'd-' + ch.dossier);
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
          l.dataset.cherche = norm([c.nom, (ch.dossier ? 'dossier ' + ch.dossier + ' devoir surveille ' : '') + 'chapitre ' + ch.numero, ch.titre, libelle(it), it.titre, it.consigne].join(' '));
          lignes.appendChild(l); sw.maj();
        });
        s.appendChild(lignes); bloc.appendChild(s);
      });
      liste.appendChild(bloc);
    });
    var seg = $('segments'); seg.innerHTML = '';
    [{ id: 'toutes', nom: 'Toutes' }].concat(DONNEES.classes.map(function (c) { return { id: c.id, nom: c.nom }; }))
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
    $('publier').disabled = EN_COURS || !ch.length; $('annuler').disabled = EN_COURS || !ch.length;
  }
  $('annuler').addEventListener('click', function () {
    VOULU = Object.assign({}, PUBLIE);
    document.querySelectorAll('.interrupteur').forEach(function (b) { b.maj(); });
    bilan();
  });
  $('publier').addEventListener('click', async function () {
    var ch = changements(); if (!ch.length) return;
    var pb = $('publier'); EN_COURS = true;
    bilan('Publication…');
    var ouvre = ch.filter(function (s) { return VOULU[s]; }), ferme = ch.filter(function (s) { return !VOULU[s]; });
    var message = 'Accès : ' + [ouvre.length ? 'ouvre ' + ouvre.join(', ') : '', ferme.length ? 'ferme ' + ferme.join(', ') : ''].filter(Boolean).join(' ; ');
    try {
      var ens = await publier(ouvre, ferme, message, function (t) { bilan(t); });
      PUBLIE = ens; VOULU = Object.assign({}, ens);
      document.querySelectorAll('.interrupteur').forEach(function (b) { b.maj(); });
      EN_COURS = false;
      bilan('Publié. Les élèves le verront d\'ici une à deux minutes.', 'ok');
    } catch (e) {
      EN_COURS = false;
      bilan(e.message, 'erreur');
    }
  });

  // ---------- connexion ----------
  async function entrer(mdpProf, jeton, garder) {
    if (!window.CLE_PROF) throw new Error('Clé de l’Espace professeur absente du site.');
    MDP_ELEVES = await ouvrirP(window.CLE_PROF, mdpProf)
      .then(function (b) { return JSON.parse(new TextDecoder().decode(b)).mdp; })
      .catch(function () { throw new Error('Mot de passe professeur incorrect.'); });
    MDP_PROF = mdpProf;
    DONNEES = await dechiffrer(MDP_ELEVES);
    DONNEES.classes.forEach(function (c) {      // le dossier « Devoirs surveillés » suit son chapitre, en bloc orange
      var l = [];
      c.chapitres.forEach(function (ch) {
        (ch.dossiers || []).forEach(function (o) {
          l.push({ numero: ch.numero, titre: o.titre + ' · ' + (ch.titre || 'chapitre ' + ch.numero), dossier: o.id, items: o.items });
        });
        if (ch.items.length) l.push(ch);
      });
      c.chapitres = l;
    });
    JETON = jeton;
    var j = await lireAcces();
    PUBLIE = {}; (j.ouvertes || []).forEach(function (s) { PUBLIE[s] = true; });
    VOULU = Object.assign({}, PUBLIE);
    try {
      var st = garder ? localStorage : sessionStorage;
      st.setItem(CLE_ADMIN, JSON.stringify({ jeton: jeton }));
      st.setItem(CLE_PROF, mdpProf);      // aperçus des corrections fermées (chiffrées avec ce mot de passe)
      st.setItem(CLE_ELEVE, MDP_ELEVES);  // aperçus des corrections ouvertes
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
    try { [localStorage, sessionStorage].forEach(function (st) { st.removeItem(CLE_ADMIN); st.removeItem(CLE_PROF); }); } catch (e) {}
    location.reload();
  });
  window.addEventListener('beforeunload', function (ev) {
    if (DONNEES && changements().length) { ev.preventDefault(); ev.returnValue = ''; }
  });

  // déjà connecté sur cet appareil
  var memo = null, mdp = null;
  try {
    memo = JSON.parse(localStorage.getItem(CLE_ADMIN) || sessionStorage.getItem(CLE_ADMIN) || 'null');
    mdp = localStorage.getItem(CLE_PROF) || sessionStorage.getItem(CLE_PROF);
  } catch (e) {}
  if (memo && memo.jeton && mdp) {
    msg.textContent = 'Connexion…';
    entrer(mdp, memo.jeton, !!localStorage.getItem(CLE_ADMIN)).then(function () { msg.textContent = ''; })
      .catch(function (e) { msg.className = 'message erreur'; msg.textContent = e.message; });
  }
})();
