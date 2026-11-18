/* Résultats des quiz notés (M. Colin, 15 nov. 2026) : lit /api/quiz-notes (résultats chiffrés par les pages des élèves avec
   la clé publique) et les déchiffre ici avec la clé privée, elle-même chiffrée par le mot de passe professeur
   (assets/notes-cle.json). Rien de lisible ne quitte cette page.
   RAPPORT DÉTAILLÉ (M. Colin, 17 nov. 2026) : un clic sur un élève ouvre son rapport, question par question (énoncé tel
   qu'il l'a vu, sa réponse, la bonne réponse, les points ; vert / orange / rouge comme dans la revue finale du quiz) ;
   statistiques par question (réussite, mauvaises réponses les plus fréquentes) ; CSV des réponses.
   SÉCURITÉ (relecture du 18 nov. 2026) : la clé publique étant publique, n'importe qui peut fabriquer un paquet. Rien de
   ce qu'il contient n'entre dans la page sans passer par sur() (balises et attributs SVG d'une liste blanche, puis LISTE
   BLANCHE de commandes LaTeX sur la chaîne finale) ou par textContent dans un élément « nt-brut », que MathLive ne rend
   jamais ; toute formule passe par texSur() ; paquets bornés (2 Mo décompressés, 100 questions) ; une question illisible
   n'empêche pas d'afficher les autres. notes.html porte en plus une politique de sécurité (CSP) : aucune requête vers
   l'extérieur, hors polices et statistiques du site. */
(function () {
  'use strict';
  // un quiz noté = son identifiant (clé de QUIZ_CONFIG dans la page du quiz, envoyé en clair au Worker et répété dans le
  // paquet chiffré) ; les résultats d'un quiz ne se mêlent jamais à ceux d'un autre
  var QUIZ = [{ id: '1ere-ch03-quiz', titre: 'Première spécialité · Chapitre 3 · Probabilités conditionnelles et indépendance' },
              { id: '2nde-ch03-devfact', titre: 'Seconde · Chapitre 3 · Développer et factoriser' }];
  var S = crypto.subtle, cle = null, donnees = [], onglet = 'resultats', ouvert = null;
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
  // paquet compressé (rapport détaillé, 17 nov. 2026) : octet 0 puis deflate-raw ; ancien paquet : JSON (« { » en tête).
  // Au plus 2 Mo une fois décompressé (un vrai paquet en fait quelques dizaines de Ko) : au-delà, ignoré et signalé.
  var PLAFOND = 2 * 1024 * 1024, MAX_QUESTIONS = 100, ignores = 0;
  function texteClair(u) {
    if (u[0] !== 0) { if (u.length > PLAFOND) throw new Error('trop gros'); return JSON.parse(new TextDecoder().decode(u)); }
    var lecteur = new Blob([u.subarray(1)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), morceaux = [], n = 0;
    function suite() {
      return lecteur.read().then(function (x) {
        if (x.done) return;
        n += x.value.length;
        if (n > PLAFOND) { try { lecteur.cancel(); } catch (e) {} throw new Error('trop gros'); }
        morceaux.push(x.value); return suite();
      });
    }
    return suite().then(function () {
      var tout = new Uint8Array(n), k = 0; morceaux.forEach(function (m) { tout.set(m, k); k += m.length; });
      return JSON.parse(new TextDecoder().decode(tout));
    });
  }
  function valide(o) {                           // la forme attendue d'un résultat ; sinon le paquet est ignoré (et compté)
    if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.pseudo !== 'string' || typeof o.quiz !== 'string') return null;
    if (o.questions != null && (!Array.isArray(o.questions) || o.questions.length > MAX_QUESTIONS)) return null;
    o.questions = (o.questions || []).filter(function (d) { return d && typeof d === 'object' && !Array.isArray(d); });
    ['note', 'points', 'total', 'repondues', 'duree'].forEach(function (k) { if (typeof o[k] !== 'number' || !isFinite(o[k])) o[k] = 0; });
    ['tentative', 'statut', 'debut', 'fin'].forEach(function (k) { if (o[k] != null && typeof o[k] !== 'string') o[k] = String(o[k]); });
    o.questions.forEach(function (d) { if (typeof d.points !== 'number' || !isFinite(d.points)) d.points = 0; d.repondue = d.repondue === true;
      ['ref', 'theme', 'type', 'famille'].forEach(function (k) { if (d[k] != null && typeof d[k] !== 'string') d[k] = String(d[k]); }); });
    return o;
  }
  function lire(p) {
    return S.importKey('jwk', { kty: 'EC', crv: 'P-256', x: p.epk.x, y: p.epk.y, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
      .then(function (pub) { return S.deriveKey({ name: 'ECDH', public: pub }, cle, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
      .then(function (k) { return S.decrypt({ name: 'AES-GCM', iv: octets(p.iv) }, k, octets(p.ct)); })
      .then(function (c) { return texteClair(new Uint8Array(c)); })
      .then(function (o) { o = valide(o); if (!o) ignores++; return o; }, function () { ignores++; return null; });   // paquet illisible ou démesuré : ignoré, compté
  }
  function charger() {
    var id = $('quiz').value;
    donnees = []; ignores = 0; fermerRapport(); afficher();     // rien de l'ancien quiz pendant le chargement (CSV compris)
    $('resume').textContent = 'Chargement…';
    return fetch('/api/quiz-notes?quiz=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    }).then(function (l) { return Promise.all((Array.isArray(l) ? l : []).map(function (x) { return x && x.paquet && x.paquet.epk ? lire(x.paquet) : (ignores++, null); })); })
      .then(function (l) { if (id !== $('quiz').value) return;   // un autre quiz a été choisi entre-temps
        donnees = uneParTentative(l.filter(function (r) { return r && r.quiz === id; })); afficher(); },
        function () { if (id !== $('quiz').value) return; donnees = []; afficher(); $('resume').textContent = 'Les résultats n’ont pas pu être chargés (connexion ?).'; });
  }
  // Une tentative quittée envoie son rapport à la sortie (et parfois plusieurs fois, si l'élève est revenu) : on ne garde
  // que le dernier paquet de chaque tentative, le résultat final s'il existe.
  function uneParTentative(l) {
    var m = Object.create(null), seules = [];
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
  // points d'une question : 1, 0, 0,5, 0,75… ou 2/3, 3/5, 7/12 (cases, tableau, arbre, exercice au prorata, 16 nov. 2026) :
  // demis et quarts en décimal, sinon fraction irréductible ; la somme du détail redonne exactement la note. Les points
  // sont envoyés arrondis au millionième ; un ancien résultat arrondi au centième (0,33) reste écrit en décimal.
  function pts(x) {
    x = +x || 0;
    for (var d = 1; d <= 240; d++) {
      var k = Math.round(x * d);
      if (Math.abs(x - k / d) < 2e-6) return d === 1 || d === 2 || d === 4 || d >= 100 ? virgule(Math.round(x * 100) / 100) : k + '/' + d;
    }
    return virgule(Math.round(x * 100) / 100);
  }
  function ptsMot(x) { var t = pts(x); return t + (t.indexOf('/') >= 0 ? ' de point' : ' point'); }
  function bilanTexte(d) {                       // comme la revue finale du quiz
    return !d.repondue ? 'Pas de réponse : 0 point.' : d.points === 1 ? 'Juste : 1 point.'
      : d.points > 0 ? 'En partie juste : ' + ptsMot(d.points) + '.' : 'Faux : 0 point.';
  }
  function couleur(x, repondue) { return repondue === false ? 'nt-sans' : x === 1 ? 'nt-juste' : x > 0 ? 'nt-partiel' : 'nt-faux'; }
  function dateFr(iso) { var d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function duree(s) { var m = Math.floor(s / 60); return m + ' min ' + String(s % 60).padStart(2, '0') + ' s'; }
  function justes(r) { return (r.questions || []).filter(function (q) { return q.points === 1; }).length + ' / ' + r.total; }
  function cleP(r) { return r.pseudo.toLowerCase(); }
  function selection() {
    var f = $('cherche').value.trim().toLowerCase(), v = $('vue').value;
    var l = donnees.filter(function (r) { return !f || cleP(r).indexOf(f) >= 0; });
    if (v !== 'toutes') {
      var m = Object.create(null);
      l.forEach(function (r) {
        var k = cleP(r), a = m[k];
        if (!a || (v === 'meilleure' ? r.note > a.note || (r.note === a.note && r.fin > a.fin) : r.fin > a.fin)) m[k] = r;
      });
      l = Object.keys(m).map(function (k) { return m[k]; });
    }
    return l.sort(function (a, b) { return cleP(a) < cleP(b) ? -1 : cleP(a) > cleP(b) ? 1 : (a.fin < b.fin ? -1 : 1); });
  }

  /* ======================= HTML sûr ======================= */
  var BALISES = { P: 'p', BR: 'br', I: 'i', B: 'b', STRONG: 'strong', EM: 'em', SUP: 'sup', SUB: 'sub', SPAN: 'span', U: 'u', SMALL: 'small' };
  var JETES = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, NOSCRIPT: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEXTAREA: 1, SELECT: 1, TITLE: 1 };
  var SVG_B = ['svg', 'g', 'path', 'text', 'tspan', 'line', 'circle', 'ellipse', 'rect', 'polygon', 'polyline'];
  // attributs SVG : valeurs simples seulement (nombres, chemins, couleurs nommées ou #hex) ; PAS d'attribut style (un
  // style de la banque est traduit en attributs de présentation, propriété par propriété : voir styleSvg)
  var SVG_NUM = /^[-+0-9.eE%\s]*$/, SVG_A = {
    viewBox: /^[-0-9.eE\s,]*$/, width: SVG_NUM, height: SVG_NUM, x: SVG_NUM, y: SVG_NUM, dx: SVG_NUM, dy: SVG_NUM, x1: SVG_NUM, y1: SVG_NUM,
    x2: SVG_NUM, y2: SVG_NUM, cx: SVG_NUM, cy: SVG_NUM, r: SVG_NUM, rx: SVG_NUM, ry: SVG_NUM, points: /^[-0-9.eE\s,]*$/, d: /^[-0-9.eE\s,a-zA-Z]*$/,
    transform: /^(?:\s*(?:translate|scale|rotate|matrix)\([-0-9.eE\s,]*\)\s*)*$/, role: /^[a-z]*$/, 'aria-label': /^[^<>"\\]*$/ };
  var SVG_P = { fill: 1, stroke: 1, 'stroke-width': 1, 'stroke-dasharray': 1, 'font-size': 1, 'font-style': 1, 'font-weight': 1, 'font-family': 1, 'text-anchor': 1 };
  var SVG_V = /^[#a-zA-Z0-9.,%\s'-]{0,60}$/;       // pas de parenthèse : ni url(), ni image-set(), ni var()
  function styleSvg(x) {                          // attributs de présentation + style de la banque → attributs vérifiés
    var p = {};
    Object.keys(SVG_P).forEach(function (k) { var v = x.getAttribute(k); if (v != null) p[k] = v; });
    String(x.getAttribute('style') || '').split(';').forEach(function (d) {
      var i = d.indexOf(':'); if (i < 0) return;
      var k = d.slice(0, i).trim().toLowerCase(); if (SVG_P[k]) p[k] = d.slice(i + 1).trim();
    });
    return Object.keys(p).filter(function (k) { return SVG_V.test(p[k]) && !/url|image|expression/i.test(p[k]); })
      .map(function (k) { return ' ' + k + '="' + esc(p[k]) + '"'; }).join('');
  }
  // LaTeX : LISTE BLANCHE de commandes (celles des banques et du clavier mathématique) ; toute autre commande perd sa barre
  // oblique (« \htmlStyle » devient le texte « htmlStyle ») ; environnements permis seulement ; « ^^ » (caractère codé)
  // ramené à « ^ ». Appliquée à la chaîne FINALE de sur() et à toute formule passée à maths().
  var TEX_OK = Object.create(null);
  ('frac dfrac tfrac sqrt left right times cdot div pm mp le ge leq geq leqslant geqslant lt gt ne neq approx sim equiv infty in notin ' +
   'ni cup cap emptyset varnothing subset subseteq supset supseteq forall exists neg land lor to rightarrow leftarrow Rightarrow Leftarrow ' +
   'Leftrightarrow iff mapsto longmapsto implies mathbb mathrm mathit mathbf mathcal mathord mathbin mathrel mathop operatorname text textrm textit textbf ' +
   'exponentialE imaginaryI differentialD placeholder overline underline overrightarrow vec hat widehat bar dot ddot tilde ' +
   'ldots cdots dots vdots ddots quad qquad big Big bigg Bigg bigl bigr Bigl Bigr displaystyle textstyle scriptstyle ' +
   'lbrack rbrack lbrace rbrace langle rangle lvert rvert vert Vert mid parallel perp angle circ degree prime ast star ' +
   'binom dbinom tbinom ln log exp sin cos tan lim sum prod int min max percent colon cancel not ' +
   'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma ' +
   'varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega begin end').split(' ').forEach(function (c) { TEX_OK[c] = 1; });
  var ENV_OK = { aligned: 1, cases: 1, matrix: 1, pmatrix: 1, bmatrix: 1, array: 1 };
  var SIGNES_OK = ',;:! {}()[]%_&#|\\';
  function texSur(t) {
    t = String(t == null ? '' : t);
    t = t.replace(/\\([a-zA-Z]+|[\s\S])/g, function (m, c, k, s) {
      if (c.length === 1 && !/[a-zA-Z]/.test(c)) return SIGNES_OK.indexOf(c) >= 0 ? m : c;
      if (c === 'begin' || c === 'end') { var e = /^\s*\{([a-zA-Z]+)\*?\}/.exec(s.slice(k + m.length)); return e && ENV_OK[e[1]] ? m : ' ' + c; }
      return TEX_OK[c] ? m : ' ' + c;                // l'espace empêche de recoller un nom à la commande permise qui précède
    });
    for (var i = 0; i < 20 && /\^\s*\^/.test(t); i++) t = t.replace(/\^\s*\^/g, '^');
    return t;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var memoSur = new Map();
  function sur(html) {
    if (html == null || html === '') return '';
    html = String(html);
    if (memoSur.has(html)) return memoSur.get(html);
    var doc = new DOMParser().parseFromString('<!DOCTYPE html><body>' + html, 'text/html'), out = texSur(enfants(doc.body));   // document inerte : rien ne s'exécute ni ne se charge ; LaTeX filtré sur la chaîne FINALE (un commentaire ou une balise au milieu d'une commande ne la sauve pas)
    if (memoSur.size > 5000) memoSur.clear();
    memoSur.set(html, out);
    return out;
  }
  function enfants(n) { var s = ''; for (var x = n.firstChild; x; x = x.nextSibling) s += noeud(x); return s; }
  function noeud(x) {
    if (x.nodeType === 3) return esc(x.nodeValue);
    if (x.nodeType !== 1 || JETES[x.tagName]) return '';
    if (x.namespaceURI === 'http://www.w3.org/2000/svg') {       // schéma vectoriel d'une proposition (1ère CH03) : dessin seul
      var t = x.localName; if (SVG_B.indexOf(t) < 0) return '';
      var a = t === 'svg' ? ' class="qz-schema"' : '';
      Object.keys(SVG_A).forEach(function (k) {
        var v = x.getAttribute(k); if (v == null || v.length > 2000 || !SVG_A[k].test(v)) return;
        a += ' ' + k + '="' + esc(v) + '"';
      });
      a += styleSvg(x);
      return '<' + t + a + '>' + enfants(x) + '</' + t + '>';
    }
    var b = BALISES[x.tagName];
    if (b === 'br') return '<br>';
    return b ? '<' + b + '>' + enfants(x) + '</' + b + '>' : enfants(x);
  }
  function nettoyerQ(o, prof) {                 // question du paquet : toutes ses chaînes passées par sur() ; forme vérifiée
    prof = prof || 0; if (prof > 12) return null;
    if (typeof o === 'string') return sur(o);
    if (typeof o === 'number') return isFinite(o) ? o : null;
    if (typeof o === 'boolean') return o;
    if (Array.isArray(o)) return o.slice(0, 200).map(function (x) { return nettoyerQ(x, prof + 1); });
    if (o && typeof o === 'object') {
      var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && /^[a-zA-Z]+$/.test(k) && k !== 'constructor') r[k] = nettoyerQ(o[k], prof + 1);
      ['propositions', 'gauche', 'droite', 'parties', 'ordre', 'ordreD'].forEach(function (k) { if (r[k] != null && !Array.isArray(r[k]) && !(k === 'gauche' || k === 'droite') ) delete r[k]; });
      if (r.type === 'associer') { if (!Array.isArray(r.gauche)) r.gauche = []; if (!Array.isArray(r.droite)) r.droite = []; }
      if (r.type === 'comparer') { if (typeof r.gauche !== 'string') r.gauche = ''; if (typeof r.droite !== 'string') r.droite = ''; }
      if (r.tableau != null && !(r.tableau && Array.isArray(r.tableau.lignes) && r.tableau.lignes.every(Array.isArray))) delete r.tableau;
      if (r.arbre != null && !(r.arbre && Array.isArray(r.arbre.branches))) delete r.arbre;
      if (r.type === 'exercice' && !Array.isArray(r.parties)) r.parties = [];
      if (typeof r.type !== 'string') r.type = '';
      return r;
    }
    return null;
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }   // html : constante ou sortie de sur()
  // texte brut (pseudo, repère, thème, réponse non mathématique…) : classe « nt-brut », jamais rendu par MathLive
  function tx(tag, cls, t) { var e = document.createElement(tag); e.className = 'nt-brut' + (cls ? ' ' + cls : ''); e.textContent = t == null ? '' : String(t); return e; }
  function maths(latex, cls) {                    // une formule : LaTeX filtré (liste blanche), délimiteurs retirés
    var e = document.createElement('span'); if (cls) e.className = cls;
    e.textContent = '\\(' + texSur(String(latex == null ? '' : latex).slice(0, 2000)).replace(/\\[()\[\]]/g, '') + '\\)';
    return e;
  }
  function C() { return window.ColineaireQuiz || null; }
  var RENDU = { ignoreClass: '(^|\\s)(tex2jax_ignore|ML__latex|nt-brut)(\\s|$)', asciiMath: { delimiters: { inline: [], display: [] } },
                TeX: { processEnvironments: false, delimiters: { inline: [['\\(', '\\)']], display: [['\\[', '\\]']] } } };
  function rendreM(e) {                          // formules rendues comme dans le quiz (MathLive), dès qu'il est chargé
    var f = function () { try { window.MathLive.renderMathInElement(e, RENDU); } catch (x) {} };
    if (window.MathLive && window.MathLive.renderMathInElement) f();
    else if (window.customElements) customElements.whenDefined('math-field').then(f);
  }

  /* ======================= Texte lisible (CSV, regroupements) ======================= */
  var SYMB = { cap: '∩', cup: '∪', times: '×', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', lt: '<', gt: '>', infty: '∞',
               approx: '≈', Omega: 'Ω', pi: 'π', in: '∈', mathbb: '', quad: ' ', qquad: ' ', mathord: '', mathrm: '', text: '', displaystyle: '', left: '', right: '' };
  function texLisible(t) {
    t = String(t == null ? '' : t).replace(/\\\(|\\\)|\\\[|\\\]/g, '').replace(/\{,\}/g, ',').replace(/\\[,;:! ]/g, ' ');
    for (var k = 0; k < 4; k++) t = t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function (_, a, b) { return (/^\w+$/.test(a) ? a : '(' + a + ')') + '/' + (/^\w+$/.test(b) ? b : '(' + b + ')'); })
      .replace(/\\overline\s*\{([^{}]*)\}/g, function (_, a) { return a.replace(/./g, '$&\u0305'); })
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
    t = t.replace(/\\([a-zA-Z]+)/g, function (m, c) { return SYMB[c] != null ? SYMB[c] : c; });
    return t.replace(/\^\{([^{}]*)\}/g, function (_, a) { return a.length > 1 ? '^(' + a + ')' : '^' + a; }).replace(/_\{([^{}]*)\}/g, '_$1')
      .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  }
  function texteBrut(html) {                    // énoncé : paragraphes séparés par « / », formules en texte lisible
    var doc = new DOMParser().parseFromString('<!DOCTYPE html><body>' + sur(html).replace(/<\/p>|<br>/g, '$& / '), 'text/html');
    return texLisible(doc.body.textContent).replace(/(\s*\/\s*)+$/, '').replace(/^\s*\/\s*/, '').replace(/\s*\/\s*\/\s*/g, ' / ');
  }
  var LETTRES = 'ABCDEFGH';
  function ordreQcm(q) {                          // ordre affiché à l'élève (rapport allégé : l'ordre seul, sans les propositions)
    var o = Array.isArray(q.ordre) ? q.ordre : null, p = Array.isArray(q.propositions) ? q.propositions : null;
    return o && (!p || o.length === p.length) ? o : (p || []).map(function (_, i) { return i; });
  }
  function lettreDe(q, i) { var r = ordreQcm(q).indexOf(i); return r >= 0 ? LETTRES[r] : '?'; }
  function choix(q, i) { return lettreDe(q, i) + '. ' + texteBrut((q.propositions || [])[i]); }
  function avantCase(s, k) {                     // texte du modèle entre la case précédente et la case k (un {k} dans \( \) n'est pas une case)
    var re = /\\\([\s\S]*?\\\)|\{(\d+)\}/g, m, d0 = 0;
    while ((m = re.exec(s))) { if (m[1] == null) continue; if (+m[1] === k) return s.slice(d0, m.index); d0 = re.lastIndex; }
    return '';
  }
  function nomCase(q, k) {                       // où est la case k : « Golden / Bien mûres », « branche vers C », « P(F ∩ C) »…
    var m = '{' + k + '}', t;
    if (q.tableau && q.type === 'tableau') {
      var L = q.tableau.lignes || [];
      for (var i = 0; i < L.length; i++) for (var j = 0; j < L[i].length; j++)
        if (String(L[i][j]).trim() === m) return [texteBrut(String(L[i][0]).replace(/<br>/g, ' ')), texteBrut(String((L[0] || [])[j]).replace(/<br>/g, ' '))].filter(Boolean).join(' / ');
    }
    if (q.arbre && q.type === 'arbre') {
      var A = q.arbre, trouve = '';
      (function tour(bs, de) { (bs || []).forEach(function (b) { if (trouve) return; if (String(b.p).trim() === m) trouve = 'branche ' + (de ? de + ' → ' : 'vers ') + texLisible(b.nom); tour(b.branches, texLisible(b.nom)); }); })(A.branches, '');
      if (trouve) return trouve;
      var c = (A.chemins || []).indexOf(m); if (c >= 0) return A.cheminsNoms && A.cheminsNoms[c] ? texLisible(A.cheminsNoms[c]) : 'chemin n° ' + (c + 1);
    }
    if (q.type === 'cases' && q.modele && (t = avantCase(String(q.modele), k))) {
      t = texteBrut(t).replace(/=\s*$/, '').trim();
      return 'case ' + (k + 1) + (t ? ' (' + t.slice(-30) + ')' : '');
    }
    return 'case ' + (k + 1);
  }
  function texteReponse(q, r, c) {               // réponse (de l'élève ou attendue) en une ligne de texte
    if (r == null || r === '') return '';
    switch (q.type) {
      case 'cases': case 'tableau': case 'arbre': case 'coords':
        return (Array.isArray(r) ? r : []).map(function (v, k) { return (q.type === 'coords' ? '' : nomCase(q, k) + ' : ') + texLisible(v) + (c ? (c[k] ? ' ✓' : ' ✗') : ''); }).join(' | ');
      case 'qcm': return (Array.isArray(r) ? r : [r]).map(function (i) { return choix(q, +i); }).join(' ; ');
      case 'vf': return r === true ? 'Vrai' : r === false ? 'Faux' : String(r);
      case 'associer': if (!Array.isArray(r)) return String(r); return (Array.isArray(q.gauche) ? q.gauche : r).map(function (g, i) { return (Array.isArray(q.gauche) ? texteBrut(g) : String(i + 1)) + ' → ' + (r[i] == null ? '?' : Array.isArray(q.droite) ? texteBrut(q.droite[r[i]]) : String(r[i])) + (c ? (c[i] ? ' ✓' : ' ✗') : ''); }).join(' | ');
      case 'exercice': return (Array.isArray(r) ? r : []).map(function (x, i) { var pa = (q.parties || [])[i] || {}; return (i + 1) + '. ' + texteReponse(pa, x, c && c[i] && c[i].c); }).join(' || ');
      default: return typeof r === 'string' ? texLisible(r) : JSON.stringify(r);
    }
  }
  // message du quiz qui NOMME une erreur (piège, forme, totaux…) ; les messages qui ne font que compter sont omis
  var GENERIQUE = /\(en rouge\)|^Ce n’est pas la bonne réponse|^La case|^L(?:a|es) questions? \d|cochées? (?:est|sont) fausses?|^Il manque au moins une bonne réponse/;
  function erreurUtile(m) { return m && !GENERIQUE.test(String(m)) ? m : ''; }
  function detailAssocier(d) { var r = Array.isArray(d.r) ? d.r : []; return (Array.isArray(d.a) ? d.a : []).map(function (x, i) { return +r[i] === x ? 1 : 0; }); }

  /* ======================= Tableau des résultats ======================= */
  function afficher() {
    var l = selection(), tb = $('lignes');
    var pseudos = Object.create(null); donnees.forEach(function (r) { pseudos[cleP(r)] = 1; });
    $('resume').textContent = donnees.length + ' tentative' + (donnees.length > 1 ? 's' : '') + ' · ' + Object.keys(pseudos).length + ' pseudo' + (Object.keys(pseudos).length > 1 ? 's' : '')
      + (ignores ? ' · ' + ignores + ' paquet' + (ignores > 1 ? 's' : '') + ' illisible' + (ignores > 1 ? 's' : '') + ' ou démesuré' + (ignores > 1 ? 's' : '') + ' ignoré' + (ignores > 1 ? 's' : '') : '');
    tb.innerHTML = '';
    if (!l.length) { var tr0 = document.createElement('tr'); tr0.innerHTML = '<td colspan="7" class="nt-vide">Aucun résultat pour l’instant.</td>'; tb.appendChild(tr0); }
    l.forEach(function (r) {
      var tr = document.createElement('tr'); tr.className = 'nt-ligne'; tr.tabIndex = 0;
      tr.setAttribute('aria-label', 'Ouvrir le rapport de ' + r.pseudo);
      [r.pseudo, virgule(r.note), justes(r), etat(r), dateFr(r.fin), duree(r.duree || 0)].forEach(function (t, j) {
        var td = tx('td', '', t); if (j === 1) td.className = 'nt-note'; if (j === 3 && r.statut === 'quitté') td.className = 'nt-quitte'; tr.appendChild(td);
      });
      var td = document.createElement('td'), b = tx('button', 'nt-voir', 'Rapport');
      b.type = 'button'; td.appendChild(b); tr.appendChild(td);
      tr.addEventListener('click', function () { ouvrirRapport(r); });
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target === tr) ouvrirRapport(r); });
      tb.appendChild(tr);
    });
    if (onglet === 'stats') statistiques();
  }

  /* ======================= Rapport d'un élève ======================= */
  function fermerRapport() {
    ouvert = null; $('rapport').hidden = true; $('rapport-corps').innerHTML = '';
    $('vue-liste').hidden = onglet !== 'resultats'; $('vue-stats').hidden = onglet !== 'stats'; $('nt-onglets').hidden = false;
  }
  function ouvrirRapport(r) {
    ouvert = r;
    $('vue-liste').hidden = true; $('vue-stats').hidden = true; $('nt-onglets').hidden = true; $('rapport').hidden = false;
    var z = $('rapport-corps'); z.innerHTML = '';
    var tete = el('div', 'nt-rap-tete');
    tete.appendChild(tx('h2', '', r.pseudo));
    tete.appendChild(tx('p', 'nt-rap-note', virgule(r.note) + ' / 20'));
    tete.appendChild(tx('p', 'nt-rap-info', justes(r) + ' questions justes · ' + etat(r) + ' · ' + dateFr(r.fin) + ' · ' + duree(r.duree || 0)));
    z.appendChild(tete);
    var qs = r.questions || [], avec = qs.some(function (d) { return d && d.q; });
    if (r.allege === 1) z.appendChild(tx('p', 'nt-indispo', 'Rapport allégé (paquet trop gros) : les énoncés n’ont pas été transmis ; réponses, bonnes réponses et points de chaque question ci-dessous.'));
    else if (!avec) z.appendChild(tx('p', 'nt-indispo', r.allege === 2 ? 'Détail non disponible pour cette tentative (paquet trop gros) : repère et points de chaque question seulement.'
      : 'Détail non disponible pour cette tentative (résultat envoyé avant le rapport détaillé) : repère et points de chaque question seulement.'));
    var liste = el('ol', 'nt-rap-liste');
    qs.forEach(function (d, i) {                   // une question illisible n'empêche pas d'afficher les autres
      var li; try { li = carteQuestion(d || {}, i); } catch (e) { li = el('li', 'nt-q nt-sans'); li.appendChild(tx('p', 'nt-q-num', 'Question ' + (i + 1) + ' : détail illisible.')); }
      liste.appendChild(li);
    });
    z.appendChild(liste);
    rendreM(z);
    window.scrollTo({ top: $('tableau').offsetTop - 70, behavior: 'smooth' });
    setTimeout(function () { try { $('rapport-retour').focus({ preventScroll: true }); } catch (e) {} }, 50);
  }
  function pastille(d) { return tx('span', 'nt-pts ' + couleur(d.points, d.repondue), bilanTexte(d)); }
  function carteQuestion(d, i) {
    var li = el('li', 'nt-q ' + couleur(d.points, d.repondue));
    var h = el('div', 'nt-q-tete');
    h.appendChild(tx('span', 'nt-q-num', 'Question ' + (i + 1)));
    h.appendChild(tx('span', 'nt-q-ref', [d.ref, d.theme].filter(Boolean).join(' · ')));
    h.appendChild(pastille(d));
    li.appendChild(h);
    if (!d.q || typeof d.q !== 'object') {
      var q0 = { type: d.type, ordre: Array.isArray(d.ordre) ? d.ordre : null };   // rapport allégé : l'ordre des lettres d'un QCM est gardé
      if (d.repondue && d.r != null) li.appendChild(tx('p', 'nt-ligne-rep', 'Réponse de l’élève : ' + texteReponse(q0, d.r, d.c)));
      if (d.a != null) li.appendChild(tx('p', 'nt-ligne-rep', 'Bonne réponse : ' + texteReponse(q0, d.a)));
      return li;
    }
    var q = nettoyerQ(d.q);
    li.appendChild(enonce(q));
    li.appendChild(reponses(q, d));
    return li;
  }
  function enonce(q) {
    var e = el('div', 'nt-enonce quiz-enonce', q.enonce || '');
    if (q.figure) e.appendChild(tx('p', 'nt-figure', '[Figure de l’énoncé' + (q.figureAlt ? ' : ' + el('i', '', q.figureAlt).textContent : '') + ']'));
    var c = C();
    if (c && q.arbre && q.type !== 'arbre') e.appendChild(c.dessinerArbre(q.arbre, 'lecture').el);
    if (c && q.tableau && q.type !== 'tableau') e.appendChild(c.dessinerTableau(q.tableau, 'lecture').el);
    if (q.enonceApres && q.type !== 'arbre' && q.type !== 'tableau') e.appendChild(el('div', 'quiz-enonce-apres', q.enonceApres));
    return e;
  }
  function ligne(titre, cls) { var p = el('div', 'nt-ligne-rep ' + (cls || '')); p.appendChild(tx('span', 'nt-etiq', titre)); return p; }
  function caseRap(v, cls, aria) {
    var s = (v == null || v === '') ? tx('span', 'nt-case ' + cls + ' nt-case-vide', '—') : maths(v, 'nt-case ' + cls);
    if (aria) s.setAttribute('title', aria);
    return s;
  }
  function figure(q, vals, det, bonne) {          // tableau / arbre redessiné, la réponse dans chaque case
    var c = C(); if (!c) return tx('p', '', texteReponse(q, vals, det));
    var o = { rapport: function (k, aria) { return caseRap(vals ? vals[k] : '', bonne ? 'nt-bon' : det && det[k] ? 'nt-j' : 'nt-f', aria); } };
    var f = q.type === 'arbre' ? c.dessinerArbre(q.arbre, 'rapport', o) : c.dessinerTableau(q.tableau, 'rapport', o);
    f.el.classList.add('nt-fig');
    return f.el;
  }
  function phraseCases(q, vals, det, bonne) {    // « compléter une égalité » : le modèle avec les valeurs dans les cases
    var p = el('span', 'nt-cases'), re = /\\\([\s\S]*?\\\)|\{(\d+)\}/g, m, d0 = 0, s = String(q.modele || '');
    function texte(t) { if (t) p.appendChild(el('span', '', t)); }
    while ((m = re.exec(s))) {
      if (m[1] == null) continue;
      texte(s.slice(d0, m.index)); d0 = re.lastIndex;
      var k = +m[1]; p.appendChild(caseRap(vals ? vals[k] : '', bonne ? 'nt-bon' : det && det[k] ? 'nt-j' : 'nt-f'));
    }
    texte(s.slice(d0));
    return p;
  }
  function expression(q, v, cls) {
    var p = el('span', 'nt-expr');
    var pre = q.prefixe || (q.type === 'intervalles' || q.type === 'ensemble' ? '\\(S=\\)' : '');
    if (q.type === 'comparer') { p.appendChild(el('span', '', '\\(' + (q.gauche || '') + '\\)')); p.appendChild(document.createTextNode(' ')); }   // q.gauche : passé par sur()
    if (pre) p.appendChild(el('span', '', pre));
    if (v == null || v === '') p.appendChild(tx('span', 'nt-rien', 'pas de réponse'));
    else p.appendChild(maths(q.type === 'ensemble' ? '\\{' + v + '\\}' : v, 'nt-val ' + cls));
    if (q.suffixe) p.appendChild(el('span', '', q.suffixe));
    if (q.type === 'comparer') { p.appendChild(document.createTextNode(' ')); p.appendChild(el('span', '', '\\(' + (q.droite || '') + '\\)')); }
    return p;
  }
  function reponses(q, d) {                       // réponse de l'élève, bonne réponse, erreur repérée
    var b = el('div', 'nt-reps'), r = d.repondue ? d.r : null, a = d.a, c = d.c, juste = d.points === 1;
    var cls = juste ? 'nt-j' : d.points > 0 ? 'nt-p' : 'nt-f';
    var L;
    switch (q.type) {
      case 'tableau': case 'arbre':
        L = ligne('Réponse de l’élève'); b.appendChild(L);
        if (r == null) L.appendChild(tx('span', 'nt-rien', 'pas de réponse')); else b.appendChild(figure(q, r, c, false));
        if (!juste) { b.appendChild(ligne('Bonne réponse')); b.appendChild(figure(q, a, null, true)); }
        else b.appendChild(ligne('Bonne réponse : toutes les cases sont justes.'));
        break;
      case 'cases':
        L = ligne('Réponse de l’élève'); L.appendChild(r == null ? tx('span', 'nt-rien', 'pas de réponse') : phraseCases(q, r, c, false)); b.appendChild(L);
        L = ligne('Bonne réponse'); L.appendChild(phraseCases(q, a, null, true)); b.appendChild(L);
        break;
      case 'qcm': {
        var ch = r == null ? [] : (Array.isArray(r) ? r : [r]).map(Number), bon = Array.isArray(a) ? a : [a];
        if (bon.length > 1) b.appendChild(tx('p', 'nt-consigne', 'Plusieurs réponses possibles.'));
        var ul = el('ul', 'nt-props');
        ordreQcm(q).forEach(function (i, rang) {
          var pris = ch.indexOf(i) >= 0, ok = bon.indexOf(i) >= 0;
          var li = el('li', 'nt-prop' + (pris ? ' nt-choisie ' + (ok ? 'nt-j' : 'nt-f') : '') + (ok ? ' nt-bonne' : ''));
          li.appendChild(tx('span', 'nt-lettre', LETTRES[rang]));
          li.appendChild(el('span', 'nt-prop-txt', (q.propositions || [])[i]));
          var marques = el('span', 'nt-marques');
          if (pris) marques.appendChild(tx('span', 'nt-badge ' + (ok ? 'nt-j' : 'nt-f'), 'choix de l’élève'));
          if (ok) marques.appendChild(tx('span', 'nt-badge nt-bon', '✓ bonne réponse'));
          li.appendChild(marques); ul.appendChild(li);
        });
        b.appendChild(ul);
        if (r == null) b.appendChild(ligne('Pas de réponse.'));
        break;
      }
      case 'vf':
        L = ligne('Réponse de l’élève'); L.appendChild(r == null ? tx('span', 'nt-rien', 'pas de réponse') : tx('span', 'nt-val ' + cls, r ? 'Vrai' : 'Faux')); b.appendChild(L);
        L = ligne('Bonne réponse'); L.appendChild(tx('span', 'nt-val nt-bon', a ? 'Vrai' : 'Faux')); b.appendChild(L);
        break;
      case 'associer': {
        var det = r ? detailAssocier(d) : null, t = el('table', 'nt-assoc'), cad = el('div', 'nt-table-cadre nt-assoc-cadre');
        var th = el('tr'); ['', 'Réponse de l’élève', 'Bonne réponse'].forEach(function (x) { th.appendChild(tx('th', '', x)); }); t.appendChild(th);
        (q.gauche || []).forEach(function (g, i) {
          var tr = el('tr'); tr.appendChild(el('td', '', g));
          var v = r && r[i] != null ? (q.droite || [])[r[i]] : null;
          tr.appendChild(v == null ? tx('td', 'nt-rien', '—') : el('td', 'nt-val ' + (det[i] ? 'nt-j' : 'nt-f'), v));
          tr.appendChild(el('td', 'nt-val nt-bon', (q.droite || [])[(a || [])[i]] || ''));
          t.appendChild(tr);
        });
        cad.appendChild(t); b.appendChild(cad);
        break;
      }
      case 'exercice': {
        var ol = el('ol', 'nt-parties'), x = Array.isArray(c) ? c : [];
        (q.parties || []).forEach(function (pa, i) {
          var xi = x[i] || {}, dp = { repondue: d.repondue, points: d.repondue ? (typeof xi.p === 'number' ? xi.p : 0) : 0, r: r ? r[i] : null, a: (a || [])[i], c: xi.c, m: xi.m };
          var li = el('li', 'nt-partie ' + couleur(dp.points, dp.repondue));
          var h = el('div', 'nt-q-tete'); h.appendChild(tx('span', 'nt-q-num', (i + 1) + '.')); h.appendChild(pastille(dp)); li.appendChild(h);
          li.appendChild(enonce(pa)); li.appendChild(reponses(pa, dp)); ol.appendChild(li);
        });
        b.appendChild(ol);
        break;
      }
      case 'signes': case 'variations': case 'repere': case 'coords':
        L = ligne('Réponse de l’élève'); L.appendChild(tx('span', 'nt-val ' + cls, r == null ? 'pas de réponse transmise' : JSON.stringify(r))); b.appendChild(L);
        L = ligne('Bonne réponse'); L.appendChild(tx('span', 'nt-val nt-bon', JSON.stringify(a))); b.appendChild(L);
        break;
      default:
        L = ligne('Réponse de l’élève'); L.appendChild(expression(q, r, cls)); b.appendChild(L);
        L = ligne('Bonne réponse'); L.appendChild(expression(q, a, 'nt-bon')); b.appendChild(L);
    }
    if (erreurUtile(d.m) && d.repondue && !juste) { L = ligne('Erreur repérée', 'nt-erreur'); L.appendChild(el('span', '', sur(d.m))); b.appendChild(L); }
    return b;
  }

  /* ======================= Statistiques par question ======================= */
  var GRAINES = [0.7316, 1.3127, -2.1093, 2.6571];
  function signature(latex) {                     // valeur d'une expression en quelques points : regroupe les écritures égales
    var c = C(); if (!c || !c.analyser) return null;
    try {
      var n = c.analyser(String(latex)), vs = Object.keys(c.variables ? c.variables(n) : {}).sort(), out = [];
      for (var g = 0; g < 3; g++) {
        var env = {}; vs.forEach(function (v, j) { env[v] = GRAINES[(g + j) % 4] + 0.37 * j; });
        var x = c.evaluer(n, env); if (!isFinite(x)) return null;
        out.push(Math.abs(x) < 1e-12 ? '0' : x.toPrecision(10));
      }
      return out.join(',') + '|' + vs.join('');
    } catch (e) { return null; }
  }
  function forme(latex) { return String(latex).replace(/\\left|\\right|\\[,;:! ]|\s+/g, '').replace(/\\[dt]frac/g, '\\frac').replace(/\{,\}/g, ',').replace(/\\cdot/g, '\\times'); }
  function cleExpr(latex, msg) { var s = signature(latex); return s ? 'v:' + s + '|' + (msg || '') : 't:' + forme(latex); }
  function mauvaises(q, d, quoi) {               // les mauvaises réponses d'une question (case par case, question par question)
    var r = d.r, c = d.c, out = [];
    if (!d.repondue || d.points === 1 || r == null) return out;
    function ajout(cle, texte, latex, ou, html) { out.push({ cle: (ou || '') + '#' + cle, texte: texte, latex: latex, quoi: ou || '', html: html }); }
    var pre = quoi ? quoi + ' · ' : '';
    switch (q.type) {
      case 'cases': case 'tableau': case 'arbre':
        (Array.isArray(r) ? r : []).forEach(function (v, k) { if (c && c[k]) return; ajout(cleExpr(v), String(v), true, pre + nomCase(q, k)); });
        break;
      case 'qcm': { var l = (Array.isArray(r) ? r : [r]).map(Number).sort(); ajout('p' + l.join(','), l.join(','), false, quoi, l.map(function (i) { return (q.propositions || [])[i] || '?'; }).join(' ; ')); break; }
      case 'vf': ajout(String(r), r ? 'Vrai' : 'Faux', false, quoi); break;
      case 'associer': { if (!Array.isArray(r)) break; var det = detailAssocier(d); (Array.isArray(q.gauche) ? q.gauche : []).forEach(function (g, i) { if (det[i] || r[i] == null) return; ajout('d' + r[i], texteBrut((Array.isArray(q.droite) ? q.droite : [])[r[i]]), false, pre + texteBrut(g)); }); break; }
      case 'exercice': if (!Array.isArray(r)) break; (Array.isArray(q.parties) ? q.parties : []).forEach(function (pa, i) {
        var xi = (Array.isArray(c) ? c : [])[i] || {};
        out = out.concat(mauvaises(pa, { repondue: true, points: typeof xi.p === 'number' ? xi.p : 0, r: r[i], c: xi.c, m: xi.m }, pre + 'question ' + (i + 1)));
      }); break;
      default: if (typeof r === 'string' && r.trim()) ajout(cleExpr(r, d.m), r, true, quoi); else ajout(JSON.stringify(r), JSON.stringify(r), false, quoi);
    }
    return out;
  }
  function natur(a, b) { return String(a).localeCompare(String(b), 'fr', { numeric: true }); }
  function statistiques() {
    var z = $('stats-liste'), mode = $('regroupe').value, tri = $('tri').value, l = selection(), G = Object.create(null), ordre = [], fam = Object.create(null);
    z.innerHTML = '';
    donnees.forEach(function (r) { (r.questions || []).forEach(function (d) { if (d && d.famille && d.ref) fam[d.ref] = d.famille; }); });
    l.forEach(function (r) {
      (r.questions || []).forEach(function (d) {
        try {                                      // une question malformée est passée, les autres comptent
          if (!d) return;
          var fa = d.famille || fam[d.ref], k = mode === 'theme' ? 't:' + (d.theme || '?') : fa ? 'f:' + fa : 'r:' + (d.ref || d.theme || '?');
          var g = G[k];
          if (!g) { g = G[k] = { k: k, n: 0, eleves: Object.create(null), rep: 0, pts: 0, faux: Object.create(null), ex: null, refs: Object.create(null), theme: d.theme || '' }; ordre.push(k); }
          g.n++; g.eleves[cleP(r)] = 1; g.refs[d.ref || '?'] = 1;
          if (d.repondue) { g.rep++; g.pts += +d.points || 0; }
          if (!g.ex && d.q && typeof d.q === 'object') g.ex = d;
          if (d.q && typeof d.q === 'object') mauvaises(nettoyerQ(d.q), d, '').forEach(function (m) {
            var f = g.faux[m.cle] || (g.faux[m.cle] = { n: 0, ec: Object.create(null), latex: m.latex, quoi: m.quoi, html: m.html });
            f.n++; f.ec[m.texte] = (f.ec[m.texte] || 0) + 1;
          });
        } catch (e) {}
      });
    });
    var gs = ordre.map(function (k) { return G[k]; });
    gs.forEach(function (g) { g.taux = g.rep ? g.pts / g.rep : -1; g.titre = titreGroupe(g, mode); });
    gs.sort(tri === 'posees' ? function (a, b) { return b.n - a.n || natur(a.titre, b.titre); }
      : tri === 'banque' ? function (a, b) { return natur(a.titre, b.titre); }
      : function (a, b) { return (a.taux < 0) - (b.taux < 0) || a.taux - b.taux || b.n - a.n || natur(a.titre, b.titre); });
    $('stats-resume').textContent = gs.length ? gs.length + (mode === 'theme' ? ' sous-thème' : ' question') + (gs.length > 1 ? 's' : '') + ' · ' + l.length + ' tentative' + (l.length > 1 ? 's' : '') + ' (sélection en cours)' : '';
    if (!gs.length) { z.appendChild(tx('p', 'nt-vide', 'Aucun résultat pour l’instant.')); return; }
    gs.forEach(function (g) {
      var c; try { c = carteStat(g, mode); } catch (e) { c = el('section', 'nt-stat nt-sans'); c.appendChild(tx('p', '', g.titre + ' : détail illisible.')); }
      z.appendChild(c);
    });
    rendreM(z);
  }
  function titreGroupe(g, mode) {
    var refs = Object.keys(g.refs).sort(natur);
    if (mode === 'theme') return g.k.slice(2);
    if (refs.length === 1) return refs[0];
    return refs[0] + ' et ' + (refs.length - 1) + ' variante' + (refs.length > 2 ? 's' : '') + ' (' + refs.slice(1, 4).join(', ') + (refs.length > 4 ? '…' : '') + ')';
  }
  function carteStat(g, mode) {
    var c = el('section', 'nt-stat ' + (g.taux < 0 ? 'nt-sans' : g.taux >= 0.75 ? 'nt-juste' : g.taux >= 0.4 ? 'nt-partiel' : 'nt-faux'));
    var h = el('div', 'nt-stat-tete');
    h.appendChild(tx('h3', '', g.titre));
    var ne = Object.keys(g.eleves).length;
    h.appendChild(tx('p', 'nt-stat-chiffres', 'Posée ' + g.n + ' fois · ' + ne + ' élève' + (ne > 1 ? 's' : '') + ' · ' + g.rep + ' réponse' + (g.rep > 1 ? 's' : '') +
      (g.n - g.rep ? ' (' + (g.n - g.rep) + ' sans réponse)' : '') + (mode !== 'theme' && g.theme ? ' · ' + g.theme : '')));
    c.appendChild(h);
    var jauge = el('div', 'nt-jauge'), barre = el('span', 'nt-jauge-barre');
    barre.style.width = Math.max(0, Math.round(g.taux * 100)) + '%'; jauge.appendChild(barre);
    var tj = el('div', 'nt-stat-taux'); tj.appendChild(jauge);
    tj.appendChild(tx('span', 'nt-stat-pc', g.taux < 0 ? 'pas de réponse' : 'réussite ' + Math.round(g.taux * 100) + ' % (points moyens sur les réponses données : ' + virgule(Math.round(g.taux * 100) / 100) + ')'));
    c.appendChild(tj);
    var fx = Object.keys(g.faux).map(function (k) { return g.faux[k]; }).sort(function (a, b) { return b.n - a.n; });
    if (fx.length) {
      c.appendChild(tx('p', 'nt-stat-sous', 'Mauvaises réponses les plus fréquentes'));
      var ul = el('ul', 'nt-stat-faux');
      fx.slice(0, 5).forEach(function (f) {
        var ec = Object.keys(f.ec).sort(function (a, b) { return f.ec[b] - f.ec[a]; }), li = el('li');
        if (f.quoi) li.appendChild(tx('span', 'nt-quoi', f.quoi + ' : '));
        li.appendChild(f.html != null ? el('span', 'nt-val nt-f', f.html) : f.latex ? maths(ec[0], 'nt-val nt-f') : tx('span', 'nt-val nt-f', ec[0]));
        li.appendChild(tx('span', 'nt-fois', ' × ' + f.n));
        if (ec.length > 1 && f.html == null) {
          var autres = el('span', 'nt-autres'); autres.appendChild(document.createTextNode(' (aussi écrit '));   // pas « nt-brut » : les formules y sont rendues
          ec.slice(1, 4).forEach(function (e, j) { if (j) autres.appendChild(document.createTextNode(', ')); autres.appendChild(f.latex ? maths(e) : tx('span', '', e)); });
          autres.appendChild(document.createTextNode(ec.length > 4 ? '…)' : ')'));
          li.appendChild(autres);
        }
        ul.appendChild(li);
      });
      if (fx.length > 5) ul.appendChild(tx('li', 'nt-autres', 'et ' + (fx.length - 5) + ' autre' + (fx.length > 6 ? 's' : '')));
      c.appendChild(ul);
    }
    if (g.ex && mode !== 'theme') {
      var det = el('details', 'nt-stat-enonce'), sm = tx('summary', '', 'Énoncé et bonne réponse' + (Object.keys(g.refs).length > 1 ? ' (une des variantes : ' + g.ex.ref + ')' : ''));
      det.appendChild(sm);
      det.addEventListener('toggle', function () {
        if (!det.open || det._fait) return; det._fait = true;
        var cont = el('div', 'nt-stat-corps');
        try { var q = nettoyerQ(g.ex.q); cont.appendChild(enonce(q)); cont.appendChild(reponses(q, { repondue: false, points: 0, r: null, a: g.ex.a })); }
        catch (e) { cont.appendChild(tx('p', '', 'Détail illisible.')); }
        det.appendChild(cont); rendreM(cont);
      });
      c.appendChild(det);
    }
    return c;
  }

  /* ======================= CSV ======================= */
  // cellule CSV : une cellule qui commence par = + - @, une tabulation ou un retour chariot reçoit une apostrophe (Excel
  // n'y voit jamais de formule : « -x+3 », « =HYPERLINK(…) »)
  function cellule(x) { x = String(x == null ? '' : x); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; }
  function decimal(x) { return virgule(Math.round((+x || 0) * 10000) / 10000); }
  function telecharger(nom, lignes) {
    var blob = new Blob(['\ufeff' + lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
  }
  // CSV des résultats : colonnes d'avant inchangées (pseudo … q1 … qn « repère : points »), puis la réponse de l'élève à
  // chaque question (r1 … rn, ajoutées le 17 nov. 2026)
  function csv() {
    var l = selection(), n = Math.max.apply(null, [0].concat(l.map(function (r) { return (r.questions || []).length; })));
    var tete = ['pseudo', 'note_sur_20', 'questions_justes', 'etat', 'debut', 'fin', 'duree_s'], k;
    for (k = 1; k <= n; k++) tete.push('q' + k);
    for (k = 1; k <= n; k++) tete.push('r' + k);
    var lignes = [tete.join(';')].concat(l.map(function (r) {
      var c = [r.pseudo, virgule(r.note), justes(r), etat(r), dateFr(r.debut), dateFr(r.fin), r.duree], qs = r.questions || [], j;
      for (j = 0; j < n; j++) c.push(qs[j] ? (qs[j].ref || qs[j].theme) + ' : ' + pts(qs[j].points) : '');
      for (j = 0; j < n; j++) {
        var d = qs[j], t = '';
        try { t = !d ? '' : !d.repondue ? '(pas de réponse)' : texteReponse(d.q && typeof d.q === 'object' ? nettoyerQ(d.q) : { type: d.type, ordre: d.ordre }, d.r, d.c); }
        catch (e) { t = '(illisible)'; }
        c.push(t);
      }
      return c.map(cellule).join(';');
    }));
    telecharger('resultats-' + $('quiz').value + '-' + new Date().toISOString().slice(0, 10) + '.csv', lignes);
  }
  // CSV détaillé : une ligne par question (et par question d'un exercice) : énoncé, réponse, bonne réponse, points
  function csvDetail() {
    // numéro « Q5.2 » et points « 2/3 pt » : du texte, jamais une date pour Excel ; points_decimaux : le nombre (0,6667)
    var tete = ['pseudo', 'fin', 'etat', 'numero', 'repere', 'theme', 'type', 'enonce', 'reponse_eleve', 'bonne_reponse', 'points', 'erreur_reperee', 'points_decimaux'];
    var lignes = [tete.join(';')];
    selection().forEach(function (r) {
      (r.questions || []).forEach(function (d, i) {
        if (!d) return;
        var base = [r.pseudo, dateFr(r.fin), etat(r)], ptsT = function (x) { return pts(x) + ' pt'; };
        try {                                      // une question malformée : une ligne « illisible », les autres restent
          var q = d.q && typeof d.q === 'object' ? nettoyerQ(d.q) : null, q0 = q || { type: d.type, ordre: d.ordre };
          var en = function (qq) { return qq ? texteBrut(qq.enonce) + (qq.tableau ? ' [tableau]' : '') + (qq.arbre ? ' [arbre]' : '') + (qq.modele && qq.type === 'cases' ? ' [' + texteBrut(String(qq.modele).replace(/\{\d+\}/g, '…')) + ']' : '') + (Array.isArray(qq.propositions) ? ' [' + ordreQcm(qq).map(function (j, x) { return LETTRES[x] + '. ' + texteBrut(qq.propositions[j]); }).join(' ; ') + ']' : '') : 'détail non disponible'; };
          lignes.push(base.concat(['Q' + (i + 1), d.ref || '', d.theme || '', d.type || '', en(q), d.repondue ? (q0.type === 'exercice' ? '' : texteReponse(q0, d.r, d.c)) : '(pas de réponse)',
            q0.type !== 'exercice' ? texteReponse(q0, d.a) : '', ptsT(d.points), d.repondue && erreurUtile(d.m) ? texteBrut(d.m) : '', decimal(d.points)]).map(cellule).join(';'));
          if (q && q.type === 'exercice') (Array.isArray(q.parties) ? q.parties : []).forEach(function (pa, j) {
            var x = (Array.isArray(d.c) ? d.c : [])[j] || {}, px = d.repondue ? +x.p || 0 : 0;
            lignes.push(base.concat(['Q' + (i + 1) + '.' + (j + 1), d.ref || '', d.theme || '', pa.type, en(pa), d.repondue ? texteReponse(pa, (Array.isArray(d.r) ? d.r : [])[j], x.c) : '(pas de réponse)',
              texteReponse(pa, (Array.isArray(d.a) ? d.a : [])[j]), ptsT(px), d.repondue && erreurUtile(x.m) ? texteBrut(x.m) : '', decimal(px)]).map(cellule).join(';'));
          });
        } catch (e) { lignes.push(base.concat(['Q' + (i + 1), d.ref || '', d.theme || '', d.type || '', '(illisible)', '', '', ptsT(d.points), '', decimal(d.points)]).map(cellule).join(';')); }
      });
    });
    telecharger('reponses-' + $('quiz').value + '-' + new Date().toISOString().slice(0, 10) + '.csv', lignes);
  }

  function choisirOnglet(o) {
    onglet = o;
    ['resultats', 'stats'].forEach(function (x) { var b = $('onglet-' + x); b.setAttribute('aria-selected', x === o ? 'true' : 'false'); b.classList.toggle('actif', x === o); });
    fermerRapport();
    if (o === 'stats') statistiques();
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
  $('vue').addEventListener('change', afficher); $('cherche').addEventListener('input', afficher);
  $('csv').addEventListener('click', csv); $('csv-detail').addEventListener('click', csvDetail);
  $('onglet-resultats').addEventListener('click', function () { choisirOnglet('resultats'); });
  $('onglet-stats').addEventListener('click', function () { choisirOnglet('stats'); });
  $('regroupe').addEventListener('change', statistiques); $('tri').addEventListener('change', statistiques);
  $('rapport-retour').addEventListener('click', function () { var r = ouvert; fermerRapport(); if (r) window.scrollTo({ top: $('tableau').offsetTop - 70 }); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ouvert) fermerRapport(); });
  var memo = null; try { memo = localStorage.getItem('colineaire.prof') || sessionStorage.getItem('colineaire.prof'); } catch (e) {}
  if (memo) entrer(memo, true);
})();
