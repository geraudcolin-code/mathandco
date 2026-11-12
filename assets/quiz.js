/* Colinéaire : quiz en accès libre (saisie mathématique MathLive + clavier maths).
   Un quiz = un <div class="quiz" data-quiz="identifiant"> ; ses questions sont dans window.QUIZ[identifiant].
   Types de questions (détail : docs/quiz/GUIDE_QUIZ.md de l'atelier, règles : charte § 11) :
     - 'expr'        : une expression, une équation « lettre = … » ou un nombre tapé dans un cadre
                       (égalité testée numériquement + contrôle de la FORME demandée)
     - 'cases'       : plusieurs cadres dans une phrase (« 6,4 h = □ h □ min », « A(□ ; □) »)
     - 'ensemble'    : S = { … ; … } (solutions d'une équation, ordre libre)
     - 'intervalles' : S = ]a ; b] ∪ [c ; +∞[ (solutions d'une inéquation)
     - 'comparer'    : a □ b, l'élève tape <, > ou =
     - 'coords'      : coordonnées d'un vecteur (deux cases en colonne)
     - 'signes'      : tableau de signes à construire
     - 'variations'  : tableau de variations à construire
     - 'repere'      : placer un point / tracer une droite dans un repère, placer un point sur une droite graduée
   Option d'un quiz : tirage { depuis: [identifiants], n } → n questions tirées au hasard à chaque essai.
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
        if (/^(left|right|mleft|mright|bigl|bigr|Bigl|Bigr|big|Big|displaystyle)$/.test(nom)) continue; // tailles
        if (nom === 'lparen') { t.push('('); continue; }
        if (nom === 'rparen') { t.push(')'); continue; }
        if (nom === 'lbrack') { t.push('['); continue; }
        if (nom === 'rbrack') { t.push(']'); continue; }
        if (nom === 'lbrace' || nom === '{') { t.push('\\{'); continue; }
        if (nom === 'rbrace' || nom === '}') { t.push('\\}'); continue; }
        if (nom === 'lt') { t.push('<'); continue; }
        if (nom === 'gt') { t.push('>'); continue; }
        if (nom === 'leq' || nom === 'leqslant') { t.push('\\le'); continue; }
        if (nom === 'geq' || nom === 'geqslant') { t.push('\\ge'); continue; }
        if (nom === 'emptyset') { t.push('\\varnothing'); continue; }
        t.push('\\' + nom);
        continue;
      }
      t.push(c); i++;
    }
    return t;
  }

  var FONCTIONS = { '\\ln': Math.log, '\\exp': Math.exp, '\\sin': Math.sin, '\\cos': Math.cos, '\\tan': Math.tan, '\\log': function (v) { return Math.log(v) / Math.LN10; } };

  function analyser(latex) { return analyserTk(decouper(latex)); }
  function analyserTk(tk) {
    var p = 0;
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
        return { t: 'num', v: parseFloat(s), txt: s };
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
      case 'var': if (!env || !(n.n in env)) return NaN; return env[n.n];
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
  function valeurDe(latex) { return evaluer(analyser(latex), {}); }      // nombre écrit en LaTeX (réponse attendue)

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
  function estEntier(n) { n = sansParentheses(n); if (n.t === 'neg') n = sansParentheses(n.a); return n.t === 'num' && Number.isInteger(n.v); }
  function sansSigne(n) { n = sansParentheses(n); while (n.t === 'neg') n = sansParentheses(n.a); return n; }
  function pgcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function sansCarre(k) { for (var d = 2; d * d <= k; d++) if (k % (d * d) === 0) return false; return true; }
  function degreMonome(n, x) {                 // ax^k écrit simplement : renvoie k, sinon -1
    if (n.t === 'neg') return -1;
    if (estNombre(n)) return 0;
    if (n.t === '/' && estNombre(n.a) && estNombre(n.b)) return 0;          // coefficient fractionnaire seul
    function pur(m) {                          // x ou x^k
      if (m.t === 'var' && m.n === x) return 1;
      if (m.t === '^' && m.a.t === 'var' && m.a.n === x && m.b.t === 'num' && Number.isInteger(m.b.v) && m.b.v >= 2) return m.b.v;
      return -1;
    }
    var k = pur(n); if (k > 0) return k;
    if (n.t === '*' && (estNombre(n.a) || (n.a.t === '/' && estNombre(n.a.a) && estNombre(n.a.b)))) return pur(n.b);
    if (n.t === '/' && estNombre(n.b)) { var k2 = pur(n.a); if (k2 > 0) return k2; if (n.a.t === '*' && estNombre(n.a.a)) return pur(n.a.b); }
    return -1;
  }
  function estFractionIrred(n) {               // a/b d'entiers, b > 1, irréductible (signe devant ou au numérateur)
    n = sansSigne(n);
    if (n.t !== '/' ) return false;
    if (!estEntier(n.a) || !estEntier(n.b)) return false;
    var a = evaluer(n.a, {}), b = evaluer(n.b, {});
    return b > 1 && a !== 0 && pgcd(a, b) === 1;
  }
  function estRadical(n) {                     // √k simplifié, ou a√k, ou √k / b
    n = sansSigne(n);
    function rac(m) { m = sansParentheses(m); return m.t === 'fn' && m.nom === 'sqrt' && estEntier(m.a) && evaluer(m.a, {}) > 1 && sansCarre(evaluer(m.a, {})); }
    if (rac(n)) return true;
    if (n.t === '*' && estEntier(n.a) && rac(n.b)) return true;
    if (n.t === '/' && (rac(n.a) || (n.a.t === '*' && estEntier(n.a.a) && rac(n.a.b))) && estEntier(n.b)) return true;
    return false;
  }
  function estDecimal(n) { n = sansSigne(n); return n.t === 'num' && isFinite(n.v); }
  function estPuissanceDe10(n) {
    n = sansParentheses(n);
    return n.t === '^' && sansParentheses(n.a).t === 'num' && sansParentheses(n.a).v === 10 && estEntier(n.b);
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
    puissance: function (n, x) {              // une seule puissance : x, x^k, ou un nombre entier puissance k
      n = sansParentheses(n);
      if (n.t === 'var' && n.n === x) return true;
      if (n.t !== '^') return false;
      var b = sansParentheses(n.a);
      return ((b.t === 'var' && b.n === x) || (b.t === 'num' && Number.isInteger(b.v))) && estEntier(n.b);
    },
    produit: function (n) {                   // forme factorisée : un produit (ou une puissance d'une parenthèse)
      n = sansSigne(n);
      if (n.t === '*') return true;
      if (n.t === '^') return sansParentheses(n.a) !== n.a;
      return false;
    },
    factorise: function (n, x) {              // produit dont aucun facteur ne se factorise encore (x en facteur, ou entier commun)
      if (!FORMES.produit(n)) return false;
      var facteurs = [];
      (function aplatir(m) { m = sansSigne(m); if (m.t === '*') { aplatir(m.a); aplatir(m.b); } else facteurs.push(m.t === '^' ? sansParentheses(m.a) : m); })(n);
      function coef(m) {                       // coefficient entier d'un monôme simple, sinon null
        if (estNombre(m)) return estEntier(m) ? Math.abs(evaluer(m, {})) : null;
        if (m.t === 'var' || m.t === '^') return 1;
        if (m.t === '*' && estNombre(m.a)) return estEntier(m.a) ? Math.abs(evaluer(m.a, {})) : null;
        return null;
      }
      for (var i = 0; i < facteurs.length; i++) {
        var ts = termes(sansParentheses(facteurs[i]), 1);
        if (ts.length < 2) continue;
        var degs = ts.map(function (t) { return degreMonome(t.n, x); });
        if (degs.some(function (d) { return d < 0; })) continue;
        if (Math.min.apply(null, degs) >= 1) return false;
        var cs = ts.map(function (t) { return coef(t.n); });
        if (cs.every(function (c) { return c !== null; }) && cs.reduce(pgcd) > 1) return false;
      }
      return true;
    },
    decimal: function (n) { return estDecimal(n); },                          // un nombre, calcul effectué
    fraction: function (n) { return estEntier(n) || estFractionIrred(n); },   // entier ou fraction irréductible
    nombre: function (n) { return estDecimal(n) || estFractionIrred(n); },    // décimal ou fraction irréductible
    reduit: function (n) { return estDecimal(n) || estFractionIrred(n) || estRadical(n); },  // + racines simplifiées
    pi: function (n) {                        // k π avec k écrit comme un nombre (aire, volume : calcul effectué)
      n = sansSigne(n);
      function estPi(m) { m = sansParentheses(m); return m.t === 'num' && m.cst === 'pi'; }
      function coef(m) { return estDecimal(m) || estFractionIrred(m); }
      if (estPi(n)) return true;
      if (n.t === '*') return (coef(n.a) && estPi(n.b)) || (estPi(n.a) && coef(n.b));
      if (n.t === '/') return n.a && FORMES.pi(n.a) && estEntier(n.b);
      return false;
    },
    scientifique: function (n) {              // a × 10^n, 1 ≤ a < 10
      n = sansSigne(n);
      if (estPuissanceDe10(n)) return true;
      if (n.t !== '*') return false;
      var a = sansParentheses(n.a);
      return a.t === 'num' && a.v >= 1 && a.v < 10 && estPuissanceDe10(n.b);
    },
    libre: function () { return true; }
  };
  var MSG_FORME = {
    polynome: 'Le résultat est juste, mais l’expression n’est pas complètement développée et réduite.',
    affine: 'C’est la bonne droite, mais l’équation n’est pas sous la forme réduite y = mx + p.',
    puissance: 'C’est égal, mais on peut encore simplifier : une seule puissance.',
    produit: 'C’est égal, mais ce n’est pas une forme factorisée : on attend un produit.',
    factorise: 'C’est égal, mais ce n’est pas factorisé au maximum : un des facteurs se factorise encore.',
    decimal: 'C’est égal, mais il faut effectuer le calcul et donner un nombre.',
    fraction: 'C’est égal, mais il faut l’écrire sous forme d’une fraction irréductible (ou d’un entier).',
    nombre: 'C’est égal, mais il faut effectuer le calcul : un nombre décimal ou une fraction irréductible.',
    reduit: 'C’est égal, mais l’écriture peut encore être simplifiée.',
    scientifique: 'C’est égal, mais ce n’est pas une écriture scientifique a × 10ⁿ avec 1 ≤ a < 10.',
    pi: 'C’est égal, mais il faut effectuer le calcul : écris le résultat sous la forme k π (par exemple 12π).'
  };

  /* ======================= 2. Vérification d'une réponse ======================= */
  var ESSAIS = [-3.7, -1.3, -0.45, 0.35, 1.7, 2.6, 4.15, 7.9];
  var ESSAIS_POS = [0.35, 0.8, 1.3, 1.7, 2.6, 3.1, 4.15, 7.9];
  function listeVars(q) { var v = q.variable; return v == null ? [] : (Array.isArray(v) ? v : [v]); }
  function equivalentes(a, b, vars, positifs) {
    var ok = 0, E = positifs ? ESSAIS_POS : ESSAIS;
    for (var i = 0; i < E.length; i++) {
      var env = {};
      vars.forEach(function (v, j) { env[v] = E[(i + 3 * j) % E.length] + 0.11 * j; });
      var va = evaluer(a, env), vb = evaluer(b, env);
      if (!isFinite(vb)) { if (vb === va) ok++; continue; }
      if (!isFinite(va)) return false;
      if (Math.abs(va - vb) > 1e-8 * Math.max(1, Math.abs(vb))) return false;
      ok++;
    }
    return ok >= 4 || (vars.length === 0 && ok >= 1);
  }
  function nettoyer(q, latex) {               // retire un « % » ou une unité tapés en trop en fin de réponse
    latex = String(latex || '').trim();
    if (q.suffixe && /%/.test(q.suffixe)) latex = latex.replace(/\\%\s*$/, '');
    if (q.suffixe && /circ|°/.test(q.suffixe)) latex = latex.replace(/\^\{?\\circ\}?\s*$|°\s*$|\\degree\s*$/, '');
    return latex;
  }

  function verifierExpr(q, latex) {
    var arbre;
    latex = nettoyer(q, latex);
    try { arbre = analyser(latex); }
    catch (e) {
      return { etat: 'lecture', msg: e.message === 'vide' ? 'La réponse est incomplète : une case est restée vide.' : 'Je n’arrive pas à lire cette écriture. Vérifie les parenthèses et les cases.' };
    }
    var expr = arbre, vars = listeVars(q);
    if (arbre.t === '=') {
      var g = sansParentheses(arbre.a);
      if (!q.gauche || g.t !== 'var' || g.n !== q.gauche) {
        return { etat: 'faux', msg: q.gauche ? 'Le membre de gauche doit être ' + q.gauche + '.' : 'On attend une expression, pas une équation.' };
      }
      expr = arbre.b;
    } else if (q.gaucheObligatoire) {
      return { etat: 'faux', msg: 'Écris une équation de la forme ' + q.gauche + ' = …' };
    }
    var vu = variables(expr);
    for (var v in vu) {
      if (vars.indexOf(v) < 0) return { etat: 'faux', msg: v === q.gauche ? 'Il reste ' + v + ' dans le membre de droite.' : 'Ta réponse contient la lettre ' + v + ', qui n’a rien à faire ici.' };
    }
    var attendu = analyser(q.attendu);
    var egal;
    if (q.tolerance != null) {
      var va = evaluer(expr, {}), vb = evaluer(attendu, {});
      egal = isFinite(va) && Math.abs(va - vb) <= q.tolerance + 1e-12;
    } else egal = equivalentes(expr, attendu, vars, q.positifs);
    if (!egal) {
      var pg = piege(q, expr, vars);
      return { etat: 'faux', msg: pg || q.indiceFaux || '' };
    }
    var forme = q.forme || 'libre';
    if (!FORMES[forme](expr, vars[0])) {
      var mf = forme === 'factorise' && !FORMES.produit(expr) ? MSG_FORME.produit : MSG_FORME[forme];
      return { etat: 'faux', msg: q.indiceForme || mf || 'Le résultat est juste, mais pas écrit sous la forme demandée.' };
    }
    return { etat: 'juste' };
  }
  function piege(q, expr, vars) {             // erreurs classiques prévues : message dédié
    if (!q.pieges) return '';
    for (var i = 0; i < q.pieges.length; i++) {
      try { if (equivalentes(expr, analyser(q.pieges[i].si), vars, q.positifs)) return q.pieges[i].msg; } catch (e) {}
    }
    return '';
  }

  /* ----- plusieurs cadres dans une phrase ----- */
  function verifierCases(q, latexs) {
    if (q.cases.length === 2 && latexs.every(function (l) { return String(l || '').trim(); })) {   // deux valeurs inversées ?
      var inv = [latexs[1], latexs[0]], tout = true;
      for (var j = 0; j < 2; j++) {
        var cj = q.cases[j];
        if (verifierExpr({ attendu: cj.attendu, forme: cj.forme || 'nombre', variable: cj.variable, tolerance: cj.tolerance, suffixe: cj.suffixe }, inv[j]).etat !== 'juste') tout = false;
      }
      if (tout && verifierExpr({ attendu: q.cases[0].attendu, forme: 'libre' }, latexs[0]).etat !== 'juste') return { etat: 'faux', msg: 'Les deux valeurs sont justes, mais inversées.' };
    }
    for (var i = 0; i < q.cases.length; i++) {
      var c = q.cases[i];
      var sq = { attendu: c.attendu, forme: c.forme || 'nombre', variable: c.variable, tolerance: c.tolerance, suffixe: c.suffixe, pieges: c.pieges };
      var r = verifierExpr(sq, latexs[i]);
      if (r.etat === 'lecture') return { etat: 'lecture', msg: /vide/.test(r.msg) || !String(latexs[i] || '').trim() ? 'Remplis toutes les cases.' : r.msg };
      if (r.etat !== 'juste') {
        if (!r.msg && q.cases.length > 1) r.msg = (c.nom ? 'La case « ' + c.nom + ' »' : 'La case n° ' + (i + 1)) + ' n’est pas juste.';
        return { etat: 'faux', msg: r.msg || q.indiceFaux || '' };
      }
    }
    return { etat: 'juste' };
  }

  /* ----- ensemble de solutions { a ; b } ----- */
  function verifierEnsemble(q, latex) {
    var s = String(latex || '').replace(/^\s*S\s*=\s*/, '').replace(/^\\(\{|lbrace)|\\(\}|rbrace)$/g, '').trim();
    s = s.replace(/^\\left\\(\{|lbrace)|\\right\\(\}|rbrace)$/g, '').trim();
    if (!s) return { etat: 'lecture', msg: 'Écris les solutions, séparées par un point-virgule « ; ».' };
    var morceaux = s.split(';').map(function (m) { return m.trim(); });
    if (morceaux.some(function (m) { return !m; })) return { etat: 'lecture', msg: 'Il y a un « ; » en trop, ou une valeur manquante entre deux « ; ».' };
    var vals = [], formes = [];
    try {
      morceaux.forEach(function (m) {
        if (/[a-zA-Z]\s*=|\\le|\\ge|</.test(m.replace(/\\(sqrt|frac|dfrac|infty|pi)/g, ''))) throw new Erreur('egal');
        var a = analyser(m); vals.push(evaluer(a, {})); formes.push(a);
      });
    } catch (e) {
      return { etat: 'lecture', msg: e.message === 'egal' ? 'Écris seulement les valeurs, séparées par « ; » (pas « x = … »).' : 'Je n’arrive pas à lire une des valeurs.' };
    }
    if (vals.some(function (v) { return !isFinite(v); })) return { etat: 'lecture', msg: 'Je n’arrive pas à lire une des valeurs.' };
    var att = q.valeurs.map(function (l) { return typeof l === 'number' ? l : valeurDe(l); });
    function pres(a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)); }
    for (var i = 0; i < vals.length; i++) for (var j = i + 1; j < vals.length; j++) if (pres(vals[i], vals[j])) return { etat: 'faux', msg: 'Une même valeur est écrite deux fois.' };
    var dedans = vals.filter(function (v) { return att.some(function (a) { return pres(v, a); }); }).length;
    if (dedans === att.length && vals.length === att.length) {
      var forme = q.forme || 'reduit';
      for (var k = 0; k < formes.length; k++) if (!FORMES[forme](formes[k])) return { etat: 'faux', msg: q.indiceForme || 'Les solutions sont justes, mais une des valeurs peut encore être simplifiée.' };
      return { etat: 'juste' };
    }
    if (dedans === vals.length && vals.length < att.length) return { etat: 'faux', msg: 'Ce que tu as écrit est juste, mais il manque ' + (att.length - vals.length > 1 ? 'des solutions.' : 'une solution.') };
    if (dedans === att.length) return { etat: 'faux', msg: 'Il y a une valeur en trop.' };
    return { etat: 'faux', msg: q.indiceFaux || (dedans ? 'Une partie seulement est juste.' : '') };
  }

  /* ----- intervalles : ]a ; b] ∪ [c ; +∞[ ----- */
  function lireIntervalles(latex) {
    var s = String(latex || '').replace(/^\s*S\s*=\s*/, '');
    var tk = decouper(s);
    if (tk.length === 1 && tk[0] === '\\varnothing') return [];
    if (!tk.length) throw new Erreur('vide');
    var parts = [[]];
    tk.forEach(function (t) { if (t === '\\cup') parts.push([]); else parts[parts.length - 1].push(t); });
    return parts.map(function (p) {
      if (p.length < 5) throw new Erreur('lecture');
      var o = p[0], f = p[p.length - 1];
      if ((o !== '[' && o !== ']') || (f !== '[' && f !== ']')) throw new Erreur('crochet');
      var corps = p.slice(1, -1), prof = 0, k = -1;
      for (var i = 0; i < corps.length; i++) {
        var t = corps[i];
        if (t === '(' || t === '{') prof++; else if (t === ')' || t === '}') prof--;
        else if (t === ';' && prof === 0) { k = i; break; }
      }
      if (k < 0) throw new Erreur('pointvirgule');
      var a = evaluer(analyserTk(corps.slice(0, k)), {}), b = evaluer(analyserTk(corps.slice(k + 1)), {});
      if (isNaN(a) || isNaN(b)) throw new Erreur('lecture');
      return { a: a, b: b, fa: o === '[', fb: f === ']' };
    });
  }
  function verifierIntervalles(q, latex) {
    var r;
    try { r = lireIntervalles(latex); }
    catch (e) {
      var m = { vide: 'Écris l’ensemble des solutions.', crochet: 'Chaque intervalle commence et finit par un crochet [ ou ].', pointvirgule: 'Sépare les deux bornes d’un intervalle par « ; ».' }[e.message];
      if (/\\le|\\ge|<|>/.test(latex || '')) m = 'Écris l’ensemble des solutions sous forme d’intervalle(s), par exemple ]−∞ ; 3].';
      return { etat: 'lecture', msg: m || 'Je n’arrive pas à lire cette écriture d’intervalle.' };
    }
    var att = lireIntervalles(q.attendu);
    function pres(a, b) { return a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)); }
    for (var i = 0; i < r.length; i++) {
      if (!(r[i].a < r[i].b)) return { etat: 'faux', msg: 'Dans un intervalle, la plus petite borne s’écrit à gauche.' };
      if ((r[i].a === -Infinity && r[i].fa) || (r[i].b === Infinity && r[i].fb)) return { etat: 'faux', msg: 'Du côté de l’infini, le crochet est toujours ouvert.' };
    }
    r.sort(function (u, v) { return u.a - v.a; });
    if (r.length !== att.length) {
      if (r.length < att.length) return { etat: 'faux', msg: att.length - r.length > 0 && r.every(function (x) { return att.some(function (y) { return pres(x.a, y.a) && pres(x.b, y.b); }); }) ? 'Il manque un intervalle (réunion « ∪ »).' : (q.indiceFaux || '') };
      return { etat: 'faux', msg: q.indiceFaux || 'Il y a trop d’intervalles.' };
    }
    for (var j = 0; j < att.length; j++) if (!pres(r[j].a, att[j].a) || !pres(r[j].b, att[j].b)) return { etat: 'faux', msg: q.indiceFaux || 'Les bornes ne sont pas les bonnes.' };
    for (var k = 0; k < att.length; k++) if (r[k].fa !== att[k].fa || r[k].fb !== att[k].fb) return { etat: 'faux', msg: 'Les bornes sont justes : vérifie les crochets (chaque borne est-elle comprise ou non ?).' };
    return { etat: 'juste' };
  }

  /* ----- comparaison : a □ b ----- */
  function verifierComparer(q, latex) {
    var tk;
    try { tk = decouper(String(latex || '')); } catch (e) { tk = ['?']; }
    if (!tk.length) return { etat: 'lecture', msg: 'Tape le symbole <, > ou = dans la case.' };
    if (tk.length !== 1 || ['<', '>', '=', '\\le', '\\ge', '\\ne'].indexOf(tk[0]) < 0) return { etat: 'lecture', msg: 'Tape seulement un symbole : <, > ou =.' };
    var s = tk[0];
    if (s === q.attendu) return { etat: 'juste' };
    if ((s === '\\le' && q.attendu === '<') || (s === '\\ge' && q.attendu === '>')) return { etat: 'faux', msg: 'C’est presque ça : mais les deux nombres ne sont pas égaux, une inégalité stricte est attendue.' };
    if (s === '\\ne') return { etat: 'faux', msg: 'C’est vrai, mais on veut savoir lequel est le plus grand.' };
    return { etat: 'faux', msg: q.indiceFaux || '' };
  }

  /* ----- tableaux de signes et de variations : état lu dans le tableau ----- */
  function verifierTableau(q, e) {
    var b = q.bornes || [-Infinity, Infinity];
    if (!(Math.abs(e.gauche - b[0]) < 1e-9 || e.gauche === b[0]) || !(Math.abs(e.droite - b[1]) < 1e-9 || e.droite === b[1]))
      return { etat: 'faux', msg: q.bornes ? 'Les extrémités de la ligne des x sont les bornes de l’intervalle d’étude.' : 'Regarde les extrémités de la ligne des x.' };
    var vals = e.valeurs;
    var tous = [e.gauche].concat(vals, [e.droite]);
    for (var i = 1; i < tous.length; i++) if (!(tous[i] > tous[i - 1])) return { etat: 'faux', msg: 'Les valeurs de x doivent être rangées dans l’ordre croissant.' };
    var att = q.valeurs;
    var memes = vals.length === att.length && vals.every(function (v, i) { return Math.abs(v - att[i]) < 1e-9; });
    if (!memes) return { etat: 'faux', msg: q.type === 'variations' ? 'Les valeurs placées sur la ligne des x ne sont pas les bonnes (on y met les x où le sens de variation change).' : 'Les valeurs placées sur la ligne des x ne sont pas les bonnes.' };
    if (q.type === 'variations') {
      if (e.fleches.some(function (f) { return !f; })) return { etat: 'faux', msg: 'Il reste des flèches à placer.' };
      for (var f = 0; f < e.fleches.length; f++) if (e.fleches[f] !== q.fleches[f]) return { etat: 'faux', msg: 'Il y a une erreur dans le sens des flèches.' };
      for (var m = 0; m < q.images.length; m++) {
        if (q.images[m] == null) continue;
        if (!isFinite(e.images[m])) return { etat: 'lecture', msg: 'Écris les images sous chaque valeur de x (au bout des flèches).' };
        if (Math.abs(e.images[m] - q.images[m]) > 1e-9) return { etat: 'faux', msg: 'Les flèches sont justes : vérifie les valeurs écrites au bout des flèches.' };
      }
      return { etat: 'juste' };
    }
    var ligne = q.ligne;
    for (var t = 0; t < att.length; t++) if (e.traits[t] !== ligne.traits[t]) return { etat: 'faux', msg: 'Vérifie les traits sous les valeurs de x.' };
    if (e.signes.some(function (sg) { return !sg; })) return { etat: 'faux', msg: 'Il reste des signes à placer.' };
    for (var k = 0; k < e.signes.length; k++) if (e.signes[k] !== ligne.signes[k]) return { etat: 'faux', msg: 'Il y a une erreur dans les signes.' };
    return { etat: 'juste' };
  }

  /* ----- repère : points placés par l'élève ----- */
  function verifierRepere(q, pts) {
    function pres(a, b) { return Math.abs(a - b) < 1e-9; }
    if (q.mode === 'graduee') {
      if (!pts.length) return { etat: 'lecture', msg: 'Touche la droite graduée pour placer le point.' };
      if (pres(pts[0][0], q.point)) return { etat: 'juste' };
      if (pres(pts[0][0], -q.point)) return { etat: 'faux', msg: 'Attention au signe : regarde de quel côté de 0 se trouve le point.' };
      return { etat: 'faux', msg: q.indiceFaux || 'Compte bien les graduations : que vaut une graduation ?' };
    }
    if (q.mode === 'point') {
      if (!pts.length) return { etat: 'lecture', msg: 'Touche le quadrillage pour placer le point.' };
      var p = pts[0], a = q.point;
      if (pres(p[0], a[0]) && pres(p[1], a[1])) return { etat: 'juste' };
      if (pres(p[0], a[1]) && pres(p[1], a[0])) return { etat: 'faux', msg: 'Tu as inversé abscisse et ordonnée : l’abscisse se lit sur l’axe horizontal.' };
      if (pres(p[0], a[0])) return { etat: 'faux', msg: 'L’abscisse est juste, vérifie l’ordonnée.' };
      if (pres(p[1], a[1])) return { etat: 'faux', msg: 'L’ordonnée est juste, vérifie l’abscisse.' };
      return { etat: 'faux', msg: q.indiceFaux || '' };
    }
    // droite : deux points distincts
    if (pts.length < 2) return { etat: 'lecture', msg: 'Place deux points de la droite (touche le quadrillage deux fois).' };
    var A = pts[0], B = pts[1], d = q.droite;
    if (pres(A[0], B[0]) && pres(A[1], B[1])) return { etat: 'lecture', msg: 'Les deux points sont confondus : place-les à deux endroits différents.' };
    if (d.x != null) return (pres(A[0], d.x) && pres(B[0], d.x)) ? { etat: 'juste' } : { etat: 'faux', msg: q.indiceFaux || '' };
    function sur(P) { return pres(P[1], d.m * P[0] + d.p); }
    if (sur(A) && sur(B)) return { etat: 'juste' };
    if (pres(A[0], B[0])) return { etat: 'faux', msg: 'Ta droite est verticale : ce n’est pas la représentation d’une fonction affine.' };
    var m = (B[1] - A[1]) / (B[0] - A[0]), p = A[1] - m * A[0];
    if (pres(m, d.m)) return { etat: 'faux', msg: 'Le coefficient directeur est bon : vérifie l’ordonnée à l’origine.' };
    if (pres(p, d.p)) return { etat: 'faux', msg: 'Elle coupe bien l’axe des ordonnées au bon endroit : vérifie le coefficient directeur.' };
    return { etat: 'faux', msg: q.indiceFaux || '' };
  }

  /* ======================= 3. Clavier mathématique ======================= */
  function k(latex, extra) { var o = { latex: latex }; if (extra) for (var c in extra) o[c] = extra[c]; return o; }
  var CLAVIERS = [
    { label: '123', tooltip: 'Nombres et opérations', rows: [
      [k('x'), k('y'), { class: 'separator w5' }, '[7]', '[8]', '[9]', k('\\frac{#@}{#?}', { tooltip: 'fraction' }), k('#@^{#?}', { tooltip: 'puissance' }), k('#@^2', { tooltip: 'carré' }), k('\\sqrt{#0}', { tooltip: 'racine carrée' })],
      [k('X'), k('a'), { class: 'separator w5' }, '[4]', '[5]', '[6]', k('\\times'), '[(]', '[)]', k('\\infty', { tooltip: 'infini' })],
      [k('n'), k('\\overrightarrow{#0}', { tooltip: 'vecteur' }), { class: 'separator w5' }, '[1]', '[2]', '[3]', '[-]', k('\\le'), k('\\ge'), k(';', { tooltip: 'point-virgule' })],
      ['[left]', '[right]', { class: 'separator w5' }, '[0]', { label: ',', latex: '{,}', insert: '{,}' }, '[=]', '[+]', k('\\pi'), k('\\%', { tooltip: 'pour cent' }), '[backspace]']
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
      [k('\\in'), k('\\notin'), k('\\subset'), k('\\cup'), k('\\cap'), k('\\varnothing'), k('\\lbrack', { tooltip: 'crochet [' }), k('\\rbrack', { tooltip: 'crochet ]' })],
      [k('\\mathbb{R}'), k('\\mathbb{N}'), k('\\mathbb{Z}'), k('\\mathbb{Q}'), k('\\mathbb{C}'), k('\\mathbb{R}^*'), k(';'), k('\\overline{#0}', { tooltip: 'barre (événement contraire)' })],
      [k('\\Rightarrow'), k('\\Leftrightarrow'), k('\\forall'), k('\\exists'), k('-\\infty', { tooltip: 'moins l’infini' }), k('+\\infty', { tooltip: 'plus l’infini' }), k('\\perp'), '[backspace]']
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
    function majVide() { mf.classList.toggle('vide', !mf.value); }      // case vide : signalée « à remplir »
    mf.addEventListener('input', majVide);
    mf.addEventListener('focusout', majVide);
    mf.classList.add('vide');
    customElements.whenDefined('math-field').then(function () { try { mf.menuItems = []; mf.smartSuperscript = false; } catch (e) {} majVide(); });
    mf._majVide = majVide;
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
  function melanger(t) { t = t.slice(); for (var i = t.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = t[i]; t[i] = t[j]; t[j] = x; } return t; }

  function Quiz(racine, def, opts) {
    this.racine = racine; this.source = def; this.i = 0; this.opts = opts || {};
    this.construire();
  }
  Quiz.prototype.preparerQuestions = function () {
    var s = this.source;
    if (!s.tirage) { this.def = s; return; }
    var toutes = [];
    (s.tirage.depuis || [null]).forEach(function (id) {             // sans « depuis » : tirage dans la banque du quiz lui-même
      var d = id ? (window.QUIZ || {})[id] : s;
      if (d) d.questions.forEach(function (q, i) { toutes.push({ q: q, i: toutes.length }); });
    });
    var tirees = melanger(toutes).slice(0, s.tirage.n || 20);
    if (s.tirage.ordre === 'banque') tirees.sort(function (a, b) { return a.i - b.i; });   // garde la progression de la banque
    var d2 = {}; for (var c in s) d2[c] = s[c];
    d2.questions = tirees.map(function (t) { return t.q; });
    this.def = d2;
  };
  Quiz.prototype.construire = function () {
    var self = this;
    fermerVolet();
    this.preparerQuestions();
    var d = this.def;
    this.etat = d.questions.map(function () { return { essais: 0, juste: false, premier: false, vue: false }; });
    this.racine.innerHTML = '';
    var tete = el('div', 'quiz-tete');
    var titres = el('div', 'quiz-titres', '<span class="quiz-etiquette">' + d.etiquette + '</span><h2>' + d.titre + '</h2>' + (d.sousTitre ? '<p class="quiz-sous-titre">' + d.sousTitre + '</p>' : ''));
    if (this.opts.reglages) {                      // retour à l'écran des réglages (nombre de questions, thèmes)
      var br = el('button', 'quiz-vers-reglages', '<span aria-hidden="true">‹</span> Réglages'); br.type = 'button';
      br.addEventListener('click', function () { fermerVolet(); self.opts.reglages(); });
      titres.insertBefore(br, titres.firstChild);
    }
    tete.appendChild(titres);
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
    c.appendChild(el('p', 'quiz-num', 'Question ' + (n + 1) + ' / ' + total + (q.theme && this.source.tirage ? ' · ' + q.theme : '')));
    var enonce = el('div', 'quiz-enonce', q.enonce);
    if (q.figure) {
      var fig = el('figure', 'quiz-figure' + (q.figureLarge ? ' large' : ''));
      var img = el('img'); img.src = q.figure; img.alt = q.figureAlt || 'Figure de la question'; img.loading = 'lazy'; img.decoding = 'async';
      fig.appendChild(img); enonce.appendChild(fig);
    }
    if (q.enonceApres) enonce.appendChild(el('div', 'quiz-enonce-apres', q.enonceApres));
    c.appendChild(enonce); rendre(enonce);
    var zone = el('div', 'quiz-zone'); c.appendChild(zone);
    function entree(mf) { mf.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.valider(n); } }); return mf; }
    var lire;
    if (q.type === 'signes' || q.type === 'variations') lire = this.tableau(q, zone);
    else if (q.type === 'coords') lire = this.coords(q, zone, n);
    else if (q.type === 'repere') lire = this.repere(q, zone);
    else if (q.type === 'cases') lire = this.cases(q, zone, n, entree);
    else if (q.type === 'comparer') {
      var lc = el('div', 'quiz-ligne quiz-comparer');
      var g = el('span', 'quiz-prefixe', '\\(' + q.gauche + '\\)'), dr = el('span', 'quiz-prefixe', '\\(' + q.droite + '\\)');
      var mfc = entree(nouveauChamp('quiz-champ petit symbole', 'Symbole de comparaison (question ' + (n + 1) + ')'));
      lc.appendChild(g); lc.appendChild(mfc); lc.appendChild(dr); zone.appendChild(lc); rendre(lc);
      lire = function () { return verifierComparer(q, mfc.value); };
    } else {
      var ligne = el('div', 'quiz-ligne');
      var mf = entree(nouveauChamp('quiz-champ', 'Ta réponse à la question ' + (n + 1)));
      var pre = q.prefixe, suf = q.suffixe;
      if (q.type === 'ensemble') { pre = (q.prefixe || '\\(S=\\)') + '<span class="quiz-accolade">\\(\\{\\)</span>'; suf = '<span class="quiz-accolade">\\(\\}\\)</span>'; }
      if (q.type === 'intervalles' && !pre) pre = '\\(S=\\)';
      if (pre) { var pf = el('span', 'quiz-prefixe', pre); ligne.appendChild(pf); rendre(pf); }
      ligne.appendChild(mf);
      if (suf) { var sf = el('span', 'quiz-prefixe quiz-suffixe', suf); ligne.appendChild(sf); rendre(sf); }
      zone.appendChild(ligne);
      if (q.type === 'ensemble') { zone.appendChild(el('p', 'quiz-aide-tab', 'Sépare les solutions par un point-virgule « ; » (touche ; du clavier 123).')); }
      if (q.type === 'intervalles') { var ai = el('p', 'quiz-aide-tab', 'Crochets [ ], infini ∞ et réunion ∪ : onglet ≤∈ℝ du clavier (au clavier de l’ordinateur : « oo » donne ∞).'); zone.appendChild(ai); }
      lire = q.type === 'ensemble' ? function () { return verifierEnsemble(q, mf.value); }
        : q.type === 'intervalles' ? function () { return verifierIntervalles(q, mf.value); }
        : function () { return verifierExpr(q, mf.value); };
    }
    c._champ = zone.querySelector('math-field');
    c._lire = lire;
    var msg = el('p', 'quiz-message'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite'); c.appendChild(msg); c._msg = msg;
    var actions = el('div', 'quiz-actions');
    var bv = el('button', 'bouton', 'Valider'); bv.type = 'button'; bv.addEventListener('click', function () { self.valider(n); });
    var bs = el('button', 'bouton discret', 'Voir la correction <span aria-hidden="true">›</span>'); bs.type = 'button'; bs.hidden = true; bs.addEventListener('click', function () { self.correction(n); });
    var bn = el('button', 'bouton', n + 1 < total ? 'Question suivante' : 'Voir le bilan'); bn.type = 'button'; bn.hidden = true;
    bn.addEventListener('click', function () { fermerVolet(); self.suivante(n); });
    actions.appendChild(bv); actions.appendChild(bs); actions.appendChild(bn); c.appendChild(actions);
    c._bv = bv; c._bs = bs; c._bn = bn; c._q = q;
    return c;
  };
  Quiz.prototype.aller = function (n) {
    if (volet && volet.quiz === this && volet.n !== n) fermerVolet();
    this.i = n;
    this.fin.hidden = true;
    this.cartes.forEach(function (c, j) { c.hidden = j !== n; });
    this.majPoints();
    var c = this.cartes[n];
    majLanguette(this);
    if (c._champ && !this.etat[n].juste) setTimeout(function () { if (voletOuvert()) return; try { c._champ.focus(); } catch (e) {} }, 50);
    else if (window.mathVirtualKeyboard) try { window.mathVirtualKeyboard.hide(); } catch (e) {}
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
    var c = this.cartes[n], e = this.etat[n];
    if (e.juste) return;
    var r = c._lire();
    c._msg.className = 'quiz-message';
    if (r.etat === 'lecture') { c._msg.textContent = r.msg; c._msg.classList.add('info'); return; }
    e.essais++;
    if (r.etat === 'juste') {
      e.juste = true; e.premier = e.essais === 1 && !e.vue;
      c.classList.add('reussie'); c.classList.remove('ratee');
      c._msg.textContent = 'Bonne réponse !'; c._msg.classList.add('ok');
      c._bv.hidden = true; c._bs.hidden = !e.vue; c._bn.hidden = false;
      c._bn.className = 'bouton';
      c.querySelectorAll('.quiz-zone math-field').forEach(function (s) { s.readOnly = true; s.blur(); });
      c.querySelectorAll('.quiz-zone button').forEach(function (s) { s.disabled = true; });
      window.mathVirtualKeyboard && window.mathVirtualKeyboard.hide();
      signalerJuste();
      setTimeout(function () { c._bn.focus(); }, 50);
    } else {
      c.classList.add('ratee');
      c._msg.textContent = r.msg ? r.msg : 'Ce n’est pas la bonne réponse. Cherche encore !';
      c._msg.classList.add('ko');
      // dès la première erreur : la correction animée est proposée (volet sur le côté), et l'on peut passer à la suite
      c._bs.hidden = false; c._bn.hidden = false; c._bn.className = 'bouton secondaire';
      signalerFaux();
    }
    this.majPoints();
  };
  Quiz.prototype.correction = function (n) {
    var c = this.cartes[n];
    this.etat[n].vue = true;
    c._bn.hidden = false;
    this.majPoints();
    ouvrirVolet(this, n);
  };
  Quiz.prototype.suivante = function (n) { if (n + 1 < this.cartes.length) this.aller(n + 1); else this.bilan(); };
  Quiz.prototype.bilan = function () {
    var self = this, total = this.etat.length;
    var premier = this.etat.filter(function (e) { return e.premier; }).length;
    var justes = this.etat.filter(function (e) { return e.juste; }).length;
    fermerVolet(); this.cartes.forEach(function (c) { c.hidden = true; });
    this.fin.innerHTML = '';
    this.fin.appendChild(el('p', 'quiz-num', 'Bilan'));
    this.fin.appendChild(el('p', 'quiz-score', '<strong>' + justes + ' / ' + total + '</strong> questions réussies'));
    this.fin.appendChild(el('p', 'quiz-detail', premier + ' du premier coup' + (justes < total ? ' · ' + (total - justes) + ' à retravailler' : '')));
    var r = el('button', 'bouton', this.source.tirage ? 'Nouveau tirage' : 'Recommencer le quiz'); r.type = 'button';
    r.addEventListener('click', function () { self.construire(); self.racine.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    var a = el('div', 'quiz-actions'); a.appendChild(r);
    if (this.opts.reglages) {
      var g = el('button', 'bouton secondaire', 'Changer les réglages'); g.type = 'button';
      g.addEventListener('click', function () { self.opts.reglages(); });
      a.appendChild(g);
    }
    this.fin.appendChild(a);
    this.fin.hidden = false;
    this.majPoints(); majLanguette(this);
    this.fin.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  /* ----- plusieurs cadres dans une phrase : modele 'texte {0} texte {1}' ----- */
  Quiz.prototype.cases = function (q, zone, n, entree) {
    var ligne = el('div', 'quiz-ligne quiz-cases'), champs = [];
    String(q.modele).split(/(\{\d+\})/).forEach(function (morceau) {
      var m = /^\{(\d+)\}$/.exec(morceau);
      if (m) {
        var i = +m[1], cd = q.cases[i] || {};
        var mf = entree(nouveauChamp('quiz-champ petit' + (cd.large ? ' large' : ''), (cd.nom || 'case ' + (i + 1)) + ' (question ' + (n + 1) + ')'));
        champs[i] = mf; ligne.appendChild(mf);
      } else if (morceau) { var t = el('span', 'quiz-prefixe', morceau); ligne.appendChild(t); }
    });
    zone.appendChild(ligne); rendre(ligne);
    return function () { return verifierCases(q, champs.map(function (mf) { return mf.value; })); };
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

  /* ----- tableau de signes / de variations : valeurs de x ajoutées par l'élève ----- */
  var TRAITS = ['pointille', 'zero', 'double'];
  var NOM_TRAIT = { pointille: 'pointillés', zero: 'trait avec un 0', double: 'double trait (valeur interdite)' };
  var FLECHES = ['', '↗', '↘'];
  var nFleche = 0;
  function flecheLongue(v) {          // une flèche qui couvre tout l'intervalle (M. Colin, 12 nov. 2026), pas un petit symbole
    if (v !== '↗' && v !== '↘') return '';
    var id = 'qvf' + (++nFleche), y1 = v === '↗' ? '86%' : '14%', y2 = v === '↗' ? '14%' : '86%';
    return '<svg class="fleche-longue" aria-hidden="true" focusable="false"><defs><marker id="' + id + '" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" markerUnits="strokeWidth" orient="auto">' +
      '<path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><line x1="6%" y1="' + y1 + '" x2="94%" y2="' + y2 + '" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" marker-end="url(#' + id + ')"/></svg>';
  }
  function nombreTeX(v) {
    if (v === Infinity) return '+\\infty';
    if (v === -Infinity) return '-\\infty';
    return String(Math.round(v * 1000) / 1000).replace('.', '{,}');
  }
  Quiz.prototype.tableau = function (q, zone) {
    var vari = q.type === 'variations';
    var wrap = el('div', 'quiz-tab-cadre'), tab = el('div', 'quiz-tab' + (vari ? ' quiz-var' : ''));
    var gauche = nouveauChamp('quiz-champ petit', 'Première valeur de la ligne x');
    var droite = nouveauChamp('quiz-champ petit', 'Dernière valeur de la ligne x');
    var racines = [];                 // { mf, trait, img }
    var inter = [''];                 // un signe ou une flèche par intervalle
    var imgG = nouveauChamp('quiz-champ petit', 'Image de la première valeur'), imgD = nouveauChamp('quiz-champ petit', 'Image de la dernière valeur');
    var lab = el('span', null, '\\(x\\)'); rendre(lab);
    var labL = el('span', null, vari ? (q.label || 'variation de \\(f\\)') : q.ligne.label); rendre(labL);
    var finiG = !q.bornes || isFinite(q.bornes[0]), finiD = !q.bornes || isFinite(q.bornes[1]);
    if (!q.bornes) finiG = finiD = false;

    function cellule(classe, contenu) { var c = el('div', 'tcell ' + (classe || '')); if (contenu) c.appendChild(contenu); tab.appendChild(c); return c; }
    function bouton(classe, texte, aria, action) {
      var b = el('button', classe, texte); b.type = 'button'; b.setAttribute('aria-label', aria);
      b.addEventListener('click', action); return b;
    }
    function ajouter(k) {             // nouvelle valeur entre la valeur k et la valeur k+1
      var mf = nouveauChamp('quiz-champ petit', 'Valeur de x');
      racines.splice(k, 0, { mf: mf, trait: 'pointille', img: vari ? nouveauChamp('quiz-champ petit', 'Image de cette valeur') : null });
      inter.splice(k + 1, 0, '');
      dessiner();
      setTimeout(function () { try { mf.focus(); } catch (e) {} }, 30);
    }
    function retirer(k) { racines.splice(k, 1); inter.splice(k + 1, 1); dessiner(); }
    function position(i) {            // valeur n° i (0 = extrémité gauche) : en haut, en bas ou au milieu
      var L = inter[i - 1], R = inter[i];
      if (L === '↗' || R === '↘') return 'haut';
      if (L === '↘' || R === '↗') return 'bas';
      return 'milieu';
    }
    function majPositions() {
      Array.prototype.forEach.call(tab.querySelectorAll('.timg'), function (c) { c.dataset.pos = position(+c.dataset.i); });
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
      // ligne du signe ou des variations
      cellule('tlab', labL);
      if (vari) { var cg = cellule('tval timg', finiG ? imgG : null); cg.dataset.i = 0; }
      else cellule('tval tvide');
      for (var m = 0; m <= n; m++) {
        (function (m) {
          var cyc = vari ? FLECHES : ['', '+', '−'];
          var b = bouton(vari ? 'signe sint fleche' : 'signe sint', vari ? flecheLongue(inter[m]) : inter[m], (vari ? 'Sens de variation' : 'Signe') + ' sur l’intervalle ' + (m + 1), function () {
            inter[m] = cyc[(cyc.indexOf(inter[m]) + 1) % cyc.length];
            if (vari) b.innerHTML = flecheLongue(inter[m]); else b.textContent = inter[m];
            b.dataset.v = inter[m];
            if (vari) { b.setAttribute('aria-label', 'Sens de variation sur l’intervalle ' + (m + 1) + (inter[m] ? ' : ' + (inter[m] === '↗' ? 'croissante' : 'décroissante') : '')); majPositions(); }
          });
          b.dataset.v = inter[m];
          cellule('tint', b);
        })(m);
        if (m < n) {
          if (vari) { var ci = cellule('tval timg', racines[m].img); ci.dataset.i = m + 1; }
          else (function (m) {
            var r = racines[m];
            var t = bouton('trait-choix', '', '', function () {
              r.trait = TRAITS[(TRAITS.indexOf(r.trait) + 1) % 3]; r.touche = true;
              t.dataset.t = r.trait; t.dataset.touche = '1'; t.setAttribute('aria-label', 'Trait : ' + NOM_TRAIT[r.trait] + ' (toucher pour changer)');
            });
            t.dataset.t = r.trait; if (r.touche) t.dataset.touche = '1'; t.setAttribute('aria-label', 'Trait : ' + NOM_TRAIT[r.trait] + ' (toucher pour changer)');
            t.innerHTML = '<span>0</span>';
            cellule('tval ttrait', t);
          })(m);
        }
      }
      if (vari) { var cd = cellule('tval timg', finiD ? imgD : null); cd.dataset.i = n + 1; majPositions(); }
      else cellule('tval tvide');
    }
    dessiner();
    wrap.appendChild(tab); zone.appendChild(wrap);
    var aide = el('p', 'quiz-aide-tab', vari
      ? 'Le bouton <b>+</b> ajoute une valeur de \\(x\\) (× la retire). Touche un rond pour tracer la flèche (montante, puis descendante), et écris les images au bout des flèches.'
      : 'Le bouton <b>+</b> ajoute une valeur de \\(x\\) (× la retire). Touche une case pour y mettre + ou −, et un trait pour choisir : pointillés, trait avec un 0, ou double trait (valeur interdite).');
    zone.appendChild(aide); rendre(aide);

    function lire(mf) { return evaluer(analyser(mf.value), {}); }
    function lireSiRempli(mf) { if (!mf.value) return NaN; try { return lire(mf); } catch (e) { return NaN; } }
    return function () {
      var e = { valeurs: [], traits: [], signes: inter.slice(), fleches: inter.slice(), images: [] };
      try { e.gauche = lire(gauche); e.droite = lire(droite); racines.forEach(function (r) { e.valeurs.push(lire(r.mf)); e.traits.push(r.trait); }); }
      catch (err) { return { etat: 'lecture', msg: err.message === 'vide' ? (q.bornes ? 'Remplis toutes les cases de la ligne des x.' : 'Remplis toutes les cases de la ligne des x (aux extrémités : −∞ et +∞).') : 'Une valeur de la ligne des x est illisible.' }; }
      if (vari) {
        e.images.push(finiG ? lireSiRempli(imgG) : null);
        racines.forEach(function (r) { e.images.push(lireSiRempli(r.img)); });
        e.images.push(finiD ? lireSiRempli(imgD) : null);
      }
      return verifierTableau(q, e);
    };
  };

  /* ----- repère : placer un point, tracer une droite (deux points), droite graduée ----- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, at) { var e = document.createElementNS(SVGNS, tag); for (var a in at) e.setAttribute(a, at[a]); return e; }
  function fmt(v) { return String(Math.round(v * 100) / 100).replace('.', ',').replace('-', '−'); }
  Quiz.prototype.repere = function (q, zone) {
    var pts = [], U = 40;                                     // unité : 40 px
    var gr = q.mode === 'graduee';
    var f = q.fenetre || (gr ? [-5, 5] : [-5, 5, -5, 5]);
    var xmin = f[0], xmax = f[1], ymin = gr ? -0.6 : f[2], ymax = gr ? 0.6 : f[3];
    var pas = q.pas || 1, grad = q.graduation || pas;
    if (gr) U = Math.min(60, 560 / (xmax - xmin));
    var W = (xmax - xmin) * U, H = (ymax - ymin) * U, M = 22;
    var svg = svgEl('svg', { viewBox: (-M) + ' ' + (-M) + ' ' + (W + 2 * M) + ' ' + (H + 2 * M), class: 'quiz-repere' + (gr ? ' graduee' : ''), role: 'img', 'aria-label': gr ? 'Droite graduée' : 'Repère quadrillé' });
    function X(x) { return (x - xmin) * U; }
    function Y(y) { return (ymax - y) * U; }
    var fond = svgEl('rect', { x: -M, y: -M, width: W + 2 * M, height: H + 2 * M, class: 'r-fond' }); svg.appendChild(fond);
    var g = svgEl('g', {}); svg.appendChild(g);
    if (!gr) {
      for (var i = Math.ceil(xmin); i <= xmax; i++) g.appendChild(svgEl('line', { x1: X(i), y1: 0, x2: X(i), y2: H, class: 'r-grille' }));
      for (var j = Math.ceil(ymin); j <= ymax; j++) g.appendChild(svgEl('line', { x1: 0, y1: Y(j), x2: W, y2: Y(j), class: 'r-grille' }));
      g.appendChild(svgEl('line', { x1: 0, y1: Y(0), x2: W, y2: Y(0), class: 'r-axe' }));
      g.appendChild(svgEl('line', { x1: X(0), y1: 0, x2: X(0), y2: H, class: 'r-axe' }));
      var et = q.etiquettes || 1;
      for (var a = Math.ceil(xmin); a <= xmax; a++) if (a !== 0 && a % et === 0) { var t = svgEl('text', { x: X(a), y: Y(0) + 15, class: 'r-txt' }); t.textContent = fmt(a); g.appendChild(t); }
      for (var b = Math.ceil(ymin); b <= ymax; b++) if (b !== 0 && b % et === 0) { var t2 = svgEl('text', { x: X(0) - 6, y: Y(b) + 4, class: 'r-txt fin' }); t2.textContent = fmt(b); g.appendChild(t2); }
      var t0 = svgEl('text', { x: X(0) - 6, y: Y(0) + 15, class: 'r-txt fin' }); t0.textContent = '0'; g.appendChild(t0);
    } else {
      g.appendChild(svgEl('line', { x1: -8, y1: Y(0), x2: W + 8, y2: Y(0), class: 'r-axe' }));
      for (var v = xmin; v <= xmax + 1e-9; v += grad) {
        var vv = Math.round(v * 1e6) / 1e6;
        g.appendChild(svgEl('line', { x1: X(vv), y1: Y(0) - 7, x2: X(vv), y2: Y(0) + 7, class: 'r-axe fin' }));
      }
      (q.etiquettesGraduee || [0, 1]).forEach(function (v) { var tt = svgEl('text', { x: X(v), y: Y(0) + 26, class: 'r-txt' }); tt.textContent = fmt(v); g.appendChild(tt); });
    }
    var calque = svgEl('g', {}); svg.appendChild(calque);
    var noms = q.noms || (q.mode === 'droite' ? ['A', 'B'] : [q.nom || 'A']);
    function coupe(m, p) {            // segment de la droite y = mx + p visible dans la fenêtre
      var P = [];
      [[xmin, m * xmin + p], [xmax, m * xmax + p]].forEach(function (u) { if (u[1] >= ymin - 1e-9 && u[1] <= ymax + 1e-9) P.push(u); });
      if (m !== 0) [[(ymin - p) / m, ymin], [(ymax - p) / m, ymax]].forEach(function (u) { if (u[0] > xmin && u[0] < xmax) P.push(u); });
      return P.length >= 2 ? P : null;
    }
    function redessiner() {
      while (calque.firstChild) calque.removeChild(calque.firstChild);
      if (q.mode === 'droite' && pts.length === 2) {
        var A = pts[0], B = pts[1], seg = null;
        if (A[0] === B[0] && A[1] !== B[1]) seg = [[A[0], ymin], [A[0], ymax]];
        else if (A[0] !== B[0]) { var m = (B[1] - A[1]) / (B[0] - A[0]); seg = coupe(m, A[1] - m * A[0]); }
        if (seg) calque.appendChild(svgEl('line', { x1: X(seg[0][0]), y1: Y(seg[0][1]), x2: X(seg[1][0]), y2: Y(seg[1][1]), class: 'r-droite' }));
      }
      pts.forEach(function (P, i) {
        var x = X(P[0]), y = Y(P[1]);
        calque.appendChild(svgEl('path', { d: 'M' + (x - 6) + ' ' + (y - 6) + 'L' + (x + 6) + ' ' + (y + 6) + 'M' + (x - 6) + ' ' + (y + 6) + 'L' + (x + 6) + ' ' + (y - 6), class: 'r-point' }));
        var t = svgEl('text', { x: x + 8, y: y - 8, class: 'r-nom' }); t.textContent = noms[i] || ''; calque.appendChild(t);
      });
      info.textContent = pts.length ? pts.map(function (P, i) { return (noms[i] || '') + (gr ? ' : ' + fmt(P[0]) : '(' + fmt(P[0]) + ' ; ' + fmt(P[1]) + ')'); }).join('   ') : '';
    }
    var fini = false;
    svg.addEventListener('click', function (ev) {
      if (fini || svg.closest('.quiz-carte.reussie')) return;
      var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      var x = Math.round((loc.x / U + xmin) / pas) * pas, y = gr ? 0 : Math.round((ymax - loc.y / U) / pas) * pas;
      x = Math.max(xmin, Math.min(xmax, Math.round(x * 1e6) / 1e6)); y = Math.max(ymin, Math.min(ymax, Math.round(y * 1e6) / 1e6));
      var max = q.mode === 'droite' ? 2 : 1;
      if (pts.length >= max) pts.shift();
      pts.push([x, y]);
      redessiner();
    });
    var cadre = el('div', 'quiz-repere-cadre'); cadre.appendChild(svg); zone.appendChild(cadre);
    var bas = el('div', 'quiz-repere-bas');
    var info = el('span', 'quiz-repere-info');
    var eff = el('button', 'bouton secondaire petit', 'Effacer'); eff.type = 'button';
    eff.addEventListener('click', function () { pts = []; redessiner(); });
    bas.appendChild(info); bas.appendChild(eff); zone.appendChild(bas);
    zone.appendChild(el('p', 'quiz-aide-tab', gr ? 'Touche la droite graduée pour placer le point (toucher ailleurs le déplace).'
      : q.mode === 'droite' ? 'Touche le quadrillage pour placer deux points : la droite passe par eux. Un troisième toucher remplace le premier point.'
        : 'Touche le quadrillage pour placer le point (toucher ailleurs le déplace).'));
    redessiner();
    return function () { return verifierRepere(q, pts.map(function (P) { return P.slice(); })); };
  };

  /* ======================= 5 bis. Correction animée dans un volet ======================= */
  /* La correction d'une question (HTML : des <p> et des blocs \[\begin{aligned}…\end{aligned}\]) est découpée en ÉTAPES
     qui apparaissent une à une, comme dans les animations des corrections (charte § 3) : « A = » d'abord, l'expression
     au clic suivant ; chaque ligne d'un calcul aligné à son tour, les « = » restant alignés ; ce qui est du texte
     (l'énoncé, une phrase de raisonnement) s'affiche d'un coup. La figure de lecture, s'il y en a une, vient d'abord. */
  var REL = /^\s*(=|&lt;|&gt;|<|>|(?:\\leq?(?:slant)?|\\geq?(?:slant)?|\\approx|\\iff|\\Leftrightarrow|\\Longleftrightarrow|\\neq?)(?![a-zA-Z]))/;
  var MOTS = /c-à-d|[A-Za-zÀ-ÿ]{3,}|[,;:]\s*[A-Za-zÀ-ÿ]/;          // un morceau de texte qui ouvre une nouvelle étape (pas une unité « cm »)
  function couper(s, sep) {                     // découpe au niveau 0 des accolades ; « \{ », « \\ »… comptent pour une unité
    var morceaux = [], cur = '', d = 0;
    for (var i = 0; i < s.length; i++) {
      var u = s[i];
      if (u === '\\') {
        var cmd = /^\\(left|right|begin|end)(?![a-zA-Z])/.exec(s.substr(i, 7));
        if (cmd) { d += cmd[1] === 'left' || cmd[1] === 'begin' ? 1 : -1; cur += cmd[0]; i += cmd[0].length - 1; continue; }   // \left( … \right) : un seul bloc
        u = s.substr(i, 2); i++;
      }
      else if (u === '{') d++; else if (u === '}') d--;
      if (d === 0 && sep(u)) { morceaux.push(cur); cur = ''; } else cur += u;
    }
    morceaux.push(cur); return morceaux;
  }
  /* --- Couleurs : ce qui change d'un membre d'égalité au suivant (charte § 3 : surligner avant de transformer) ---
     Chaque membre est lu comme un arbre (somme, produit, fraction, résultat encadré, atome). On compare deux membres
     qui se suivent : la partie qui va changer est SURLIGNÉE à un clic à part (l'élève cherche), puis le membre suivant
     apparaît avec sa partie nouvelle surlignée de la même couleur ; les deux s'éteignent au clic d'après. Le signe
     devant un terme n'est jamais surligné. Si tout le membre change, rien n'est surligné (aucune information). */
  function jetonsTeX(s) {                       // jetons de niveau 0 : {…}, \left…\right…, \commande, caractère
    var r = [], i = 0;
    function finGroupe(j) { var d = 0; for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) return j + 1; } return s.length; }
    while (i < s.length) {
      var c = s[i], j, m;
      if (/\s/.test(c)) { i++; continue; }
      if (c === '{') { j = finGroupe(i); r.push({ t: s.slice(i, j), a: i, b: j }); i = j; continue; }
      if (c === '\\') {
        m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i));
        if (m[0] === '\\left') {
          var d = 0, re = /\\left|\\right/g, x; re.lastIndex = i; j = s.length;
          while ((x = re.exec(s))) { d += x[0] === '\\left' ? 1 : -1; if (d === 0) { var dl = /^\\right(\\[a-zA-Z]+|\\.|.)/.exec(s.slice(x.index)); j = x.index + (dl ? dl[0].length : 6); break; } }
          r.push({ t: s.slice(i, j), a: i, b: j }); i = j; continue;
        }
        r.push({ t: m[0], a: i, b: i + m[0].length }); i += m[0].length; continue;
      }
      r.push({ t: c, a: i, b: i + 1 }); i++;
    }
    return r;
  }
  var OPS = { '+': 1, '-': 1, '\\times': 1, '\\div': 1, '\\cdot': 1, '=': 1, '(': 1, '[': 1, '^': 1, '_': 1 };
  function sansAccolades(t) { return t[0] === '{' ? t.slice(1, -1) : t; }
  function arbreTeX(s) {
    var tx = s.trim(), j = jetonsTeX(tx), n = { tex: tx, cle: tx.replace(/\s+/g, ''), cls: null };
    if (!j.length) { n.k = 'atome'; return n; }
    function morceauxA(test) {                  // découpe aux jetons test() de niveau 0 (parenthèses comprises)
      var p = 0, parts = [], deb = 0, op = '', mal = false;
      j.forEach(function (x, i) {
        if (x.t === '(' || x.t === '[') p++; else if (x.t === ')' || x.t === ']') { p--; if (p < 0) mal = true; }
        if (p === 0 && test(x, i)) { parts.push({ op: op, s: tx.slice(deb, x.a) }); op = x.t; deb = x.b; }
      });
      if (mal || p !== 0) return null;
      parts.push({ op: op, s: tx.slice(deb) }); return parts;
    }
    var somme = morceauxA(function (x, i) { return (x.t === '+' || x.t === '-') && (i === 0 || !OPS[j[i - 1].t]); });
    if (somme && somme.length > 1) {
      if (!somme[0].s.trim()) somme.shift();    // signe en tête : il appartient au premier terme
      if (somme.length > 1 || somme[0].op) {
        n.k = 'somme'; n.items = somme.map(function (x) { return { signe: x.op, n: arbreTeX(x.s) }; });
        if (n.items.some(function (x) { return !x.n.cle; })) { n.k = 'atome'; delete n.items; }
        return n;
      }
    }
    var prod = morceauxA(function (x) { return x.t === '\\times' || x.t === '\\div' || x.t === '\\cdot'; });
    if (prod && prod.length > 1 && prod.every(function (x) { return x.s.trim(); })) { n.k = 'produit'; n.fac = prod.map(function (x) { return { op: x.op, n: arbreTeX(x.s) }; }); return n; }
    if (j.length === 3 && /^\\[dt]?frac$/.test(j[0].t)) { n.k = 'frac'; n.cmd = j[0].t; n.num = arbreTeX(sansAccolades(j[1].t)); n.den = arbreTeX(sansAccolades(j[2].t)); return n; }
    if (j.length === 2 && j[0].t === '\\boxed' && j[1].t[0] === '{') { n.k = 'boite'; n.c = arbreTeX(sansAccolades(j[1].t)); return n; }
    n.k = 'atome'; return n;
  }
  function texArbre(n) {
    var s;
    if (n.k === 'somme') s = n.items.map(function (x, i) { return (i || x.signe === '-' ? x.signe : '') + texArbre(x.n); }).join('');
    else if (n.k === 'produit') s = n.fac.map(function (x, i) { return (i ? x.op + ' ' : '') + texArbre(x.n); }).join('');
    else if (n.k === 'frac') s = n.cmd + '{' + texArbre(n.num) + '}{' + texArbre(n.den) + '}';
    else if (n.k === 'boite') s = '\\boxed{' + texArbre(n.c) + '}';
    else s = n.tex;
    return n.cls ? '\\class{' + n.cls.join(' ') + '}{' + s + '}' : s;
  }
  function difference(a, b, o) {                // o.a : parties de a qui changent, o.b : ce qu'elles deviennent dans b
    if (a.cle === b.cle) return;
    if (a.k === 'boite' || b.k === 'boite') return difference(a.k === 'boite' ? a.c : a, b.k === 'boite' ? b.c : b, o);
    if (a.k === 'frac' && b.k === 'frac') { difference(a.num, b.num, o); difference(a.den, b.den, o); return; }
    if (a.k === 'produit' && b.k === 'produit' && a.fac.length === b.fac.length &&
        a.fac.every(function (x, i) { return x.op === b.fac[i].op; })) { a.fac.forEach(function (x, i) { difference(x.n, b.fac[i].n, o); }); return; }
    if (a.k === 'somme' && b.k === 'somme') {
      var cle = function (x) { return (x.signe === '-' ? '-' : '+') + x.n.cle; };
      var restA = a.items.slice(), restB = [];
      b.items.forEach(function (x) { var i = restA.map(cle).indexOf(cle(x)); if (i >= 0) restA.splice(i, 1); else restB.push(x); });
      if (restA.length === 1 && restB.length === 1) difference(restA[0].n, restB[0].n, o);
      else { restA.forEach(function (x) { o.a.push(x.n); }); restB.forEach(function (x) { o.b.push(x.n); }); }
      return;
    }
    o.a.push(a); o.b.push(b);
  }
  function racineUtile(n) { return n.k === 'boite' ? n.c : n; }
  function marquer(a, b, classe) {              // vrai si une partie seulement change : on la surligne
    var o = { a: [], b: [] }; difference(a, b, o);
    if (!o.a.length || !o.b.length) return false;
    var ra = racineUtile(a), rb = racineUtile(b);
    if (o.a.indexOf(ra) >= 0 || o.b.indexOf(rb) >= 0) return false;
    if (ra.k === 'somme' && ra.items.every(function (x) { return o.a.indexOf(x.n) >= 0; })) return false;
    o.a.concat(o.b).forEach(function (n) { (n.cls = n.cls || []).push('qv-c', classe); });
    return true;
  }
  function Chaine(ajouter, trans) { this.aj = ajouter; this.trans = trans; this.prec = null; this.attente = null; this.membres = []; }
  Chaine.prototype.preparer = function (tex) {  // AVANT de prendre l'étape du membre : l'étape « on surligne » vient d'abord
    var n = arbreTeX(tex), t = null;
    if (this.prec) {
      var id = this.trans.length;
      if (marquer(this.prec.n, n, 'qv-t' + id)) { t = { id: id, pre: this.aj(), show: null }; this.trans.push(t); }
    }
    this.attente = { n: n, t: t };
  };
  Chaine.prototype.poser = function (span, avant, apres, k) {
    var a = this.attente; if (a.t) a.t.show = k;
    var m = { n: a.n, span: span, avant: avant || '', apres: apres || '' };
    this.membres.push(m); this.prec = m;
  };
  Chaine.prototype.rompre = function () { this.prec = null; };
  Chaine.prototype.ecrire = function (D) {
    this.membres.forEach(function (m) { m.span.innerHTML = '\\(' + (D || '') + m.avant + texArbre(m.n) + m.apres + '\\)'; });
  };
  function membresEgalite(m) {                  // « A=B=C » → [{tex:'A', apres:'=\;'}, …] ; un « = » en tête passe au membre suivant
    var t = couper(m, function (u) { return u === '='; }), r = [], report = '';
    t.forEach(function (x, i) {
      var der = i === t.length - 1;
      if (!x.trim() && !der) { report += '=\\;'; return; }
      r.push({ tex: x, avant: report, apres: der ? '' : '=\\;' }); report = '';
    });
    return r;
  }

  function morceau(parent, html, k, classe) {
    var s = el('span', 'qv-e' + (classe ? ' ' + classe : ''), html); s.dataset.e = k; parent.appendChild(s); return s;
  }
  function etapesParagraphe(html, ajouter, trans) {
    var p = el('p', 'qv-p'), re = /\\\(([\s\S]*?)\\\)/g, m, dernier = 0, jetons = [];
    while ((m = re.exec(html))) { if (m.index > dernier) jetons.push({ t: html.slice(dernier, m.index) }); jetons.push({ m: m[1] }); dernier = re.lastIndex; }
    if (dernier < html.length) jetons.push({ t: html.slice(dernier) });
    var cur = null, avecMaths = false;
    function nouvelle() { cur = morceau(p, '', ajouter()); avecMaths = false; }
    jetons.forEach(function (j) {
      if (j.t != null) {
        var cad = cur && /^\s*c-à-d/.test(j.t);
        if (cad) p.appendChild(el('br'));            // une ligne « c-à-d » à la fois (charte § 3)
        if (!cur || cad || (avecMaths && MOTS.test(j.t))) nouvelle();
        cur.insertAdjacentHTML('beforeend', cad ? j.t.replace(/^\s+/, '') : j.t);
      } else {
        var membres = membresEgalite(j.m), ch = new Chaine(ajouter, trans);
        membres.forEach(function (x, i) {
          if (!x.tex.trim()) return;
          ch.preparer(x.tex);
          if (!cur || i > 0) nouvelle();
          var sm = el('span'); cur.appendChild(sm); ch.poser(sm, x.avant, x.apres, +cur.dataset.e);
        });
        ch.ecrire();
        // seul un CALCUL (égalité, résultat encadré) clôt l'étape ; un nom (« ABC », « B », « 5x ») reste dans la phrase
        if (membres.length > 1 || /\\boxed/.test(j.m)) avecMaths = true;
      }
    });
    return p;
  }
  function etapesAligne(tex, ajouter, trans) {
    var g = el('div', 'qv-al'), ch = new Chaine(ajouter, trans), D = '\\displaystyle ';
    couper(tex, function (u) { return u === '\\\\'; }).forEach(function (ligne) {
      ligne = ligne.replace(/^\s*\[[^\]]*\]/, '');
      if (!ligne.trim()) return;
      var cols = couper(ligne, function (u) { return u === '&'; });
      var gauche = el('span', 'qv-g'), droite = el('span', 'qv-d' + (cols.length > 1 ? '' : ' plein'));
      if (cols.length > 1) g.appendChild(gauche);
      g.appendChild(droite);
      var lhs = cols.length > 1 ? cols[0] : '', rhs = cols.length > 1 ? cols.slice(1).join('\\quad ') : cols[0];
      var m = rhs.match(REL), rel = m ? m[1] : '', reste = m ? rhs.slice(m[0].length) : rhs, k = null, sp;
      if (lhs.trim() || rel !== '=') ch.rompre();       // nouvelle expression, ou relation qui n'est pas une égalité
      if (lhs.trim()) { ch.preparer(lhs); k = ajouter(); sp = morceau(gauche, '', k); ch.poser(sp, '', '', k); }
      var membres = membresEgalite(reste).filter(function (x) { return x.tex.trim(); });
      if (rel) {
        if (k == null) { if (membres.length) ch.preparer(membres[0].tex); k = ajouter(); }
        morceau(droite, '\\(' + D + '\\;' + rel + '\\;\\)', k, 'qv-rel');
      }
      var suite = !lhs.trim() && k != null;           // « &= … » : le « = » vient avec ce qui le suit
      membres.forEach(function (x, i) {
        if (!(suite && i === 0)) { ch.preparer(x.tex); k = ajouter(); }
        sp = morceau(droite, '', k); ch.poser(sp, x.avant, x.apres, k);
      });
    });
    ch.ecrire(D);
    return g;
  }
  function tableauCorrection(q, ajouter) {      // le tableau attendu, tracé pas à pas (ligne des x, puis chaque intervalle)
    var vari = q.type === 'variations', b = q.bornes || [-Infinity, Infinity], xs = [b[0]].concat(q.valeurs, [b[1]]), n = q.valeurs.length;
    var cadre = el('div', 'quiz-tab-cadre qv-tab-cadre'), t = el('div', 'quiz-tab qv-tab' + (vari ? ' quiz-var' : ''));
    var cols = ['max-content'];
    for (var c = 0; c < 2 * n + 3; c++) cols.push(c % 2 === 0 ? 'auto' : 'minmax(1.8em, 1fr)');
    t.style.gridTemplateColumns = cols.join(' ');
    function cellule(cls, html, k, clsE) {
      var c = el('div', 'tcell ' + cls);
      if (html != null) { var e = el('span', 'qv-e' + (clsE ? ' ' + clsE : ''), html); e.dataset.e = k; c.appendChild(e); }
      t.appendChild(c); return c;
    }
    var k1 = ajouter(), i, k;
    cellule('tlab tx', '\\(x\\)', k1);
    xs.forEach(function (x, j) { cellule('tx tval', '\\(' + nombreTeX(x) + '\\)', k1); if (j < xs.length - 1) cellule('tx tint', null); });
    cellule('tlab', vari ? (q.label || 'variation de \\(f\\)') : q.ligne.label, k1);
    if (vari) {
      var pos = function (j) { var L = q.fleches[j - 1], R = q.fleches[j]; return L === '↗' || R === '↘' ? 'haut' : L === '↘' || R === '↗' ? 'bas' : 'milieu'; };
      k = ajouter();                                // l'image de la première valeur, puis une flèche et son image par clic
      for (i = 0; i < xs.length; i++) {
        var im = q.images[i];
        cellule('tval timg', im == null ? null : '\\(' + nombreTeX(im) + '\\)', k).dataset.pos = pos(i);
        if (i < xs.length - 1) { k = ajouter(); cellule('tint', flecheLongue(q.fleches[i]), k, 'qv-fleche'); }
      }
    } else {
      var kt = ajouter();                           // les traits (0, double barre) d'abord, puis un signe par clic
      cellule('tval tvide', null);
      for (i = 0; i <= n; i++) {
        cellule('tint', '\\(' + (q.ligne.signes[i] === '−' ? '-' : '+') + '\\)', ajouter(), 'qv-signe');
        if (i < n) {
          var tc = cellule('tval ttrait', null), tr = el('div', 'trait-choix qv-e', '<span>0</span>');
          tr.dataset.t = q.ligne.traits[i]; tr.dataset.touche = '1'; tr.dataset.e = kt; tc.appendChild(tr);
        }
      }
      cellule('tval tvide', null);
    }
    cadre.appendChild(t); return cadre;
  }
  function construireEtapes(q) {
    var racine = el('div', 'qv-etapes'), n = 0, trans = [];
    function ajouter() { return ++n; }
    if (q.figureCorrection) {                     // la lecture se montre sur la figure (charte § 5)
      var f = el('figure', 'qv-fig qv-e'), im = el('img'); im.src = q.figureCorrection; im.alt = 'Figure de la correction'; im.decoding = 'async';
      f.appendChild(im); f.dataset.e = ajouter(); racine.appendChild(f);
    }
    var html = q.correction || '', re = /<p>([\s\S]*?)<\/p>|\\\[([\s\S]*?)\\\]/g, m, dernier = 0;
    function libre(t) { t = t.trim(); if (t) { var b = el('div', 'qv-p'); morceau(b, t, ajouter()); racine.appendChild(b); } }
    while ((m = re.exec(html))) {
      libre(html.slice(dernier, m.index));
      if (m[1] != null) racine.appendChild(etapesParagraphe(m[1], ajouter, trans));
      else {
        var a = m[2].match(/^\s*\\begin\{aligned\}([\s\S]*)\\end\{aligned\}\s*$/);
        if (a) racine.appendChild(etapesAligne(a[1], ajouter, trans));
        else { var b = el('div', 'qv-disp'); morceau(b, '\\[' + m[2] + '\\]', ajouter()); racine.appendChild(b); }
      }
      dernier = re.lastIndex;
    }
    libre(html.slice(dernier));
    if ((q.type === 'variations' && q.fleches) || (q.type === 'signes' && q.ligne)) {   // « trace le tableau » (M. Colin, 12 nov. 2026)
      racine.appendChild(tableauCorrection(q, ajouter));
    }
    rendre(racine);
    return { racine: racine, n: n, k: 0, trans: trans };
  }

  var volet = null;
  function voletOuvert() { return !!(volet && volet.el.classList.contains('ouvert')); }
  function bouton(classe, html, aria) { var b = el('button', classe, html); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); return b; }
  function creerVolet() {
    if (volet) return volet;
    var v = volet = { quiz: null, n: -1, e: null, minuteur: null };
    v.el = el('aside', 'quiz-volet'); v.el.setAttribute('aria-label', 'Correction animée'); v.el.setAttribute('aria-hidden', 'true'); v.el.inert = true;
    var tete = el('div', 'qv-tete');
    v.titre = el('p', 'qv-titre', 'Correction');
    var fermer = bouton('qv-fermer', '<span aria-hidden="true">×</span>', 'Fermer la correction');
    fermer.addEventListener('click', fermerVolet);
    v.compte = el('span', 'qv-compte');
    tete.appendChild(v.titre); tete.appendChild(v.compte); tete.appendChild(fermer);
    v.barre = el('div', 'qv-barre', '<span></span>');
    v.corps = el('div', 'qv-corps');
    var pied = el('div', 'qv-pied');
    v.prec = bouton('qv-rond', '<span aria-hidden="true">‹</span>', 'Étape précédente');
    v.lecture = bouton('qv-rond', '<span aria-hidden="true">▶</span>', 'Lecture automatique');
    var vide = el('span', 'qv-vide');
    v.tout = bouton('bouton secondaire petit', 'Tout afficher');
    v.suiv = bouton('bouton petit qv-suivant', 'Étape suivante <span aria-hidden="true">›</span>');
    v.prec.addEventListener('click', function () { arreterAuto(v); montrer(v, v.e.k - 1, false); });
    v.lecture.addEventListener('click', function () { if (v.minuteur) arreterAuto(v); else lancerAuto(v); });
    v.tout.addEventListener('click', function () { arreterAuto(v); montrer(v, v.e.n, true); });
    v.suiv.addEventListener('click', function () { arreterAuto(v); avancer(v, true); });
    [v.prec, v.lecture, vide, v.tout, v.suiv].forEach(function (x) { pied.appendChild(x); });
    v.el.appendChild(tete); v.el.appendChild(v.barre); v.el.appendChild(v.corps); v.el.appendChild(pied);
    document.body.appendChild(v.el);
    // l'onglet sur le côté : rouvre la correction de la question en cours une fois le volet fermé
    v.languette = bouton('quiz-languette', '<span>Correction</span>', 'Rouvrir la correction'); v.languette.hidden = true;
    v.languette.addEventListener('click', function () { var q = v.languetteQuiz; if (q) ouvrirVolet(q, q.i); });
    document.body.appendChild(v.languette);
    document.addEventListener('keydown', function (ev) {
      if (!v.el.classList.contains('ouvert')) return;
      var t = ev.target, tag = t && t.tagName;
      if (tag === 'MATH-FIELD' || tag === 'INPUT' || tag === 'TEXTAREA' || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (ev.key === 'Escape') { ev.preventDefault(); fermerVolet(); }
      else if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || (ev.key === ' ' && tag !== 'BUTTON')) { ev.preventDefault(); arreterAuto(v); avancer(v, false); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { ev.preventDefault(); arreterAuto(v); montrer(v, v.e.k - 1, false); }
    });
    // quitter le quiz (« ‹ Première », changement d'onglet) ferme le volet et range l'onglet
    document.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('[data-retour], [role=tab]')) { fermerVolet(); v.languette.hidden = true; }
    });
    return v;
  }
  function montrer(v, k, anime) {               // affiche les étapes 1…k (jamais moins d'une)
    var et = v.e; et.k = Math.max(Math.min(1, et.n), Math.min(et.n, k));
    var neufs = [];
    Array.prototype.forEach.call(et.racine.querySelectorAll('.qv-e'), function (x) {
      var i = +x.dataset.e;
      x.classList.toggle('vu', i <= et.k);
      x.classList.remove('neuf');
      if (anime && i === et.k) neufs.push(x);
    });
    neufs.forEach(function (x) { void x.offsetWidth; x.classList.add('neuf'); });
    // surlignages : allumés de l'étape « on surligne » jusqu'à l'apparition du résultat, éteints ensuite
    Array.prototype.forEach.call(et.racine.querySelectorAll('.qv-c'), function (x) { x.classList.remove('allume', 'c0', 'c1', 'c2'); });
    (et.trans || []).forEach(function (t) {
      if (et.k < t.pre || et.k > t.show) return;
      Array.prototype.forEach.call(et.racine.querySelectorAll('.qv-t' + t.id), function (x) { x.classList.add('allume', 'c' + (t.id % 3)); });
    });
    var der = neufs[neufs.length - 1];
    if (der) {                                    // garder la dernière étape à l'écran, sans faire défiler la page
      var r = der.getBoundingClientRect(), c = v.corps.getBoundingClientRect();
      if (r.bottom > c.bottom - 12) v.corps.scrollBy({ top: r.bottom - c.bottom + 28, behavior: 'smooth' });
      else if (r.top < c.top) v.corps.scrollBy({ top: r.top - c.top - 16, behavior: 'smooth' });
    }
    majPied(v);
  }
  function majPied(v) {
    var et = v.e, fini = et.k >= et.n, total = v.quiz.cartes.length;
    v.barre.firstChild.style.width = (et.n ? 100 * et.k / et.n : 100) + '%';
    v.compte.textContent = 'Étape ' + et.k + ' / ' + et.n;
    v.prec.disabled = et.k <= 1;
    v.tout.hidden = fini; v.lecture.hidden = fini;
    v.suiv.innerHTML = fini ? (v.n + 1 < total ? 'Question suivante' : 'Voir le bilan') + ' <span aria-hidden="true">›</span>' : 'Étape suivante <span aria-hidden="true">›</span>';
    v.suiv.classList.toggle('fin', fini);
    v.lecture.innerHTML = v.minuteur ? '<span aria-hidden="true">❚❚</span>' : '<span aria-hidden="true">▶</span>';
    v.lecture.setAttribute('aria-label', v.minuteur ? 'Mettre en pause' : 'Lecture automatique');
  }
  function avancer(v, auBout) {
    if (v.e.k < v.e.n) { montrer(v, v.e.k + 1, true); return; }
    if (!auBout) return;                          // le bouton seul passe à la question suivante
    var q = v.quiz, n = v.n; fermerVolet(); q.suivante(n);
  }
  function lancerAuto(v) {
    if (v.e.k >= v.e.n) return;
    v.minuteur = setInterval(function () { if (v.e.k < v.e.n) montrer(v, v.e.k + 1, true); if (v.e.k >= v.e.n) arreterAuto(v); }, 1700);
    montrer(v, v.e.k + 1, true);
    if (v.e.k >= v.e.n) arreterAuto(v);
  }
  function arreterAuto(v) { if (v.minuteur) { clearInterval(v.minuteur); v.minuteur = null; if (v.e) majPied(v); } }
  function ouvrirVolet(quiz, n) {
    var v = creerVolet(), c = quiz.cartes[n], q = c._q;
    arreterAuto(v);
    if (!c._etapes) c._etapes = construireEtapes(q);
    if (!c._rappel) {                             // rappel de la question (affiché sur téléphone, où le volet la recouvre)
      var d = el('details', 'qv-rappel'), s = el('summary', '', 'Rappel de la question'), z = el('div', 'qv-rappel-texte', q.enonce + (q.enonceApres || ''));
      if (q.figure) { var fi = el('figure', 'quiz-figure'), im = el('img'); im.src = q.figure; im.alt = q.figureAlt || 'Figure de la question'; fi.appendChild(im); z.appendChild(fi); }
      d.appendChild(s); d.appendChild(z); rendre(z); c._rappel = d;
    }
    v.quiz = quiz; v.n = n; v.e = c._etapes;
    v.titre.innerHTML = 'Correction <span class="qv-num">· question ' + (n + 1) + '</span>';
    v.corps.innerHTML = ''; v.corps.appendChild(c._rappel); v.corps.appendChild(v.e.racine); v.corps.scrollTop = 0;
    v.el.classList.add('ouvert'); v.el.setAttribute('aria-hidden', 'false'); v.el.inert = false;
    document.body.classList.add('volet-ouvert');
    v.languette.hidden = true;
    if (window.mathVirtualKeyboard) try { window.mathVirtualKeyboard.hide(); } catch (e) {}
    if (v.e.k === 0) montrer(v, 1, true); else montrer(v, v.e.k, false);
    if (window.matchMedia && window.matchMedia('(max-width: 999px)').matches) {
      // téléphone : la feuille monte par le bas ; on remonte la question juste sous les barres collées en haut
      var haut = 0;
      Array.prototype.forEach.call(document.querySelectorAll('#nav, .outils'), function (b) {
        var st = getComputedStyle(b).position; if (st === 'sticky' || st === 'fixed') haut = Math.max(haut, b.getBoundingClientRect().bottom);
      });
      var cible = c.querySelector('.quiz-num') || c;
      setTimeout(function () { window.scrollTo({ top: window.scrollY + cible.getBoundingClientRect().top - haut - 10, behavior: 'smooth' }); }, 30);
    }
    setTimeout(function () { try { v.suiv.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function fermerVolet() {
    if (!volet || !volet.el.classList.contains('ouvert')) return;
    arreterAuto(volet);
    var dedans = volet.el.contains(document.activeElement);
    volet.el.classList.remove('ouvert'); volet.el.setAttribute('aria-hidden', 'true'); volet.el.inert = true;
    document.body.classList.remove('volet-ouvert');
    if (volet.quiz) {
      majLanguette(volet.quiz);
      var c = volet.quiz.cartes[volet.n];
      if (dedans && c && !c.hidden) try { (c._bn.hidden ? c._bv : c._bn).focus({ preventScroll: true }); } catch (e) {}
    }
  }
  function majLanguette(quiz) {
    if (!volet) return;                           // l'onglet n'existe qu'après une première correction
    var c = quiz.cartes[quiz.i];
    var ok = quiz.fin.hidden && c && !c.hidden && quiz.etat[quiz.i].vue && !volet.el.classList.contains('ouvert') && quiz.racine.getClientRects().length > 0;
    volet.languette.hidden = !ok; volet.languetteQuiz = quiz;
  }

  /* ======================= 5 ter. Réglages d'un quiz à thèmes ======================= */
  /* window.QUIZ_CONFIG[id] = { etiquette, titre, sousTitre, themes: [id de QUIZ…], choix: [10, 20…], defaut: 20 }.
     Écran de départ : nombre de questions, thèmes (tous cochés par défaut), bouton « Lancer le quiz ». */
  function Reglages(racine, cfg) {
    this.racine = racine; this.cfg = cfg;
    this.n = cfg.defaut || 20;
    this.coches = {}; var self = this;
    cfg.themes.forEach(function (id) { self.coches[id] = true; });
    this.afficher();
  }
  Reglages.prototype.banque = function (id) { var d = (window.QUIZ || {})[id]; return d ? d.questions.length : 0; };
  Reglages.prototype.afficher = function () {
    var self = this, cfg = this.cfg, r = this.racine;
    fermerVolet(); if (volet) volet.languette.hidden = true;
    r.innerHTML = '';
    var tete = el('div', 'quiz-tete');
    tete.appendChild(el('div', 'quiz-titres', '<span class="quiz-etiquette">' + cfg.etiquette + '</span><h2>' + cfg.titre + '</h2>' +
      '<p class="quiz-sous-titre">' + (cfg.sousTitre || 'Choisis le nombre de questions et les thèmes, puis lance le quiz.') + '</p>'));
    r.appendChild(tete);
    var carte = el('section', 'quiz-carte quiz-reglages');
    // nombre de questions
    var f1 = el('fieldset', 'qr-bloc'); f1.appendChild(el('legend', '', 'Nombre de questions'));
    var nb = el('div', 'qr-nombres');
    (cfg.choix || [10, 20, 30, 40]).forEach(function (k) {
      var l = el('label', 'qr-nombre'), i = el('input'); i.type = 'radio'; i.name = 'qr-n-' + (cfg.id || 'quiz'); i.value = k; i.checked = k === self.n;
      i.addEventListener('change', function () { self.n = k; self.maj(); });
      l.appendChild(i); l.appendChild(el('span', '', String(k))); nb.appendChild(l);
    });
    f1.appendChild(nb); carte.appendChild(f1);
    // thèmes
    var f2 = el('fieldset', 'qr-bloc'); var lg = el('legend', 'qr-legende', '<span>Thèmes abordés</span>'); f2.appendChild(lg);
    this.bTout = bouton('qr-tout', 'Tout décocher');
    this.bTout.addEventListener('click', function () {
      var tous = cfg.themes.every(function (id) { return self.coches[id]; });
      cfg.themes.forEach(function (id) { self.coches[id] = !tous; });
      self.cases.forEach(function (x) { x.checked = !tous; });
      self.maj();
    });
    lg.appendChild(this.bTout);
    var liste = el('div', 'qr-themes'); this.cases = [];
    cfg.themes.forEach(function (id) {
      var d = (window.QUIZ || {})[id]; if (!d) return;
      var l = el('label', 'qr-theme'), i = el('input'); i.type = 'checkbox'; i.checked = !!self.coches[id]; i.value = id;
      i.addEventListener('change', function () { self.coches[id] = i.checked; self.maj(); });
      l.appendChild(i);
      l.appendChild(el('span', 'qr-case', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>'));
      l.appendChild(el('span', 'qr-nom', (cfg.noms && cfg.noms[id]) || d.titre));
      l.appendChild(el('span', 'qr-taille', self.banque(id) + ' questions'));
      liste.appendChild(l); self.cases.push(i);
    });
    f2.appendChild(liste); carte.appendChild(f2);
    this.resume = el('p', 'qr-resume'); this.resume.setAttribute('aria-live', 'polite'); carte.appendChild(this.resume);
    var a = el('div', 'quiz-actions');
    this.bLancer = bouton('bouton qr-lancer', 'Lancer le quiz <span aria-hidden="true">›</span>');
    this.bLancer.addEventListener('click', function () { self.lancer(); });
    a.appendChild(this.bLancer); carte.appendChild(a);
    r.appendChild(carte);
    this.maj();
  };
  Reglages.prototype.choisis = function () { var self = this; return this.cfg.themes.filter(function (id) { return self.coches[id] && (window.QUIZ || {})[id]; }); };
  Reglages.prototype.maj = function () {
    var self = this, ch = this.choisis(), dispo = ch.reduce(function (s, id) { return s + self.banque(id); }, 0);
    var tous = ch.length === this.cfg.themes.length;
    this.bTout.textContent = tous ? 'Tout décocher' : 'Tout cocher';
    this.bLancer.disabled = !ch.length;
    this.resume.classList.toggle('alerte', !ch.length);
    this.resume.innerHTML = !ch.length ? 'Coche au moins un thème.'
      : '<strong>' + Math.min(this.n, dispo) + ' questions</strong> tirées au hasard parmi ' + dispo +
        (tous ? ', dans tous les thèmes.' : ', dans ' + (ch.length === 1 ? 'le thème choisi.' : 'les ' + ch.length + ' thèmes choisis.')) +
        (this.n > dispo ? ' (Il n’y en a pas davantage.)' : '');
  };
  Reglages.prototype.lancer = function () {
    var self = this, ch = this.choisis(); if (!ch.length) return;
    var dispo = ch.reduce(function (s, id) { return s + self.banque(id); }, 0), n = Math.min(this.n, dispo);
    var tous = ch.length === this.cfg.themes.length;
    var def = { etiquette: this.cfg.etiquette, titre: this.cfg.titre,
      sousTitre: n + ' questions tirées au hasard' + (tous ? ' dans tous les thèmes' : ch.length === 1 ? ' : ' + ((this.cfg.noms && this.cfg.noms[ch[0]]) || window.QUIZ[ch[0]].titre).toLowerCase() : ' dans ' + ch.length + ' thèmes') + ', nouveau tirage à chaque essai.',
      tirage: { depuis: ch, n: n, ordre: 'banque' }, questions: [] };
    this.quiz = new Quiz(this.racine, def, { reglages: function () { self.afficher(); self.racine.scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
    this.racine.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  /* ======================= 6. Démarrage ======================= */
  function compter(def) {                     // taille de la banque d'un quiz (avec tirage : toutes les questions possibles)
    if (!def.tirage || !def.tirage.depuis) return def.questions.length;
    return def.tirage.depuis.reduce(function (n, id) { var d = (window.QUIZ || {})[id]; return n + (d ? d.questions.length : 0); }, 0);
  }
  function majTuiles() {                       // « 20 questions au hasard parmi 73 » : calculé, jamais écrit à la main
    Array.prototype.forEach.call(document.querySelectorAll('.ch-tuile[data-ouvre]'), function (t) {
      var bloc = document.getElementById(t.dataset.ouvre), c = t.querySelector('.ch-tuile-compte');
      var rc = bloc && bloc.querySelector('.quiz[data-quiz-config]'), cfg = rc && (window.QUIZ_CONFIG || {})[rc.dataset.quizConfig];
      if (cfg && c) {                            // quiz à thèmes : taille totale de la banque
        var tot = cfg.themes.reduce(function (s, id) { var d = (window.QUIZ || {})[id]; return s + (d ? d.questions.length : 0); }, 0);
        c.textContent = tot + ' questions · ' + cfg.themes.length + ' thèmes';
        return;
      }
      var r = bloc && bloc.querySelector('.quiz[data-quiz]');
      var def = r && (window.QUIZ || {})[r.dataset.quiz];
      if (!def || !c) return;
      var n = compter(def);
      c.textContent = def.tirage ? Math.min(def.tirage.n || 20, n) + ' questions au hasard parmi ' + n : n + ' questions';
    });
  }
  function demarrer() {
    majTuiles();
    var quiz = document.querySelectorAll('.quiz[data-quiz], .quiz[data-quiz-config]');
    if (!quiz.length) return;
    preparerMathLive().then(function () {
      // un champ MathLive créé dans un bloc masqué ne prend pas le focus : on construit le quiz quand il devient visible
      Array.prototype.forEach.call(quiz, function (r) {
        var cfg = r.dataset.quizConfig && (window.QUIZ_CONFIG || {})[r.dataset.quizConfig];
        var def = !cfg && (window.QUIZ || {})[r.dataset.quiz];
        if (!def && !cfg) return;
        if (cfg) cfg.id = r.dataset.quizConfig;
        function lancer() { if (r._quiz) return; r._quiz = cfg ? new Reglages(r, cfg) : new Quiz(r, def); }
        if (r.getClientRects().length) { lancer(); return; }
        if (!window.ResizeObserver) { lancer(); return; }
        var ro = new ResizeObserver(function () { if (r.getClientRects().length) { ro.disconnect(); lancer(); } });
        ro.observe(r);
      });
    });
  }
  window.ColineaireQuiz = {
    analyser: analyser, evaluer: evaluer, verifierExpr: verifierExpr, verifierCases: verifierCases, verifierEnsemble: verifierEnsemble,
    verifierIntervalles: verifierIntervalles, verifierComparer: verifierComparer, verifierTableau: verifierTableau, verifierRepere: verifierRepere,
    lireIntervalles: lireIntervalles, FORMES: FORMES,
    // pour les tests : monter un quiz sans tuile, découper une correction en étapes
    monter: function (r, def, opts) { return (r._quiz = new Quiz(r, def, opts)); }, etapes: construireEtapes
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
