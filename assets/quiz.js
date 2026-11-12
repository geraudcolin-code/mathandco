/* Colinéaire : quiz en accès libre (saisie mathématique MathLive + clavier maths).
   Un quiz = un <div class="quiz" data-quiz="identifiant"> ; ses questions sont dans window.QUIZ[identifiant].
   Types de questions :
     - 'expr'    : une expression ou une équation tapée dans un champ (équivalence numérique + contrôle de forme)
     - 'signes'  : un tableau de signes à remplir (valeurs de x tapées, signes au clic)
*/
(function () {
  'use strict';

  /* ======================= 1. Lecture du LaTeX produit par MathLive ======================= */
  function Erreur(msg) { this.message = msg; }

  function decouper(src) {
    var t = [], i = 0, s = src.replace(/\{,\}/g, ',');
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c) || c === '~') { i++; continue; }
      if (c === '\\') {
        var m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i));
        if (!m) throw new Erreur('lecture');
        var nom = m[1];
        i += m[0].length;
        if (/^[,;:! ]$/.test(nom) || nom === 'quad' || nom === 'qquad') continue;   // espaces
        if (/^(left|right|mleft|mright|bigl|bigr|Bigl|Bigr|big|Big)$/.test(nom)) continue; // tailles des délimiteurs
        if (nom === 'lparen') { t.push('('); continue; }
        if (nom === 'rparen') { t.push(')'); continue; }
        if (nom === 'lbrack') { t.push('['); continue; }
        if (nom === 'rbrack') { t.push(']'); continue; }
        if (nom === '{' || nom === '}') { continue; }
        t.push('\\' + nom);
        continue;
      }
      t.push(c); i++;
    }
    return t;
  }

  var FONCTIONS = { '\\ln': Math.log, '\\exp': Math.exp, '\\sin': Math.sin, '\\cos': Math.cos, '\\tan': Math.tan, '\\log': function (v) { return Math.log(v) / Math.LN10; } };

  function analyser(latex) {
    var tk = decouper(latex), p = 0;
    function voir() { return tk[p]; }
    function prendre(x) { if (x !== undefined && tk[p] !== x) throw new Erreur('lecture'); return tk[p++]; }
    function chiffre(c) { return c !== undefined && /^[0-9]$/.test(c); }
    function debutPrimaire(c) {
      if (c === undefined) return false;
      return chiffre(c) || /^[a-zA-Z]$/.test(c) || c === '(' || c === '{' ||
        /^\\(frac|dfrac|tfrac|sqrt|infty|pi|exponentialE|mathrm|operatorname|ln|exp|sin|cos|tan|log)$/.test(c);
    }
    function groupe() {           // argument entre accolades, ou un seul élément
      if (voir() === '{') { prendre('{'); var e = expression(); prendre('}'); return e; }
      if (chiffre(voir())) return { t: 'num', v: +prendre() };
      return primaire();
    }
    function primaire() {
      var c = voir();
      if (c === undefined) throw new Erreur('vide');
      if (chiffre(c) || c === ',' || c === '.') {
        var s = '';
        while (chiffre(voir())) s += prendre();
        if ((voir() === ',' || voir() === '.') && chiffre(tk[p + 1])) { prendre(); s += '.'; while (chiffre(voir())) s += prendre(); }
        if (s === '') throw new Erreur('lecture');
        return { t: 'num', v: parseFloat(s) };
      }
      if (/^[a-zA-Z]$/.test(c)) { prendre(); return { t: 'var', n: c }; }
      if (c === '(') {          // parenthèse fermante fantôme de MathLive : fermée en fin de groupe
        prendre(); var e = expression();
        if (voir() === ')') prendre(); else if (voir() !== '}' && voir() !== undefined && voir() !== '=') throw new Erreur('lecture');
        return { t: 'par', a: e };
      }
      if (c === '{') { prendre(); var g = expression(); prendre('}'); return g; }
      if (c === '|') { prendre(); var v = expression(); prendre('|'); return { t: 'fn', f: Math.abs, nom: 'abs', a: v }; }
      if (c === '\\frac' || c === '\\dfrac' || c === '\\tfrac') { prendre(); var n = groupe(), d = groupe(); return { t: '/', a: n, b: d, frac: true }; }
      if (c === '\\sqrt') {
        prendre(); var ordre = null;
        if (voir() === '[') { prendre('['); ordre = expression(); prendre(']'); }
        var r = groupe();
        return ordre ? { t: '^', a: r, b: { t: '/', a: { t: 'num', v: 1 }, b: ordre } } : { t: 'fn', f: Math.sqrt, nom: 'sqrt', a: r };
      }
      if (c === '\\infty') { prendre(); return { t: 'num', v: Infinity, infini: true }; }
      if (c === '\\pi') { prendre(); return { t: 'num', v: Math.PI, cst: 'pi' }; }
      if (c === '\\exponentialE') { prendre(); return { t: 'num', v: Math.E, cst: 'e' }; }
      if (c === '\\mathrm' || c === '\\operatorname') {
        prendre(); prendre('{'); var mot = ''; while (voir() !== '}' && voir() !== undefined) mot += prendre(); prendre('}');
        if (mot === 'e') return { t: 'num', v: Math.E, cst: 'e' };
        if (FONCTIONS['\\' + mot]) return appel('\\' + mot);
        throw new Erreur('lecture');
      }
      if (FONCTIONS[c]) { prendre(); return appel(c); }
      if (c === '\\placeholder') throw new Erreur('vide');
      throw new Erreur('lecture');
    }
    function appel(nom) {
      var arg = (voir() === '(' || voir() === '{') ? primaire() : puissance();
      return { t: 'fn', f: FONCTIONS[nom], nom: nom.slice(1), a: arg };
    }
    function puissance() {
      var b = primaire();
      while (voir() === '^' || voir() === '_') {
        var op = prendre();
        var e = groupe();
        if (op === '^') b = { t: '^', a: b, b: e };
        else b = { t: 'ind', a: b, b: e };     // indice : u_n (non calculé)
      }
      return b;
    }
    function unaire() {
      if (voir() === '-') { prendre(); return { t: 'neg', a: unaire() }; }
      if (voir() === '+') { prendre(); return unaire(); }
      return puissance();
    }
    function terme() {
      var g = unaire();
      for (;;) {
        var c = voir();
        if (c === '\\cdot' || c === '\\times' || c === '*') { prendre(); g = { t: '*', a: g, b: unaire() }; }
        else if (c === '\\div' || c === '/') { prendre(); g = { t: '/', a: g, b: unaire() }; }
        else if (debutPrimaire(c)) { g = { t: '*', a: g, b: puissance(), impl: true }; }
        else return g;
      }
    }
    function expression() {
      var g = terme();
      for (;;) {
        var c = voir();
        if (c === '+') { prendre(); g = { t: '+', a: g, b: terme() }; }
        else if (c === '-') { prendre(); g = { t: '-', a: g, b: terme() }; }
        else return g;
      }
    }
    if (!tk.length) throw new Erreur('vide');
    var gauche = expression(), droite = null;
    if (voir() === '=') { prendre(); droite = expression(); }
    if (p !== tk.length) throw new Erreur('lecture');
    return droite ? { t: '=', a: gauche, b: droite } : gauche;
  }

  function evaluer(n, env) {
    switch (n.t) {
      case 'num': return n.v;
      case 'var': if (!(n.n in env)) return NaN; return env[n.n];
      case 'par': return evaluer(n.a, env);
      case 'neg': return -evaluer(n.a, env);
      case '+': return evaluer(n.a, env) + evaluer(n.b, env);
      case '-': return evaluer(n.a, env) - evaluer(n.b, env);
      case '*': return evaluer(n.a, env) * evaluer(n.b, env);
      case '/': return evaluer(n.a, env) / evaluer(n.b, env);
      case '^': return Math.pow(evaluer(n.a, env), evaluer(n.b, env));
      case 'fn': return n.f(evaluer(n.a, env));
      default: return NaN;
    }
  }
  function variables(n, acc) {
    acc = acc || {};
    if (!n) return acc;
    if (n.t === 'var') acc[n.n] = true;
    if (n.a) variables(n.a, acc);
    if (n.b) variables(n.b, acc);
    return acc;
  }
  function sansParentheses(n) { return n.t === 'par' ? sansParentheses(n.a) : n; }

  /* ----- contrôles de forme ----- */
  function termes(n, signe, acc) {            // découpe une somme en termes signés
    acc = acc || [];
    if (n.t === '+') { termes(n.a, signe, acc); termes(n.b, signe, acc); }
    else if (n.t === '-') { termes(n.a, signe, acc); termes(n.b, -signe, acc); }
    else if (n.t === 'neg' && acc.length === 0) { acc.push({ s: -signe, n: n.a }); }
    else acc.push({ s: signe, n: n });
    return acc;
  }
  function estConstante(n) { return Object.keys(variables(n)).length === 0; }
  function estNombre(n) { n = n.t === 'neg' ? n.a : n; return n.t === 'num' && isFinite(n.v); }
  function degreMonome(n, x) {                 // ax^k écrit simplement : renvoie k, sinon -1
    if (n.t === 'neg') return -1;
    if (estNombre(n)) return 0;
    function pur(m) {                          // x ou x^k
      if (m.t === 'var' && m.n === x) return 1;
      if (m.t === '^' && m.a.t === 'var' && m.a.n === x && m.b.t === 'num' && Number.isInteger(m.b.v) && m.b.v >= 2) return m.b.v;
      return -1;
    }
    var k = pur(n); if (k > 0) return k;
    if (n.t === '*' && estNombre(n.a)) return pur(n.b);
    return -1;
  }
  var FORMES = {
    polynome: function (n, x) {                // développée et réduite : monômes de degrés tous différents
      var vus = {}, ts = termes(n, 1);
      for (var i = 0; i < ts.length; i++) {
        var d = degreMonome(ts[i].n, x);
        if (d < 0 || vus[d]) return false;
        vus[d] = true;
      }
      return true;
    },
    affine: function (n, x) {                  // y = mx + p : au plus un terme en x, au plus une constante
      var ts = termes(n, 1), nx = 0, nc = 0;
      function termeX(m) {
        if (m.t === 'var' && m.n === x) return true;
        if (m.t === 'par') return termeX(m.a);
        if (m.t === '*') return (estConstante(m.a) && termeX(m.b)) || (estConstante(m.b) && termeX(m.a));
        if (m.t === '/') return estConstante(m.b) && termeX(m.a);
        return false;
      }
      for (var i = 0; i < ts.length; i++) {
        if (estConstante(ts[i].n)) nc++;
        else if (termeX(ts[i].n)) nx++;
        else return false;
      }
      return nx <= 1 && nc <= 1;
    },
    puissance: function (n, x) {              // une seule puissance : x ou x^k
      n = sansParentheses(n);
      if (n.t === 'var' && n.n === x) return true;
      if (n.t !== '^') return false;
      var b = sansParentheses(n.a);
      return b.t === 'var' && b.n === x && estNombre(n.b);
    },
    libre: function () { return true; }
  };

  /* ======================= 2. Vérification d'une réponse ======================= */
  var ESSAIS = [-3.7, -1.3, -0.45, 0.35, 1.7, 2.6, 4.15, 7.9];
  function equivalentes(a, b, x) {
    var ok = 0;
    for (var i = 0; i < ESSAIS.length; i++) {
      var env = {}; env[x] = ESSAIS[i];
      var va = evaluer(a, env), vb = evaluer(b, env);
      if (!isFinite(vb)) continue;
      if (!isFinite(va)) return false;
      if (Math.abs(va - vb) > 1e-8 * Math.max(1, Math.abs(vb))) return false;
      ok++;
    }
    return ok >= 4;
  }

  function verifierExpr(q, latex) {
    var arbre;
    try { arbre = analyser(latex); }
    catch (e) {
      return { etat: 'lecture', msg: e.message === 'vide' ? 'La réponse est incomplète : une case est restée vide.' : 'Je n’arrive pas à lire cette écriture. Vérifie les parenthèses et les cases.' };
    }
    var expr = arbre;
    if (arbre.t === '=') {
      var g = sansParentheses(arbre.a);
      if (!q.gauche || g.t !== 'var' || g.n !== q.gauche) {
        return { etat: 'faux', msg: q.gauche ? 'Le membre de gauche doit être ' + q.gauche + '.' : 'On attend une expression, pas une équation.' };
      }
      expr = arbre.b;
    } else if (q.gaucheObligatoire) {
      return { etat: 'faux', msg: 'Écris une équation de la forme ' + q.gauche + ' = …' };
    }
    var vars = variables(expr);
    for (var v in vars) {
      if (v !== q.variable) return { etat: 'faux', msg: v === q.gauche ? 'Il reste ' + v + ' dans le membre de droite.' : 'Ta réponse contient la lettre ' + v + ', qui n’a rien à faire ici.' };
    }
    var attendu = analyser(q.attendu);
    if (!equivalentes(expr, attendu, q.variable)) return { etat: 'faux', msg: q.indiceFaux || '' };
    if (!FORMES[q.forme || 'libre'](expr, q.variable)) return { etat: 'faux', msg: q.indiceForme || 'Le résultat est juste, mais pas écrit sous la forme demandée.' };
    return { etat: 'juste' };
  }

  /* ======================= 3. Clavier mathématique ======================= */
  function k(latex, extra) { var o = { latex: latex }; if (extra) for (var c in extra) o[c] = extra[c]; return o; }
  var CLAVIERS = [
    { label: '123', tooltip: 'Nombres et opérations', rows: [
      [k('x'), k('y'), { class: 'separator w5' }, '[7]', '[8]', '[9]', k('\\frac{#@}{#?}', { tooltip: 'fraction' }), k('#@^{#?}', { tooltip: 'puissance' }), k('#@^2', { tooltip: 'carré' }), k('\\sqrt{#0}', { tooltip: 'racine carrée' })],
      [k('X'), k('a'), { class: 'separator w5' }, '[4]', '[5]', '[6]', k('\\times'), '[(]', '[)]', k('\\infty', { tooltip: 'infini' })],
      [k('n'), k('\\overrightarrow{#0}', { tooltip: 'vecteur' }), { class: 'separator w5' }, '[1]', '[2]', '[3]', '[-]', k('\\le'), k('\\ge'), k('\\ne')],
      ['[left]', '[right]', { class: 'separator w5' }, '[0]', { label: ',', latex: '{,}', insert: '{,}' }, '[=]', '[+]', k('\\pi'), k('\\mathrm{e}'), '[backspace]']
    ] },
    { label: 'géo', tooltip: 'Vecteurs, points, angles', rows: [
      [k('\\overrightarrow{#0}', { tooltip: 'vecteur AB' }), k('\\vec{#0}', { tooltip: 'vecteur u' }), k('\\left\\Vert #0\\right\\Vert', { tooltip: 'norme' }), k('\\begin{pmatrix}#?\\\\#?\\end{pmatrix}', { tooltip: 'coordonnées en colonne' }), k('\\cdot', { tooltip: 'produit scalaire' }), k('\\widehat{#0}', { tooltip: 'angle' }), k('#@^{\\circ}', { tooltip: 'degré' }), k('\\parallel')],
      [k('A'), k('B'), k('C'), k('D'), k('E'), k('F'), k('M'), k('\\perp')],
      [k('I'), k('J'), k('O'), k('\\vec{u}'), k('\\vec{v}'), k('\\vec{i}'), k('\\vec{j}'), k('#@\'', { tooltip: 'prime' })],
      ['[left]', '[right]', '[(]', k(';'), '[)]', k('\\sqrt{#0}'), '[=]', '[backspace]']
    ] },
    { label: 'f(x)', tooltip: 'Fonctions et puissances', rows: [
      [k('#@^{#?}', { tooltip: 'puissance' }), k('#@^2'), k('#@^3'), k('#@^{-1}'), k('\\sqrt{#0}'), k('\\sqrt[#?]{#0}'), k('\\left|#0\\right|', { tooltip: 'valeur absolue' }), k('\\frac{#@}{#?}')],
      [k('\\mathrm{e}^{#?}'), k('\\ln\\left(#0\\right)'), k('\\exp\\left(#0\\right)'), k('\\log\\left(#0\\right)'), k('\\cos\\left(#0\\right)'), k('\\sin\\left(#0\\right)'), k('\\tan\\left(#0\\right)'), k('\\pi')],
      [k('f\\left(#0\\right)'), k("f'\\left(#0\\right)"), k('g\\left(#0\\right)'), k('#@_{#?}', { tooltip: 'indice' }), k('u_n'), k('u_{n+1}'), k('\\Delta'), k('\\infty')],
      ['[left]', '[right]', k('\\pm'), k('\\mapsto'), k('\\to'), k('\\lim_{#?\\to#?}'), k('\\sum_{#?}^{#?}'), '[backspace]']
    ] },
    { label: '≤∈ℝ', tooltip: 'Comparaisons, ensembles, logique', rows: [
      [k('<'), k('>'), k('\\le'), k('\\ge'), k('='), k('\\ne'), k('\\approx'), k('\\equiv')],
      [k('\\in'), k('\\notin'), k('\\subset'), k('\\cup'), k('\\cap'), k('\\varnothing'), k('\\lbrack'), k('\\rbrack')],
      [k('\\mathbb{R}'), k('\\mathbb{N}'), k('\\mathbb{Z}'), k('\\mathbb{Q}'), k('\\mathbb{C}'), k('\\mathbb{R}^*'), k(';'), k('\\overline{#0}', { tooltip: 'barre (événement contraire)' })],
      [k('\\Rightarrow'), k('\\Leftrightarrow'), k('\\forall'), k('\\exists'), k('\\overrightarrow{#0}', { tooltip: 'vecteur' }), k('\\parallel'), k('\\perp'), '[backspace]']
    ] },
    'alphabetic',
    'greek'
  ];

  var mlPret = null;
  function preparerMathLive() {
    if (mlPret) return mlPret;
    mlPret = customElements.whenDefined('math-field').then(function () {
      var MF = window.MathfieldElement;
      try { MF.soundsDirectory = null; } catch (e) {}
      try { MF.decimalSeparator = ','; } catch (e) {}
      try { MF.locale = 'fr'; } catch (e) {}
      var vk = window.mathVirtualKeyboard;
      try { vk.alphabeticLayout = 'azerty'; } catch (e) {}
      vk.layouts = CLAVIERS;
      if (window.matchMedia && window.matchMedia('(max-width: 520px)').matches) try { vk.editToolbar = 'none'; } catch (e) {}   // téléphone : place pour les onglets
      vk.addEventListener('geometrychange', function () {
        var h = vk.visible ? vk.boundingRect.height : 0;
        document.documentElement.style.setProperty('--clavier', h + 'px');
        if (h) setTimeout(degager, 80);
      });
    });
    return mlPret;
  }

  /* le champ actif et le bouton Valider restent visibles au-dessus du clavier */
  function degager() {
    var vk = window.mathVirtualKeyboard, a = document.activeElement;
    if (!vk || !vk.visible || !a || !a.closest) return;
    var carte = a.closest('.quiz-carte'); if (!carte) return;
    var h = vk.boundingRect.height, haut = 140;                      // barre du site + onglets
    var limite = window.innerHeight - h - 12;
    var actions = carte.querySelector('.quiz-actions');
    var bas = (actions || a).getBoundingClientRect().bottom;
    var dy = bas - limite;
    var dispo = a.getBoundingClientRect().top - haut;              // ne pas faire passer le champ sous la barre
    if (dy > dispo) dy = dispo;
    if (dy > 4) window.scrollBy(0, dy);                             // instantané : deux appels rapprochés ne s'additionnent pas
  }

  function nouveauChamp(classe, etiquette) {
    var mf = document.createElement('math-field');
    mf.className = classe;
    mf.setAttribute('math-virtual-keyboard-policy', 'manual');
    mf.setAttribute('aria-label', etiquette);
    mf.setAttribute('smart-fence', '');
    mf.addEventListener('focusin', function () { if (window.mathVirtualKeyboard) { window.mathVirtualKeyboard.show(); setTimeout(degager, 120); } });
    mf.addEventListener('focusout', function () {
      setTimeout(function () {
        var a = document.activeElement;
        if (!a || a.tagName !== 'MATH-FIELD') window.mathVirtualKeyboard && window.mathVirtualKeyboard.hide();
      }, 120);
    });
    customElements.whenDefined('math-field').then(function () { try { mf.menuItems = []; mf.smartSuperscript = false; } catch (e) {} });
    return mf;
  }

  /* ======================= 4. Retours visuels ======================= */
  var voile = null, coche = null;
  function preparerRetours() {
    if (voile) return;
    voile = document.createElement('div'); voile.className = 'quiz-voile'; voile.setAttribute('aria-hidden', 'true');
    coche = document.createElement('div'); coche.className = 'quiz-coche'; coche.setAttribute('aria-hidden', 'true');
    coche.innerHTML = '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><path d="M36 62 L53 79 L86 43"/></svg>';
    document.body.appendChild(voile); document.body.appendChild(coche);
  }
  function rejouer(el, classe) { el.classList.remove(classe); void el.offsetWidth; el.classList.add(classe); }
  function signalerFaux() {
    preparerRetours();
    rejouer(voile, 'actif');
    rejouer(document.querySelector('main') || document.body, 'quiz-secoue');
    if (navigator.vibrate) try { navigator.vibrate([60, 40, 60]); } catch (e) {}
  }
  function signalerJuste() { preparerRetours(); rejouer(coche, 'actif'); }

  /* ======================= 5. Le quiz ======================= */
  function el(tag, classe, html) { var e = document.createElement(tag); if (classe) e.className = classe; if (html != null) e.innerHTML = html; return e; }
  function rendre(elm) { if (window.MathLive && window.MathLive.renderMathInElement) try { window.MathLive.renderMathInElement(elm); } catch (e) {} }

  function Quiz(racine, def) {
    this.racine = racine; this.def = def; this.i = 0;
    this.etat = def.questions.map(function () { return { essais: 0, juste: false, premier: false, vue: false }; });
    this.construire();
  }
  Quiz.prototype.construire = function () {
    var self = this, d = this.def;
    this.racine.innerHTML = '';
    var tete = el('div', 'quiz-tete');
    tete.appendChild(el('div', 'quiz-titres', '<span class="quiz-etiquette">' + d.etiquette + '</span><h2>' + d.titre + '</h2>'));
    this.points = el('div', 'quiz-points'); this.points.setAttribute('role', 'group'); this.points.setAttribute('aria-label', 'Questions');
    d.questions.forEach(function (q, n) {
      var b = el('button', 'quiz-point', String(n + 1)); b.type = 'button'; b.setAttribute('aria-label', 'Question ' + (n + 1));
      b.addEventListener('click', function () { self.aller(n); });
      self.points.appendChild(b);
    });
    tete.appendChild(this.points);
    this.racine.appendChild(tete);
    this.cartes = d.questions.map(function (q, n) { var c = self.carte(q, n); c.hidden = true; self.racine.appendChild(c); return c; });
    this.fin = el('div', 'quiz-carte quiz-fin'); this.fin.hidden = true; this.racine.appendChild(this.fin);
    this.aller(0);
  };
  Quiz.prototype.carte = function (q, n) {
    var self = this, total = this.def.questions.length;
    var c = el('section', 'quiz-carte');
    c.appendChild(el('p', 'quiz-num', 'Question ' + (n + 1) + ' / ' + total));
    var enonce = el('div', 'quiz-enonce', q.enonce); c.appendChild(enonce); rendre(enonce);
    var zone = el('div', 'quiz-zone'); c.appendChild(zone);
    var lire;
    if (q.type === 'signes') lire = this.tableau(q, zone);
    else if (q.type === 'coords') { lire = this.coords(q, zone, n); c._champ = zone.querySelector('math-field'); }
    else {
      var ligne = el('div', 'quiz-ligne');
      var mf = nouveauChamp('quiz-champ', 'Ta réponse à la question ' + (n + 1));
      if (q.prefixe) { var pf = el('span', 'quiz-prefixe', q.prefixe); ligne.appendChild(pf); rendre(pf); }
      ligne.appendChild(mf); zone.appendChild(ligne);
      mf.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.valider(n); } });
      lire = function () { return mf.value; };
      c._champ = mf;
    }
    c._lire = lire;
    var msg = el('p', 'quiz-message'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite'); c.appendChild(msg); c._msg = msg;
    var actions = el('div', 'quiz-actions');
    var bv = el('button', 'bouton', 'Valider'); bv.type = 'button'; bv.addEventListener('click', function () { self.valider(n); });
    var bs = el('button', 'bouton secondaire', 'Voir la correction'); bs.type = 'button'; bs.hidden = true; bs.addEventListener('click', function () { self.correction(n); });
    var bn = el('button', 'bouton', n + 1 < total ? 'Question suivante' : 'Voir le bilan'); bn.type = 'button'; bn.hidden = true;
    bn.addEventListener('click', function () { if (n + 1 < total) self.aller(n + 1); else self.bilan(); });
    actions.appendChild(bv); actions.appendChild(bs); actions.appendChild(bn); c.appendChild(actions);
    c._bv = bv; c._bs = bs; c._bn = bn;
    var corr = el('div', 'quiz-correction', q.correction); corr.hidden = true; c.appendChild(corr); rendre(corr); c._corr = corr;
    return c;
  };
  Quiz.prototype.aller = function (n) {
    this.i = n;
    this.fin.hidden = true;
    this.cartes.forEach(function (c, j) { c.hidden = j !== n; });
    this.majPoints();
    var c = this.cartes[n];
    if (c._champ && !this.etat[n].juste) setTimeout(function () { try { c._champ.focus(); } catch (e) {} }, 50);
  };
  Quiz.prototype.majPoints = function () {
    var self = this;
    Array.prototype.forEach.call(this.points.children, function (b, j) {
      var e = self.etat[j];
      b.classList.toggle('courant', j === self.i && self.fin.hidden);
      b.classList.toggle('juste', e.juste);
      b.classList.toggle('vue', !e.juste && e.vue);
      b.setAttribute('aria-current', j === self.i && self.fin.hidden ? 'step' : 'false');
    });
  };
  Quiz.prototype.valider = function (n) {
    var q = this.def.questions[n], c = this.cartes[n], e = this.etat[n];
    if (e.juste) return;
    var r = (q.type === 'signes' || q.type === 'coords') ? c._lire() : verifierExpr(q, c._lire());
    c._msg.className = 'quiz-message';
    if (r.etat === 'lecture') { c._msg.textContent = r.msg; c._msg.classList.add('info'); return; }
    e.essais++;
    if (r.etat === 'juste') {
      e.juste = true; e.premier = e.essais === 1 && !e.vue;
      c.classList.add('reussie'); c.classList.remove('ratee');
      c._msg.textContent = 'Bonne réponse !'; c._msg.classList.add('ok');
      c._bv.hidden = true; c._bs.hidden = true; c._bn.hidden = false;
      if (c._champ) { c._champ.readOnly = true; c._champ.blur(); }
      c.querySelectorAll('.quiz-tab button, .quiz-tab math-field').forEach(function (s) { s.disabled = true; s.readOnly = true; });
      window.mathVirtualKeyboard && window.mathVirtualKeyboard.hide();
      signalerJuste();
      setTimeout(function () { c._bn.focus(); }, 50);
    } else {
      c.classList.add('ratee');
      c._msg.textContent = r.msg ? r.msg : 'Ce n’est pas la bonne réponse. Cherche encore !';
      c._msg.classList.add('ko');
      if (e.essais >= 2) c._bs.hidden = false;
      signalerFaux();
    }
    this.majPoints();
  };
  Quiz.prototype.correction = function (n) {
    var c = this.cartes[n];
    this.etat[n].vue = true;
    c._corr.hidden = false; c._bs.hidden = true; c._bn.hidden = false;
    this.majPoints();
    c._corr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  Quiz.prototype.bilan = function () {
    var self = this, total = this.etat.length;
    var premier = this.etat.filter(function (e) { return e.premier; }).length;
    var justes = this.etat.filter(function (e) { return e.juste; }).length;
    this.cartes.forEach(function (c) { c.hidden = true; });
    this.fin.innerHTML = '';
    this.fin.appendChild(el('p', 'quiz-num', 'Bilan'));
    this.fin.appendChild(el('p', 'quiz-score', '<strong>' + justes + ' / ' + total + '</strong> questions réussies'));
    this.fin.appendChild(el('p', 'quiz-detail', premier + ' du premier coup' + (justes < total ? ' · ' + (total - justes) + ' à retravailler' : '')));
    var r = el('button', 'bouton', 'Recommencer le quiz'); r.type = 'button';
    r.addEventListener('click', function () {
      self.etat = self.def.questions.map(function () { return { essais: 0, juste: false, premier: false, vue: false }; });
      self.construire();
    });
    var a = el('div', 'quiz-actions'); a.appendChild(r); this.fin.appendChild(a);
    this.fin.hidden = false;
    this.majPoints();
    this.fin.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  /* ----- coordonnées d'un vecteur : deux cases en colonne ----- */
  Quiz.prototype.coords = function (q, zone, n) {
    var self = this;
    var ligne = el('div', 'quiz-ligne quiz-coords');
    if (q.prefixe) { var pf = el('span', 'quiz-prefixe', q.prefixe); ligne.appendChild(pf); rendre(pf); }
    var col = el('div', 'coords-col');
    var noms = q.noms || ['abscisse', 'ordonnée'];
    var champs = q.valeurs.map(function (_, i) {
      var mf = nouveauChamp('quiz-champ petit', (noms[i] || 'coordonnée ' + (i + 1)) + ' (question ' + (n + 1) + ')');
      mf.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.valider(n); } });
      col.appendChild(mf); return mf;
    });
    ligne.appendChild(col); zone.appendChild(ligne);
    return function () {
      var v = [];
      try { champs.forEach(function (mf) { v.push(evaluer(analyser(mf.value), {})); }); }
      catch (e) { return { etat: 'lecture', msg: e.message === 'vide' ? 'Remplis les deux cases (abscisse en haut, ordonnée en bas).' : 'Une des coordonnées est illisible.' }; }
      function pres(a, b) { return isFinite(a) && Math.abs(a - b) < 1e-9; }
      var att = q.valeurs;
      if (v.every(function (x, i) { return pres(x, att[i]); })) return { etat: 'juste' };
      if (v.length === 2 && pres(v[0], att[1]) && pres(v[1], att[0])) return { etat: 'faux', msg: 'Attention à l’ordre : l’abscisse en haut, l’ordonnée en bas.' };
      if (v.every(function (x, i) { return pres(x, -att[i]); })) return { etat: 'faux', msg: q.indiceSigne || 'Attention au sens : on calcule « arrivée − départ ».' };
      return { etat: 'faux', msg: q.indiceFaux || '' };
    };
  };

  /* ----- tableau de signes : une ligne (le signe du résultat), valeurs de x ajoutées par l'élève ----- */
  var TRAITS = ['pointille', 'zero', 'double'];
  var NOM_TRAIT = { pointille: 'pointillés', zero: 'trait avec un 0', double: 'double trait (valeur interdite)' };
  Quiz.prototype.tableau = function (q, zone) {
    var wrap = el('div', 'quiz-tab-cadre'), tab = el('div', 'quiz-tab');
    var gauche = nouveauChamp('quiz-champ petit', 'Première valeur de la ligne x');
    var droite = nouveauChamp('quiz-champ petit', 'Dernière valeur de la ligne x');
    var racines = [];                 // { mf, trait }
    var signes = [''];                // un signe par intervalle
    var lab = el('span', null, '\\(x\\)'); rendre(lab);
    var labL = el('span', null, q.ligne.label); rendre(labL);

    function cellule(classe, contenu) { var c = el('div', 'tcell ' + (classe || '')); if (contenu) c.appendChild(contenu); tab.appendChild(c); return c; }
    function bouton(classe, texte, aria, action) {
      var b = el('button', classe, texte); b.type = 'button'; b.setAttribute('aria-label', aria);
      b.addEventListener('click', action); return b;
    }
    function ajouter(k) {             // nouvelle valeur entre la valeur k et la valeur k+1
      var mf = nouveauChamp('quiz-champ petit', 'Valeur de x');
      racines.splice(k, 0, { mf: mf, trait: 'pointille' });
      signes.splice(k + 1, 0, '');
      dessiner();
      setTimeout(function () { try { mf.focus(); } catch (e) {} }, 30);
    }
    function retirer(k) {
      racines.splice(k, 1);
      signes.splice(k + 1, 1);
      dessiner();
    }
    function dessiner() {
      var n = racines.length;
      while (tab.firstChild) tab.removeChild(tab.firstChild);
      var cols = ['minmax(4em, max-content)'];
      for (var c = 0; c < 2 * n + 3; c++) cols.push(c % 2 === 0 ? 'minmax(2.4em, auto)' : 'minmax(1.9em, 1fr)');
      tab.style.gridTemplateColumns = cols.join(' ');
      // ligne des x
      cellule('tlab tx', lab);
      cellule('tx tval', gauche);
      for (var k = 0; k <= n; k++) {
        (function (k) { cellule('tx tint', bouton('tab-plus', '+', 'Ajouter une valeur de x ici', function () { ajouter(k); })); })(k);
        if (k < n) {
          (function (k) {
            var boite = el('div', 'tab-valeur'); boite.appendChild(racines[k].mf);
            boite.appendChild(bouton('tab-suppr', '×', 'Retirer cette valeur', function () { retirer(k); }));
            cellule('tx tval', boite);
          })(k);
        }
      }
      cellule('tx tval', droite);
      // ligne du signe
      cellule('tlab', labL);
      cellule('tval tvide');
      for (var m = 0; m <= n; m++) {
        (function (m) {
          var b = bouton('signe sint', signes[m], 'Signe sur l’intervalle ' + (m + 1), function () {
            var cy = ['', '+', '−']; signes[m] = cy[(cy.indexOf(signes[m]) + 1) % 3];
            b.textContent = signes[m]; b.dataset.v = signes[m];
          });
          b.dataset.v = signes[m];
          cellule('tint', b);
        })(m);
        if (m < n) {
          (function (m) {
            var r = racines[m];
            var t = bouton('trait-choix', '', '', function () {
              r.trait = TRAITS[(TRAITS.indexOf(r.trait) + 1) % 3];
              t.dataset.t = r.trait; t.setAttribute('aria-label', 'Trait : ' + NOM_TRAIT[r.trait] + ' (toucher pour changer)');
            });
            t.dataset.t = r.trait; t.setAttribute('aria-label', 'Trait : ' + NOM_TRAIT[r.trait] + ' (toucher pour changer)');
            t.innerHTML = '<span>0</span>';
            cellule('tval ttrait', t);
          })(m);
        }
      }
      cellule('tval tvide');
    }
    dessiner();
    wrap.appendChild(tab); zone.appendChild(wrap);
    var aide = el('p', 'quiz-aide-tab', 'Le bouton <b>+</b> ajoute une valeur de \\(x\\) (× la retire). Touche une case pour y mettre + ou −, et un trait pour choisir : pointillés, trait avec un 0, ou double trait (valeur interdite).');
    zone.appendChild(aide); rendre(aide);

    function lire(mf) { return evaluer(analyser(mf.value), {}); }
    return function () {
      var vg, vd, vals = [];
      try { vg = lire(gauche); vd = lire(droite); racines.forEach(function (r) { vals.push(lire(r.mf)); }); }
      catch (e) { return { etat: 'lecture', msg: e.message === 'vide' ? 'Remplis toutes les cases de la ligne des x (aux extrémités : −∞ et +∞).' : 'Une valeur de la ligne des x est illisible.' }; }
      if (vg !== -Infinity || vd !== Infinity) return { etat: 'faux', msg: 'Regarde les extrémités de la ligne des x.' };
      for (var i = 1; i < vals.length; i++) if (!(vals[i] > vals[i - 1])) return { etat: 'faux', msg: 'Les valeurs de x doivent être rangées dans l’ordre croissant.' };
      var att = q.valeurs;
      var memes = vals.length === att.length && vals.every(function (v, i) { return Math.abs(v - att[i]) < 1e-9; });
      if (!memes) return { etat: 'faux', msg: 'Les valeurs placées sur la ligne des x ne sont pas les bonnes.' };
      for (var t = 0; t < att.length; t++) if (racines[t].trait !== q.ligne.traits[t]) return { etat: 'faux', msg: 'Vérifie les traits sous les valeurs de x.' };
      if (signes.some(function (sg) { return !sg; })) return { etat: 'faux', msg: 'Il reste des signes à placer.' };
      for (var k = 0; k < signes.length; k++) if (signes[k] !== q.ligne.signes[k]) return { etat: 'faux', msg: 'Il y a une erreur dans les signes.' };
      return { etat: 'juste' };
    };
  };

  /* ======================= 6. Démarrage ======================= */
  function demarrer() {
    var quiz = document.querySelectorAll('.quiz[data-quiz]');
    if (!quiz.length) return;
    preparerMathLive().then(function () {
      // un champ MathLive créé dans un bloc masqué ne prend pas le focus : on construit le quiz quand il devient visible
      Array.prototype.forEach.call(quiz, function (r) {
        var def = (window.QUIZ || {})[r.dataset.quiz];
        if (!def) return;
        function lancer() { if (r._quiz) return; r._quiz = new Quiz(r, def); }
        if (r.getClientRects().length) { lancer(); return; }
        if (!window.ResizeObserver) { lancer(); return; }
        var ro = new ResizeObserver(function () { if (r.getClientRects().length) { ro.disconnect(); lancer(); } });
        ro.observe(r);
      });
    });
  }
  window.ColineaireQuiz = { analyser: analyser, evaluer: evaluer, verifierExpr: verifierExpr, FORMES: FORMES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
