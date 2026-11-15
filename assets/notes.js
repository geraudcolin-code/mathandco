/* Résultats des quiz notés (M. Colin, 15 nov. 2026) : lit /api/quiz-notes (résultats chiffrés par les pages des élèves avec
   la clé publique) et les déchiffre ici avec la clé privée, elle-même chiffrée par le mot de passe professeur
   (assets/notes-cle.json). Rien de lisible ne quitte cette page. */
(function () {
  'use strict';
  var QUIZ = [{ id: '1ere-ch03-quiz', titre: 'Première spécialité · Chapitre 3 · Probabilités conditionnelles et indépendance' }];
  var S = crypto.subtle, cle = null, donnees = [];
  var $ = function (id) { return document.getElementById(id); };
  function octets(b) { var t = atob(b), u = new Uint8Array(t.length); for (var k = 0; k < t.length; k++) u[k] = t.charCodeAt(k); return u; }
  function ouvrirCle(mdp) {
    return fetch('assets/notes-cle.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (doc) {
      var P = doc.priv;
      return S.importKey('raw', new TextEncoder().encode(mdp), 'PBKDF2', false, ['deriveKey'])
        .then(function (b) { return S.deriveKey({ name: 'PBKDF2', salt: octets(P.s), iterations: P.n, hash: 'SHA-256' }, b, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
        .then(function (k) { return S.decrypt({ name: 'AES-GCM', iv: octets(P.i) }, k, octets(P.c)); })
        .then(function (c) { return S.importKey('jwk', JSON.parse(new TextDecoder().decode(c)), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']); });
    });
  }
  function lire(p) {
    return S.importKey('jwk', { kty: 'EC', crv: 'P-256', x: p.epk.x, y: p.epk.y, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
      .then(function (pub) { return S.deriveKey({ name: 'ECDH', public: pub }, cle, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
      .then(function (k) { return S.decrypt({ name: 'AES-GCM', iv: octets(p.iv) }, k, octets(p.ct)); })
      .then(function (c) { return JSON.parse(new TextDecoder().decode(c)); }, function () { return null; });   // paquet illisible : ignoré
  }
  function charger() {
    var id = $('quiz').value;
    $('resume').textContent = 'Chargement…';
    return fetch('/api/quiz-notes?quiz=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    }).then(function (l) { return Promise.all(l.map(function (x) { return lire(x.paquet); })); })
      .then(function (l) { donnees = uneParTentative(l.filter(Boolean)); afficher(); },
        function () { donnees = []; afficher(); $('resume').textContent = 'Les résultats n’ont pas pu être chargés (connexion ?).'; });
  }
  // Une tentative quittée envoie son rapport à la sortie (et parfois plusieurs fois, si l'élève est revenu) : on ne garde
  // que le dernier paquet de chaque tentative, le résultat final s'il existe.
  function uneParTentative(l) {
    var m = {}, seules = [];
    l.forEach(function (r) {
      if (!r.tentative) { seules.push(r); return; }
      var a = m[r.tentative];
      var mieux = !a || (r.statut === 'terminé') > (a.statut === 'terminé') ||
        ((r.statut === 'terminé') === (a.statut === 'terminé') && ((r.repondues || 0) > (a.repondues || 0) || ((r.repondues || 0) === (a.repondues || 0) && r.fin > a.fin)));
      if (mieux) m[r.tentative] = r;
    });
    return seules.concat(Object.keys(m).map(function (k) { return m[k]; }));
  }
  function etat(r) { return r.statut === 'quitté' ? 'quitté après ' + (r.repondues || 0) + ' / ' + r.total + ' réponses' : 'terminé'; }
  function virgule(x) { return String(x).replace('.', ','); }
  function dateFr(iso) { var d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function duree(s) { var m = Math.floor(s / 60); return m + ' min ' + String(s % 60).padStart(2, '0') + ' s'; }
  function justes(r) { return (r.questions || []).filter(function (q) { return q.points === 1; }).length + ' / ' + r.total; }
  function cleP(r) { return r.pseudo.toLowerCase(); }
  function selection() {
    var f = $('cherche').value.trim().toLowerCase(), v = $('vue').value;
    var l = donnees.filter(function (r) { return !f || cleP(r).indexOf(f) >= 0; });
    if (v !== 'toutes') {
      var m = {};
      l.forEach(function (r) {
        var k = cleP(r), a = m[k];
        if (!a || (v === 'meilleure' ? r.note > a.note || (r.note === a.note && r.fin > a.fin) : r.fin > a.fin)) m[k] = r;
      });
      l = Object.keys(m).map(function (k) { return m[k]; });
    }
    return l.sort(function (a, b) { return cleP(a) < cleP(b) ? -1 : cleP(a) > cleP(b) ? 1 : (a.fin < b.fin ? -1 : 1); });
  }
  function afficher() {
    var l = selection(), tb = $('lignes');
    var pseudos = {}; donnees.forEach(function (r) { pseudos[cleP(r)] = 1; });
    $('resume').textContent = donnees.length + ' tentative' + (donnees.length > 1 ? 's' : '') + ' · ' + Object.keys(pseudos).length + ' pseudo' + (Object.keys(pseudos).length > 1 ? 's' : '');
    tb.innerHTML = '';
    if (!l.length) { var tr0 = document.createElement('tr'); tr0.innerHTML = '<td colspan="7" class="nt-vide">Aucun résultat pour l’instant.</td>'; tb.appendChild(tr0); return; }
    l.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.pseudo, virgule(r.note), justes(r), etat(r), dateFr(r.fin), duree(r.duree || 0)].forEach(function (t, j) {
        var td = document.createElement('td'); td.textContent = t; if (j === 1) td.className = 'nt-note'; if (j === 3 && r.statut === 'quitté') td.className = 'nt-quitte'; tr.appendChild(td);
      });
      var td = document.createElement('td'), b = document.createElement('button');
      b.type = 'button'; b.className = 'nt-voir'; b.textContent = 'Détail'; td.appendChild(b); tr.appendChild(td);
      var det = document.createElement('tr'); det.className = 'nt-detail'; det.hidden = true;
      var dd = document.createElement('td'); dd.colSpan = 7;
      dd.textContent = (r.questions || []).map(function (q, i) { return (i + 1) + '. ' + (q.ref || q.theme) + ' : ' + virgule(q.points); }).join(' · ');
      det.appendChild(dd);
      b.addEventListener('click', function () { det.hidden = !det.hidden; });
      tb.appendChild(tr); tb.appendChild(det);
    });
  }
  function csv() {
    var l = selection(), n = Math.max.apply(null, [0].concat(l.map(function (r) { return (r.questions || []).length; })));
    var tete = ['pseudo', 'note_sur_20', 'questions_justes', 'etat', 'debut', 'fin', 'duree_s'];
    for (var k = 1; k <= n; k++) tete.push('q' + k);
    var lignes = [tete.join(';')].concat(l.map(function (r) {
      var c = [r.pseudo, virgule(r.note), justes(r), etat(r), dateFr(r.debut), dateFr(r.fin), r.duree];
      (r.questions || []).forEach(function (q) { c.push((q.ref || q.theme) + ' : ' + virgule(q.points)); });
      return c.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(';');
    }));
    var blob = new Blob(['﻿' + lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'resultats-' + $('quiz').value + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function entrer(mdp, auto) {
    var m = $('message'); m.textContent = 'Ouverture…';
    return ouvrirCle(mdp).then(function (k) {
      cle = k; $('porte').hidden = true; $('tableau').hidden = false; return charger();
    }, function () { m.textContent = auto ? '' : 'Mot de passe incorrect.'; });
  }
  QUIZ.forEach(function (q) { var o = document.createElement('option'); o.value = q.id; o.textContent = q.titre; $('quiz').appendChild(o); });
  $('formulaire').addEventListener('submit', function (e) { e.preventDefault(); entrer($('mdp').value); });
  $('quiz').addEventListener('change', charger); $('actualiser').addEventListener('click', charger);
  $('vue').addEventListener('change', afficher); $('cherche').addEventListener('input', afficher); $('csv').addEventListener('click', csv);
  var memo = null; try { memo = localStorage.getItem('colineaire.prof') || sessionStorage.getItem('colineaire.prof'); } catch (e) {}
  if (memo) entrer(memo, true);
})();
