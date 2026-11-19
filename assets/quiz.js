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
   Types des quiz de chapitre (1ère CH03, 14 nov. 2026 ; format : docs/quiz/1ere-ch03/CONTRAT.md de l'atelier) :
     - 'qcm'         : propositions en cartes (une bonne réponse, ou plusieurs avec « bonnes »), mélangées
     - 'vf'          : vrai / faux, une seule tentative
     - 'associer'    : une ligne par élément de gauche, les choix de droite en pastilles
     - 'tableau'     : tableau à double entrée à remplir (option « totaux »)
     - 'arbre'       : arbre pondéré à compléter, dessiné par le moteur
     - 'exercice'    : plusieurs questions (« parties ») sur un même énoncé, un seul bouton Valider
   Toute question peut montrer un arbre ou un tableau en lecture seule (champs « arbre », « tableau ») ; dans une
   correction, <!--cours:clé--> montre une capture du cours (window.QUIZ_COURS) et <!--v:k--> écrit la valeur de la
   case k dans l'arbre / le tableau dessiné en tête de la correction.
   Option d'un quiz : tirage { depuis: [identifiants], n } → n questions tirées au hasard à chaque essai, posées dans un
   ordre au hasard (thèmes mélangés) ; avec ordre: 'banque', elles sont remises dans l'ordre des banques.
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
      return chiffre(c) || /^[a-zA-Z]$/.test(c) || c === '(' || c === '[' || c === '{' ||
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
      if (c === '[') {          // crochets tapés par l'élève ([a − b][a + b]) : lus comme des parenthèses (15 nov. 2026)
        prendre(); var eb = expression();
        if (voir() === ']') prendre(); else if (voir() !== '}' && voir() !== undefined && voir() !== '=') throw new Erreur('lecture');
        return { t: 'par', a: eb };
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
    factorise: function (n, x, q) { return raisonFacto(n, x, true, q && q.facteursReduits) === ''; },    // factorisé AU MAXIMUM
    factorisee: function (n, x, q) { return raisonFacto(n, x, false, q && q.facteursReduits) === ''; },  // factorisé ; un entier commun peut rester dans un facteur
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
  /* Forme factorisée : '' si n convient, sinon la raison.
     Pour TOUS les quiz : 'produit' (pas un produit), 'un' (facteur numérique 1 ou −1 : « 1(x² − 100) » n'est pas une
     factorisation), 'x' (x encore en facteur dans un facteur), 'entier' (strict seulement : un entier commun reste dans un
     facteur, 2(2x + 4)) — et, dans verifierExpr, une réponse qui a MOINS de facteurs non constants que l'attendu
     (« 4(9x² + 6x + 1) » pour (6x + 2)²) n'est pas factorisée (15 nov. 2026).
     Option de question facteursReduits (quiz de Seconde CH03, 14 nov. 2026) : de plus 'reduire' (un facteur non réduit :
     parenthèses ou termes semblables à l'intérieur, ou plusieurs facteurs numériques) et 'regrouper' (plusieurs facteurs numériques ou
     puissances de x en plusieurs facteurs : 2 × 2(2x − 3), 3x × x(2x − 3)). Avec strict = false (forme 'factorisee'), (3x − 4)(3x + 6) est accepté comme
     3(3x − 4)(x + 2), comme dans les corrections de Seconde (« (4x + 12)(2x + 2) » du cours). */
  function contientSomme(m) {                // une somme à l'intérieur (pas dans une fraction ni une fonction)
    if (!m || typeof m !== 'object' || m.t === '/' || m.t === 'fn') return false;
    if (m.t === '+' || m.t === '-') return true;
    return contientSomme(m.a) || contientSomme(m.b);
  }
  function aplatirProduit(n) {
    var facteurs = [];
    (function aplatir(m) { m = sansSigne(m); if (m.t === '*') { aplatir(m.a); aplatir(m.b); } else facteurs.push(m.t === '^' ? sansParentheses(m.a) : m); })(n);
    return facteurs;
  }
  function raisonFacto(n, x, strict, reduits) {
    if (!FORMES.produit(n)) return 'produit';
    var facteurs = aplatirProduit(n), nombres = 0, puissX = 0;
    function coef(m) {                       // coefficient entier d'un monôme simple, sinon null
      if (estNombre(m)) return estEntier(m) ? Math.abs(evaluer(m, {})) : null;
      if (m.t === 'var' || m.t === '^') return 1;
      if (m.t === '*' && estNombre(m.a)) return estEntier(m.a) ? Math.abs(evaluer(m.a, {})) : null;
      return null;
    }
    for (var i = 0; i < facteurs.length; i++) {
      var f = sansSigne(facteurs[i]);
      if (estConstante(f)) {
        if (Math.abs(evaluer(f, {})) === 1) return 'un';
        nombres++; continue;
      }
      if (f.t === 'var' && f.n === x) puissX++;
      var ts = termes(f, 1);
      if (ts.length < 2) { if (reduits && contientSomme(f)) return 'reduire'; continue; }
      if (reduits && ts.some(function (t) { return contientSomme(t.n); })) return 'reduire';
      var degs = ts.map(function (t) { return degreMonome(t.n, x); }), vus = {};
      if (reduits) for (var j = 0; j < degs.length; j++) { if (degs[j] < 0) continue; if (vus[degs[j]]) return 'reduire'; vus[degs[j]] = true; }
      if (degs.some(function (d) { return d < 0; })) continue;
      if (Math.min.apply(null, degs) >= 1) return 'x';
      if (strict) {
        var cs = ts.map(function (t) { return coef(t.n); });
        if (cs.every(function (c) { return c !== null; }) && cs.reduce(pgcd) > 1) return 'entier';
      }
    }
    if (reduits && puissX > 1) return 'regrouper';
    if (reduits && nombres > 1) return 'regrouperN';      // 2 × 2(2x − 3) : seulement des nombres à regrouper
    return '';
  }
  function nbFacteurs(n) {                   // facteurs non constants, multiplicités comprises : (x − 5)² en compte 2
    n = sansSigne(n);
    if (n.t === '*') return nbFacteurs(n.a) + nbFacteurs(n.b);
    if (n.t === '^' && estEntier(n.b) && evaluer(n.b, {}) >= 1) return evaluer(n.b, {}) * nbFacteurs(n.a);
    if (n.t === '/' && estConstante(n.b)) return nbFacteurs(n.a);
    return estConstante(n) ? 0 : 1;
  }
  function canon(n) {                        // écriture d'une expression (pour reconnaître un piège de FORME écrit tel quel)
    switch (n.t) {
      case 'num': return String(n.v);
      case 'var': return n.n;
      case 'par': return canon(n.a);
      case 'neg': return '-' + canon(n.a);
      case 'fn': return n.nom + '(' + canon(n.a) + ')';
      case '=': return canon(n.a) + '=' + canon(n.b);
      default: return '(' + canon(n.a) + n.t + canon(n.b) + ')';
    }
  }
  function piegeForme(q, expr) {             // réponse égale mais mal écrite, prévue comme piège : son message
    if (!q.pieges) return '';
    var c = canon(expr);
    for (var i = 0; i < q.pieges.length; i++) {
      try { if (canon(lireTeX(q, q.pieges[i].si)) === c) return q.pieges[i].msg; } catch (e) {}
    }
    return '';
  }
  var MSG_FORME = {
    polynome: 'Le résultat est juste, mais l’expression n’est pas complètement développée et réduite.',
    affine: 'C’est la bonne droite, mais l’équation n’est pas sous la forme réduite y = mx + p.',
    puissance: 'C’est égal, mais on peut encore simplifier : une seule puissance.',
    produit: 'C’est égal, mais ce n’est pas une forme factorisée : on attend un produit.',
    factorise: 'C’est égal, mais ce n’est pas factorisé au maximum : un des facteurs se factorise encore.',
    factorisee: 'C’est égal, mais un des facteurs se factorise encore (x est encore en facteur).',
    reduire: 'C’est égal, mais chaque facteur doit être réduit : plus de parenthèses ni de termes semblables à l’intérieur d’un facteur.',
    regrouper: 'C’est égal, mais regroupe le coefficient et les puissances de x en un seul facteur (3x² et non 3x × x).',
    un: 'C’est égal, mais un facteur 1 (ou −1) ne factorise rien : il faut un vrai produit de facteurs.',
    pasfacto: 'C’est égal, mais ce n’est pas encore factorisé : un des facteurs se factorise encore.',
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
  /* Suites (quiz TERM CH02, 18 nov. 2026) : avec l'option entiers d'une question (ou d'une case), la variable est un
     ENTIER naturel (n) : l'égalité est testée en n = 0, 1, …, 9 et 12 ((−2)ⁿ n'a pas de sens en n = 1,7 ; une valeur
     interdite, 1/n en 0, est sautée). Sans l'option, rien ne change. */
  var ESSAIS_N = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12];
  function listeVars(q) { var v = q.variable; return v == null ? [] : (Array.isArray(v) ? v : [v]); }
  function equivalentes(a, b, vars, positifs, entiers) {
    var ok = 0, E = entiers ? ESSAIS_N : positifs ? ESSAIS_POS : ESSAIS;
    for (var i = 0; i < E.length; i++) {
      var env = {};
      vars.forEach(function (v, j) { env[v] = entiers ? E[i] : E[(i + 3 * j) % E.length] + 0.11 * j; });
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

  /* Nombre e (quiz TERM CH05, 16 nov. 2026) : avec l'option nombreE d'une question (ou d'une case), la lettre e tapée
     par l'élève (clavier de l'ordinateur, onglet abc) est le nombre d'Euler, comme la touche e^□ de l'onglet f(x)
     (\mathrm{e}) ; sans l'option, rien ne change (e reste une lettre). */
  function avecE(n) {
    if (!n || typeof n !== 'object') return n;
    if (n.t === 'var' && n.n === 'e') return { t: 'num', v: Math.E, cst: 'e' };
    var c = {}; for (var x in n) c[x] = (x === 'a' || x === 'b') ? avecE(n[x]) : n[x];
    return c;
  }
  function lireTeX(q, latex) { var a = analyser(latex); return q && q.nombreE ? avecE(a) : a; }
  /* Réponse en toutes lettres « aucun » (quiz TERM CH05 : « s'il n'y a pas de point d'inflexion, écrire aucun ») :
     question avec l'option aucun: true, ou attendu: 'aucun'. Le mot tapé (lettres, \text{…}, \mathrm{…}) est reconnu. */
  function motTape(latex) {
    var t = String(latex || '').replace(/\\(text|mathrm|textrm|operatorname|mathit)\s*/g, '').replace(/\\[,;:! ]|~|\s|[{}]/g, '');
    return /^[a-zA-ZÀ-ÿ]{3,}$/.test(t) ? t.toLowerCase() : '';
  }
  /* « aucune » (quiz TERM CH02, 18 nov. 2026 : « si la suite est géométrique, donner sa raison, sinon écrire aucune ») :
     attendu 'aucune' accepté comme 'aucun' ; aucun: 'aucune' (une chaîne) donne le mot des messages et le bouton « Aucune »
     sous le cadre (boutonAucun). */
  function motAucun(q) { return typeof q.aucun === 'string' ? q.aucun : /^aucune$/.test(String(q.attendu).trim()) ? 'aucune' : 'aucun'; }
  function verifierAucun(q, latex) {           // null : la question n'attend pas de mot ; sinon le résultat
    var attAucun = /^aucune?$/.test(String(q.attendu).trim()), lire = 'Écris un nombre, ou le mot « ' + motAucun(q) + ' ».';
    if (!q.aucun && !attAucun) return null;
    if (q.gauche) latex = String(latex || '').replace(new RegExp('^\\s*' + q.gauche + '\\s*=\\s*'), '');   // « x = aucun » (TERM CH05, 17 nov. 2026)
    var mot = motTape(latex);
    if (/^aucune?s?$/.test(mot)) return attAucun ? { etat: 'juste' } : { etat: 'faux', msg: q.indiceAucun || q.indiceFaux || '' };
    if (mot) return { etat: 'lecture', msg: lire };
    if (!attAucun) return null;
    try { lireTeX(q, nettoyer(q, latex)); } catch (e) { return { etat: 'lecture', msg: e.message === 'vide' ? lire : 'Je n’arrive pas à lire cette écriture.' }; }
    return { etat: 'faux', msg: q.indiceFaux || '' };
  }
  /* LIMITE d'une suite (quiz TERM CH02, 18 nov. 2026) : option limite: true d'une question « expr » (ou d'une case).
     L'élève tape +∞ ou −∞ (onglet ≤∈ℝ, ou « + » / « − » puis ∞), un nombre (forme de la question, « reduit » par défaut),
     ou le mot « aucune » si la suite n'a pas de limite (option aucun, ou attendu: 'aucune'). Messages : ∞ sans signe et
     calcul avec ∞ (gris, rien n'est jugé) ; mauvais signe de l'infini (indiceSigne) ; « aucune » alors que la suite a une
     limite (indiceAucun) ; valeur approchée d'une limite exacte ; les pièges valent aussi pour +∞ / −∞ (si: '+\\infty'). */
  var INF_P = { t: 'num', v: Infinity, infini: true }, INF_M = { t: 'neg', a: INF_P };
  function verifierLimite(q, latex) {
    var att = String(q.attendu).replace(/\s+|[{}]/g, ''), attAucun = /^aucune?$/.test(att), avecMot = !!(q.aucun || attAucun);
    var lire = 'Écris la limite : un nombre, +∞ ou −∞' + (avecMot ? ', ou le mot « ' + motAucun(q) + ' » si la suite n’a pas de limite' : '') + '.';
    latex = nettoyer(q, latex);
    var mot = motTape(latex);
    if (mot) {
      if (avecMot && /^aucune?s?$/.test(mot)) return attAucun ? { etat: 'juste' } : { etat: 'faux', msg: q.indiceAucun || 'Cette suite a une limite : cherche-la.' };
      return { etat: 'lecture', msg: lire };
    }
    var tk;
    try { tk = decouper(latex); } catch (e) { return { etat: 'lecture', msg: 'Je n’arrive pas à lire cette écriture.' }; }
    if (!tk.length || tk.indexOf('\\placeholder') >= 0) return { etat: 'lecture', msg: lire };
    var attInf = /^\+?\\infty$/.test(att) ? 1 : /^-\\infty$/.test(att) ? -1 : 0;
    if (tk.indexOf('\\infty') >= 0) {                     // un infini : +∞ ou −∞ SEUL
      var s = tk.filter(function (t) { return !/^[{}()]$/.test(t); }).join(''), m = /^([+-]*)\\infty$/.exec(s);
      if (!m) return { etat: 'lecture', msg: 'Écris +∞ ou −∞ seul : on ne calcule pas avec l’infini.' };
      if (!m[1]) return { etat: 'lecture', msg: 'Précise le signe : +∞ ou −∞.' };
      var sg = (m[1].match(/-/g) || []).length % 2 ? -1 : 1;
      if (sg === attInf) return { etat: 'juste' };
      var pg = piege(q, sg > 0 ? INF_P : INF_M, []);
      if (pg) return { etat: 'faux', msg: pg };
      if (attInf) return { etat: 'faux', msg: q.indiceSigne || 'Attention au signe de l’infini.' };
      return { etat: 'faux', msg: q.indiceFaux || '' };
    }
    if (attInf || attAucun) {                               // un nombre, alors que la limite est infinie (ou n'existe pas)
      var ex;
      try { ex = lireTeX(q, latex); } catch (e2) { return { etat: 'lecture', msg: e2.message === 'vide' ? lire : 'Je n’arrive pas à lire cette écriture.' }; }
      for (var v in variables(ex)) return { etat: 'faux', msg: 'Ta réponse contient la lettre ' + v + ' : une limite est un nombre, +∞ ou −∞.' };
      return { etat: 'faux', msg: piege(q, ex, []) || q.indiceFaux || '' };
    }
    var q2 = {}; for (var c in q) q2[c] = q[c];               // limite finie : comme une question « expr » (valeur, forme, pièges)
    q2.limite = false; q2.aucun = null; q2.variable = null; q2.entiers = false; q2.forme = q.forme || 'reduit';
    var r = verifierExpr(q2, latex);
    if (r.etat === 'faux' && (!r.msg || r.msg === q.indiceFaux)) {   // une valeur approchée d'une limite qui ne s'écrit pas en décimal court
      try {
        var a = lireTeX(q, latex), va = evaluer(a, {}), vb = evaluer(lireTeX(q, q.attendu), {});
        if (estDecimal(a) && isFinite(va) && isFinite(vb) && Math.abs(vb * 1e4 - Math.round(vb * 1e4)) > 1e-6 && Math.abs(va - vb) <= 0.01 * Math.max(1, Math.abs(vb)))
          return { etat: 'faux', msg: 'C’est une valeur approchée : donne la valeur exacte de la limite.' };
      } catch (e3) {}
    }
    return r;
  }
  function verifierExpr(q, latex) {
    if (q.limite) return verifierLimite(q, latex);
    var arbre, ra = verifierAucun(q, latex);
    if (ra) return ra;
    latex = nettoyer(q, latex);
    try { arbre = lireTeX(q, latex); }
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
    } else if (q.gaucheObligatoire) {             // option gaucheGris (TERM CH05, 17 nov. 2026) : « y = » oublié = message gris, pas une erreur
      return { etat: q.gaucheGris ? 'lecture' : 'faux', msg: 'Écris une équation de la forme ' + q.gauche + ' = …' };
    }
    var vu = variables(expr);
    for (var v in vu) {
      if (vars.indexOf(v) < 0) return { etat: 'faux', msg: v === q.gauche ? 'Il reste ' + v + ' dans le membre de droite.' : 'Ta réponse contient la lettre ' + v + ', qui n’a rien à faire ici.' };
    }
    var attendu = lireTeX(q, q.attendu);
    var egal;
    if (q.tolerance != null) {
      var va = evaluer(expr, {}), vb = evaluer(attendu, {});
      egal = isFinite(va) && Math.abs(va - vb) <= q.tolerance + 1e-12;
    } else egal = equivalentes(expr, attendu, vars, q.positifs, q.entiers);
    if (!egal) {
      var pg = piege(q, expr, vars);
      return { etat: 'faux', msg: pg || q.indiceFaux || '' };
    }
    var forme = q.forme || 'libre';
    var facto = forme === 'factorise' || forme === 'factorisee';
    if (!FORMES[forme](expr, vars[0], q)) {
      var pf = piegeForme(q, expr);                // une mauvaise écriture prévue comme piège : son message (15 nov. 2026)
      if (pf) return { etat: 'faux', msg: pf };
      if (facto) {
        var rf = raisonFacto(expr, vars[0], forme === 'factorise', q.facteursReduits);
        if (rf === 'un') return { etat: 'faux', msg: MSG_FORME.un };
        if (q.facteursReduits && rf === 'regrouperN') {      // le message ne parle que des nombres (« 2 × 2 = 4 »)
          var ns = aplatirProduit(expr).map(sansSigne).filter(estConstante).map(function (m) { return evaluer(m, {}); });
          var pr = ns.reduce(function (a, b) { return a * b; }, 1), f = function (v) { return String(Math.round(v * 1e6) / 1e6).replace('.', ','); };
          return { etat: 'faux', msg: 'C’est égal, mais regroupe les nombres en un seul coefficient : ' + ns.map(f).join(' × ') + ' = ' + f(pr) + '.' };
        }
        if (q.facteursReduits && (rf === 'produit' || rf === 'reduire' || rf === 'regrouper')) return { etat: 'faux', msg: MSG_FORME[rf] };
      }
      var mf = forme === 'factorise' && !FORMES.produit(expr) ? MSG_FORME.produit : MSG_FORME[forme];
      return { etat: 'faux', msg: q.indiceForme || mf || 'Le résultat est juste, mais pas écrit sous la forme demandée.' };
    }
    if (facto) {                                   // vraiment factorisé : au moins autant de facteurs que l'attendu
      var na = nbFacteurs(analyser(q.attendu));
      if (nbFacteurs(expr) < na) return { etat: 'faux', msg: piegeForme(q, expr) || MSG_FORME.pasfacto };
    }
    return { etat: 'juste' };
  }
  function piege(q, expr, vars) {             // erreurs classiques prévues : message dédié
    if (!q.pieges) return '';
    for (var i = 0; i < q.pieges.length; i++) {
      try { if (equivalentes(expr, lireTeX(q, q.pieges[i].si), vars, q.positifs, q.entiers)) return q.pieges[i].msg; } catch (e) {}
    }
    return '';
  }

  /* ----- plusieurs cadres dans une phrase ----- */
  function verifierCases(q, latexs) {
    // TOUTES les cases d'abord (relecture du 16 nov. 2026) : une case vide ou illisible n'est pas une erreur ; on ne juge
    // rien tant que tout n'est pas rempli (sinon une 1re case fausse enregistrait 0 en quiz noté, et « Remplis toutes les
    // cases » trahissait qu'elle était juste)
    for (var i0 = 0; i0 < q.cases.length; i0++) {
      var c0 = q.cases[i0], l0 = latexs[i0], r0 = String(l0 || '').trim() ? verifierExpr({ attendu: c0.attendu, forme: 'libre', variable: c0.variable, nombreE: c0.nombreE || q.nombreE,
        entiers: c0.entiers || q.entiers, limite: c0.limite, aucun: c0.aucun }, l0) : { etat: 'lecture', msg: 'vide' };
      if (r0.etat === 'lecture') return { etat: 'lecture', msg: /vide/.test(r0.msg) ? 'Remplis toutes les cases.' : r0.msg };
    }
    if (q.variantes) for (var vi = 0; vi < q.variantes.length; vi++) {   // autre remplissage juste ((x − 3)² au lieu de (x + 3)², 15 nov. 2026)
      var qv = { cases: q.cases.map(function (c, j) { var o = {}; for (var a in c) o[a] = c[a]; o.attendu = q.variantes[vi][j]; return o; }) };
      if (verifierCases(qv, latexs).etat === 'juste') return { etat: 'juste' };
    }
    if (q.cases.length === 2 && latexs.every(function (l) { return String(l || '').trim(); })) {   // deux valeurs inversées ?
      var inv = [latexs[1], latexs[0]], tout = true;
      for (var j = 0; j < 2; j++) {
        var cj = q.cases[j];
        if (verifierExpr({ attendu: cj.attendu, forme: cj.forme || 'nombre', variable: cj.variable, tolerance: cj.tolerance, suffixe: cj.suffixe, nombreE: cj.nombreE || q.nombreE,
          entiers: cj.entiers || q.entiers, limite: cj.limite, aucun: cj.aucun }, inv[j]).etat !== 'juste') tout = false;
      }
      if (tout && verifierExpr({ attendu: q.cases[0].attendu, forme: 'libre', variable: q.cases[0].variable, nombreE: q.cases[0].nombreE || q.nombreE, entiers: q.cases[0].entiers || q.entiers,
        limite: q.cases[0].limite, aucun: q.cases[0].aucun }, latexs[0]).etat !== 'juste') return { etat: 'faux', msg: 'Les deux valeurs sont justes, mais inversées.' };
    }
    for (var i = 0; i < q.cases.length; i++) {
      var c = q.cases[i];
      var sq = { attendu: c.attendu, forme: c.forme || 'nombre', variable: c.variable, tolerance: c.tolerance, suffixe: c.suffixe, pieges: c.pieges, nombreE: c.nombreE || q.nombreE,
        entiers: c.entiers || q.entiers, limite: c.limite, aucun: c.aucun, indiceSigne: c.indiceSigne, indiceAucun: c.indiceAucun };
      var r = verifierExpr(sq, latexs[i]);
      if (r.etat === 'lecture') return { etat: 'lecture', msg: /vide/.test(r.msg) || !String(latexs[i] || '').trim() ? 'Remplis toutes les cases.' : r.msg };
      if (r.etat !== 'juste') {
        if (!r.msg && q.cases.length > 1) r.msg = (c.nom ? 'La case « ' + c.nom + ' »' : 'La case n° ' + (i + 1)) + ' n’est pas juste.';
        return { etat: 'faux', msg: r.msg || q.indiceFaux || '' };
      }
    }
    return { etat: 'juste' };
  }

  /* Quiz NOTÉ (M. Colin, 16 nov. 2026, quiz de Seconde CH03) : une question à plusieurs cases (« compléter une égalité »)
     rapporte la part de ses cases justes, comme un exercice en plusieurs questions ; avec des remplissages justes
     différents (variantes), le meilleur compte. Tableaux et arbres à remplir : même barème (M. Colin, 16 nov. 2026,
     quiz 1ère CH03 : « Oui tu fais au prorata »), voir detailGrille / pointsReponse. */
  function detailCases(q, latexs) {                 // case par case (true = juste), pour le meilleur remplissage
    var rem = [q.cases.map(function (c) { return c.attendu; })].concat(q.variantes || []), mieux = null;
    rem.forEach(function (att) {
      var d = q.cases.map(function (c, j) {
        try { return verifierExpr({ attendu: att[j], forme: c.forme || 'nombre', variable: c.variable, tolerance: c.tolerance, suffixe: c.suffixe, nombreE: c.nombreE || q.nombreE,
          entiers: c.entiers || q.entiers, limite: c.limite, aucun: c.aucun }, latexs[j]).etat === 'juste'; } catch (e) { return false; }
      });
      if (!mieux || d.filter(Boolean).length > mieux.filter(Boolean).length) mieux = d;
    });
    return mieux || [];
  }
  function pointsCases(q, latexs) {
    var n = q.cases.length;
    return n ? detailCases(q, latexs).filter(Boolean).length / n : 0;
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
    if (/^(\\mathbb\{R\}|\\R|\\Reals|ℝ)$/.test(tk.join(''))) return [{ a: -Infinity, b: Infinity, fa: false, fb: false }];   // ℝ (quiz TERM CH05)
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
    if (e && e.erreur) return { etat: 'lecture', msg: e.erreur };
    var b = q.bornes || [-Infinity, Infinity];
    if (!(Math.abs(e.gauche - b[0]) < 1e-9 || e.gauche === b[0]) || !(Math.abs(e.droite - b[1]) < 1e-9 || e.droite === b[1]))
      return { etat: 'faux', msg: q.bornes ? 'Les extrémités de la ligne des x sont les bornes de l’intervalle d’étude.' : 'Regarde les extrémités de la ligne des x.' };
    var vals = e.valeurs;
    var tous = [e.gauche].concat(vals, [e.droite]);
    for (var i = 1; i < tous.length; i++) if (!(tous[i] > tous[i - 1])) return { etat: 'faux', msg: 'Les valeurs de x doivent être rangées dans l’ordre croissant.' };
    var att = q.valeurs.map(nbTableau);
    var memes = vals.length === att.length && vals.every(function (v, i) { return Math.abs(v - att[i]) < 1e-9; });
    if (!memes) return { etat: 'faux', msg: q.type === 'variations' ? 'Les valeurs placées sur la ligne des x ne sont pas les bonnes (on y met les x où le sens de variation change).' : 'Les valeurs placées sur la ligne des x ne sont pas les bonnes.' };
    if (q.type === 'variations') {
      var ls = q.ligneSigne;                        // ligne « signe de f′(x) » (quiz TERM CH05) : vérifiée avant les flèches
      if (ls) {
        for (var t0 = 0; t0 < att.length; t0++) if (e.traits[t0] !== ls.traits[t0]) return { etat: 'faux', msg: 'Ligne du signe : vérifie les traits sous les valeurs de x.' };
        if (e.signes.some(function (sg) { return !sg; })) return { etat: 'faux', msg: 'Il reste des signes à placer.' };
        for (var k0 = 0; k0 < e.signes.length; k0++) if (e.signes[k0] !== ls.signes[k0]) return { etat: 'faux', msg: 'Il y a une erreur dans les signes.' };
      }
      if (e.fleches.some(function (f) { return !f; })) return { etat: 'faux', msg: 'Il reste des flèches à placer.' };
      for (var f = 0; f < e.fleches.length; f++) if (e.fleches[f] !== q.fleches[f]) return { etat: 'faux', msg: 'Il y a une erreur dans le sens des flèches.' };
      for (var m = 0; m < q.images.length; m++) {
        if (q.images[m] == null) continue;
        if (!isFinite(e.images[m])) return { etat: 'lecture', msg: 'Écris les images sous chaque valeur de x (au bout des flèches).' };
        if (Math.abs(e.images[m] - nbTableau(q.images[m])) > 1e-9) return { etat: 'faux', msg: 'Les flèches sont justes : vérifie les valeurs écrites au bout des flèches.' };
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

  /* ======================= 2 bis. Types des quiz de chapitre : vérification (1ère CH03, 14 nov. 2026) ======================= */
  /* qcm, vf (vrai / faux), associer, tableau (double entrée à remplir), arbre (pondéré, à compléter), exercice (plusieurs
     questions sur un même énoncé). Format des questions : docs/quiz/1ere-ch03/CONTRAT.md de l'atelier.
     verifierReponse(q, rep) vérifie TOUS les types, sans toucher à la page ; rep a le format de reponseAttendue(q) :
     expr, intervalles, comparer : LaTeX ; cases, tableau, arbre : liste de LaTeX (une par case) ; ensemble : « a;b » ;
     coords : [x, y] ; signes, variations : état du tableau ; repere : points ; qcm : indice (ou liste avec bonnes) ;
     vf : true / false ; associer : un indice de « droite » par ligne ; exercice : la liste des réponses des parties.
     Résultat : { etat: 'juste' | 'faux' | 'lecture', msg, … } (+ faux : cases ou lignes fausses, fige : plus d'essai). */
  var CASE_SEULE = /^\{(\d+)\}$/;              // une cellule, une étiquette de branche, un chemin : « {k} » = case n° k
  function caseDe(s) { var m = CASE_SEULE.exec(String(s == null ? '' : s).trim()); return m ? +m[1] : -1; }
  function valeurTeX(s) {                       // nombre écrit (LaTeX, ou HTML avec \( \)) ; NaN si ce n'en est pas un
    s = String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\\\(|\\\)/g, ' ').replace(/&nbsp;/g, ' ').trim();
    if (!s) return NaN;
    try { var v = evaluer(analyser(s), {}); return isFinite(v) ? v : NaN; } catch (e) { return NaN; }
  }
  function sansReponse(x) { return x == null || x === '' || (typeof x === 'string' && !x.trim()) || (typeof x === 'number' && x < 0); }
  function caseVerif(c) {                       // une case (tableau, arbre) vérifiée comme une question « expr »
    return { attendu: c.attendu, forme: c.forme || 'nombre', variable: c.variable, tolerance: c.tolerance, suffixe: c.suffixe, pieges: c.pieges, positifs: c.positifs, nombreE: c.nombreE,
      entiers: c.entiers, limite: c.limite, aucun: c.aucun, indiceSigne: c.indiceSigne, indiceAucun: c.indiceAucun };
  }
  function estVraiFaux(q) { return q.droite && q.droite.length === 2 && /^vrai$/i.test(String(q.droite[0]).trim()) && /^faux$/i.test(String(q.droite[1]).trim()); }

  /* ----- QCM : une bonne réponse (bonne), ou plusieurs (bonnes) ----- */
  function verifierQcm(q, rep) {
    if (q.bonnes) {
      var ch = (Array.isArray(rep) ? rep : sansReponse(rep) ? [] : [rep]).map(Number);
      if (!ch.length) return { etat: 'lecture', msg: 'Coche au moins une réponse.' };
      var fausses = ch.filter(function (i) { return q.bonnes.indexOf(i) < 0; }).length;
      if (fausses) return { etat: 'faux', msg: fausses > 1 ? 'Des réponses cochées sont fausses.' : 'Une des réponses cochées est fausse.' };
      if (q.bonnes.some(function (i) { return ch.indexOf(i) < 0; })) return { etat: 'faux', msg: 'Il manque au moins une bonne réponse.' };
      return { etat: 'juste' };
    }
    var i = Array.isArray(rep) ? rep[0] : rep;
    if (sansReponse(i)) return { etat: 'lecture', msg: 'Choisis une réponse.' };
    i = +i;
    if (i === q.bonne) return { etat: 'juste' };
    var m = q.messages ? q.messages[i] : '';
    return { etat: 'faux', msg: m || 'Ce n’est pas la bonne réponse.', choix: i };
  }

  /* ----- vrai / faux : une seule tentative (avec deux choix, la seconde serait devinée) ----- */
  function verifierVf(q, rep) {
    if (typeof rep === 'string') rep = /^\s*v/i.test(rep) ? true : /^\s*f/i.test(rep) ? false : null;
    if (rep !== true && rep !== false) return { etat: 'lecture', msg: 'Choisis « Vrai » ou « Faux ».' };
    return rep === !!q.attendu ? { etat: 'juste' } : { etat: 'faux', msg: 'Ce n’est pas la bonne réponse.', fige: true };
  }

  /* ----- associer : un choix de « droite » par ligne de « gauche » ----- */
  /* Plusieurs assemblages justes (quiz TERM CH02, relecture du 19 nov. 2026 : « On sait que A et B » vaut « On sait que B et
     A ») : q.variantes = [autre attendu, …], comme les variantes des questions à cases ; le jugement se fait contre l'assemblage
     le plus proche de la réponse (lignes rouges et message du piège comptés par rapport à lui). */
  function attenduAssocier(q, rep) {
    var atts = [q.attendu].concat(q.variantes || []), mieux = q.attendu, nf = Infinity;
    if (!rep) return mieux.slice();
    atts.forEach(function (att) {
      var f = 0; for (var i = 0; i < q.gauche.length; i++) if (+rep[i] !== att[i]) f++;
      if (f < nf) { nf = f; mieux = att; }
    });
    return mieux.slice();
  }
  function verifierAssocier(q, rep) {
    var n = q.gauche.length, vides = 0, faux = [], i;
    for (i = 0; i < n; i++) if (sansReponse(rep[i])) vides++;
    if (vides && q.blocs) return { etat: 'lecture', msg: vides === n ? 'Place un bloc après chaque mot de la démonstration.' : 'Il reste ' + (vides > 1 ? vides + ' places vides' : 'une place vide') + ' dans la démonstration.' };
    if (vides) return { etat: 'lecture', msg: vides === n ? 'Associe chaque ligne à une réponse.' : 'Il reste ' + (vides > 1 ? vides + ' lignes' : 'une ligne') + ' sans réponse.' };
    var att = attenduAssocier(q, rep);
    for (i = 0; i < n; i++) if (+rep[i] !== att[i]) faux.push(i);
    if (!faux.length) return { etat: 'juste' };
    var msg = '';
    (q.messages || []).some(function (m) { if (faux.indexOf(m.g) >= 0 && +rep[m.g] === m.d) { msg = m.msg; return true; } return false; });
    if (!msg && q.blocs) msg = faux.length === 1 ? 'Un bloc sur ' + n + ' n’est pas le bon (en rouge).' : faux.length + ' blocs sur ' + n + ' ne sont pas les bons (en rouge).';
    if (!msg) {
      var mot = estVraiFaux(q) ? 'réponse' : 'association';
      msg = faux.length === 1 ? 'Une ' + mot + ' sur ' + n + ' n’est pas juste (en rouge).' : faux.length + ' ' + mot + 's sur ' + n + ' ne sont pas justes (en rouge).';
    }
    return { etat: 'faux', msg: msg, faux: faux };
  }

  /* ----- tableau à double entrée, arbre pondéré : une case par {k} ----- */
  function verifierGrille(q, rep, genre) {
    var vides = [], illisibles = [], faux = [], msgCase = '';
    q.cases.forEach(function (c, k) {
      var l = rep[k];
      if (sansReponse(l)) { vides.push(k); return; }
      var r = verifierExpr(caseVerif(c), l);
      if (r.etat === 'lecture') illisibles.push(k);
      else if (r.etat !== 'juste') { faux.push(k); if (!msgCase && r.msg) msgCase = r.msg; }
    });
    if (vides.length) return { etat: 'lecture', msg: 'Remplis toutes les cases.', vides: vides };
    if (illisibles.length) return { etat: 'lecture', msg: 'Je n’arrive pas à lire ' + (illisibles.length > 1 ? 'certaines cases' : 'une des cases') + ' : vérifie l’écriture.', illisibles: illisibles };
    if (!faux.length) return { etat: 'juste' };
    if (q.variantes && detailGrille(q, rep).every(Boolean)) return { etat: 'juste' };   // autre remplissage juste (variantes)
    // ordre des messages : piège ou forme d'une case, puis la cohérence (totaux, somme 1, produit le long d'un chemin), puis le compte
    var msg = msgCase || (genre === 'arbre' ? incoherenceArbre(q.arbre, rep, faux) : incoherenceTableau(q.tableau, rep));
    if (!msg) msg = faux.length === 1 ? 'Une valeur n’est pas juste (en rouge).' : faux.length + ' valeurs ne sont pas justes (en rouge).';
    return { etat: 'faux', msg: msg, faux: faux };
  }
  /* Quiz NOTÉ (M. Colin, 16 nov. 2026, quiz 1ère CH03) : un tableau ou un arbre à remplir rapporte la part de ses cases
     justes (cases à remplir seulement : les valeurs déjà écrites ne comptent pas) ; s'il y a plusieurs remplissages justes
     (q.variantes : une liste d'attendus par remplissage), le meilleur compte. Rien n'est jugé tant qu'une case est vide
     ou illisible (verifierGrille rend alors « lecture » : rien d'enregistré). */
  function detailGrille(q, rep) {                   // case par case (true = juste), pour le meilleur remplissage
    rep = rep || [];
    var rem = [q.cases.map(function (c) { return c.attendu; })].concat(q.variantes || []), mieux = null;
    rem.forEach(function (att) {
      var d = q.cases.map(function (c, k) {
        if (sansReponse(rep[k])) return false;
        var cv = caseVerif(c); cv.attendu = att[k];
        try { return verifierExpr(cv, rep[k]).etat === 'juste'; } catch (e) { return false; }
      });
      if (!mieux || d.filter(Boolean).length > mieux.filter(Boolean).length) mieux = d;
    });
    return mieux || [];
  }
  function pointsGrille(q, rep) {
    var n = q.cases.length;
    return n ? detailGrille(q, rep).filter(Boolean).length / n : 0;
  }
  /* points d'une réponse JUGÉE (quiz noté) : 1 si juste ; « compléter », tableau, arbre : part des cases justes ; exercice :
     moyenne des points de ses questions (une question à cases, un tableau ou un arbre y compte aussi au prorata) ; 0 sinon */
  function pointsReponse(q, rep, r) {
    if (r && r.etat === 'juste') return 1;
    switch (q.type) {
      case 'cases': return pointsCases(q, rep || []);
      case 'tableau': case 'arbre': return pointsGrille(q, rep || []);
      case 'exercice': {
        var n = q.parties.length, s = 0, rs = (r && r.parties) || [];
        q.parties.forEach(function (pa, i) { s += pointsReponse(pa, (rep || [])[i], rs[i]); });
        return n ? s / n : 0;
      }
      default: return 0;
    }
  }
  function valeurCellule(c, rep) { var k = caseDe(c); return k >= 0 ? valeurTeX(rep[k]) : valeurTeX(c); }
  function incoherenceTableau(t, rep) {         // totaux : dernière ligne et dernière colonne
    if (!t || !t.totaux || t.lignes.length < 3) return '';
    var V = t.lignes.map(function (l) { return l.map(function (c) { return valeurCellule(c, rep); }); });
    var R = V.length, C = V[0].length, ko = false, i, j;
    function pres(a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)); }
    function compare(cells, tot) {
      if (!isFinite(tot) || !cells.length || !cells.every(isFinite)) return;
      if (!pres(cells.reduce(function (s, x) { return s + x; }, 0), tot)) ko = true;
    }
    if (C < 3) return '';
    for (i = 1; i < R - 1; i++) compare(V[i].slice(1, C - 1), V[i][C - 1]);           // chaque ligne
    for (j = 1; j < C; j++) { var col = []; for (i = 1; i < R - 1; i++) col.push(V[i][j]); compare(col, V[R - 1][j]); }   // chaque colonne (et la colonne des totaux)
    compare(V[R - 1].slice(1, C - 1), V[R - 1][C - 1]);                                  // total général
    return ko ? 'Vérifie les totaux : chaque total est la somme de sa ligne ou de sa colonne.' : '';
  }
  function cheminsArbre(a) {                    // les feuilles de haut en bas : branches de la racine à la feuille
    var out = [];
    (function tour(bs, pref) { (bs || []).forEach(function (b) { var ch = pref.concat([b]); if (b.branches && b.branches.length) tour(b.branches, ch); else out.push(ch); }); })(a.branches, []);
    return out;
  }
  function incoherenceArbre(a, rep, faux) {
    var msg = '';
    function val(p) { return valeurCellule(p, rep); }
    (function noeud(bs) {                         // la somme des branches issues d'un même nœud vaut 1
      if (!bs || !bs.length || msg) return;
      var vs = bs.map(function (b) { return val(b.p); });
      if (bs.some(function (b) { return caseDe(b.p) >= 0; }) && vs.every(isFinite) && Math.abs(vs.reduce(function (s, x) { return s + x; }, 0) - 1) > 1e-9)
        msg = 'La somme des probabilités des branches issues d’un même nœud est égale à 1.';
      bs.forEach(function (b) { noeud(b.branches); });
    })(a.branches);
    if (msg || !a.chemins) return msg;
    var ch = cheminsArbre(a);                     // la probabilité d'un chemin est le produit des probabilités de ses branches
    for (var i = 0; i < ch.length; i++) {
      var k = caseDe(a.chemins[i]); if (k < 0 || faux.indexOf(k) < 0) continue;
      var prod = ch[i].reduce(function (x, b) { return x * val(b.p); }, 1), v = valeurTeX(rep[k]);
      if (isFinite(prod) && isFinite(v) && Math.abs(prod - v) > 1e-9) return 'La probabilité d’un chemin est le produit des probabilités des branches qui le composent.';
    }
    return '';
  }

  /* ----- exercice : plusieurs questions sur un même énoncé, un seul bouton Valider ----- */
  function estVide(q, rep) {
    switch (q.type) {
      case 'qcm': return Array.isArray(rep) ? !rep.length : sansReponse(rep);
      case 'vf': return rep !== true && rep !== false && sansReponse(rep);
      case 'cases': case 'tableau': case 'arbre': case 'associer': case 'coords': return !rep || !rep.length || rep.every(sansReponse);
      case 'signes': case 'variations': return !rep || !!rep.vide;
      default: return sansReponse(rep);
    }
  }
  function numeros(ks) {                        // [1, 2, 3] → « 2, 3 et 4 »
    ks = ks.map(function (k) { return k + 1; });
    return ks.length > 1 ? ks.slice(0, -1).join(', ') + ' et ' + ks[ks.length - 1] : String(ks[0]);
  }
  function bilanExercice(res) {                 // res : un résultat par partie ('vide' : pas encore de réponse ; 'rate' : vrai / faux raté)
    var faux = [], reste = [];
    res.forEach(function (r, i) { if (r.etat === 'faux' || r.etat === 'rate') faux.push(i); else if (r.etat !== 'juste') reste.push(i); });
    var msgR = reste.length ? 'Il reste à répondre ' + (reste.length > 1 ? 'aux questions ' : 'à la question ') + numeros(reste) + '.' : '';
    if (faux.length) return { etat: 'faux', parties: res, reste: reste, msg: (faux.length > 1 ? 'Les questions ' + numeros(faux) + ' ne sont pas justes.' : 'La question ' + numeros(faux) + ' n’est pas juste.') + (msgR ? ' ' + msgR : '') };
    if (reste.length) return { etat: 'lecture', parties: res, reste: reste, msg: msgR };
    return { etat: 'juste', parties: res, reste: reste };
  }
  function verifierExercice(q, rep) {
    return bilanExercice(q.parties.map(function (pa, i) { return estVide(pa, rep[i]) ? { etat: 'vide' } : verifierReponse(pa, rep[i]); }));
  }

  /* ----- coordonnées d'un vecteur (deux cases en colonne) ----- */
  function verifierCoords(q, vals) {
    var v = [];
    try { q.valeurs.forEach(function (_, i) { var x = vals[i]; v.push(typeof x === 'number' ? x : evaluer(analyser(x == null ? '' : x), {})); }); }
    catch (e) { return { etat: 'lecture', msg: e.message === 'vide' ? 'Remplis les deux cases (abscisse en haut, ordonnée en bas).' : 'Une des coordonnées est illisible.' }; }
    function pres(a, b) { return isFinite(a) && Math.abs(a - b) < 1e-9; }
    var att = q.valeurs;
    if (v.every(function (x, i) { return pres(x, att[i]); })) return { etat: 'juste' };
    if (v.length === 2 && pres(v[0], att[1]) && pres(v[1], att[0])) return { etat: 'faux', msg: 'Attention à l’ordre : l’abscisse en haut, l’ordonnée en bas.' };
    if (v.every(function (x, i) { return pres(x, -att[i]); })) return { etat: 'faux', msg: q.indiceSigne || 'Attention au sens : on calcule « arrivée − départ ».' };
    return { etat: 'faux', msg: q.indiceFaux || '' };
  }

  /* ----- pour TOUS les types ----- */
  function verifierReponse(q, rep) {
    switch (q.type) {
      case 'cases': return verifierCases(q, rep || []);
      case 'ensemble': return verifierEnsemble(q, rep);
      case 'intervalles': return verifierIntervalles(q, rep);
      case 'comparer': return verifierComparer(q, rep);
      case 'coords': return verifierCoords(q, rep || []);
      case 'signes': case 'variations': return rep ? verifierTableau(q, rep) : { etat: 'lecture', msg: 'Construis le tableau.' };
      case 'repere': return verifierRepere(q, rep || []);
      case 'qcm': return verifierQcm(q, rep);
      case 'vf': return verifierVf(q, rep);
      case 'associer': return verifierAssocier(q, rep || []);
      case 'tableau': case 'arbre': return verifierGrille(q, rep || [], q.type);
      case 'exercice': return verifierExercice(q, rep || []);
      default: return verifierExpr(q, rep);
    }
  }
  function reponseAttendue(q) {
    function num(v) { return typeof v === 'number' ? String(v).replace('.', '{,}') : v; }
    switch (q.type) {
      case 'cases': case 'tableau': case 'arbre': return q.cases.map(function (c) { return c.attendu; });
      case 'ensemble': return q.valeurs.map(num).join(';');
      case 'coords': return q.valeurs.slice();
      case 'signes': case 'variations': {
        var b = q.bornes || [-Infinity, Infinity], lg = q.ligne || q.ligneSigne;
        return { gauche: b[0], droite: b[1], valeurs: q.valeurs.map(nbTableau), traits: lg ? lg.traits.slice() : [], signes: lg ? lg.signes.slice() : [],
          fleches: (q.fleches || []).slice(), images: (q.images || []).map(nbTableau) };
      }
      case 'repere':
        return q.mode === 'droite' ? (q.droite.x != null ? [[q.droite.x, 0], [q.droite.x, 1]] : [[0, q.droite.p], [3, 3 * q.droite.m + q.droite.p]])
          : q.mode === 'graduee' ? [[q.point, 0]] : [q.point.slice()];
      case 'qcm': return q.bonnes ? q.bonnes.slice() : q.bonne;
      case 'vf': return !!q.attendu;
      case 'associer': return q.attendu.slice();
      case 'exercice': return q.parties.map(reponseAttendue);
      default: return (q.gaucheObligatoire ? q.gauche + '=' : '') + q.attendu;      // expr, intervalles, comparer
    }
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
    try { document.dispatchEvent(new CustomEvent('quiz:faux')); } catch (e) {}       // pour les styles (ex. « Braquage »)
  }
  function signalerJuste() { preparerRetours(); rejouer(coche, 'actif'); try { document.dispatchEvent(new CustomEvent('quiz:juste')); } catch (e) {} }

  /* ======================= 5. Le quiz ======================= */
  function el(tag, classe, html) { var e = document.createElement(tag); if (classe) e.className = classe; if (html != null) e.innerHTML = html; return e; }
  function rendre(elm) { if (window.MathLive && window.MathLive.renderMathInElement) try { window.MathLive.renderMathInElement(elm); insecables(elm); } catch (e) {} }
  var PONCT = /^(\s?)([.,;:!?…)\]»]+)/;
  function insecables(racine) {                  // « \(P(A)=0{,}4\). » : le point ne passe pas seul à la ligne (14 nov. 2026)
    Array.prototype.forEach.call(racine.querySelectorAll('.ML__sr-only'), function (sr) {
      var f = sr.parentNode, t = f && f.nextSibling, m;
      if (!f || !t || t.nodeType !== 3 || !(m = PONCT.exec(t.nodeValue)) || (f.parentNode && f.parentNode.classList && f.parentNode.classList.contains('qv-insec'))) return;
      var w = el('span', 'qv-insec'); f.parentNode.insertBefore(w, f); w.appendChild(f);
      w.appendChild(document.createTextNode((m[1] ? '\u00a0' : '') + m[2])); t.nodeValue = t.nodeValue.slice(m[0].length);
    });
  }
  function melanger(t) { t = t.slice(); for (var i = t.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = t[i]; t[i] = t[j]; t[j] = x; } return t; }

  /* Tirage ÉQUILIBRÉ (option equilibre d'un quiz à réglages, 15 nov. 2026) : chaque sous-banque (même banque, même
     q.theme) fournit des questions en proportion de sa taille, puis tout est mélangé : 20 questions d'un thème qui
     regroupe plusieurs sous-banques ne tombent pas toutes dans la même. Arrondi SANS BIAIS (tirage systématique) :
     sous-banques dans un ordre au hasard, parts n × taille / total cumulées, n points u, u + 1, …, u + n − 1 (u au hasard
     dans [0 ; 1[) : une sous-banque reçoit les points de son intervalle, soit sa part arrondie au-dessous ou au-dessus,
     en moyenne exactement sa part (une petite sous-banque sort aussi en 5 questions, pas toujours la même). */
  function tirageEquilibre(toutes, n) {
    var groupes = {}, cles = [];
    toutes.forEach(function (t) { if (!groupes[t.g]) { groupes[t.g] = []; cles.push(t.g); } groupes[t.g].push(t); });
    n = Math.min(n, toutes.length);
    cles = melanger(cles);
    var u = Math.random(), cumul = 0, out = [];
    cles.forEach(function (c, j) {
      var a = cumul;
      cumul = j === cles.length - 1 ? n : cumul + n * groupes[c].length / toutes.length;
      var k = Math.ceil(cumul - u) - Math.ceil(a - u);           // nombre d'entiers m tels que a <= u + m < cumul
      out = out.concat(melanger(groupes[c]).slice(0, k));
    });
    return melanger(out);
  }
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
      if (d) d.questions.forEach(function (q, i) { toutes.push({ q: q, i: toutes.length, g: (id || '') + '|' + (q.theme || '') }); });
    });
    var vues = {};                                 // une seule question par famille (q.famille : même énoncé, d'autres nombres)
    toutes = melanger(toutes).filter(function (t) { var f = t.q.famille; if (!f) return true; if (vues[f]) return false; vues[f] = 1; return true; });
    var tirees = s.tirage.equilibre ? tirageEquilibre(toutes, s.tirage.n || 20) : melanger(toutes).slice(0, s.tirage.n || 20);
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
    figuresLecture(q, enonce);                     // arbre / tableau en lecture seule (quiz de chapitre, 14 nov. 2026)
    var apresFigure = q.enonceApres && (q.type === 'arbre' || q.type === 'tableau');   // la suite de l'énoncé vient après la figure à compléter
    if (q.enonceApres && !apresFigure) enonce.appendChild(el('div', 'quiz-enonce-apres', q.enonceApres));
    c.appendChild(enonce); rendre(enonce);
    var zone = el('div', 'quiz-zone'); c.appendChild(zone);
    function entree(mf) { mf.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.valider(n); } }); return mf; }
    var lire;
    if (NOUVEAUX[q.type]) {                        // qcm, vf, associer, tableau, arbre, exercice (quiz de chapitre, 14 nov. 2026)
      var s = saisiePour(q, { label: 'question ' + (n + 1), valider: function () { self.valider(n); },
        champ: function (classe, aria) { return nouveauChamp(classe, aria); } });
      zone.appendChild(s.el); c._saisie = s;
      if (apresFigure) { var ea = el('div', 'quiz-enonce-apres', q.enonceApres); zone.appendChild(ea); rendre(ea); }
      lire = s.verifier || function () { var r = verifierReponse(q, s.lire()); s.marquer(r); return r; };
    }
    else if (q.type === 'signes' || q.type === 'variations') lire = this.tableau(q, zone);
    else if (q.type === 'coords') lire = this.coords(q, zone, n);
    else if (q.type === 'repere') lire = this.repere(q, zone);
    else if (q.type === 'cases') lire = this.cases(q, zone, n, entree);
    else if (q.type === 'comparer') {
      var lc = el('div', 'quiz-ligne quiz-comparer');
      var g = el('span', 'quiz-prefixe', '\\(' + q.gauche + '\\)'), dr = el('span', 'quiz-prefixe', '\\(' + q.droite + '\\)');
      var mfc = entree(nouveauChamp('quiz-champ petit symbole', 'Symbole de comparaison (question ' + (n + 1) + ')'));
      lc.appendChild(g); lc.appendChild(mfc); lc.appendChild(dr); zone.appendChild(lc); rendre(lc);
      lire = function () { return verifierComparer(q, mfc.value); };
      lire.valeurs = function () { return mfc.value; };
    } else {
      var ligne = el('div', 'quiz-ligne');
      var mf = entree(nouveauChamp('quiz-champ', 'Ta réponse à la question ' + (n + 1)));
      var pre = q.prefixe, suf = q.suffixe;
      if (q.type === 'ensemble') { pre = (q.prefixe || '\\(S=\\)') + '<span class="quiz-accolade">\\(\\{\\)</span>'; suf = '<span class="quiz-accolade">\\(\\}\\)</span>'; }
      if (q.type === 'intervalles' && !pre) pre = '\\(S=\\)';
      if (pre) { var pf = el('span', 'quiz-prefixe', pre); ligne.appendChild(pf); rendre(pf); }
      ligne.appendChild(mf);
      if (suf) { var sf = el('span', 'quiz-prefixe quiz-suffixe', suf); ligne.appendChild(sf); rendre(sf); }
      if (typeof q.aucun === 'string' && q.type !== 'ensemble' && q.type !== 'intervalles') ligne.appendChild(boutonAucun(q, mf));   // « Aucune » (TERM CH02)
      zone.appendChild(ligne);
      if (q.type === 'ensemble') { zone.appendChild(el('p', 'quiz-aide-tab', 'Sépare les solutions par un point-virgule « ; » (touche ; du clavier 123).')); }
      if (q.type === 'intervalles') { var ai = el('p', 'quiz-aide-tab', 'Crochets [ ], infini ∞ et réunion ∪ : onglet ≤∈ℝ du clavier (au clavier de l’ordinateur : « oo » donne ∞).'); zone.appendChild(ai); }
      lire = q.type === 'ensemble' ? function () { return verifierEnsemble(q, mf.value); }
        : q.type === 'intervalles' ? function () { return verifierIntervalles(q, mf.value); }
        : function () { return verifierExpr(q, mf.value); };
      lire.valeurs = function () { return mf.value; };      // rapport détaillé (quiz noté) : ce que l'élève a tapé
    }
    // exercice, arbre, tableau, énoncé avec une figure : pas de mise au point automatique, le clavier virtuel cacherait
    // le haut de la figure ; il s'ouvre quand l'élève touche une case (14 nov. 2026)
    var aFigure = q.type === 'exercice' || q.type === 'arbre' || q.type === 'tableau' || !!(q.figure || q.arbre || q.tableau);
    c._champ = aFigure ? null : zone.querySelector('math-field');
    c._lire = lire;
    var msg = el('p', 'quiz-message'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite'); c.appendChild(msg); c._msg = msg;
    var actions = el('div', 'quiz-actions');
    var bv = el('button', 'bouton', 'Valider'); bv.type = 'button'; bv.addEventListener('click', function () { self.valider(n); });
    var bs = el('button', 'bouton discret', 'Voir la correction <span aria-hidden="true">›</span>'); bs.type = 'button'; bs.hidden = true; bs.addEventListener('click', function () { self.correction(n); });
    var bn = el('button', 'bouton', n + 1 < total ? 'Question suivante' : (this.opts.note ? 'Terminer le quiz' : 'Voir le bilan')); bn.type = 'button'; bn.hidden = true;
    bn.addEventListener('click', function () { fermerVolet(); self.suivante(n); });
    actions.appendChild(bv); actions.appendChild(bs); actions.appendChild(bn); c.appendChild(actions);
    c._bv = bv; c._bs = bs; c._bn = bn; c._q = q;
    return c;
  };
  Quiz.prototype.prochaine = function () {        // quiz noté : première question sans réponse
    for (var j = 0; j < this.etat.length; j++) if (!this.etat[j].repondue) return j;
    return -1;
  };
  Quiz.prototype.aller = function (n) {
    if (this.opts.note && !this.noteFinie && !this.etat[n].repondue && n !== this.prochaine()) return;   // répondre avant de passer à la suivante (M. Colin, 15 nov. 2026)
    if (volet && volet.quiz === this && volet.n !== n) fermerVolet();
    this.i = n;
    this.fin.hidden = true;
    this.cartes.forEach(function (c, j) { c.hidden = j !== n; });
    this.majPoints();
    var c = this.cartes[n];
    majLanguette(this);
    espacerCarte(c);                               // fractions de l'énoncé : leur ligne leur fait la place
    if (document.fonts && document.fonts.status !== 'loaded' && document.fonts.ready) document.fonts.ready.then(function () { if (!c.hidden) espacerCarte(c, true); });
    if (c._champ && !this.etat[n].juste && !c._fini) setTimeout(function () { if (voletOuvert()) return; try { c._champ.focus(); } catch (e) {} }, 50);
    else if (window.mathVirtualKeyboard) try { window.mathVirtualKeyboard.hide(); } catch (e) {}
  };
  Quiz.prototype.majPoints = function () {
    var self = this;
    Array.prototype.forEach.call(this.points.children, function (b, j) {
      var e = self.etat[j];
      b.classList.toggle('courant', j === self.i && self.fin.hidden);
      if (self.opts.note) {                        // quiz noté : « répondue » pendant le quiz, juste / fausse après la note
        b.classList.toggle('repondue', !!e.repondue && !self.noteFinie);
        b.classList.toggle('bloquee', !self.noteFinie && !e.repondue && j !== self.prochaine());
        b.disabled = !self.noteFinie && !e.repondue && j !== self.prochaine();
        b.classList.toggle('juste', !!self.noteFinie && e.points === 1);
        b.classList.toggle('partielle', !!self.noteFinie && e.points > 0 && e.points < 1);   // en partie juste : orange
        b.classList.toggle('fausse', !!self.noteFinie && !(e.points > 0));
      } else {
      b.classList.toggle('juste', e.juste);
      b.classList.toggle('vue', !e.juste && e.vue);
      }
      b.setAttribute('aria-current', j === self.i && self.fin.hidden ? 'step' : 'false');
    });
  };
  Quiz.prototype.valider = function (n) {
    if (this.opts.note) return this.validerNote(n);
    var c = this.cartes[n], e = this.etat[n];
    if (e.juste || c._fini) return;
    var r = c._lire();
    c._msg.className = 'quiz-message';
    if (r.etat === 'lecture') { ecrireMsg(c._msg, r.msg); c._msg.classList.add('info'); return; }
    e.essais++;
    if (r.etat === 'juste') {
      e.juste = true; e.premier = e.essais === 1 && !e.vue;
      c.classList.add('reussie'); c.classList.remove('ratee');
      c._msg.textContent = 'Bonne réponse !'; c._msg.classList.add('ok');
      c._bv.hidden = true; c._bs.hidden = !e.vue; c._bn.hidden = false;
      c._bn.className = 'bouton';
      c.querySelectorAll('.quiz-zone math-field').forEach(function (s) { s.readOnly = true; s.blur(); });
      c.querySelectorAll('.quiz-zone button').forEach(function (s) { s.disabled = true; });
      if (c._saisie) c._saisie.figer();
      window.mathVirtualKeyboard && window.mathVirtualKeyboard.hide();
      signalerJuste();
      setTimeout(function () { c._bn.focus(); }, 50);
    } else {
      c.classList.add('ratee');
      ecrireMsg(c._msg, r.msg ? r.msg : 'Ce n’est pas la bonne réponse. Cherche encore !');
      c._msg.classList.add('ko');
      // dès la première erreur : la correction animée est proposée (volet sur le côté), et l'on peut passer à la suite
      c._bs.hidden = false; c._bn.hidden = false; c._bn.className = 'bouton secondaire';
      if (!r.calme) signalerFaux();                // calme : rien de nouveau de faux (exercice dont un vrai / faux était raté)
      if (r.fige) {                                // plus d'essai possible (vrai / faux) : la correction, ou la question suivante
        c._fini = true; c._bv.hidden = true;
        if (c._saisie) c._saisie.figer();
        window.mathVirtualKeyboard && window.mathVirtualKeyboard.hide();
        setTimeout(function () { try { c._bs.focus({ preventScroll: true }); } catch (x) {} }, 60);
      }
    }
    this.majPoints();
  };
  Quiz.prototype.correction = function (n) {
    if (this.opts.note && !this.noteFinie) return;             // quiz noté : les corrections viennent après la note
    var c = this.cartes[n];
    this.etat[n].vue = true;
    c._bn.hidden = false;
    this.majPoints();
    ouvrirVolet(this, n);
  };
  Quiz.prototype.suivante = function (n) { if (n + 1 < this.cartes.length) this.aller(n + 1); else this.bilan(); };
  Quiz.prototype.bilan = function () {
    if (this.opts.note) return this.terminerNote();
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
    var self = this, ligne = el('div', 'quiz-ligne quiz-cases'), champs = [];
    poserCases(ligne, q.modele, function (i) {
      var cd = q.cases[i] || {};
      var mf = entree(nouveauChamp('quiz-champ petit' + (cd.large ? ' large' : ''), (cd.nom || 'case ' + (i + 1)) + ' (question ' + (n + 1) + ')'));
      champs[i] = mf; return mf;
    });
    zone.appendChild(ligne); rendre(ligne);
    var lire = function () {
      var l = champs.map(function (mf) { return mf.value; }), r = verifierCases(q, l);
      if (self.opts.note && r.etat !== 'lecture') r.prorata = r.etat === 'juste' ? 1 : pointsCases(q, l);   // quiz noté : part des cases justes
      return r;
    };
    lire.valeurs = function () { return champs.map(function (mf) { return mf ? mf.value : ''; }); };   // rapport détaillé (quiz noté)
    lire.marquerCases = function () {              // revue finale du quiz noté : chaque case en vert ou en rouge
      var d = detailCases(q, champs.map(function (mf) { return mf.value; }));
      champs.forEach(function (mf, j) { if (!mf) return; mf.classList.remove('vide'); mf.classList.toggle('qz-juste', !!d[j]); mf.classList.toggle('qz-faux', !d[j]); });
    };
    return lire;
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
    var lire = function () { return verifierCoords(q, champs.map(function (mf) { return mf.value; })); };
    lire.valeurs = function () { return champs.map(function (mf) { return mf.value; }); };
    return lire;
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
  /* Valeur d'une ligne des x ou d'une image donnée dans la question : un nombre, ou du LaTeX (« \frac{5}{3} », « 2\mathrm{e} »,
     quiz TERM CH05) ; texTableau : son écriture dans le tableau de la correction. */
  function nbTableau(v) { return v == null ? v : typeof v === 'number' ? v : valeurDe(String(v)); }
  function texTableau(v) { return typeof v === 'number' ? nombreTeX(v) : String(v); }
  Quiz.prototype.tableau = function (q, zone) {
    var s = saisieSV(q); zone.appendChild(s.el);
    return function () { return verifierReponse(q, s.lire()); };
  };
  /* Saisie d'un tableau de signes ou de variations (question seule, ou partie d'un exercice depuis le 16 nov. 2026) ;
     q.ligneSigne (type 'variations', quiz TERM CH05) : une ligne « signe de f′(x) » (traits et signes) entre la ligne des x
     et celle des variations, comme dans les tableaux de M. Colin. lire() rend l'état du tableau (format de
     reponseAttendue) ; une valeur illisible : e.erreur (message gris) ; rien de rempli : e.vide. */
  function saisieSV(q) {
    var vari = q.type === 'variations', ls = vari ? q.ligneSigne : null, avecSigne = !vari || !!ls;
    var box = el('div', 'qz-sv'), wrap = el('div', 'quiz-tab-cadre'), tab = el('div', 'quiz-tab' + (vari ? ' quiz-var' : '') + (ls ? ' quiz-var-signe' : ''));
    var gauche = nouveauChamp('quiz-champ petit', 'Première valeur de la ligne x');
    var droite = nouveauChamp('quiz-champ petit', 'Dernière valeur de la ligne x');
    var racines = [];                 // { mf, trait, img }
    var inter = [''];                 // un signe (tableau de signes) ou une flèche (variations) par intervalle
    var sgn = [''];                   // tableau de variations avec ligne de signe : un signe par intervalle
    var imgG = nouveauChamp('quiz-champ petit', 'Image de la première valeur'), imgD = nouveauChamp('quiz-champ petit', 'Image de la dernière valeur');
    var lab = el('span', null, '\\(x\\)'); rendre(lab);
    var labL = el('span', null, vari ? (q.label || 'variation de \\(f\\)') : q.ligne.label); rendre(labL);
    var labS = ls ? el('span', null, ls.label || 'signe de \\(f\'(x)\\)') : null; if (labS) rendre(labS);
    var finiG = !q.bornes || isFinite(q.bornes[0]), finiD = !q.bornes || isFinite(q.bornes[1]);
    if (!q.bornes) finiG = finiD = false;
    var touche = false, fige = false;

    function cellule(classe, contenu) { var c = el('div', 'tcell ' + (classe || '')); if (contenu) c.appendChild(contenu); tab.appendChild(c); return c; }
    function bouton(classe, texte, aria, action) {
      var b = el('button', classe, texte); b.type = 'button'; b.setAttribute('aria-label', aria);
      b.addEventListener('click', function () { touche = true; action(); }); return b;
    }
    function ajouter(k) {             // nouvelle valeur entre la valeur k et la valeur k+1
      var mf = nouveauChamp('quiz-champ petit', 'Valeur de x');
      racines.splice(k, 0, { mf: mf, trait: 'pointille', img: vari ? nouveauChamp('quiz-champ petit', 'Image de cette valeur') : null });
      inter.splice(k + 1, 0, ''); sgn.splice(k + 1, 0, '');
      dessiner();
      setTimeout(function () { try { mf.focus(); } catch (e) {} }, 30);
    }
    function retirer(k) { racines.splice(k, 1); inter.splice(k + 1, 1); sgn.splice(k + 1, 1); dessiner(); }
    function position(i) {            // valeur n° i (0 = extrémité gauche) : en haut, en bas ou au milieu
      var L = inter[i - 1], R = inter[i];
      if (L === '↗' || R === '↘') return 'haut';
      if (L === '↘' || R === '↗') return 'bas';
      return 'milieu';
    }
    function majPositions() {
      Array.prototype.forEach.call(tab.querySelectorAll('.timg'), function (c) { c.dataset.pos = position(+c.dataset.i); });
    }
    function ligneSignes(T, classe) {  // traits sous les valeurs et un signe par intervalle (T : tableau des signes)
      cellule('tval tvide' + classe);
      for (var m = 0; m <= racines.length; m++) {
        (function (m) {
          var cyc = ['', '+', '−'];
          var b = bouton('signe sint', T[m], 'Signe sur l’intervalle ' + (m + 1), function () {
            T[m] = cyc[(cyc.indexOf(T[m]) + 1) % cyc.length]; b.textContent = T[m]; b.dataset.v = T[m];
          });
          b.dataset.v = T[m];
          cellule('tint' + classe, b);
        })(m);
        if (m < racines.length) (function (m) {
          var r = racines[m];
          var t = bouton('trait-choix', '', '', function () {
            r.trait = TRAITS[(TRAITS.indexOf(r.trait) + 1) % 3]; r.touche = true;
            t.dataset.t = r.trait; t.dataset.touche = '1'; t.setAttribute('aria-label', 'Trait : ' + NOM_TRAIT[r.trait] + ' (toucher pour changer)');
          });
          t.dataset.t = r.trait; if (r.touche) t.dataset.touche = '1'; t.setAttribute('aria-label', 'Trait : ' + NOM_TRAIT[r.trait] + ' (toucher pour changer)');
          t.innerHTML = '<span>0</span>';
          cellule('tval ttrait' + classe, t);
        })(m);
      }
      cellule('tval tvide' + classe);
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
      if (ls) { cellule('tlab tsg', labS); ligneSignes(sgn, ' tsg'); }     // ligne « signe de f′(x) »
      // ligne du signe (tableau de signes) ou des variations
      cellule('tlab', labL);
      if (!vari) { ligneSignes(inter, ''); return; }
      var cg = cellule('tval timg', finiG ? imgG : null); cg.dataset.i = 0;
      for (var m = 0; m <= n; m++) {
        (function (m) {
          var b = bouton('signe sint fleche', flecheLongue(inter[m]), 'Sens de variation sur l’intervalle ' + (m + 1), function () {
            inter[m] = FLECHES[(FLECHES.indexOf(inter[m]) + 1) % FLECHES.length];
            b.innerHTML = flecheLongue(inter[m]); b.dataset.v = inter[m];
            b.setAttribute('aria-label', 'Sens de variation sur l’intervalle ' + (m + 1) + (inter[m] ? ' : ' + (inter[m] === '↗' ? 'croissante' : 'décroissante') : '')); majPositions();
          });
          b.dataset.v = inter[m];
          cellule('tint', b);
        })(m);
        if (m < n) { var ci = cellule('tval timg', racines[m].img); ci.dataset.i = m + 1; }
      }
      var cd = cellule('tval timg', finiD ? imgD : null); cd.dataset.i = n + 1; majPositions();
    }
    dessiner();
    wrap.appendChild(tab); box.appendChild(wrap);
    var aide = el('p', 'quiz-aide-tab', vari
      ? 'Le bouton <b>+</b> ajoute une valeur de \\(x\\) (× la retire).' + (ls ? ' Touche une case de la ligne du signe pour y mettre + ou −, et un trait pour choisir : pointillés, trait avec un 0, ou double trait (valeur interdite).' : '') + ' Touche un rond pour tracer la flèche (montante, puis descendante), et écris les images au bout des flèches.'
      : 'Le bouton <b>+</b> ajoute une valeur de \\(x\\) (× la retire). Touche une case pour y mettre + ou −, et un trait pour choisir : pointillés, trait avec un 0, ou double trait (valeur interdite).');
    box.appendChild(aide); rendre(aide);

    function lire(mf) { return evaluer(lireTeX(q, mf.value), {}); }
    function lireSiRempli(mf) { if (!mf.value) return NaN; try { return lire(mf); } catch (e) { return NaN; } }
    function champs() { return [gauche, droite].concat(racines.map(function (r) { return r.mf; }), vari ? [imgG, imgD].concat(racines.map(function (r) { return r.img; })) : []); }
    return {
      el: box,
      lire: function () {
        var e = { valeurs: [], traits: [], signes: (ls ? sgn : inter).slice(), fleches: vari ? inter.slice() : [], images: [] };
        e.vide = !touche && !racines.length && champs().every(function (mf) { return !mf || !String(mf.value || '').trim(); }) && inter.every(function (x) { return !x; });
        try { e.gauche = lire(gauche); e.droite = lire(droite); racines.forEach(function (r) { e.valeurs.push(lire(r.mf)); e.traits.push(r.trait); }); }
        catch (err) { e.erreur = err.message === 'vide' ? (q.bornes ? 'Remplis toutes les cases de la ligne des x.' : 'Remplis toutes les cases de la ligne des x (aux extrémités : −∞ et +∞).') : 'Une valeur de la ligne des x est illisible.'; }
        if (vari) {
          e.images.push(finiG ? lireSiRempli(imgG) : null);
          racines.forEach(function (r) { e.images.push(lireSiRempli(r.img)); });
          e.images.push(finiD ? lireSiRempli(imgD) : null);
        }
        if (!avecSigne) e.traits = [];
        return e;
      },
      marquer: function () {},
      figer: function () {
        fige = true; box.classList.add('fige');
        box.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        figerChamps(champs());
      }
    };
  }

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

  /* ======================= 5 quater. Types des quiz de chapitre : saisie et figures (1ère CH03, 14 nov. 2026) ======================= */
  /* Chaque saisie rend { el, lire() → réponse (format de reponseAttendue), marquer(résultat), figer() } ; la vérification
     est celle de verifierReponse. Classes préfixées « qz- » (site.css, « Quiz de chapitre »). */
  var LETTRES = 'ABCDEFGH';
  var NOUVEAUX = { qcm: 1, vf: 1, associer: 1, tableau: 1, arbre: 1, exercice: 1 };
  function texteJoli(t) {                        // texte brut d'un message : « P_A(B) », « P_C₁(S) » avec un vrai indice
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/_\{([^{}]+)\}|_([A-Za-zÀ-ÿ][\u0304\u0305]?[₀-₉0-9]*)/g, function (x, a, b) { return '<sub>' + (a || b) + '</sub>'; });
  }
  function ecrireMsg(m, txt) {                  // texte simple ; avec des formules \( … \), elles sont rendues
    if (txt && /\\\(/.test(txt)) { m.innerHTML = txt; rendre(m); }
    else if (txt && /_/.test(txt)) m.innerHTML = texteJoli(txt);
    else m.textContent = txt || '';
  }
  function texteSimple(tex) {                   // « \overline{A} » → « A barre » (étiquettes pour les lecteurs d'écran)
    return String(tex == null ? '' : tex).replace(/<[^>]*>/g, ' ').replace(/\\\(|\\\)/g, ' ').replace(/\\overline\{([^{}]*)\}/g, '$1 barre')
      .replace(/\\cap/g, ' inter ').replace(/\\cup/g, ' union ').replace(/\{,\}/g, ',').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  }
  function celluleHTML(c) {                     // une cellule : HTML ; un nombre LaTeX écrit sans \( \) (« 0{,}3 ») y est mis
    c = String(c == null ? '' : c);
    return !/\\\(/.test(c) && !/</.test(c) && /\\|\{,\}|\^|_/.test(c) ? '\\(' + c + '\\)' : c;
  }
  /* Une ligne de cases « texte {0} texte {1} » : le texte qui PRÉCÈDE une case lui reste collé (span.qz-case-paire), de
     même que le texte qui suit la dernière (unité) : au retour à la ligne, « Membre de droite : » ne se sépare plus de sa
     case (relecture du quiz TERM CH02, 19 nov. 2026) ; un long texte passe à la ligne DANS sa paire. champ(i) crée la case i. */
  function poserCases(ligne, modele, champ) {
    var texte = null, dernier = null;
    morceauxModele(String(modele)).forEach(function (m) {
      var x = /^\{(\d+)\}$/.exec(m);
      if (x) {
        var mf = champ(+x[1]);
        if (texte) { dernier = el('span', 'qz-case-paire'); dernier.appendChild(texte); dernier.appendChild(mf); texte = null; }
        else dernier = mf;
        ligne.appendChild(dernier);
      } else if (m) {
        if (texte) ligne.appendChild(texte);
        // « \\(\\qquad\\) Membre de droite : » : l'espace de tête devient une marge à droite de ce qui précède (invisible en
        // fin de ligne) ; au retour à la ligne, l'étiquette ne commence plus par un blanc
        var e = /^\s*\\\(\s*\\(q?quad)(?![a-zA-Z])\s*/.exec(m);
        if (e && ligne.lastChild) {
          ligne.lastChild.classList.add(e[1] === 'qquad' ? 'qz-case-tres-loin' : 'qz-case-loin');
          m = '\\(' + m.slice(e[0].length);
          m = m.replace(/^\\\(\s*\\\)\s*/, '');
        }
        texte = m.trim() ? el('span', 'quiz-prefixe', m) : null;
      }
    });
    if (!texte) return;
    if (dernier && dernier.classList.contains('qz-case-paire')) dernier.appendChild(texte);
    else if (dernier) { var g = el('span', 'qz-case-paire'); ligne.replaceChild(g, dernier); g.appendChild(dernier); g.appendChild(texte); }
    else ligne.appendChild(texte);
  }
  function morceauxModele(s) {                  // « texte {0} texte {1} » ; un {k} DANS une formule \( … \) n'est pas une case
    var out = [], re = /\\\([\s\S]*?\\\)|\{(\d+)\}/g, m, d = 0;
    while ((m = re.exec(s))) { if (m[1] == null) continue; out.push(s.slice(d, m.index), m[0]); d = re.lastIndex; }
    out.push(s.slice(d));
    return out;
  }
  function boutonChoix(classe, html) { var b = el('button', classe, html); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); return b; }
  function entreeSuivante(champs, valider) {    // Entrée : la case vide suivante, sinon on valide
    champs.forEach(function (mf, i) {
      mf.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        for (var j = 1; j < champs.length; j++) {
          var m = champs[(i + j) % champs.length];
          if (m && !m.readOnly && !String(m.value || '').trim()) { try { m.focus(); } catch (e) {} return; }
        }
        valider();
      });
    });
  }
  function figerChamps(mfs) { mfs.forEach(function (mf) { if (mf) { mf.readOnly = true; mf.classList.remove('vide'); } }); }

  /* ----- QCM : cartes à toucher (lettres A, B, C… après mélange) ----- */
  function saisieQcm(q) {
    var multi = !!q.bonnes, ordre = q.propositions.map(function (_, i) { return i; });
    if (q.melanger !== false) ordre = melanger(ordre);
    var figs = q.propositions.some(function (t) { return /<img\b/.test(String(t)); });   // cartes à figures (TERM CH05) : une colonne
    // uneColonne (quiz TERM CH02, 18 nov. 2026) : une proposition par ligne (longues formules qui ne passent pas à la ligne)
    var box = el('div', 'qz-qcm' + (multi ? ' qz-multi' : '') + (figs ? ' qz-figures' : '') + (q.uneColonne ? ' qz-une-colonne' : '')), grille = el('div', 'qz-props'), choix = multi ? [] : null, cartes = {};
    grille.setAttribute('role', 'group'); grille.setAttribute('aria-label', multi ? 'Propositions (plusieurs réponses possibles)' : 'Propositions');
    if (multi) box.appendChild(el('p', 'qz-consigne', 'Plusieurs réponses possibles.'));
    ordre.forEach(function (i, rang) {
      var b = boutonChoix('qz-prop', '<span class="qz-lettre" aria-hidden="true">' + LETTRES[rang] + '</span><span class="qz-prop-txt">' + q.propositions[i] +
        '</span><span class="qz-marque" aria-hidden="true"></span>');
      b.dataset.i = i; cartes[i] = b;
      b.addEventListener('click', function () {
        if (b.disabled) return;
        if (multi) { var j = choix.indexOf(i); if (j >= 0) choix.splice(j, 1); else choix.push(i); } else choix = i;
        maj();
      });
      grille.appendChild(b);
    });
    box.appendChild(grille); rendre(box);
    function maj() {
      ordre.forEach(function (i) { var on = multi ? choix.indexOf(i) >= 0 : choix === i; cartes[i].classList.toggle('choisie', on); cartes[i].setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
    return {
      el: box, ordre: ordre,
      lire: function () { return multi ? choix.slice().sort(function (a, b) { return a - b; }) : choix; },
      marquer: function (r) {
        if (r.etat === 'faux' && !multi && choix != null) {           // la carte fausse passe en rouge, on ne peut plus la choisir
          var b = cartes[choix]; b.classList.add('qz-faux'); b.disabled = true;
          b.appendChild(el('span', 'qz-sr', ' (réponse fausse)'));
          choix = null; maj();
        }
        if (r.etat === 'juste') (multi ? choix : [choix]).forEach(function (i) { cartes[i].classList.add('qz-juste'); });
      },
      figer: function () { ordre.forEach(function (i) { cartes[i].disabled = true; }); }
    };
  }

  /* ----- vrai / faux : deux grands boutons, une seule tentative ----- */
  function saisieVf() {
    var box = el('div', 'qz-vf'), choix = null, bs = [];
    box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Vrai ou faux');
    [['Vrai', true], ['Faux', false]].forEach(function (x) {
      var b = boutonChoix('qz-vf-b', '<span class="qz-marque" aria-hidden="true"></span><span>' + x[0] + '</span>'); b.dataset.v = x[1] ? 'vrai' : 'faux';
      b.addEventListener('click', function () { if (b.disabled) return; choix = x[1]; maj(); });
      box.appendChild(b); bs.push([b, x[1]]);
    });
    function maj() { bs.forEach(function (x) { x[0].classList.toggle('choisie', choix === x[1]); x[0].setAttribute('aria-pressed', choix === x[1] ? 'true' : 'false'); }); }
    return {
      el: box,
      lire: function () { return choix; },
      marquer: function (r) {
        bs.forEach(function (x) { if (x[1] !== choix) return; if (r.etat === 'faux') x[0].classList.add('qz-faux'); if (r.etat === 'juste') x[0].classList.add('qz-juste'); });
      },
      figer: function () { bs.forEach(function (x) { x[0].disabled = true; }); }
    };
  }

  /* ----- bouton « Aucune » (quiz TERM CH02, 18 nov. 2026, comme le bouton de kwyk) : aucun: 'aucune' (le mot attendu
     quand il n'y a pas de limite, pas de raison…) ; il écrit le mot dans le cadre, l'élève valide ensuite ----- */
  function boutonAucun(q, mf) {
    var mot = String(q.aucun), b = el('button', 'qz-aucun', mot.charAt(0).toUpperCase() + mot.slice(1));
    b.type = 'button'; b.setAttribute('aria-label', 'Écrire « ' + mot + ' » dans le cadre');
    b.addEventListener('click', function () {
      if (b.disabled || mf.readOnly) return;
      mf.value = '\\text{' + mot + '}';
      mf.dispatchEvent(new Event('input', { bubbles: true }));
      if (mf._majVide) mf._majVide();
    });
    return b;
  }

  /* ----- DÉMONSTRATION EN BLOCS (quiz TERM CH02, 18 nov. 2026, façon kwyk) : une question « associer » avec blocs: true.
     Les lignes (gauche) sont les mots de liaison « On sait que », « or, », « donc » (une nouvelle étape commence à chaque
     « On sait que », jamais d'imbrication) ; les choix (droite) sont les BLOCS, dans une palette sous la démonstration.
     On touche une place (la première place vide est prête), puis un bloc : il s'y pose et la place vide suivante est prête ;
     un bloc sert autant de fois qu'il faut ; une place remplie se touche pour être changée, une seconde fois pour être
     vidée. Couleurs des blocs (genres, comme kwyk) : 'prop' propriété / théorème / définition (brun), 'fait' affirmation
     sur la suite (bleu), 'ineg' inégalité (violet). Même vérification, même barème et même rapport qu'« associer ».
     Apparence FAÇON SCRATCH (M. Colin, 18 nov. 2026, 22 h 33) : « Démonstration » en bloc chapeau, chaque ligne une pièce de
     commande à encoche et à ergot (une seule pile), un trou de la forme des blocs dans chaque ligne ; tous les blocs ont la
     même forme ; un bloc posé s'incruste dans son trou (site.css : formes en clip-path). ----- */
  function saisieBlocs(q) {
    var n = q.gauche.length, rep = q.gauche.map(function () { return null; }), actif = 0, fige = false;
    var ordreD = q.droite.map(function (_, j) { return j; });
    if (q.melanger !== false) ordreD = melanger(ordreD);
    function genre(j) { var g = q.genres && q.genres[j]; return g === 'prop' || g === 'ineg' ? g : 'fait'; }
    var box = el('div', 'qz-blocs'), demo = el('div', 'qz-blocs-demo'), pal = el('div', 'qz-blocs-palette');
    demo.appendChild(el('p', 'qz-blocs-cap qz-blocs-chapeau', 'Démonstration'));      // le bloc chapeau de la pile
    var lignes = q.gauche.map(function (g, i) {
      var etape = i > 0 && /^(on sait|initialisation|hérédité|conclusion)/i.test(texteSimple(g));   // une nouvelle étape de la démonstration
      var li = el('div', 'qz-blocs-ligne' + (etape ? ' qz-blocs-etape' : '')), mot = el('span', 'qz-blocs-mot', g), place = el('button', 'qz-blocs-place');
      place.type = 'button'; place.dataset.i = i;
      place.addEventListener('click', function () {
        if (fige) return;
        if (actif === i && rep[i] != null) rep[i] = null;          // seconde touche sur une place remplie : vidée
        actif = i; li.classList.remove('qz-faux'); maj();
      });
      li.appendChild(mot); li.appendChild(place); demo.appendChild(li);
      return { li: li, place: place, nom: texteSimple(g) };
    });
    pal.appendChild(el('p', 'qz-blocs-cap qz-blocs-cap-pal', 'Blocs à placer'));
    var liste = el('div', 'qz-blocs-liste'), bs = {};
    liste.setAttribute('role', 'group'); liste.setAttribute('aria-label', 'Blocs à placer dans la démonstration');
    ordreD.forEach(function (j) {
      var b = el('button', 'qz-bloc qz-bloc-' + genre(j), q.droite[j]); b.type = 'button'; b.dataset.j = j;
      b.addEventListener('click', function () { if (!fige) poser(j); });
      liste.appendChild(b); bs[j] = b;
    });
    pal.appendChild(liste);
    box.appendChild(demo); box.appendChild(pal);
    rendre(box);
    function poser(j) {
      if (actif < 0) actif = rep.indexOf(null);
      if (actif < 0) return;                                      // tout est rempli : toucher d'abord la place à changer
      rep[actif] = j; lignes[actif].li.classList.remove('qz-faux');
      var suivante = -1;
      for (var k = 1; k <= n; k++) { var x = (actif + k) % n; if (rep[x] == null) { suivante = x; break; } }
      actif = suivante;
      maj();
    }
    function maj() {
      lignes.forEach(function (l, i) {
        var j = rep[i], p = l.place;
        p.className = 'qz-blocs-place' + (j != null ? ' remplie qz-bloc-' + genre(j) : '') + (i === actif && !fige ? ' active' : '');
        if (p._j !== j) {
          p._j = j; p.innerHTML = j != null ? q.droite[j] : '';
          if (j != null) {
            rendre(p);
            if (pret) { p.classList.add('qz-incruste'); p.addEventListener('animationend', function fin() { p.classList.remove('qz-incruste'); p.removeEventListener('animationend', fin); }); }   // le bloc s'incruste dans son trou
          }
        }
        p.setAttribute('aria-pressed', i === actif && !fige ? 'true' : 'false');
        p.setAttribute('aria-label', 'Place ' + (i + 1) + ', après « ' + l.nom + ' » : ' + (j != null ? texteSimple(q.droite[j]) : 'vide'));
      });
    }
    var pret = false;                                               // pas d'animation au premier affichage
    maj();
    pret = true;
    return {
      el: box, ordreD: ordreD,
      lire: function () { return rep.slice(); },
      marquer: function (r) {
        lignes.forEach(function (l, i) { l.li.classList.toggle('qz-faux', !!(r.faux && r.faux.indexOf(i) >= 0)); l.li.classList.toggle('qz-juste', r.etat === 'juste'); });
      },
      figer: function () { fige = true; maj(); lignes.forEach(function (l) { l.place.disabled = true; }); ordreD.forEach(function (j) { bs[j].disabled = true; }); }
    };
  }

  /* ----- associer : une ligne par élément de gauche, les choix de droite en pastilles ----- */
  function saisieAssocier(q) {
    if (q.blocs) return saisieBlocs(q);
    var vf = estVraiFaux(q), box = el('div', 'qz-assoc' + (vf ? ' qz-assoc-vf' : '')), rep = q.gauche.map(function () { return null; }), lignes = [];
    var ordreD = q.droite.map(function (_, j) { return j; });
    if (q.melanger === true && !vf) ordreD = melanger(ordreD);      // option : choix de droite dans un ordre au hasard
    q.gauche.forEach(function (g, i) {
      var li = el('div', 'qz-assoc-ligne'), gl = el('div', 'qz-assoc-g', g), dr = el('div', 'qz-assoc-d');
      dr.setAttribute('role', 'group'); dr.setAttribute('aria-label', 'Réponse associée à ' + texteSimple(g));
      var ps = [];
      ordreD.forEach(function (j) {
        var b = boutonChoix('qz-pastille', q.droite[j]); b.dataset.j = j; ps[j] = b;
        b.addEventListener('click', function () { if (b.disabled) return; rep[i] = rep[i] === j ? null : j; li.classList.remove('qz-faux'); maj(i); });
        dr.appendChild(b);
      });
      li.appendChild(gl); li.appendChild(dr); box.appendChild(li); lignes.push({ li: li, ps: ps });
    });
    rendre(box);
    function maj(i) { lignes[i].ps.forEach(function (b, j) { b.classList.toggle('choisie', rep[i] === j); b.setAttribute('aria-pressed', rep[i] === j ? 'true' : 'false'); }); }
    return {
      el: box, ordreD: ordreD,
      lire: function () { return rep.slice(); },
      marquer: function (r) {
        lignes.forEach(function (l, i) { l.li.classList.toggle('qz-faux', !!(r.faux && r.faux.indexOf(i) >= 0)); l.li.classList.toggle('qz-juste', r.etat === 'juste'); });
      },
      figer: function () { lignes.forEach(function (l) { l.ps.forEach(function (b) { b.disabled = true; }); }); }
    };
  }

  /* ----- tableau à double entrée, arbre pondéré : des cases MathLive compactes à la place des {k} ----- */
  function saisieGrille(q, ctx) {
    var champs = [], arbre = q.type === 'arbre';
    var o = { champ: function (k, aria) {
      var c = q.cases[k] || {}, mf = ctx.champ('quiz-champ petit qz-champ', (c.nom || aria || 'case ' + (k + 1)) + ' (' + ctx.label + ')');
      mf.dataset.case = k;                         // l'ordre des cadres est celui de la lecture : math-field[data-case="k"] = case k
      mf.addEventListener('input', function () { mf.classList.remove('qz-faux', 'qz-illisible'); });
      champs[k] = mf; return mf;
    } };
    var fig = arbre ? dessinerArbre(q.arbre, 'saisie', o) : dessinerTableau(q.tableau, 'saisie', o);
    rendre(fig.el);
    entreeSuivante(Array.prototype.slice.call(fig.el.querySelectorAll('math-field')), ctx.valider);
    return {
      el: fig.el, champs: champs,
      lire: function () { return q.cases.map(function (_, k) { return champs[k] ? champs[k].value : ''; }); },
      marquer: function (r) {
        champs.forEach(function (mf, k) {
          if (!mf) return;
          mf.classList.toggle('qz-faux', !!(r.faux && r.faux.indexOf(k) >= 0));
          mf.classList.toggle('qz-illisible', !!(r.illisibles && r.illisibles.indexOf(k) >= 0));
        });
      },
      marquerFin: function (rep) {                // revue finale du quiz noté : chaque case en vert ou en rouge
        var d = detailGrille(q, rep);
        champs.forEach(function (mf, k) { if (!mf) return; mf.classList.remove('vide', 'qz-illisible'); mf.classList.toggle('qz-juste', !!d[k]); mf.classList.toggle('qz-faux', !d[k]); });
      },
      figer: function () { figerChamps(champs); }
    };
  }

  /* ----- expression, cases dans une phrase : pour les parties d'un exercice (même aspect que les questions seules) ----- */
  function saisieExpr(q, ctx) {
    var ligne = el('div', 'quiz-ligne'), mf = ctx.champ('quiz-champ', 'Ta réponse (' + ctx.label + ')');
    if (q.prefixe) ligne.appendChild(el('span', 'quiz-prefixe', q.prefixe));
    ligne.appendChild(mf);
    if (q.suffixe) ligne.appendChild(el('span', 'quiz-prefixe quiz-suffixe', q.suffixe));
    var bA = typeof q.aucun === 'string' && q.type !== 'intervalles' ? boutonAucun(q, mf) : null;   // « Aucune » (TERM CH02)
    if (bA) ligne.appendChild(bA);
    rendre(ligne);
    mf.addEventListener('input', function () { mf.classList.remove('qz-faux'); });
    entreeSuivante([mf], ctx.valider);
    var bloc = ligne;
    if (q.type === 'intervalles') {             // partie « intervalles » (quiz TERM CH05) : l'aide du clavier, comme une question seule
      bloc = el('div'); bloc.appendChild(ligne);
      var ai = el('p', 'quiz-aide-tab', 'Crochets [ ], infini ∞ et réunion ∪ : onglet ≤∈ℝ du clavier (au clavier de l’ordinateur : « oo » donne ∞).'); bloc.appendChild(ai);
    }
    return { el: bloc, champs: [mf], lire: function () { return mf.value; },
      marquer: function (r) { mf.classList.toggle('qz-faux', r.etat === 'faux'); }, figer: function () { figerChamps([mf]); if (bA) bA.disabled = true; } };
  }
  function saisieCases(q, ctx) {
    var ligne = el('div', 'quiz-ligne quiz-cases'), champs = [];
    poserCases(ligne, q.modele, function (i) {
      var cd = q.cases[i] || {}, mf = ctx.champ('quiz-champ petit' + (cd.large ? ' large' : ''), (cd.nom || 'case ' + (i + 1)) + ' (' + ctx.label + ')');
      mf.addEventListener('input', function () { mf.classList.remove('qz-faux'); });
      champs[i] = mf; return mf;
    });
    rendre(ligne);
    entreeSuivante(Array.prototype.slice.call(ligne.querySelectorAll('math-field')), ctx.valider);
    return { el: ligne, champs: champs, lire: function () { return champs.map(function (mf) { return mf ? mf.value : ''; }); },
      marquer: function (r) {
        champs.forEach(function (mf, k) { if (mf) mf.classList.toggle('qz-faux', r.etat === 'faux' && verifierExpr(caseVerif(q.cases[k]), mf.value).etat === 'faux'); });
      },
      marquerFin: function (rep) {                // revue finale du quiz noté (question d'un exercice) : cases vertes / rouges
        var d = detailCases(q, rep || []);
        champs.forEach(function (mf, k) { if (!mf) return; mf.classList.remove('vide'); mf.classList.toggle('qz-juste', !!d[k]); mf.classList.toggle('qz-faux', !d[k]); });
      },
      figer: function () { figerChamps(champs); } };
  }

  /* ----- exercice : énoncé commun, parties numérotées « 1. », « 2. »…, un seul bouton Valider ----- */
  function saisieExercice(q, ctx) {
    var box = el('ol', 'qz-exo'), parties = [];
    q.parties.forEach(function (pa, i) {
      var li = el('li', 'qz-partie'), tete = el('div', 'qz-partie-tete'), en = el('div', 'qz-partie-enonce', pa.enonce);
      tete.appendChild(el('span', 'qz-partie-num', (i + 1) + '.'));
      if (pa.figure) { var f = el('figure', 'quiz-figure'), im = el('img'); im.src = pa.figure; im.alt = pa.figureAlt || 'Figure de la question'; f.appendChild(im); en.appendChild(f); }
      figuresLecture(pa, en);
      var apresZ = pa.enonceApres && (pa.type === 'arbre' || pa.type === 'tableau');   // après la figure à compléter
      if (pa.enonceApres && !apresZ) en.appendChild(el('div', 'quiz-enonce-apres', pa.enonceApres));
      tete.appendChild(en);
      var coche = el('span', 'qz-partie-coche', '<svg viewBox="0 0 24 24" focusable="false"><path d="M6 12.5l4 4 8-9"/></svg>'); coche.setAttribute('aria-hidden', 'true');
      tete.appendChild(coche); li.appendChild(tete); rendre(tete);
      var s = saisiePour(pa, { label: ctx.label + ', partie ' + (i + 1), valider: ctx.valider, champ: ctx.champ });
      var z = el('div', 'qz-partie-zone'), msg = el('p', 'qz-partie-msg');
      msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
      z.appendChild(s.el); li.appendChild(z); li.appendChild(msg); box.appendChild(li);
      if (apresZ) { var ea = el('div', 'quiz-enonce-apres', pa.enonceApres); z.appendChild(ea); rendre(ea); }
      parties.push({ q: pa, li: li, s: s, msg: msg, etat: '' });
    });
    function verifier() {
      var nouveaux = false;
      var res = parties.map(function (p) {
        if (p.etat) return { etat: p.etat };                         // déjà figée : juste, ou vrai / faux raté
        var rep = p.s.lire();
        return estVide(p.q, rep) ? { etat: 'vide' } : verifierReponse(p.q, rep);
      });
      res.forEach(function (r, i) {
        var p = parties[i];
        if (p.etat) return;
        p.msg.className = 'qz-partie-msg'; ecrireMsg(p.msg, '');
        if (r.etat === 'juste') { p.etat = 'juste'; p.li.classList.add('reussie'); p.s.marquer(r); p.s.figer(); }
        else if (r.etat === 'faux') {
          nouveaux = true; p.s.marquer(r); ecrireMsg(p.msg, r.msg || 'Ce n’est pas la bonne réponse.'); p.msg.classList.add('ko');
          if (r.fige) { p.etat = 'rate'; p.li.classList.add('ratee'); p.s.figer(); }
        } else if (r.etat === 'lecture') { p.s.marquer(r); ecrireMsg(p.msg, r.msg); p.msg.classList.add('info'); }
      });
      var b = bilanExercice(res), fini = !b.reste.length;
      if (b.etat === 'faux' && !nouveaux)                            // seule une partie déjà ratée (vrai / faux) reste fausse
        b = fini ? { etat: 'faux', calme: true, fige: true, parties: res, msg: 'Les autres questions sont justes, mais ' + b.msg.charAt(0).toLowerCase() + b.msg.slice(1, -1) + ' : regarde la correction.' }
          : { etat: 'lecture', parties: res, msg: b.msg.replace(/^.*?\.\s*/, '') };
      else if (b.etat === 'faux' && fini && parties.every(function (p) { return p.etat; })) b.fige = true;
      return b;
    }
    return {
      el: box, parties: parties, verifier: verifier,
      lire: function () { return parties.map(function (p) { return p.s.lire(); }); },
      marquer: function () {}, figer: function () { parties.forEach(function (p) { p.s.figer(); }); },
      marquerFin: function (rep, r) {             // revue finale du quiz noté : chaque question juste (vert), en partie juste (orange), fausse (rouge)
        var rs = (r && r.parties) || [];
        parties.forEach(function (p, i) {
          var ri = rs[i], x = pointsReponse(p.q, (rep || [])[i], ri);
          p.li.classList.toggle('reussie', x === 1); p.li.classList.toggle('partielle', x > 0 && x < 1); p.li.classList.toggle('ratee', !(x > 0));
          if (p.s.marquerFin) p.s.marquerFin((rep || [])[i], ri);
          else if (ri && ri.etat && ri.etat !== 'juste') try { p.s.marquer(ri); } catch (e) {}
        });
      }
    };
  }
  function saisiePour(q, ctx) {
    switch (q.type) {
      case 'qcm': return saisieQcm(q, ctx);
      case 'vf': return saisieVf(q, ctx);
      case 'associer': return saisieAssocier(q, ctx);
      case 'tableau': case 'arbre': return saisieGrille(q, ctx);
      case 'cases': return saisieCases(q, ctx);
      case 'exercice': return saisieExercice(q, ctx);
      case 'signes': case 'variations': return saisieSV(q, ctx);
      default: return saisieExpr(q, ctx);
    }
  }

  /* ----- figures dessinées par le moteur : tableau à double entrée, arbre pondéré ----- */
  /* mode 'saisie' : cases MathLive (o.champ(k, aria)) ; 'lecture' : emplacement vide en pointillés ; 'correction' :
     emplacement en pointillés où la valeur o.valeur(k) s'écrira (en rouge) à son étape (o.slots[k] = { el, val }). */
  function contenuCase(v, mode, o, aria) {
    var k = caseDe(v);
    if (k < 0) return null;
    if (mode === 'saisie') return o.champ(k, aria);
    if (mode === 'rapport') return o.rapport(k, aria);   // notes.html (rapport détaillé d'un quiz noté)
    if (mode === 'correction') {
      var s = el('span', 'qz-slot'), val = el('span', 'qz-val qv-e', '\\(' + o.valeur(k) + '\\)');
      val.dataset.case = k; val.dataset.tex = o.valeur(k);
      s.appendChild(el('span', 'qz-slot-vide')); s.appendChild(val); o.slots[k] = { el: s, val: val };
      return s;
    }
    return el('span', 'qz-vide-slot');
  }
  function figuresLecture(q, cont, toutes) {   // arbre / tableau sous l'énoncé, en lecture seule (toutes : ceux à compléter aussi)
    if (q.arbre && (toutes || q.type !== 'arbre')) cont.appendChild(dessinerArbre(q.arbre, 'lecture').el);
    if (q.tableau && (toutes || q.type !== 'tableau')) cont.appendChild(dessinerTableau(q.tableau, 'lecture').el);
  }
  function dessinerTableau(t, mode, o) {
    o = o || {}; o.slots = o.slots || [];
    var cadre = el('div', 'qz-tab-cadre'), tab = el('table', 'qz-tab' + (t.totaux ? ' qz-avec-totaux' : '')), R = t.lignes.length;
    t.lignes.forEach(function (ligne, i) {
      var tr = el('tr'), C = ligne.length;
      ligne.forEach(function (c, j) {
        var tete = i === 0 || j === 0, td = el(tete ? 'th' : 'td');
        if (tete) td.setAttribute('scope', i === 0 ? 'col' : 'row');
        if (i === 0 && j === 0 && !String(c).trim()) td.className = 'qz-coin';
        if (t.totaux && (i === R - 1 || j === C - 1)) td.classList.add('qz-total');
        var x = contenuCase(c, mode, o, 'Case ' + [texteSimple(ligne[0]), texteSimple(t.lignes[0][j])].filter(Boolean).join(', '));
        if (x) { td.appendChild(x); td.classList.add('qz-case'); } else td.innerHTML = celluleHTML(c);
        tr.appendChild(td);
      });
      tab.appendChild(tr);
    });
    cadre.appendChild(tab);
    return { el: cadre, slots: o.slots };
  }

  /* Arbre pondéré HORIZONTAL, comme dans le livret de M. Colin : racine (point noir) à gauche, nœuds dans des cercles,
     probabilité au milieu de la branche, au-dessus d'une branche qui monte, au-dessous d'une branche qui descend.
     Traits en SVG, étiquettes en HTML positionnées (cases MathLive comprises). La mise en page se refait quand une
     étiquette change de taille (saisie, polices) : écarts choisis pour qu'aucune étiquette ne touche une autre, un
     nœud ou une branche (une étiquette peut glisser le long de sa branche si le milieu est trop serré). */
  var POS_BRANCHE = [0.5, 0.42, 0.58, 0.34, 0.66, 0.74];
  function boite(l, t, r, b) { return { l: l, t: t, r: r, b: b }; }
  function chevauche(a, b) { return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; }
  function segmentCoupe(p, q, b) {              // le segment [pq] rencontre-t-il la boîte b ? (Liang–Barsky)
    var t0 = 0, t1 = 1, dx = q.x - p.x, dy = q.y - p.y, P = [-dx, dx, -dy, dy], Q = [p.x - b.l, b.r - p.x, p.y - b.t, b.b - p.y];
    for (var i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return false; continue; }
      var r = Q[i] / P[i];
      if (P[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return true;
  }
  function dessinerArbre(a, mode, o) {
    o = o || {}; o.slots = o.slots || [];
    var cadre = el('div', 'qz-arbre-cadre'), zone = el('div', 'qz-arbre'), svg = svgEl('svg', { class: 'qz-arbre-traits', 'aria-hidden': 'true', focusable: 'false' });
    zone.setAttribute('role', 'group'); zone.setAttribute('aria-label', 'Arbre pondéré');
    zone.appendChild(svg); cadre.appendChild(zone);
    var racine = { prof: 0, enfants: [], racine: true }, noeuds = [], aretes = [], feuilles = [];
    (function construire(parent, bs, prof) {
      (bs || []).forEach(function (b) {
        var nd = { prof: prof, enfants: [], b: b, parent: parent, nom: texteSimple(b.nom) };
        parent.enfants.push(nd); noeuds.push(nd);
        if (b.branches && b.branches.length) construire(nd, b.branches, prof + 1); else feuilles.push(nd);
      });
    })(racine, a.branches, 1);
    var profMax = feuilles.reduce(function (m, f) { return Math.max(m, f.prof); }, 1);
    var point = el('span', 'qz-racine'); zone.appendChild(point);
    var file = racine.enfants.slice();            // ordre de lecture (et de tabulation) : niveau par niveau, de haut en bas
    while (file.length) {
      var nd = file.shift(), p = String(nd.b.p == null ? '' : nd.b.p).trim(), ar = { de: nd.parent, vers: nd, lab: null };
      var x = contenuCase(p, mode, o, 'Probabilité de la branche ' + (nd.parent.racine ? 'vers ' : 'de ' + nd.parent.nom + ' vers ') + nd.nom);
      if (x || p) { ar.lab = el('span', 'qz-proba' + (x ? ' qz-proba-case' : '')); if (x) ar.lab.appendChild(x); else ar.lab.innerHTML = '\\(' + p + '\\)'; zone.appendChild(ar.lab); }
      nd.el = el('span', 'qz-noeud'); nd.t = el('span', 'qz-noeud-t', '\\(' + nd.b.nom + '\\)'); nd.el.appendChild(nd.t); zone.appendChild(nd.el);
      aretes.push(ar);
      file = file.concat(nd.enfants);
    }
    if (a.chemins) feuilles.forEach(function (f, i) {
      var v = a.chemins[i]; if (v == null || !String(v).trim()) return;
      var e = el('span', 'qz-chemin'), nom = a.cheminsNoms && a.cheminsNoms[i];
      if (nom) e.appendChild(el('span', 'qz-chemin-nom', '\\(' + nom + '=\\)'));
      var c = contenuCase(v, mode, o, 'Probabilité du chemin ' + (nom ? texteSimple(nom) : 'n° ' + (i + 1)));
      e.appendChild(c || el('span', 'qz-chemin-val', '\\(' + v + '\\)'));
      f.chemin = e; zone.appendChild(e);
    });

    function taille(e) { var r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; }
    function essai(R, dx, dy, smax, force) {
      feuilles.forEach(function (f, i) { f.y = i * dy; });
      (function posY(nd) { if (!nd.enfants.length) return; nd.enfants.forEach(posY); nd.y = (nd.enfants[0].y + nd.enfants[nd.enfants.length - 1].y) / 2; })(racine);
      var X = [0];                                // abscisses niveau par niveau : une branche ne monte (ou ne descend) pas plus que smax
      for (var d = 1; d <= profMax; d++) {
        var ecart = 0;
        noeuds.forEach(function (nd) { if (nd.prof === d) ecart = Math.max(ecart, Math.abs(nd.y - nd.parent.y)); });
        X[d] = X[d - 1] + Math.max(dx, Math.round(ecart / smax));
      }
      racine.x = 0; noeuds.forEach(function (nd) { nd.x = X[nd.prof]; });
      var col = X[profMax] + R + (smax > 1.2 ? 20 : smax > 0.8 ? 26 : 34), obst = [boite(-7, racine.y - 7, 7, racine.y + 7)], places = [];
      noeuds.forEach(function (nd) { obst.push(boite(nd.x - R - 1, nd.y - R - 1, nd.x + R + 1, nd.y + R + 1)); });
      var basChemin = -Infinity;
      for (var c = 0; c < feuilles.length; c++) {
        var f = feuilles[c]; if (!f.chemin) continue;
        if (!force && f.y - f.ch / 2 < basChemin + 4) return null;     // deux chemins voisins se touchent : plus d'écart
        obst.push(boite(col, f.y - f.ch / 2, col + f.cw, f.y + f.ch / 2)); basChemin = f.y + f.ch / 2;
      }
      aretes.forEach(function (ar) {
        var A = ar.de, B = ar.vers, ux = B.x - A.x, uy = B.y - A.y, l = Math.sqrt(ux * ux + uy * uy), r0 = A.racine ? 4.5 : R;
        ux /= l; uy /= l; ar.ux = ux; ar.uy = uy;
        ar.a = { x: A.x + ux * r0, y: A.y + uy * r0 }; ar.b = { x: B.x - ux * R, y: B.y - uy * R };
      });
      function libre(bx, ar) {
        var m = boite(bx.l - 2, bx.t - 2, bx.r + 2, bx.b + 2), j;
        for (j = 0; j < obst.length; j++) if (chevauche(m, obst[j])) return false;
        for (j = 0; j < places.length; j++) if (chevauche(m, places[j])) return false;
        for (j = 0; j < aretes.length; j++) if (aretes[j] !== ar && segmentCoupe(aretes[j].a, aretes[j].b, m)) return false;
        return true;
      }
      for (var i = 0; i < aretes.length; i++) {
        var ar = aretes[i]; if (!ar.lab) continue;
        var cotes = Math.abs(ar.uy) < 1e-6 ? [-1, 1] : [ar.uy < 0 ? -1 : 1], ok = false;   // -1 : au-dessus ; 1 : au-dessous
        for (var ci = 0; ci < cotes.length && !ok; ci++) for (var ti = 0; ti < POS_BRANCHE.length && !ok; ti++) {
          var t = POS_BRANCHE[ti], nx = cotes[ci] < 0 ? ar.uy : -ar.uy, ny = cotes[ci] < 0 ? -ar.ux : ar.ux;
          var mx = ar.a.x + (ar.b.x - ar.a.x) * t, my = ar.a.y + (ar.b.y - ar.a.y) * t;
          var d = ar.w / 2 * Math.abs(nx) + ar.h / 2 * Math.abs(ny) + 3, cx = mx + nx * d, cy = my + ny * d;
          var bx = boite(cx - ar.w / 2, cy - ar.h / 2, cx + ar.w / 2, cy + ar.h / 2);
          if (libre(bx, ar) || (force && ti === 0 && ci === 0)) { ar.cx = cx; ar.cy = cy; places.push(bx); ok = true; }
        }
        if (!ok) return null;
      }
      var x1 = X[profMax] + R + 5;
      aretes.forEach(function (ar) { if (ar.lab) x1 = Math.max(x1, ar.cx + ar.w / 2); });
      feuilles.forEach(function (f) { if (f.chemin) x1 = Math.max(x1, col + f.cw); });
      var x0 = -7;
      aretes.forEach(function (ar) { if (ar.lab) x0 = Math.min(x0, ar.cx - ar.w / 2); });
      return { R: R, col: col, dx: dx, dy: dy, smax: smax, largeur: x1 - x0 + 12 };
    }
    function appliquer(L) {
      var R = L.R, PAD = 6, x0 = -7, y0 = racine.y - 7, x1 = 7, y1 = racine.y + 7;
      function inclure(l, t, r, b) { x0 = Math.min(x0, l); y0 = Math.min(y0, t); x1 = Math.max(x1, r); y1 = Math.max(y1, b); }
      noeuds.forEach(function (nd) { inclure(nd.x - R - 2, nd.y - R - 2, nd.x + R + 5, nd.y + R + 6); });   // ombre portée comprise
      aretes.forEach(function (ar) { if (ar.lab) inclure(ar.cx - ar.w / 2, ar.cy - ar.h / 2, ar.cx + ar.w / 2, ar.cy + ar.h / 2); });
      feuilles.forEach(function (f) { if (f.chemin) inclure(L.col, f.y - f.ch / 2, L.col + f.cw, f.y + f.ch / 2); });
      var ox = PAD - x0, oy = PAD - y0, W = Math.ceil(x1 - x0 + 2 * PAD), H = Math.ceil(y1 - y0 + 2 * PAD);
      zone.style.width = W + 'px'; zone.style.height = H + 'px';
      svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      aretes.forEach(function (ar) { svg.appendChild(svgEl('line', { x1: ox + ar.a.x, y1: oy + ar.a.y, x2: ox + ar.b.x, y2: oy + ar.b.y, class: 'qz-trait' })); });
      feuilles.forEach(function (f) {                          // une petite flèche de la feuille vers son chemin
        if (!f.chemin) return;
        var xa = ox + f.x + R + 4, xb = ox + L.col - 5, y = oy + f.y;
        svg.appendChild(svgEl('path', { d: 'M' + xa + ' ' + y + 'H' + xb + 'M' + (xb - 5) + ' ' + (y - 3.5) + 'L' + xb + ' ' + y + 'L' + (xb - 5) + ' ' + (y + 3.5), class: 'qz-trait-chemin' }));
      });
      point.style.left = (ox - 4.5) + 'px'; point.style.top = (oy + racine.y - 4.5) + 'px';
      noeuds.forEach(function (nd) { var s = nd.el.style; s.left = (ox + nd.x - R) + 'px'; s.top = (oy + nd.y - R) + 'px'; s.width = s.height = 2 * R + 'px'; });
      aretes.forEach(function (ar) { if (ar.lab) { ar.lab.style.left = (ox + ar.cx - ar.w / 2) + 'px'; ar.lab.style.top = (oy + ar.cy - ar.h / 2) + 'px'; } });
      feuilles.forEach(function (f) { if (f.chemin) { f.chemin.style.left = (ox + L.col) + 'px'; f.chemin.style.top = (oy + f.y - f.ch / 2) + 'px'; } });
    }
    function mesurerChemins(empile) {             // empilé : le nom du chemin au-dessus de sa case (écran étroit)
      feuilles.forEach(function (f) { if (!f.chemin) return; f.chemin.classList.toggle('qz-chemin-empile', empile); var t = taille(f.chemin); f.cw = t.w; f.ch = t.h; });
    }
    function chercher(R, Hm, Wm, etroit, dispo) { // les paramètres de la mise en page retenue (sans chevauchement)
      var smax = etroit ? 1.05 : 0.72;            // téléphone : branches un peu plus pentues
      var dy0 = Math.max(2 * R + 12, Math.round(Hm) + 14), dx0 = Math.max(2 * R + (etroit ? 40 : 58), Math.round(2 * R + 0.8 * Math.min(Wm, 110) + (etroit ? 10 : 24))), L = null;
      for (var s = 0; s < 36 && !L; s++) for (var ix = 0; ix <= s && !L; ix++) L = essai(R, dx0 + 8 * ix, dy0 + 4 * (s - ix), smax);
      if (L && L.largeur > dispo) {               // trop large pour la place (téléphone, volet) : la plus étroite sans chevauchement,
        var serre = null;                         // branches plus courtes et plus pentues si besoin
        var dyMin = Math.max(2 * R + 6, Math.round(Hm) + 6);
        [smax, 1.35, 1.75, 2.2].forEach(function (sm) {
          if (serre && serre.largeur <= dispo) return;
          for (var dx = dx0; dx >= 2 * R + 20 && !(serre && serre.largeur <= dispo && serre.smax === sm); dx -= 6)
            for (var dy = dyMin; dy < dy0 + 56; dy += 4) {
              var M = essai(R, dx, dy, sm);
              if (M) { if (!serre || M.largeur < serre.largeur - 0.5 || (M.largeur <= dispo && serre.largeur > dispo)) serre = M; break; }
            }
        });
        if (serre && serre.largeur < L.largeur) L = serre;
      }
      return L || { R: R, dx: dx0 + 8 * 18, dy: dy0 + 4 * 18, smax: smax, largeur: Infinity, force: true };
    }
    function placer() {
      if (!zone.isConnected || !zone.getClientRects().length) return;
      var R = 16, Hm = 0, Wm = 0, vide = false, etroit = cadre.clientWidth < 520, dispo = cadre.clientWidth - 4;
      noeuds.forEach(function (nd) { var t = taille(nd.t); if (!t.w) vide = true; R = Math.max(R, Math.max(t.w, t.h) / 2 + 6); });
      aretes.forEach(function (ar) { if (!ar.lab) return; var t = taille(ar.lab); ar.w = t.w; ar.h = t.h; Hm = Math.max(Hm, t.h); Wm = Math.max(Wm, t.w); if (!t.w) vide = true; });
      if (vide) return;                           // pas encore affiché : on attendra
      R = Math.ceil(R);
      mesurerChemins(false);
      var L = chercher(R, Hm, Wm, etroit, dispo);
      if (L.largeur > dispo && feuilles.some(function (f) { return f.chemin && f.chemin.querySelector('.qz-chemin-nom'); })) {
        mesurerChemins(true);
        var L2 = chercher(R, Hm, Wm, etroit, dispo);
        if (L2.largeur < L.largeur - 1) L = L2; else mesurerChemins(false);
      }
      appliquer(essai(R, L.dx, L.dy, L.smax, L.force) || essai(R, L.dx, L.dy, L.smax, true));
      zone.classList.add('place');
    }
    var prevu = false;
    function planifier() { if (prevu) return; prevu = true; (window.requestAnimationFrame || setTimeout)(function () { prevu = false; placer(); }); }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(planifier);
      noeuds.forEach(function (nd) { ro.observe(nd.t); });
      aretes.forEach(function (ar) { if (ar.lab) ro.observe(ar.lab); });
      feuilles.forEach(function (f) { if (f.chemin) ro.observe(f.chemin); });
    } else setTimeout(placer, 400);
    return { el: cadre, slots: o.slots, placer: placer };
  }

  /* ----- rappel de la question dans le volet (téléphone) : énoncé, figures, propositions ----- */
  function resumeChoix(q, s, cont) {
    if (q.type === 'qcm') {
      var ul = el('ul', 'qz-rappel-props'), ordre = (s && s.ordre) || q.propositions.map(function (_, i) { return i; });
      ordre.forEach(function (i, r) { ul.appendChild(el('li', '', '<b>' + LETTRES[r] + '.</b> ' + q.propositions[i])); });
      cont.appendChild(ul);
    } else if (q.type === 'associer') {
      var u2 = el('ul', 'qz-rappel-props'), od = (s && s.ordreD) || q.droite.map(function (_, j) { return j; });
      q.gauche.forEach(function (g) { u2.appendChild(el('li', '', g + ' → ?')); });
      cont.appendChild(u2); cont.appendChild(el('p', 'qz-rappel-choix', 'Choix : ' + od.map(function (j) { return q.droite[j]; }).join(' ; ')));
    } else if (q.type === 'vf') cont.appendChild(el('p', 'qz-rappel-choix', 'Vrai ou faux ?'));
  }
  function rappelQuestion(q, s) {                // dans l'ordre de la carte : énoncé, figure, arbre / tableau, suite de l'énoncé
    var z = el('div', 'qv-rappel-texte', q.enonce);
    if (q.figure) { var fi = el('figure', 'quiz-figure'), im = el('img'); im.src = q.figure; im.alt = q.figureAlt || 'Figure de la question'; fi.appendChild(im); z.appendChild(fi); }
    figuresLecture(q, z, true);
    if (q.enonceApres) z.appendChild(el('div', 'quiz-enonce-apres', q.enonceApres));
    resumeChoix(q, s, z);
    if (q.type === 'exercice') {
      var ol = el('ol', 'qz-rappel-parties');
      q.parties.forEach(function (pa, i) {
        var li = el('li', '', pa.enonce); figuresLecture(pa, li, true);
        if (pa.enonceApres) li.appendChild(el('div', 'quiz-enonce-apres', pa.enonceApres));
        resumeChoix(pa, s && s.parties && s.parties[i].s, li); ol.appendChild(li);
      });
      z.appendChild(ol);
    }
    return z;
  }

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
    if (n.k === 'somme') s = n.items.map(function (x, i) { return (i || x.signe ? x.signe : '') + texArbre(x.n); }).join('');   // un « + » écrit en tête reste (« +∞ », 18 nov. 2026)
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
    // cur : le morceau de l'étape en cours ; suite : après une égalité, l'étape de son dernier membre (la phrase continue
    // dans un nouveau morceau de cette étape, HORS du conteneur insécable de l'égalité)
    var cur = null, suite = null, avecMaths = false, derniere = null;
    function nouvelle() { cur = morceau(p, '', ajouter()); suite = null; avecMaths = false; }
    function courante() { if (!cur) { if (suite != null) { cur = morceau(p, '', suite); suite = null; } else nouvelle(); } return cur; }
    jetons.forEach(function (j) {
      if (j.t != null) {
        var t = j.t, po = derniere && PONCT.exec(t);
        if (po) {                                    // la ponctuation reste avec la formule, dans la même étape (14 nov. 2026)
          var pt = document.createTextNode((po[1] ? ' ' : '') + po[2]);
          if (derniere.parentNode.classList.contains('qv-formule')) derniere.appendChild(pt);
          else { var w = el('span', 'qv-insec'); derniere.parentNode.insertBefore(w, derniere); w.appendChild(derniere); w.appendChild(pt); }
          t = t.slice(po[0].length);
        }
        derniere = null;
        if (!t) return;
        var cad = (cur || suite != null) && /^\s*c-à-d/.test(t);
        if (cad) p.appendChild(el('br'));            // une ligne « c-à-d » à la fois (charte § 3)
        if ((!cur && suite == null) || cad || (avecMaths && MOTS.test(t))) nouvelle();
        courante().insertAdjacentHTML('beforeend', cad ? t.replace(/^\s+/, '') : t);
      } else {
        var membres = membresEgalite(j.m), vrais = membres.filter(function (x) { return x.tex.trim(); }), ch = new Chaine(ajouter, trans);
        if (vrais.length > 1) {
          // une égalité « P(B₁) = 0,45 » : ses membres restent ENSEMBLE sur la ligne (conteneur insécable, 14 nov. 2026),
          // chacun à son étape ; une égalité trop longue pour la ligne passe entière à la ligne suivante (réduite au besoin)
          var e0 = +courante().dataset.e, grp = el('span', 'qv-insec qv-formule'), k = e0;
          p.appendChild(grp); cur = null;
          vrais.forEach(function (x, i) {
            ch.preparer(x.tex);
            k = i === 0 ? e0 : ajouter();
            var sm = morceau(grp, '', k); ch.poser(sm, x.avant, x.apres, k); derniere = sm;
          });
          suite = k;
        } else if (vrais.length) {
          ch.preparer(vrais[0].tex);
          var sm = el('span'); courante().appendChild(sm); ch.poser(sm, vrais[0].avant, vrais[0].apres, +cur.dataset.e); derniere = sm;
        }
        ch.ecrire();
        // seul un CALCUL (égalité, résultat encadré) clôt l'étape ; un nom (« ABC », « B », « 5x ») reste dans la phrase
        if (membres.length > 1 || /\\boxed/.test(j.m)) avecMaths = true;
      }
    });
    return p;
  }
  /* Bloc aligné \[\begin{aligned} … \end{aligned}\] : une ligne par « \\ », colonnes « membre & =suite ».
     - « \iff membre &= … » : le « ⟺ » va dans sa propre colonne, à gauche (chaînes d'équivalences de Seconde, CH03) ;
     - « … && justification » : ce qu'on fait pour passer de la ligne précédente à celle-ci (« \times3 », « -5 »,
       « \div2 », « \text{on échange les membres} ») : écrit en ORANGE dans la marge de droite, ENTRE les deux lignes, avec
       une flèche courbe qui va de l'une à l'autre (charte § 4 et § 9, M. Colin 5 et 12 nov. 2026) ; elle apparaît à son
       propre clic, AVANT la ligne qu'elle justifie (l'élève cherche le résultat). */
  var PRE = /^\s*(\\iff|\\Leftrightarrow|\\Longleftrightarrow)(?![a-zA-Z])\s*/;
  function etapesAligne(tex, ajouter, trans) {
    var g = el('div', 'qv-al'), ch = new Chaine(ajouter, trans), D = '\\displaystyle ';
    var lignes = couper(tex, function (u) { return u === '\\\\'; }).map(function (ligne) {
      ligne = ligne.replace(/^\s*\[[^\]]*\]/, '');
      if (!ligne.trim()) return null;
      var cols = couper(ligne, function (u) { return u === '&'; }), just = null;
      if (cols.length >= 4 && !cols[2].trim()) { just = cols.slice(3).join(' ').trim(); cols = cols.slice(0, 2); }
      var lhs = cols.length > 1 ? cols[0] : '', pre = '';
      var mp = PRE.exec(lhs); if (mp) { pre = mp[1]; lhs = lhs.slice(mp[0].length); }
      return { cols: cols, lhs: lhs, pre: pre, just: just, rhs: cols.length > 1 ? cols.slice(1).join('\\quad ') : cols[0] };
    }).filter(Boolean);
    var avecPre = lignes.some(function (l) { return l.pre; }), justifs = [], prec = null;
    if (avecPre) g.classList.add('avec-pre');
    lignes.forEach(function (l) {
      var cellP = avecPre ? el('span', 'qv-pre') : null;
      var gauche = el('span', 'qv-g'), droite = el('span', 'qv-d' + (l.cols.length > 1 ? '' : ' plein'));
      if (cellP) g.appendChild(cellP);
      if (l.cols.length > 1) g.appendChild(gauche);
      g.appendChild(droite);
      if (l.just && prec) {                         // la justification d'abord, à son clic, puis la ligne
        var kj = ajouter(), lab = el('span', 'qv-just qv-e', justifHTML(l.just)), fl = el('span', 'qv-fl qv-e');
        lab.dataset.e = kj; fl.dataset.e = kj;
        fl.innerHTML = '<svg aria-hidden="true" focusable="false"><path/><path class="pointe"/></svg>';
        g.appendChild(fl); g.appendChild(lab);
        justifs.push({ lab: lab, fl: fl, de: prec, vers: droite, cells: [cellP, l.cols.length > 1 ? gauche : null, droite].filter(Boolean) });
      }
      var m = l.rhs.match(REL), rel = m ? m[1] : '', reste = m ? l.rhs.slice(m[0].length) : l.rhs, k = null, sp, sens = false;
      var ms = /^\s*\\sens\{([^{}]*)\}/.exec(l.rhs);   // \sens{<} : le symbole a changé de sens (en rouge)
      if (ms) { rel = ms[1]; reste = l.rhs.slice(ms[0].length); sens = true; }
      if (l.lhs.trim() || rel !== '=') ch.rompre();       // nouvelle expression, ou relation qui n'est pas une égalité
      if (l.lhs.trim()) {
        ch.preparer(l.lhs); k = ajouter(); sp = morceau(gauche, '', k); ch.poser(sp, '', '', k);
        if (l.pre) morceau(cellP, '\\(\\Leftrightarrow\\)', k);
      }
      var membres = membresEgalite(reste).filter(function (x) { return x.tex.trim(); });
      if (rel) {
        if (k == null) { if (membres.length) ch.preparer(membres[0].tex); k = ajouter(); if (l.pre) morceau(cellP, '\\(\\Leftrightarrow\\)', k); }
        morceau(droite, '\\(' + D + '\\;' + rel + '\\;\\)', k, 'qv-rel' + (sens ? ' qv-sens' : ''));
      }
      var suite = !l.lhs.trim() && k != null;           // « &= … » : le « = » vient avec ce qui le suit
      membres.forEach(function (x, i) {
        if (!(suite && i === 0)) { ch.preparer(x.tex); k = ajouter(); }
        sp = morceau(droite, '', k); ch.poser(sp, x.avant, x.apres, k);
      });
      prec = droite;
    });
    ch.ecrire(D);
    if (justifs.length) { g.classList.add('avec-just'); g._justifs = justifs; g._droites = Array.prototype.slice.call(g.querySelectorAll('.qv-d')); }
    return g;
  }
  function justifHTML(j) {                      // « \\div2\\text{ : le sens change} » : le texte peut aller à la ligne
    var out = '', re = /\\text\{([^{}]*)\}/g, m, d = 0;
    function maths(x) { x = x.trim().replace(/\\dfrac/g, '\\frac'); if (x) out += '\\(' + x + '\\)'; }   // fractions petites dans la marge
    while ((m = re.exec(j))) { maths(j.slice(d, m.index)); out += m[1].replace(/&/g, '&amp;').replace(/</g, '&lt;'); d = re.lastIndex; }
    maths(j.slice(d));
    return out;
  }
  function bordEcrit(d, R, g) {                 // bord droit de ce qui est ÉCRIT dans un membre (la cellule s'étire sur la colonne ;
    var mx = d.getBoundingClientRect().left;    // un radical ou un exposant peut dépasser la boîte de son morceau)
    Array.prototype.forEach.call(d.querySelectorAll('span'), function (e) {
      if (e.closest('.ML__sr-only')) return;
      var r = e.getBoundingClientRect(); if (r.width && r.height) mx = Math.max(mx, r.right);
    });
    return mx - R.left + g.scrollLeft;
  }
  /* Un calcul trop large pour le volet (téléphone) : ni défilement ni calcul coupé (charte § 2 : « baisser la taille du
     texte ») : la taille du bloc baisse jusqu'à ce qu'il tienne ; quand la marge de droite ne laisse pas assez de place aux
     justifications (« ×3 », « on échange les membres »), elles passent SOUS la ligne qu'elles précèdent (14 nov. 2026).
     Une formule d'une phrase plus large que le volet est réduite de même. */
  function ajusterLargeurs(racine, force) {
    Array.prototype.forEach.call(racine.querySelectorAll('.qv-al, .qv-disp'), function (g) {
      var W = g.clientWidth; if (!W || (g._ajuste === W && !force)) return;
      g.style.fontSize = ''; g.classList.remove('qv-dessous');
      if (g._justifs) g._justifs.forEach(function (j) {       // positions d'avant oubliées : elles fausseraient la mesure
        j.cells.forEach(function (c) { c.style.paddingTop = ''; });
        j.lab.style.left = j.fl.style.left = '0px'; j.lab.style.maxWidth = ''; j.lab.style.fontSize = ''; j.lab.style.width = '';
      });
      var f = 1;
      function deborde() { return g.scrollWidth > g.clientWidth + 1; }
      function reduire(min) { for (var i = 0; i < 4 && deborde() && f > min + 0.001; i++) { f = Math.max(min, f * g.clientWidth / g.scrollWidth * 0.985); g.style.fontSize = f.toFixed(3) + 'em'; } }
      function margeManque() {                    // une justification n'a pas la place dans la marge : 44 px au moins, et son
        var R = g.getBoundingClientRect();        // plus long mot (ou sa formule, qui ne se coupe pas) doit y tenir
        return g._justifs.some(function (j) {
          var m = g.clientWidth + g.scrollLeft - Math.max(bordEcrit(j.de, R, g), bordEcrit(j.vers, R, g)) - 46;
          j.lab.style.width = 'min-content'; var mot = j.lab.offsetWidth; j.lab.style.width = '';
          return m < Math.max(44, mot);
        });
      }
      reduire(g._justifs ? 0.8 : 0.5);
      if (g._justifs && (deborde() || margeManque())) { f = 1; g.style.fontSize = ''; g.classList.add('qv-dessous'); reduire(0.5); }
      g._ajuste = W;
    });
    // développement pas à pas (TERM CH02) : un morceau d'un seul tenant plus large que sa ligne (une fraction dont le
    // numérateur est développé) est réduit jusqu'à tenir ; les autres passent à la ligne entre deux morceaux
    Array.prototype.forEach.call(racine.querySelectorAll('.qv-dev'), function (g) {
      var W = g.clientWidth; if (!W || (g._ajuste === W && !force)) return;
      var ms = Array.prototype.slice.call(g.querySelectorAll('.qv-dp'));
      ms.forEach(function (x) { x.style.fontSize = ''; });
      ms.forEach(function (x) {
        var c = x.closest('.qv-dc'), cw = c && c.clientWidth, w = x.getBoundingClientRect().width;
        if (cw && w > cw) x.style.fontSize = Math.max(0.55, cw / w * 0.97).toFixed(3) + 'em';
      });
      g._ajuste = W;
    });
    Array.prototype.forEach.call(racine.querySelectorAll('.qv-p'), function (p) {
      var W = p.clientWidth; if (!W || (p._ajuste === W && !force)) return;
      Array.prototype.forEach.call(p.querySelectorAll('.qv-insec'), function (q) { q.style.fontSize = ''; });
      Array.prototype.forEach.call(p.querySelectorAll('.ML__sr-only'), function (sr) { sr.parentNode.style.fontSize = ''; });
      Array.prototype.forEach.call(p.querySelectorAll('.qv-insec'), function (q) {     // égalité insécable : réduite en entier
        if (q.parentNode.closest && q.parentNode.closest('.qv-insec')) return;
        var w = q.getBoundingClientRect().width; if (w > W) q.style.fontSize = Math.max(0.5, W / w * 0.98).toFixed(3) + 'em';
      });
      Array.prototype.forEach.call(p.querySelectorAll('.ML__sr-only'), function (sr) {
        var fo = sr.parentNode; if (fo.closest('.qv-insec')) return;
        var w = fo.getBoundingClientRect().width; if (w > W) fo.style.fontSize = Math.max(0.5, W / w * 0.98).toFixed(3) + 'em';
      });
      espacerFractions(p);
      p._ajuste = W;
    });
  }
  /* Une fraction empilée dans une phrase (« \(P(A)=\dfrac{1}{3}\) ») : MathLive ne réserve pas toute sa hauteur dans la
     ligne, si bien qu'elle chevaucherait la ligne du dessus ou du dessous. Sa formule devient un bloc en ligne, avec juste
     ce qu'il faut de marge pour couvrir son encre (+ 4 px) : seules les lignes qui portent une fraction s'écartent. */
  function espacerFractions(racine) {
    var vus = [];
    Array.prototype.forEach.call(racine.querySelectorAll('.ML__mfrac'), function (fr) {
      var lat = fr.closest('.ML__latex'), f = lat && lat.parentNode;
      if (!f || vus.indexOf(f) >= 0 || f.closest('.qz-arbre, .qz-tab, .qv-al, .qv-disp')) return; vus.push(f);   // figures et calculs : à part
      f.classList.add('qv-frac'); f.style.paddingTop = f.style.paddingBottom = '';
      var R = f.getBoundingClientRect(), t = Infinity, b = -Infinity, bloc = f.parentElement.closest('p, li, div, td, button');
      if (bloc && R.width > bloc.clientWidth) { f.classList.remove('qv-frac'); return; }   // plus large que la ligne : elle garde ses coupures
      Array.prototype.forEach.call(lat.querySelectorAll('*'), function (e) {
        if (e.children.length) return;
        var x = e.getBoundingClientRect(); if (!x.width || !x.height) return;
        t = Math.min(t, x.top); b = Math.max(b, x.bottom);
      });
      if (t === Infinity || !R.height) return;
      f.style.paddingTop = Math.max(0, Math.ceil(R.top - t + 4)) + 'px';
      f.style.paddingBottom = Math.max(0, Math.ceil(b - R.bottom + 4)) + 'px';
    });
  }
  function espacerCarte(c, force) {             // les fractions de l'énoncé d'une question affichée (une fois par largeur)
    var W = c.clientWidth; if (!W || (c._frac === W && !force)) return;
    c._frac = W; espacerFractions(c);
  }
  var espaceTour = 0;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(espaceTour);
    espaceTour = requestAnimationFrame(function () { Array.prototype.forEach.call(document.querySelectorAll('.quiz-carte:not([hidden])'), function (c) { espacerCarte(c); }); });
  });
  function justifsDessous(g) {                  // la marge manque : sous la ligne précédente, une petite flèche vers la ligne suivante
    var R = g.getBoundingClientRect(), W = g.clientWidth;
    g._justifs.forEach(function (j) {           // le texte va à droite de la flèche s'il y tient, sinon à gauche, sinon du côté le plus large
      var b = j.vers.getBoundingClientRect(), x = b.left - R.left + g.scrollLeft, dr = W - (x + 22) - 2, ga = x - 6;
      j.lab.style.fontSize = ''; j.lab.style.transform = 'none'; j.lab.style.maxWidth = Math.max(60, W - 34) + 'px';
      var w = j.lab.offsetWidth, cote = w <= dr ? 'd' : w <= ga ? 'g' : (dr >= ga ? 'd' : 'g'), place = Math.max(60, cote === 'd' ? dr : ga);
      if (w > place) {
        j.lab.style.maxWidth = place + 'px';
        if (j.lab.scrollWidth > place + 1) j.lab.style.fontSize = (Math.max(0.6, place / j.lab.scrollWidth) * 0.82).toFixed(3) + 'em';
      }
      j._x = x; j._cote = cote;
      var hl = j.lab.offsetHeight;
      j.cells.forEach(function (c) { c.style.paddingTop = (hl + 8) + 'px'; });
    });
    R = g.getBoundingClientRect();
    g._justifs.forEach(function (j) {
      var a = j.de.getBoundingClientRect(), b = j.vers.getBoundingClientRect(), x = j._x;
      var y1 = a.bottom - R.top - 2, y2 = b.top - R.top + parseFloat(j.vers.style.paddingTop || 0) + 4, h = Math.max(14, y2 - y1), svg = j.fl.firstChild;
      j.fl.style.left = x + 'px'; j.fl.style.top = y1 + 'px'; j.fl.style.width = '18px'; j.fl.style.height = h + 'px';
      svg.setAttribute('width', 18); svg.setAttribute('height', h); svg.setAttribute('viewBox', '0 0 18 ' + h);
      svg.firstChild.setAttribute('d', 'M9 1 C 2 ' + (h * 0.35).toFixed(1) + ', 2 ' + (h * 0.65).toFixed(1) + ', 9 ' + h);
      svg.lastChild.setAttribute('d', 'M9 ' + h + ' l -6 -5 M9 ' + h + ' l 3.5 -7');
      j.lab.style.left = (j._cote === 'd' ? x + 22 : Math.max(0, x - 4 - j.lab.offsetWidth)) + 'px';
      j.lab.style.top = (b.top - R.top + 3) + 'px';
    });
  }
  function placerJustifs(racine) {              // flèches de la marge : après mise en page (positions réelles)
    Array.prototype.forEach.call(racine.querySelectorAll('.qv-al.avec-just'), function (g) {
      var R = g.getBoundingClientRect(); if (!R.width) return;
      if (g.classList.contains('qv-dessous')) { justifsDessous(g); return; }
      function bord(d) { return bordEcrit(d, R, g); }
      var bas = -Infinity;                       // une justification ne chevauche jamais la précédente
      g._justifs.forEach(function (j) {
        var x = Math.max(bord(j.de), bord(j.vers)) + 12;   // la flèche longe les deux lignes qu'elle relie
        var a = j.de.getBoundingClientRect(), b = j.vers.getBoundingClientRect();
        var y1 = (a.top + a.bottom) / 2 - R.top + 3, y2 = (b.top + b.bottom) / 2 - R.top - 3, h = Math.max(14, y2 - y1), bo = 20;
        var svg = j.fl.firstChild;
        j.fl.style.left = x + 'px'; j.fl.style.top = y1 + 'px'; j.fl.style.width = (bo + 6) + 'px'; j.fl.style.height = h + 'px';
        svg.setAttribute('width', bo + 6); svg.setAttribute('height', h); svg.setAttribute('viewBox', '0 0 ' + (bo + 6) + ' ' + h);
        svg.firstChild.setAttribute('d', 'M2 0 C ' + (bo + 2) + ' 2, ' + (bo + 2) + ' ' + (h - 2) + ', 4 ' + h);
        svg.lastChild.setAttribute('d', 'M4 ' + h + ' l 7 -6.5 M4 ' + h + ' l 9.5 1.5');
        j.lab.style.left = (x + bo + 10) + 'px'; j.lab.style.transform = '';
        var place = Math.max(44, g.clientWidth + g.scrollLeft - (x + bo + 10) - 4);   // reste dans la largeur visible
        j.lab.style.maxWidth = place + 'px'; j.lab.style.fontSize = '';
        if (j.lab.scrollWidth > place + 1)          // une formule qui ne se coupe pas (« 100 > 0 ») : on la rétrécit un peu
          j.lab.style.fontSize = (Math.max(0.6, place / j.lab.scrollWidth) * 0.82).toFixed(3) + 'em';
        var hl = j.lab.offsetHeight, c = y1 + h / 2;
        if (c - hl / 2 < bas + 4) c = bas + 4 + hl / 2;
        j.lab.style.top = c + 'px'; bas = c + hl / 2;
      });
    });
  }
  /* ---- Développement pas à pas (q.dev, écrit par l'atelier : generer.py) — M. Colin, 14 nov. 2026 ----
     Comme dans les corrections du site (charte § 3 et § 4) : l'expression de l'énoncé seule ; le post-it jaune « On
     utilise » de chaque identité remarquable à son propre clic, puis « avec a = … » et « et b = … » à leurs clics (a et b
     surlignés dans l'expression) ; le développement terme par terme ; un « − » (ou un facteur) distribué avec une flèche
     rouge par terme, le produit au clic suivant ; les termes semblables surlignés par groupe (x² violet, x vert,
     constantes orange), ceux qui s'annulent barrés en rouge ; le résultat encadré. Chaque terme est un morceau à part :
     une longue ligne passe à la ligne entre deux termes, rien ne déborde du volet.
     d = { l: [[{i, t}, …], …]  lignes (la première : l'expression de l'énoncé ; les suivantes commencent par « = ») ;
           n: [{i, apres, t, l: [html…], titre}]  post-it, posés sous la ligne « apres » (titre : « On utilise » par défaut,
              « On factorise par » pour une factorisation) ;
           s: [[action, …], …]  une entrée par clic : ['v', morceau…] fait apparaître ; ['n', note] ; ['nl', note, rang] ;
              ['h', marque, couleur] … ['hx', marque…] surlignage (c0 orange, c1 vert, c2 violet ; pastilles des
              factorisations : c3 bleu ciel pour le facteur commun, c4 rose et c5 pêche pour les autres facteurs) ; ['f', de, vers, 'bas'?]
              flèche, jusqu'à ['fx'] ; ['x', morceau…] barré en rouge ; ['c', ligne] cadre du résultat }
     Une marque est posée dans le TeX d'un morceau : \class{qv-c qv-m-<id>}{…} (le cœur d'un terme, jamais son signe).
     Morceau {i, t, g} : les morceaux de même groupe g (une parenthèse entière) ne sont jamais coupés par un retour à la
     ligne (15 nov. 2026). d.g = {ligne: {i, t}} : membre de gauche d'une ligne (« 9 = 3² donc b = 3 », « 2ab = … »),
     dans une colonne alignée, révélé par ['v', i] à son propre clic ; le « = » vient avec le premier morceau de droite.
     Ajouts du quiz TERM CH02 (18 nov. 2026, distributivité fléchée partout, charte § 11.2) :
     - SOUS-MORCEAU \class{qv-sub qv-s-<id>}{…} dans le TeX d'un morceau (un terme d'un NUMÉRATEUR, qui ne peut pas être
       un morceau à part) : ['v', <id>] le fait apparaître à son clic ; le morceau qui le porte (la fraction, son trait et
       son dénominateur) apparaît avec son premier sous-morceau ; ['x', <id>] le barre ;
     - morceau {i, t, j: 1} : justification de la ligne (« HR ») en orange au bout de la ligne, à son clic, avant la ligne ;
     - ['f', de, vers, 'haut2'] : flèche bleue PAR-DESSUS, plus haute (2ᵉ facteur dans un numérateur : par-dessous, elle
       couperait le trait de fraction) ;
     - ['c', ligne] sur une ligne sans membre de gauche d'un développement à membres de gauche : cadre à la taille de ce
       qui est écrit (la cellule de la grille s'étire sur toute la largeur). */
  function etapesDev(d, ajouter, trans, majs) {
    var g = el('div', 'qv-dev'), P = {}, N = {}, C = [], ouverts = {}, fl = [], barres = [], cadres = [], ligneDe = {}, SUB = {};
    var gauche = d.g || {}, avecG = Object.keys(gauche).length > 0;   // membres de gauche (lignes « 9 = 3² », « 2ab = … »)
    // mot de liaison devant un membre de gauche (quiz TERM CH02, 19 nov. 2026, hérédité selon la charte § 4 : « On a : uₖ₊₁ = … »,
    // « c-à-d (d’après HR) uₖ₊₁ = … », « c-à-d uₖ₊₁ = … ») : g[ligne].x, texte dans sa propre colonne, qui vient avec le membre
    var avecX = Object.keys(gauche).some(function (c) { return gauche[c].x; });
    if (avecG) g.classList.add('qv-dev-g');
    if (avecX) g.classList.add('qv-dev-x');
    d.l.forEach(function (L, i) {
      var aEg = i > 0 || !!gauche[i];
      var row = el('div', 'qv-dl' + (aEg ? '' : ' qv-dl0')), eg = el('span', 'qv-deg' + (aEg ? ' qv-e' : ''), aEg ? '\\(=\\)' : ''), c = el('span', 'qv-dc');
      if (avecG) {
        var lg = el('span', 'qv-dlg'), sx = null;
        if (avecX) { var lx = el('span', 'qv-dlx'); if (gauche[i] && gauche[i].x) { sx = el('span', 'qv-dpx qv-e', gauche[i].x); lx.appendChild(sx); } row.appendChild(lx); }
        if (gauche[i]) { var sl = el('span', 'qv-dp qv-e', '\\(' + gauche[i].t + '\\)'); sl.dataset.ligne = i; sl.dataset.gauche = '1'; sl._x = sx; P[gauche[i].i] = sl; lg.appendChild(sl); }
        row.appendChild(lg);
      }
      row.appendChild(eg); row.appendChild(c); g.appendChild(row); C.push({ row: row, eg: eg, c: c });
      var groupes = {}, jus = [];               // morceaux d'un même groupe (p.g) : jamais coupés par un retour à la ligne
      L.forEach(function (p, j) {
        if (p.j) { var sj = el('span', 'qv-dp qv-dj qv-e', p.t); sj.dataset.ligne = i; sj.dataset.just = '1'; P[p.i] = sj; jus.push(sj); return; }   // « HR » : posée après le garde-fou
        var ouvrant = j && /[([]\s*$/.test(L[j - 1].t);                             // juste après « ( » ou « [ » : un signe de début de terme, pas d'opération
        var t = p.t, sg = j && !ouvrant ? /^(\\class\{[^{}]*\}\{[+-]\}|[+=-])/.exec(t) : null;   // un signe (ou un « = ») entre deux morceaux : espacé
        if (sg) t = sg[1] + '\\:' + t.slice(sg[1].length);                              // comme une opération (morceaux séparés)
        var s = el('span', 'qv-dp qv-e' + (sg ? ' qv-dps' : ''), '\\(' + t + '\\)'); s.dataset.ligne = i; P[p.i] = s;
        var nu = p.t.replace(/\\class\{[^{}]*\}/g, '');                              // un terme « court » : ni somme entre parenthèses, ni texte
        if (!/\\text|\([^()]*[+-][^()]*\)/.test(nu)) s.dataset.court = '1';
        if (p.g) { if (!groupes[p.g]) { groupes[p.g] = el('span', 'qv-dgr'); c.appendChild(groupes[p.g]); } groupes[p.g].appendChild(s); }
        else c.appendChild(s);
        (p.t.match(/qv-m-[\w-]+/g) || []).forEach(function (m) { ligneDe[m.slice(5)] = i; });
        (p.t.match(/qv-s-[\w-]+/g) || []).forEach(function (m) { SUB[m.slice(5)] = { p: s, k: null }; });   // termes d'un numérateur
      });
      // garde-fou (15 nov. 2026) : le dernier morceau d'une ligne n'est jamais laissé seul à la ligne : collé au précédent
      var kids = c.children, der = kids[kids.length - 1], avant = kids[kids.length - 2];
      var seul = der && (der.classList.contains('qv-dgr') ? (der.children.length === 1 ? der.firstElementChild : null) : der);
      if (seul && avant && seul.dataset.court) {                                      // un terme court (« − 4 », « + 12 », « − 1² »)
        if (avant.classList.contains('qv-dgr')) avant.appendChild(seul);             // dans le groupe qui précède
        else { var colle = el('span', 'qv-dgr'); c.insertBefore(colle, avant); colle.appendChild(avant); colle.appendChild(seul); }
        if (der !== seul) c.removeChild(der);
      }
      jus.forEach(function (sj) { c.appendChild(sj); });
      var ns = (d.n || []).filter(function (x) { return x.apres === i; });
      if (ns.length) {
        var bloc = el('div', 'qv-notes');
        ns.forEach(function (x) {
          var o = el('div', 'qv-note qv-e', '<span class="qv-note-t">' + (x.titre || 'On utilise') + '</span><span class="qv-note-id">\\(' + x.t + '\\)</span>'), lg = [];
          (x.l || []).forEach(function (t) { var e = el('span', 'qv-note-l qv-e', t); o.appendChild(e); lg.push(e); });
          N[x.i] = { el: o, l: lg }; bloc.appendChild(o);
        });
        g.appendChild(bloc);
      }
    });
    d.s.forEach(function (acts) {
      var k = ajouter();
      acts.forEach(function (a) {
        var t = a[0], r = a.slice(1);
        if (t === 'v') r.forEach(function (id) {
          var p = P[id], sb = !p && SUB[id];
          if (sb) { sb.k = k; p = sb.p; if (p.dataset.e) return; }      // un terme d'un numérateur : la fraction vient avec le premier
          p.dataset.e = k; if (p._x) p._x.dataset.e = k; var L = C[+p.dataset.ligne];
          if (!p.dataset.gauche && !p.dataset.just && L.eg.classList.contains('qv-e') && !L.eg.dataset.e) L.eg.dataset.e = k;
        });
        else if (t === 'n') N[r[0]].el.dataset.e = k;
        else if (t === 'nx') N[r[0]].el.dataset.f = k;                     // le post-it s'en va (le suivant prend sa place)
        else if (t === 'nl') N[r[0]].l[r[1]].dataset.e = k;
        else if (t === 'h') { var o = { id: trans.length, sel: 'qv-m-' + r[0], c: r[1], pre: k, show: Infinity }; trans.push(o); ouverts[r[0]] = o; }
        else if (t === 'hx') r.forEach(function (id) { if (ouverts[id]) { ouverts[id].show = k - 1; delete ouverts[id]; } });
        else if (t === 'f') {                           // ['f', de, vers, sens, étiquette] : étiquette « ×10 » en rouge au sommet (19 nov. 2026)
          var lab = r[3] || null;
          fl.push({ de: r[0], vers: r[1], bas: r[2] === 'bas', haut2: r[2] === 'haut2' || (!!lab && r[2] !== 'bas'), lab: lab, k0: k, k1: Infinity });
          C[ligneDe[r[1]]].row.classList.add(r[2] === 'bas' ? (lab ? 'avec-fl-bas2' : 'avec-fl-bas') : r[2] === 'haut2' || lab ? 'avec-fl2' : 'avec-fl');   // de la place pour la flèche
        }
        else if (t === 'fx') fl.forEach(function (f) { if (f.k1 === Infinity) f.k1 = k - 1; });
        else if (t === 'x') r.forEach(function (id) { barres.push({ p: P[id], id: id, k0: k }); });
        // avec un membre de gauche : toute l'égalité encadrée ; une ligne sans membre de gauche d'une grille alignée : ce qui est écrit
        else if (t === 'c') {
          cadres.push(gauche[r[0]] ? { ligne: C[r[0]].row, k0: k } : avecG ? { ligne: C[r[0]].c, k0: k } : { c: C[r[0]].c, k0: k });
          C[r[0]].row.classList.add('qv-dl-cadre');     // place du cadre réservée dès le début : rien ne bouge quand il apparaît
        }
      });
    });
    var svg = svgEl('svg', { class: 'qv-dev-fl', 'aria-hidden': 'true', focusable: 'false' }); g.appendChild(svg);
    majs.push(function (k, anime) {
      var H = g.getBoundingClientRect(); if (!H.width) return;
      fl.forEach(function (f) {                   // flèches de distributivité : du cœur du facteur au cœur du terme
        if (k < f.k0 || k > f.k1) { if (f.el) { f.el.remove(); f.el = null; } return; }
        var a = g.querySelector('.qv-m-' + f.de), b = g.querySelector('.qv-m-' + f.vers), A = a && boiteEncre(a), B = b && boiteEncre(b);
        if (!A || !B) return;
        var x1 = (A.l + A.r) / 2 - H.left, x2 = (B.l + B.r) / 2 - H.left, s = f.bas ? 1 : -1;
        var y1 = (f.bas ? A.b + 3 : A.t - 3) - H.top, y2 = (f.bas ? B.b + 3 : B.t - 3) - H.top;
        var h = f.lab ? Math.min(34, 20 + Math.abs(x2 - x1) * 0.15) : f.haut2 ? Math.min(46, 24 + Math.abs(x2 - x1) * 0.22) : Math.min(30, 11 + Math.abs(x2 - x1) * 0.17), ym = (f.bas ? Math.max(y1, y2) : Math.min(y1, y2)) + s * h;
        var neuve = !f.el;
        if (neuve) {
          f.el = svgEl('g', { class: 'qv-dfl' + (f.lab ? ' fois' : f.bas ? ' bas' : f.haut2 ? ' bleu' : '') });
          f.el.appendChild(svgEl('path', { class: 'tige' })); f.el.appendChild(svgEl('path', { class: 'pointe' })); svg.appendChild(f.el);
          if (f.lab) { f.t = svgEl('text', { class: 'qv-dfl-lab', 'text-anchor': 'middle' }); f.t.textContent = f.lab; f.el.appendChild(f.t); }
        }
        var tige = f.el.firstChild, pointe = f.el.childNodes[1];
        tige.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + ym + ',' + x2 + ' ' + ym + ',' + x2 + ' ' + y2);
        pointe.setAttribute('d', 'M' + (x2 - 5) + ' ' + (y2 + s * 7) + ' L' + x2 + ' ' + y2 + ' L' + (x2 + 5) + ' ' + (y2 + s * 7));
        if (f.t) {                                    // l'étiquette au sommet de l'arc (sommet de la courbe de Bézier : t = 1/2)
          var ys = 0.125 * (y1 + y2) + 0.75 * ym;
          f.t.setAttribute('x', ((x1 + x2) / 2).toFixed(1)); f.t.setAttribute('y', (f.bas ? ys + 15 : ys - 5).toFixed(1));
        }
        if (neuve && anime && k === f.k0) {        // la flèche se TRACE du facteur vers le terme, la pointe à l'arrivée
          var L = tige.getTotalLength ? tige.getTotalLength() : 200;
          f.el.style.setProperty('--L', L.toFixed(1)); f.el.classList.add('trace');
        }
      });
      Object.keys(SUB).forEach(function (id) {   // termes d'un numérateur : chacun à son clic (place gardée : rien ne bouge)
        var sb = SUB[id], vu = sb.k != null && k >= sb.k;
        Array.prototype.forEach.call(g.querySelectorAll('.qv-s-' + id), function (x) {
          var avant = x.classList.contains('vu');
          x.classList.toggle('vu', vu);
          if (vu && !avant && anime && k === sb.k) { var o = calque(x, g, 'qv-eclair', 2); if (o) o.addEventListener('animationend', function () { o.remove(); }); }
        });
      });
      barres.forEach(function (b) {               // termes qui s'annulent : barrés en rouge
        if (k < b.k0) { if (b.o) { b.o.remove(); b.o = null; } return; }
        var e = b.p || g.querySelector('.qv-s-' + b.id); if (e) b.o = calque(e, g, 'qv-raye', 1, b.o);
      });
      cadres.forEach(function (c) {
        if (c.c) { c.c.classList.toggle('qv-cadre', k >= c.k0); return; }
        // égalité « gauche = droite » : cadre à la taille de ce qui est écrit (la ligne occupe toute la grille)
        if (k < c.k0) { if (c.o) { c.o.remove(); c.o = null; } return; }
        var u = null;                                // union de l'encre des morceaux (pas des cellules de la grille)
        Array.prototype.forEach.call(c.ligne.querySelectorAll('.qv-dp:not(.qv-dj), .qv-deg'), function (x) {
          var b = boiteEncre(x); if (!b) return;
          u = u ? { l: Math.min(u.l, b.l), t: Math.min(u.t, b.t), r: Math.max(u.r, b.r), b: Math.max(u.b, b.b) } : b;
        });
        if (!u) return;
        if (!c.o) { c.o = el('span', 'qv-cadre-calque'); g.appendChild(c.o); }
        c.o.style.left = (u.l - H.left - 6) + 'px'; c.o.style.top = (u.t - H.top - 5) + 'px';
        c.o.style.width = (u.r - u.l + 12) + 'px'; c.o.style.height = (u.b - u.t + 10) + 'px';
      });
    });
    return g;
  }
  /* Le tableau attendu, tracé pas à pas : la ligne des x (avec les intitulés), puis, s'il y en a, la ligne du signe (les
     traits, puis un signe par clic), la ligne des variations (l'image de départ, puis une flèche et son image par clic),
     et (q.convexite, quiz TERM CH05) la ligne « convexité de f » : un mot par clic, convexe en vert, concave en bleu,
     comme dans les tableaux de M. Colin. */
  function tableauCorrection(q, ajouter) {
    var vari = q.type === 'variations', ls = vari ? q.ligneSigne : q.ligne, b = q.bornes || [-Infinity, Infinity], xs = [b[0]].concat(q.valeurs, [b[1]]), n = q.valeurs.length;
    var cadre = el('div', 'quiz-tab-cadre qv-tab-cadre'), t = el('div', 'quiz-tab qv-tab' + (vari ? ' quiz-var' : '') + (vari && ls ? ' quiz-var-signe' : '') + (q.convexite ? ' qv-avec-cvx' : ''));
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
    xs.forEach(function (x, j) { cellule('tx tval', '\\(' + texTableau(x) + '\\)', k1); if (j < xs.length - 1) cellule('tx tint', null); });
    function ligneSignes(L, cls, label, note) {
      var lab = cellule('tlab' + cls + (note ? ' tnote' : ''), label, note ? ajouter() : k1);   // avec une justification : l'étiquette à son clic,
      if (note) { var e = el('span', 'qv-e qv-tnote', note); e.dataset.e = ajouter(); lab.appendChild(e); }   // puis la justification
      var kt = ajouter();                           // les traits (0, double barre) d'abord, puis un signe par clic
      cellule('tval tvide' + cls, null);
      for (var i2 = 0; i2 <= n; i2++) {
        cellule('tint' + cls, '\\(' + (L.signes[i2] === '−' ? '-' : '+') + '\\)', ajouter(), 'qv-signe');
        if (i2 < n) {
          var tc = cellule('tval ttrait' + cls, null), tr = el('div', 'trait-choix qv-e', '<span>0</span>');
          tr.dataset.t = L.traits[i2]; tr.dataset.touche = '1'; tr.dataset.e = kt; tc.appendChild(tr);
        }
      }
      cellule('tval tvide' + cls, null);
    }
    // produit de facteurs affines (M. Colin, 18 nov. 2026) : un étage par facteur, signe justifié par son coefficient
    // directeur, puis l'étage du produit, justifié par la règle des signes. q.facteurs = [{tex, a, b}] pour ax + b.
    var fac = !vari && ls && q.facteurs;
    if (fac) q.facteurs.forEach(function (F) {
      var L = { signes: [], traits: [] }, fx = function (x) { return F.a * x + F.b; };
      for (var j = 0; j <= n; j++) {
        var lo = xs[j], hi = xs[j + 1];
        if (!isFinite(lo)) lo = isFinite(hi) ? hi - 1 : -1;
        if (!isFinite(hi)) hi = isFinite(lo) ? lo + 1 : 1;
        L.signes.push(fx((lo + hi) / 2) < 0 ? '−' : '+');
        if (j < n) L.traits.push(Math.abs(fx(q.valeurs[j])) < 1e-9 ? 'zero' : 'trait');
      }
      ligneSignes(L, ' tfac', 'signe de \\(' + F.tex + '\\)', 'coefficient directeur \\(' + nombreTeX(F.a) + (F.a > 0 ? '>' : '<') + '0\\)');
    });
    if (ls) ligneSignes(ls, vari ? ' tsg' : '', vari ? (ls.label || 'signe de \\(f\'(x)\\)') : ls.label, fac ? 'règle des signes' : null);
    if (vari) {
      cellule('tlab', q.label || 'variation de \\(f\\)', k1);
      var pos = function (j) { var L = q.fleches[j - 1], R = q.fleches[j]; return L === '↗' || R === '↘' ? 'haut' : L === '↘' || R === '↗' ? 'bas' : 'milieu'; };
      k = ajouter();                                // l'image de la première valeur, puis une flèche et son image par clic
      for (i = 0; i < xs.length; i++) {
        var im = q.images[i];
        cellule('tval timg', im == null ? null : '\\(' + texTableau(im) + '\\)', k).dataset.pos = pos(i);
        if (i < xs.length - 1) { k = ajouter(); cellule('tint', flecheLongue(q.fleches[i]), k, 'qv-fleche'); }
      }
    }
    if (q.convexite) {                              // ligne « convexité de f » (correction seulement)
      cellule('tlab tcv', q.labelConvexite || 'convexité de \\(f\\)', k1);
      cellule('tval tvide tcv', null);
      for (i = 0; i <= n; i++) {
        var mot = String(q.convexite[i] || '');
        cellule('tint tcv', mot, ajouter(), 'qv-cvx' + (/^convexe/.test(mot) ? ' qv-convexe' : /^concave/.test(mot) ? ' qv-concave' : ''));
        if (i < n) cellule('tval tcv', null);
      }
      cellule('tval tvide tcv', null);
    }
    cadre.appendChild(t); return cadre;
  }
  /* Quiz de chapitre (14 nov. 2026) : <!--cours:clé--> entre deux blocs = une étape qui montre la capture du cours
     (window.QUIZ_COURS[clé]) ; <!--v:k--> (ou <!--v:2,3-->) = la valeur de la case k s'écrit dans l'arbre / le tableau
     dessiné en tête de la correction, à la dernière étape construite avant le marqueur (une case sans marqueur : à la
     dernière étape) ; un exercice : les corrections de ses parties à la suite, sous « Question 1 », « Question 2 »… */
  function construireEtapes(q) {
    var racine = el('div', 'qv-etapes'), n = 0, trans = [], majs = [];
    var ctx = { ajouter: function () { return ++n; }, n: function () { return n; }, trans: trans, majs: majs, code: codeDe(q) };
    if (q.type === 'exercice') {
      etapesFigure(q, racine, ctx);
      ctx.devs = q.devs || null;                   // <!--dev:k--> de la correction commune
      etapesTexte(q.correction || '', racine, ctx, null);
      q.parties.forEach(function (pa, i) {
        var sec = el('section', 'qz-corr-partie'), t = el('h3', 'qz-corr-titre', 'Question ' + (i + 1));
        racine.appendChild(sec);
        // titre collé avec la figure ; une partie dont la correction COMMENCE par le programme (<!--code-->, TERM CH02) : le titre
        // vient dans le bloc du programme (collé en haut du volet, il cacherait sinon « Question k »)
        if ((pa.type === 'arbre' && pa.arbre) || (pa.type === 'tableau' && pa.tableau) || /^\s*<!--\s*code\s*-->/.test(pa.correction || '')) etapesQuestion(pa, sec, ctx, t);
        else { t.classList.add('qv-e'); t.dataset.e = n + 1; sec.appendChild(t); etapesQuestion(pa, sec, ctx); }   // le titre vient avec la première étape
      });
    } else etapesQuestion(q, racine, ctx);
    rendre(racine);
    return { racine: racine, n: n, k: 0, trans: trans, majs: majs };
  }
  function etapesFigure(q, racine, ctx) {       // la lecture se montre sur la figure (charte § 5)
    if (!q.figureCorrection) return;
    var f = el('figure', 'qv-fig qv-e'), im = el('img'); im.src = q.figureCorrection; im.alt = 'Figure de la correction'; im.decoding = 'async';
    f.appendChild(im); f.dataset.e = ctx.ajouter(); racine.appendChild(f);
  }
  function etapesQuestion(q, racine, ctx, titre) {
    var aComp = (q.type === 'arbre' && q.arbre) || (q.type === 'tableau' && q.tableau);
    ctx.devs = q.devs || null;                     // développements fléchés de CETTE question (une partie d'exercice : les siens)
    if (!aComp) etapesFigure(q, racine, ctx);
    var src = /<!--\s*code\s*-->/.test(q.correction || '') ? (codeDe(q) || ctx.code) : '';   // le programme de l'énoncé (TERM CH02)
    var prog = src ? programmeCorrection(src, ctx) : null, progPose = false;
    var fig = aComp ? figureACompleter(q, racine, ctx, titre, prog) : null;
    if (prog && aComp) progPose = true;
    var code = prog ? { poser: function () {
      if (progPose) return; progPose = true;
      var b = el('div', 'qz-fig-corr qz-code-etape qv-e');
      if (titre && !aComp) b.appendChild(titre);    // partie d'exercice : « Question k » au-dessus du programme, dans le bloc collé
      b.appendChild(prog.el); b.dataset.e = ctx.ajouter(); racine.appendChild(b);
      ctx.majs.push(function () { collerFigure(b); });
    }, ligne: prog.ligne } : null;
    // graphique de conclusion (TERM CH02, charte § 4 : un calcul de limite se conclut par un graphique) : à la fin, ou au marqueur <!--graphique-->
    var grFait = false, gr = q.figureConclusion ? function () {
      if (grFait) return; grFait = true;
      var f = el('figure', 'qv-fig qv-fig-fin qv-e'), im = el('img');
      im.src = q.figureConclusion; im.alt = q.figureConclusionAlt || 'Graphique de la conclusion'; im.decoding = 'async';
      f.appendChild(im); f.dataset.e = ctx.ajouter(); racine.appendChild(f);
    } : null;
    if (aComp) etapesFigure(q, racine, ctx);       // tableau à compléter ET figure de lecture (TERM CH05) : le tableau en tête, collé en haut
    // « trace le tableau » (M. Colin, 12 nov. 2026) : à la fin, ou à l'étape du marqueur <!--tableau--> (16 nov. 2026)
    // q.tableauCorrection (quiz TERM CH05) : le tableau de signes / de variations d'une question d'un autre type (lecture
    // graphique, intervalles…), tracé de même ({type: 'signes' | 'variations', valeurs, ligne | ligneSigne, fleches, images, convexite})
    var srcT = q.tableauCorrection || ((q.type === 'variations' && q.fleches) || (q.type === 'signes' && q.ligne) ? q : null);
    var pose = false, tab = srcT ? function () { if (!pose) { pose = true; racine.appendChild(tableauCorrection(srcT, ctx.ajouter)); } } : null;
    etapesTexte(q.dev ? '' : q.correction || '', racine, ctx, fig, tab, gr, code);
    if (q.dev) racine.appendChild(etapesDev(q.dev, ctx.ajouter, ctx.trans, ctx.majs));   // développement pas à pas (M. Colin, 14 nov. 2026)
    if (tab) tab();
    if (fig) fig.finir(ctx.n());
    if (gr) gr();
  }
  /* Programme Python dans la correction (quiz TERM CH02, 18 nov. 2026 ; charte § 3 : « une seule flèche qui glisse de ligne
     en ligne et remonte sur la boucle à chaque fin de tour ») : <!--code--> recopie le programme de l'énoncé (le premier
     <pre class="qz-code">, celui de l'énoncé commun pour une partie d'exercice) dans le volet, collé en haut tant que la
     hauteur le permet ; dans une question « tableau » (tableau d'état), il est posé au-dessus du tableau. <!--py:k--> : à
     la PREMIÈRE étape du dernier bloc construit avant le marqueur (le paragraphe ou le calcul qui parle de cette ligne), la
     flèche se pose sur la ligne k (1 = première ; 0 : plus de flèche) ; elle GLISSE d'une ligne à l'autre et la ligne lue
     est surlignée. */
  var RE_CODE = /<pre class="qz-code"[\s\S]*?<\/pre>/;
  function codeDe(q) { var m = RE_CODE.exec(String((q && q.enonce) || '')); return m ? m[0] : ''; }
  function programmeCorrection(html, ctx) {
    var b = el('div', 'qz-code-corr'), marques = [];
    b.innerHTML = html;
    var bande = el('span', 'qz-py-bande'), fl = el('span', 'qz-py-fleche');
    bande.setAttribute('aria-hidden', 'true'); fl.setAttribute('aria-hidden', 'true');
    b.appendChild(bande); b.appendChild(fl);
    ctx.majs.push(function (k) {
      var L = 0; marques.forEach(function (m) { if (m[0] <= k) L = m[1]; });
      var x = L > 0 ? b.querySelectorAll('.qz-py-ligne')[L - 1] : null, e = b.closest('.qv-e');
      var vis = !!x && !!e && e.classList.contains('vu');
      b.classList.toggle('qz-py-actif', vis);
      if (!vis) return;
      var R = b.getBoundingClientRect(), r = x.getBoundingClientRect(), y = r.top - R.top;
      fl.style.transform = 'translateY(' + (y + r.height / 2).toFixed(1) + 'px)';
      bande.style.transform = 'translateY(' + y.toFixed(1) + 'px)'; bande.style.height = r.height.toFixed(1) + 'px';
    });
    return { el: b, ligne: function (k, L) { marques.push([k, L]); } };
  }
  var RE_ETAPES = /<p>([\s\S]*?)<\/p>|\\\[([\s\S]*?)\\\]|<!--\s*(cours|v|tableau|graphique|code|py|dev)\s*(?::\s*([\s\S]*?))?\s*-->/g;
  var RE_MARQUEUR = /<!--\s*(?:(?:cours|v|py|dev)\s*:|(?:tableau|graphique|code)\s*-->)/;
  function etapesTexte(html, racine, ctx, fig, tab, gr, code) {
    if (RE_MARQUEUR.test(html))                   // un marqueur glissé DANS un paragraphe le coupe en deux
      html = html.replace(/<p>([\s\S]*?)<\/p>/g, function (tout, c) {
        return RE_MARQUEUR.test(c) ? '<p>' + c.replace(/\s*(<!--\s*(?:cours|v|py|dev)\s*:[\s\S]*?-->|<!--\s*(?:tableau|graphique|code)\s*-->)\s*/g, '</p>$1<p>') + '</p>' : tout;
      }).replace(/<p>\s*<\/p>/g, '');
    // debut : première étape du dernier bloc construit (paragraphe, calcul) ; <!--py:k--> écrit APRÈS un bloc pose la flèche
    // sur la ligne k dès la PREMIÈRE étape de ce bloc (« Ligne 3 : … » : la flèche y est quand la phrase commence)
    var re = new RegExp(RE_ETAPES.source, 'g'), m, dernier = 0, debut = 0;
    function bloc0() { var d = ctx.n() + 1; return function () { if (ctx.n() >= d) debut = d; }; }
    function libre(t) { t = t.trim(); if (t) { var f0 = bloc0(), b = el('div', 'qv-p'); morceau(b, t, ctx.ajouter()); racine.appendChild(b); f0(); } }
    while ((m = re.exec(html))) {
      libre(html.slice(dernier, m.index));
      var f1 = bloc0();
      if (m[1] != null) { racine.appendChild(etapesParagraphe(m[1], ctx.ajouter, ctx.trans)); f1(); }
      else if (m[2] != null) {
        var a = m[2].match(/^\s*\\begin\{aligned\}([\s\S]*)\\end\{aligned\}\s*$/);
        if (a) racine.appendChild(etapesAligne(a[1], ctx.ajouter, ctx.trans));
        else { var b = el('div', 'qv-disp'); morceau(b, '\\[' + m[2] + '\\]', ctx.ajouter()); racine.appendChild(b); }
        f1();
      }
      else if (m[3] === 'cours') captureCours(m[4], racine, ctx);
      else if (m[3] === 'tableau') { if (tab) tab(); }
      else if (m[3] === 'graphique') { if (gr) gr(); }
      else if (m[3] === 'code') { if (code) code.poser(); }
      else if (m[3] === 'py') { if (code) code.ligne(Math.max(1, debut || ctx.n()), parseInt(m[4], 10) || 0); }
      else if (m[3] === 'dev') {                   // <!--dev:k--> : le développement q.devs[k], fléché, au milieu de la correction (TERM CH02)
        var dv = (ctx.devs || [])[parseInt(m[4], 10)];
        if (dv) { racine.appendChild(etapesDev(dv, ctx.ajouter, ctx.trans, ctx.majs)); f1(); }
      }
      else if (fig) fig.ecrire(m[4].split(',').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x >= 0; }), Math.max(1, ctx.n()));
      dernier = re.lastIndex;
    }
    libre(html.slice(dernier));
  }
  function figureACompleter(q, racine, ctx, titre, prog) {   // l'arbre / le tableau dessiné EN TÊTE, emplacements vides en pointillés
    var o = { slots: [], valeur: function (k) { return (q.cases[k] || {}).attendu || ''; } };
    var fig = q.type === 'arbre' ? dessinerArbre(q.arbre, 'correction', o) : dessinerTableau(q.tableau, 'correction', o);
    var bloc = el('div', 'qz-fig-corr qv-e');
    if (titre) bloc.appendChild(titre);           // exercice : « Question k » reste visible au-dessus de la figure collée
    if (prog) bloc.appendChild(prog.el);          // tableau d'état d'un programme (TERM CH02) : le programme au-dessus
    bloc.appendChild(fig.el); bloc.dataset.e = ctx.ajouter(); racine.appendChild(bloc);
    ctx.majs.push(function () { collerFigure(bloc); });
    function poser(ks, k) { ks.forEach(function (j) { var s = o.slots[j]; if (s && !s.val.dataset.e) s.val.dataset.e = k; }); }
    return { ecrire: poser, finir: function (k) { poser(o.slots.map(function (_, j) { return j; }), k); } };
  }
  function collerFigure(b) {                    // collée en haut du volet pendant qu'on la complète, si la hauteur le permet
    var corps = b.closest('.qv-corps'); if (!corps) return;
    var h = b.offsetHeight, H = corps.clientHeight, cache = 0;
    // un programme (TERM CH02), seul ou au-dessus de son tableau d'état, reste collé jusqu'à 62 % de la hauteur ; programme
    // et tableau trop hauts ensemble (téléphone) : le bloc est collé avec un haut NÉGATIF, le programme défile hors de vue
    // et le tableau qui se remplit reste visible (relecture du 19 nov. 2026)
    var prog = b.querySelector('.qz-code-corr'), lim = prog && !b.querySelector('svg, img') ? 0.62 : 0.46;
    var tab = prog && b.querySelector('.qz-tab-cadre');
    if (tab && h > H * lim) {
      cache = Math.max(0, Math.round(tab.getBoundingClientRect().top - b.getBoundingClientRect().top) - 2);   // dans la marge entre les deux
      h -= cache; lim = 0.46;
    }
    var colle = h > 0 && h <= H * lim;
    b.style.top = colle && cache ? -cache + 'px' : '';
    b.classList.toggle('colle', colle);
  }
  /* Intitulé d'une capture du cours (texte de remplacement, titre de l'agrandissement) : window.QUIZ_COURS_NOMS[clé]
     quand la page le donne (« Remarque : incompatibles et indépendants (p. 51) ») ; sinon déduit de la clé : « Définition 1 »,
     « Propriété 1 »… ; les remarques ne sont pas numérotées dans le livret : « Remarque du cours ». */
  function nomCours(cle) {
    var donne = window.QUIZ_COURS_NOMS && window.QUIZ_COURS_NOMS[cle];
    if (donne) return String(donne);
    var m = /^(def|prop|th|meth|rq|ex)(\d*)$/.exec(cle), N = { def: 'Définition', prop: 'Propriété', th: 'Théorème', meth: 'Méthode', ex: 'Exemple' };
    if (m && m[1] === 'rq') return 'Remarque du cours';
    return m ? N[m[1]] + (m[2] ? ' ' + m[2] : '') : 'Extrait du cours';
  }
  function captureCours(cle, racine, ctx) {     // capture du cadre du cours, en PLEINE largeur du volet, ombre portée ; clé absente : rien
    cle = String(cle).trim();
    var src = window.QUIZ_COURS && window.QUIZ_COURS[cle];
    if (!src) return;
    var f = el('figure', 'qz-cours qv-e'), b = el('button', 'qz-cours-b'), im = el('img'), nom = nomCours(cle);
    im.alt = nom; im.decoding = 'async';
    /* Échelle UNIFORME (TERM CH05, 17 nov. 2026) : avec window.QUIZ_COURS_REF (largeur en pixels d'une capture pleine
       largeur), une capture plus étroite (cadre d'une demi-page du livret) garde la même échelle au lieu d'être agrandie. */
    var ref = +window.QUIZ_COURS_REF || 0;
    if (ref) { im.onload = function () { if (im.naturalWidth && im.naturalWidth < ref) { im.style.width = (100 * im.naturalWidth / ref).toFixed(2) + '%'; f.classList.add('qz-cours-etroit'); } }; }
    im.src = src;
    b.type = 'button'; b.title = 'Agrandir'; b.setAttribute('aria-label', 'Agrandir : ' + nom);
    b.appendChild(im);                           // l'invitation à agrandir est SOUS la capture : rien par-dessus le texte du cours
    b.appendChild(el('span', 'qz-cours-loupe', '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M10.5 8v5M8 10.5h5"/></svg><span>Agrandir</span>'));
    b.addEventListener('click', function () { loupe(src, nom, b); });
    f.dataset.cours = cle; f.appendChild(b); f.dataset.e = ctx.ajouter(); racine.appendChild(f);
  }
  /* La capture en grand, plein écran : à la plus grande taille qui tient dans l'écran (jusqu'à 1,25 fois sa taille).
     Téléphone tenu droit et capture large : elle est tournée d'un quart de tour (on tourne le téléphone pour la lire),
     ce qui la rend environ deux fois plus grande ; si l'écran se met à l'horizontale, elle se redresse. Un toucher, Échap,
     Entrée, Espace ou la croix la referment. */
  function loupe(src, nom, retour) {
    var o = el('div', 'qz-loupe'), cadre = el('div', 'qz-loupe-cadre'), im = el('img'), b = el('button', 'qz-loupe-fermer', '<span aria-hidden="true">×</span>');
    var tete = el('div', 'qz-loupe-tete'), titre = el('p', 'qz-loupe-titre'), aide = el('p', 'qz-loupe-aide');
    titre.textContent = nom;
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', nom);
    im.src = src; im.alt = nom; b.type = 'button'; b.setAttribute('aria-label', 'Fermer');
    tete.appendChild(titre); tete.appendChild(aide);
    cadre.appendChild(im); o.appendChild(cadre); o.appendChild(tete); o.appendChild(b);
    function poser() {                           // en haut : l'intitulé, l'aide et la croix ; la capture dessous, au plus grand
      var W = window.innerWidth, H = window.innerHeight, w = im.naturalWidth || 1000, h = im.naturalHeight || 300, m = 14, bas = 16;
      function essai(rot) {
        o.classList.toggle('tourne', rot);
        aide.textContent = rot ? 'Tourne le téléphone pour lire. Touche l’écran pour fermer.' : 'Touche l’écran pour fermer.';
        var haut = Math.max(64, Math.ceil(tete.getBoundingClientRect().bottom) + 12), L = H - haut - bas;
        return { haut: haut, sc: rot ? Math.min(L / w, (W - 2 * m) / h, 1.25) : Math.min((W - 2 * m) / w, L / h, 1.25) };
      }
      var d = essai(false), t = W < H ? essai(true) : null, rot = !!t && t.sc > d.sc * 1.3, r = rot ? t : d;
      if (t && !rot) essai(false);                 // essayée tournée, mais pas plus grande : on la remet droite
      var lw = Math.round(w * r.sc), lh = Math.round(h * r.sc);
      im.style.width = lw + 'px'; im.style.height = lh + 'px';
      cadre.style.width = (rot ? lh : lw) + 'px'; cadre.style.height = (rot ? lw : lh) + 'px';
      cadre.style.marginTop = (r.haut - bas) + 'px';   // centrée entre l'en-tête et le bas de l'écran
    }
    function fermer() {
      o.remove(); document.removeEventListener('keydown', cle, true); window.removeEventListener('resize', poser);
      try { retour.focus({ preventScroll: true }); } catch (e) {}
    }
    function cle(ev) { if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); fermer(); } }
    o.addEventListener('click', fermer);
    document.addEventListener('keydown', cle, true);
    window.addEventListener('resize', poser);
    document.body.appendChild(o);
    poser(); if (!(im.complete && im.naturalWidth)) im.addEventListener('load', poser);
    try { b.focus({ preventScroll: true }); } catch (e) {}
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
    window.addEventListener('resize', function () { if (v.e && v.el.classList.contains('ouvert')) { ajusterLargeurs(v.e.racine, true); placerJustifs(v.e.racine); surligner(v.e.racine); (v.e.majs || []).forEach(function (f) { f(v.e.k, false); }); } });
    // quitter le quiz (« ‹ Première », changement d'onglet) ferme le volet et range l'onglet
    document.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('[data-retour], [role=tab]')) { fermerVolet(); v.languette.hidden = true; }
    });
    return v;
  }
  /* Surlignage dessiné SOUS l'encre : MathLive donne à une fraction (surtout dans une fraction) une boîte plus petite que
     ce qui est écrit, et un fond posé sur la boîte tombe à côté (M. Colin, 13 nov. 2026 : « surlignage mal ajusté »).
     On mesure donc ce qui est réellement tracé (union des morceaux visibles) et on pose un calque derrière. */
  function boiteEncre(e) {
    var b = null;
    [e].concat(Array.prototype.slice.call(e.querySelectorAll('span'))).forEach(function (s) {
      if (s.closest('.ML__sr-only') || /ML__strut|ML__pstrut/.test(s.className)) return;
      var r = s.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (!b) b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      else { b.l = Math.min(b.l, r.left); b.t = Math.min(b.t, r.top); b.r = Math.max(b.r, r.right); b.b = Math.max(b.b, r.bottom); }
    });
    return b;
  }
  function calque(e, racine, classe, marge, o) {   // o : un calque déjà posé, qu'on recale seulement
    var b = boiteEncre(e); if (!b) return null;
    var hote = e.closest('.qv-al, .qv-dev') || racine, H = hote.getBoundingClientRect();
    o = o || el('span', classe);
    o.style.left = (b.l - H.left + hote.scrollLeft - marge) + 'px'; o.style.top = (b.t - H.top + hote.scrollTop - marge) + 'px';
    o.style.width = (b.r - b.l + 2 * marge) + 'px'; o.style.height = (b.b - b.t + 2 * marge) + 'px';
    if (!o.parentNode) hote.appendChild(o);
    return o;
  }
  function surligner(racine) {
    var gardes = [];
    Array.prototype.forEach.call(racine.querySelectorAll('.qv-c.allume'), function (e) {
      if (e.parentElement && e.parentElement.closest('.qv-c.allume')) return;   // déjà couvert par un surlignage qui l'englobe
      var pas = e.closest('.qv-e'); if (pas && !pas.classList.contains('vu')) return;   // ligne pas encore écrite : rien à surligner
      var c = (e.className.match(/\bc[0-5]\b/) || ['c0'])[0];
      var o = e._surl && e._surl.isConnected && e._surl.classList.contains(c) ? e._surl : null;   // reste allumé : on ne le refait pas clignoter
      e._surl = calque(e, racine, 'qv-surl ' + c, 3, o);
      if (e._surl) gardes.push(e._surl);
    });
    Array.prototype.forEach.call(racine.querySelectorAll('.qv-surl'), function (x) { if (gardes.indexOf(x) < 0) x.remove(); });
  }
  function montrer(v, k, anime) {               // affiche les étapes 1…k (jamais moins d'une)
    var et = v.e; et.k = Math.max(Math.min(1, et.n), Math.min(et.n, k));
    ajusterLargeurs(et.racine);                    // un calcul trop large pour le volet : plus petit (une fois par largeur)
    placerJustifs(et.racine);                      // les polices des formules ont pu finir de charger : on recale les flèches
    var neufs = [];
    Array.prototype.forEach.call(et.racine.querySelectorAll('.qv-e'), function (x) {
      var i = +x.dataset.e;
      var parti = x.dataset.f && et.k >= +x.dataset.f;              // ['nx', note] : un post-it qui a servi s'en va
      x.classList.toggle('vu', i <= et.k && !parti);
      x.classList.toggle('qv-parti', !!parti);
      x.classList.remove('neuf');
      if (anime && i === et.k) neufs.push(x);
    });
    Array.prototype.forEach.call(et.racine.querySelectorAll('.qv-eclair'), function (x) { x.remove(); });
    neufs.forEach(function (x) {
      if (x.closest('.qv-al, .qv-dev')) { var o = calque(x, et.racine, 'qv-eclair', 2); if (o) o.addEventListener('animationend', function () { o.remove(); }); }   // formule : l'éclair suit l'encre
      else { void x.offsetWidth; x.classList.add('neuf'); }                       // phrase : le fond suit les lignes du texte
    });
    // surlignages : allumés de l'étape « on surligne » jusqu'à l'apparition du résultat, éteints ensuite ; à la DERNIÈRE
    // étape, rien ne reste surligné (14 nov. 2026), sauf un surlignage voulu jusqu'au bout (développement pas à pas, show ∞)
    Array.prototype.forEach.call(et.racine.querySelectorAll('.qv-c'), function (x) { x.classList.remove('allume', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5'); });
    (et.trans || []).forEach(function (t) {
      if (et.k < t.pre || et.k > t.show || (et.k === et.n && t.show === et.n)) return;
      var c = t.c || 'c' + (t.id % 3);             // t.sel, t.c : surlignages choisis par le développement pas à pas
      Array.prototype.forEach.call(et.racine.querySelectorAll('.' + (t.sel || 'qv-t' + t.id)), function (x) { x.classList.add('allume', c); });
    });
    surligner(et.racine);
    (et.majs || []).forEach(function (f) { f(et.k, anime); });   // flèches, barres, cadre du développement pas à pas
    var der = neufs[neufs.length - 1];
    if (der) {                                    // garder la dernière étape à l'écran, sans faire défiler la page
      var r = der.getBoundingClientRect(), c = v.corps.getBoundingClientRect(), haut = c.top, colles = [];
      Array.prototype.forEach.call(v.corps.querySelectorAll('.qz-fig-corr.colle'), function (f) {   // figure collée en haut du volet
        if (f.contains(der)) return; var fr = f.getBoundingClientRect(); if (fr.top <= c.top + 2) { haut = Math.max(haut, fr.bottom); colles.push(f); }
      });
      var t = r.top;                               // une valeur écrite dans la figure à la même étape : visible aussi, si la place suffit
      neufs.forEach(function (x) {
        if (colles.some(function (f) { return f.contains(x); })) return;
        var q = x.getBoundingClientRect(); if (q.height && r.bottom - Math.min(t, q.top) <= c.bottom - 40 - haut) t = Math.min(t, q.top);
      });
      // une étape plus haute que la place visible (figure de conclusion sur téléphone) : son HAUT reste visible, sous la barre
      // du volet (relecture du quiz TERM CH02, 19 nov. 2026) ; sinon, son bas est amené au-dessus du pied du volet
      if (r.bottom > c.bottom - 12 && r.height + 36 > c.bottom - haut) v.corps.scrollBy({ top: r.top - haut - 8, behavior: 'smooth' });
      else if (r.bottom > c.bottom - 12) v.corps.scrollBy({ top: r.bottom - c.bottom + 28, behavior: 'smooth' });
      else if (t < haut) v.corps.scrollBy({ top: t - haut - 16, behavior: 'smooth' });
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
      var d = el('details', 'qv-rappel'), s = el('summary', '', 'Rappel de la question'), z = rappelQuestion(q, c._saisie);
      d.appendChild(s); d.appendChild(z); rendre(z); c._rappel = d;
      d.addEventListener('toggle', function () { if (d.open) espacerFractions(z); });
    }
    v.quiz = quiz; v.n = n; v.e = c._etapes;
    v.titre.innerHTML = 'Correction <span class="qv-num">· question ' + (n + 1) + '</span>';
    v.corps.innerHTML = ''; v.corps.appendChild(c._rappel); v.corps.appendChild(v.e.racine); v.corps.scrollTop = 0;
    v.el.classList.add('ouvert'); v.el.setAttribute('aria-hidden', 'false'); v.el.inert = false;
    document.body.classList.add('volet-ouvert');
    v.languette.hidden = true;
    if (window.mathVirtualKeyboard) try { window.mathVirtualKeyboard.hide(); } catch (e) {}
    ajusterLargeurs(v.e.racine); placerJustifs(v.e.racine);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (v.e && v.e.racine.isConnected) { ajusterLargeurs(v.e.racine, true); placerJustifs(v.e.racine); surligner(v.e.racine); (v.e.majs || []).forEach(function (f) { f(v.e.k, false); }); } });
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

  /* ----- QUIZ NOTÉ (M. Colin, 15 nov. 2026) : pseudo donné en classe, tirage imposé, une seule réponse par question,
     note sur 20 et corrections à la fin, résultat chiffré pour le professeur (clé publique ECDH P-256) et envoyé à
     /api/quiz-notes (Worker Cloudflare + D1). Réglage : QUIZ_CONFIG[id].note = {n, cle (JWK publique), envoi}. ----- */
  /* RAPPORT DÉTAILLÉ (M. Colin, 17 nov. 2026 : « avoir accès à un rapport détaillé avec les questions eues par les élèves
     et les réponses données ») : chaque question du paquet chiffré porte l'énoncé tel que l'élève l'a vu (texte + LaTeX
     de la banque, variante générée comprise ; tableau, arbre, propositions dans l'ordre affiché, parties d'un exercice ;
     ni correction, ni image), sa réponse (LaTeX tapé, case par case, proposition cochée…), la bonne réponse, le détail
     case par case / question par question et le message de l'erreur repérée. notes.html le relit (clé privée). */
  var CHAMPS_RAPPORT = ['type', 'enonce', 'enonceApres', 'prefixe', 'suffixe', 'gauche', 'droite', 'tableau', 'arbre', 'modele', 'propositions', 'figureAlt'];
  function sansImage(x) {                       // une image (data URI) n'est jamais envoyée : « [figure] » à sa place
    if (typeof x === 'string') return x.replace(/<img\b[^>]*>/gi, '[figure]').split(/(<pre\b[\s\S]*?<\/pre>)/i)   // espaces insécables gardés ;
      .map(function (t, i) { return i % 2 ? t : t.replace(/[ \t\r\n]+/g, ' '); }).join('');                     // programme (<pre>) tel quel
    if (Array.isArray(x)) return x.map(sansImage);
    if (x && typeof x === 'object') { var o = {}; for (var k in x) o[k] = sansImage(x[k]); return o; }
    return x;
  }
  function questionRapport(q, s) {
    var o = {};
    CHAMPS_RAPPORT.forEach(function (k) { if (q[k] != null && q[k] !== '') o[k] = sansImage(q[k]); });
    if (q.figure) o.figure = true;
    if (s && s.ordre) o.ordre = s.ordre.slice();            // QCM : ordre des propositions vu par l'élève (lettres A, B…)
    if (s && s.ordreD) o.ordreD = s.ordreD.slice();         // associer : ordre des pastilles
    if (q.parties) o.parties = q.parties.map(function (pa, i) { return questionRapport(pa, s && s.parties && s.parties[i] && s.parties[i].s); });
    return o;
  }
  function reponseRapport(x) {                  // réponse compacte : textes de 300 caractères au plus (paquet borné)
    if (x == null) return null;
    if (typeof x === 'string') return x.length > 300 ? x.slice(0, 300) + '…' : x;
    if (typeof x === 'number' || typeof x === 'boolean') return x;
    if (Array.isArray(x)) return x.slice(0, 60).map(reponseRapport);
    return null;
  }
  function detailRapport(q, rep, r) {           // case par case (1 / 0) ; exercice : points, cases et message de chaque question
    switch (q.type) {
      case 'cases': return detailCases(q, rep || []).map(Number);
      case 'tableau': case 'arbre': return detailGrille(q, rep || []).map(Number);
      case 'exercice': return q.parties.map(function (pa, i) {
        var ri = r && r.parties && r.parties[i], x = (rep || [])[i], o = { p: Math.round(pointsReponse(pa, x, ri) * 1e6) / 1e6 };
        var c = detailRapport(pa, x, ri); if (c) o.c = c;
        if (ri && (ri.etat === 'faux' || ri.etat === 'rate') && ri.msg) o.m = reponseRapport(ri.msg);
        return o;
      });
      default: return null;
    }
  }
  function attenduRapport(q, rep) {               // bonne réponse du rapport : avec des variantes (blocs), la plus proche de la réponse
    return q.type === 'associer' && q.variantes && rep ? attenduAssocier(q, rep) : reponseAttendue(q);
  }
  function rapportQuestion(d, q, e, s) {
    if (q.famille) d.famille = q.famille;
    d.q = questionRapport(q, s);
    d.a = reponseRapport(attenduRapport(q, e.repondue ? e.brute : null));   // bonne réponse
    if (!e.repondue) return;
    d.r = reponseRapport(e.brute);                          // réponse de l'élève
    var c = detailRapport(q, e.brute, e.res); if (c) d.c = c;
    if (q.type !== 'exercice' && e.res && e.res.etat === 'faux' && e.res.msg) d.m = reponseRapport(e.res.msg);   // erreur repérée (piège) ; exercice : par question
  }
  /* Le paquet est compressé (deflate-raw, octet 0 en tête) quand le navigateur sait le faire : ~10 Ko au lieu de ~45 Ko
     pour le pire tirage (rapport de sortie envoyé par sendBeacon, limité à 64 Ko) ; sinon, JSON tel quel (« { » en tête). */
  function compresser(u) {
    try {
      if (!window.CompressionStream || !window.Response || !window.Blob) return Promise.resolve(null);
      var flux = new Blob([u]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Response(flux).arrayBuffer().then(function (b) { var z = new Uint8Array(b.byteLength + 1); z.set(new Uint8Array(b), 1); return z; }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function b64(u) { u = new Uint8Array(u); var t = ''; for (var k = 0; k < u.length; k++) t += String.fromCharCode(u[k]); return btoa(t); }
  function chiffrerPourProf(jwk, obj) {
    var S = crypto.subtle, pub, eph;
    return S.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
      .then(function (k) { pub = k; return S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); })
      .then(function (k) { eph = k; return S.deriveKey({ name: 'ECDH', public: pub }, eph.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']); })
      .then(function (cle) {
        var iv = crypto.getRandomValues(new Uint8Array(12)), brut = new TextEncoder().encode(JSON.stringify(obj));
        return compresser(brut).then(function (z) { return S.encrypt({ name: 'AES-GCM', iv: iv }, cle, z || brut); }).then(function (ct) {
          return S.exportKey('jwk', eph.publicKey).then(function (e) { return { epk: { x: e.x, y: e.y }, iv: b64(iv), ct: b64(ct) }; });
        });
      });
  }
  /* Paquet d'un quiz noté : jamais plus de 60 000 caractères (sendBeacon et fetch keepalive, qui portent le rapport de
     sortie, refusent au-delà de 64 Kio ; le Worker accepte 90 000) ; s'il le fallait (réponses démesurées, navigateur sans
     compression), le rapport est allégé : sans les énoncés (allege: 1, l'ordre des lettres d'un QCM gardé), puis sans
     détail (allege: 2) ; la note et les points restent. */
  var MAX_PAQUET = 60000;
  function allege(obj, niveau) {
    var o = {}, k; for (k in obj) o[k] = obj[k];
    var garde = ['ref', 'theme', 'type', 'points', 'repondue', 'famille'];
    o.questions = (obj.questions || []).map(function (d) {
      var x = {}; for (var c in d) if (niveau === 1 ? c !== 'q' : garde.indexOf(c) >= 0) x[c] = d[c];
      if (niveau === 1 && d.q && d.q.ordre) x.ordre = d.q.ordre;   // réponse d'un QCM lisible (« B. ») sans l'énoncé
      return x; });
    o.allege = niveau; return o;
  }
  function chiffrerNote(jwk, obj) {
    var taille = function (p) { return JSON.stringify(p).length + 40; };
    return chiffrerPourProf(jwk, obj).then(function (p) {
      if (taille(p) <= MAX_PAQUET) return p;
      return chiffrerPourProf(jwk, allege(obj, 1)).then(function (p1) { return taille(p1) <= MAX_PAQUET ? p1 : chiffrerPourProf(jwk, allege(obj, 2)); });
    });
  }
  var ATTENTE = 'colineaire.notes.attente';
  function lireAttente() { try { return JSON.parse(localStorage.getItem(ATTENTE) || '[]'); } catch (e) { return []; } }
  function ecrireAttente(l) { try { localStorage.setItem(ATTENTE, JSON.stringify(l)); } catch (e) {} }
  function poster(url, paquet) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paquet) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return true; });
  }
  function renvoyerAttente(url) {                 // résultats restés en attente (pas de réseau) : renvoyés à la visite suivante
    var l = lireAttente(); if (!l.length) return;
    var reste = [];
    l.reduce(function (p, paquet) { return p.then(function () { return poster(url, paquet).catch(function () { reste.push(paquet); }); }); }, Promise.resolve())
      .then(function () { ecrireAttente(reste); });
  }
  /* Sortie du quiz (M. Colin, 15 nov. 2026) : le rapport de la tentative en cours (réponses déjà données, les autres à 0)
     est chiffré d'avance après chaque réponse ; si l'élève quitte la page (onglet fermé, rechargement, autre page,
     application fermée), il part tout seul (sendBeacon) et la tentative est close : en revenant, l'élève repart d'un
     nouveau tirage. Les paquets d'une même tentative portent le même numéro : notes.html n'en garde que le dernier. */
  var ENCOURS = 'colineaire.notes.encours';
  function envoyerSortie(url, paquet) {
    var corps = JSON.stringify(paquet);
    try { if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([corps], { type: 'application/json' }))) return true; } catch (e) {}
    try { fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps, keepalive: true }); return true; } catch (e) {}
    return false;
  }
  function renvoyerEncours(url) {                 // rapport d'une tentative quittée qui n'a pas pu partir : envoyé à la visite suivante
    var p = null; try { p = JSON.parse(localStorage.getItem(ENCOURS) || 'null'); } catch (e) {}
    if (!p) return;
    poster(url, p).then(function () { try { localStorage.removeItem(ENCOURS); } catch (e) {} }, function () {});
  }
  /* Plein écran (demandé au début, message dès qu'on en sort) ; copier, couper, coller, clic droit, sélection : bloqués
     sur la page du quiz noté (sauf la case du pseudo). */
  function pleinEcranPossible() { var d = document.documentElement; return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(d.requestFullscreen || d.webkitRequestFullscreen); }
  function enPleinEcran() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function demanderPleinEcran() {
    var d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
    try { var r = f.call(d, { navigationUI: 'hide' }); return r && r.then ? r : Promise.resolve(); } catch (e) { return Promise.reject(e); }
  }
  function quitterPleinEcran() { var f = document.exitFullscreen || document.webkitExitFullscreen; if (f && enPleinEcran()) try { var r = f.call(document); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
  var antiCopieInstalle = false;
  function antiCopie() {
    if (antiCopieInstalle) return; antiCopieInstalle = true;
    document.documentElement.classList.add('qn-protege');
    var libre = function (ev) { var t = ev.target; return t && t.classList && t.classList.contains('qn-pseudo'); };
    var bloque = function (ev) { if (libre(ev)) return; ev.preventDefault(); ev.stopImmediatePropagation(); };
    ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drop'].forEach(function (t) { document.addEventListener(t, bloque, true); });
    document.addEventListener('selectstart', function (ev) {
      var p = ev.composedPath ? ev.composedPath() : [];
      for (var k = 0; k < p.length; k++) if (p[k].tagName === 'MATH-FIELD' || p[k].tagName === 'INPUT') return;
      ev.preventDefault();
    }, true);
    document.addEventListener('keydown', function (ev) {            // raccourcis copier / couper / coller / tout sélectionner
      if (!(ev.ctrlKey || ev.metaKey) || libre(ev)) return;
      var k = (ev.key || '').toLowerCase();
      if (k === 'c' || k === 'x' || k === 'v' || k === 'insert' || (k === 'a' && !(ev.target && ev.target.tagName === 'MATH-FIELD'))) { ev.preventDefault(); ev.stopImmediatePropagation(); }
    }, true);
  }
  function QuizNote(racine, cfg) {
    var self = this;
    this.racine = racine; this.cfg = cfg; this.pseudo = '';
    try { this.pseudo = sessionStorage.getItem('colineaire.pseudo') || ''; } catch (e) {}
    this.url = cfg.note.envoi || '/api/quiz-notes';
    renvoyerAttente(this.url); renvoyerEncours(this.url);
    antiCopie();
    var sortie = function () { self.sortir(); };
    window.addEventListener('pagehide', sortie);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') self.sortir(true); });
    window.addEventListener('pageshow', function (ev) { if (ev.persisted && self.close) self.afficher(true); });   // retour arrière : pas de reprise
    window.addEventListener('beforeunload', function (ev) { if (self.enCours()) { ev.preventDefault(); ev.returnValue = ''; } });
    document.addEventListener('fullscreenchange', function () { self.majPleinEcran(); });
    document.addEventListener('webkitfullscreenchange', function () { self.majPleinEcran(); });
    this.afficher();
  }
  QuizNote.prototype.enCours = function () { return !!(this.quiz && !this.quiz.noteFinie && !this.close); };
  QuizNote.prototype.preparer = function (bilan) {   // rapport de sortie chiffré d'avance (la page qui se ferme n'attend pas)
    var self = this, cfg = this.cfg, k = (this.version = (this.version || 0) + 1), t = new Date();
    var obj = { quiz: cfg.id, tentative: this.tentative, statut: 'quitté', pseudo: this.pseudo, debut: this.debut.toISOString(), fin: t.toISOString(),
                duree: Math.round((t - this.debut) / 1000), note: bilan.note, points: bilan.points, total: bilan.total, repondues: bilan.repondues,
                questions: bilan.details };
    chiffrerNote(cfg.note.cle, obj).then(function (paquet) {
      if (k !== self.version || !self.enCours()) return;
      paquet.quiz = cfg.id; self.partiel = paquet; self.partielEnvoye = false;
      try { localStorage.setItem(ENCOURS, JSON.stringify(paquet)); } catch (e) {}
    }).catch(function () {});
  };
  QuizNote.prototype.sortir = function (cache) {
    if (!this.enCours() || !this.partiel) return;
    if (!this.partielEnvoye && envoyerSortie(this.url, this.partiel)) {
      this.partielEnvoye = true; try { localStorage.removeItem(ENCOURS); } catch (e) {}
    }
    if (!cache) this.close = true;                   // page quittée : la tentative est finie
  };
  QuizNote.prototype.majPleinEcran = function () {
    var v = this.voile;
    if (!this.pleinEcran || !this.enCours() || enPleinEcran()) { if (v) v.hidden = true; return; }
    if (!v) {
      v = this.voile = el('div', 'qn-voile');
      v.setAttribute('role', 'alertdialog'); v.setAttribute('aria-modal', 'true');
      var b = el('div', 'qn-voile-boite',
        '<p class="qn-voile-titre">Tu as quitté le plein écran</p>' +
        '<p>Le quiz noté se fait en plein écran. Reviens-y pour continuer : tes réponses sont gardées.</p>');
      var bt = el('button', 'bouton', 'Revenir en plein écran'); bt.type = 'button';
      bt.addEventListener('click', function () { demanderPleinEcran().catch(function () {}); });
      b.appendChild(bt); v.appendChild(b); document.body.appendChild(v);
    }
    v.hidden = false;
    setTimeout(function () { try { v.querySelector('button').focus({ preventScroll: true }); } catch (e) {} }, 30);
  };
  QuizNote.prototype.afficher = function (quitte) {
    var self = this, cfg = this.cfg, r = this.racine, N = cfg.note.n || 20;
    this.quiz = null; this.close = false; this.partiel = null; this.pleinEcran = false;
    if (this.voile) this.voile.hidden = true;
    fermerVolet(); if (volet) volet.languette.hidden = true;
    r.innerHTML = '';
    var tete = el('div', 'quiz-tete');
    tete.appendChild(el('div', 'quiz-titres', '<span class="quiz-etiquette">' + cfg.etiquette + '</span><h2>' + cfg.titre + '</h2>' +
      '<p class="quiz-sous-titre">Quiz noté : ' + N + ' questions tirées au hasard dans tout le chapitre.</p>'));
    r.appendChild(tete);
    var carte = el('section', 'quiz-carte quiz-reglages qn-accueil');
    var f = el('form', 'qn-form'); f.setAttribute('autocomplete', 'off');
    f.appendChild(el('label', 'qn-label', 'Écris le pseudo donné en classe'));
    var i = el('input', 'qn-pseudo'); i.type = 'text'; i.maxLength = 40; i.value = this.pseudo;
    i.setAttribute('autocapitalize', 'off'); i.setAttribute('spellcheck', 'false'); i.id = 'qn-pseudo-' + (cfg.id || 'quiz');
    f.firstChild.setAttribute('for', i.id);
    f.appendChild(i);
    var regles = el('ul', 'qn-regles',
      '<li>Une seule réponse par question : réfléchis bien avant de valider. Il faut répondre pour passer à la suivante.</li>' +
      '<li>Ta note sur 20 et les corrections s’affichent à la fin.</li>' +
      '<li>Ton résultat est envoyé à M. Colin avec ton pseudo.</li>' +
      '<li>Si tu quittes la page avant la fin, ta tentative s’arrête là : elle est envoyée telle quelle (questions sans réponse à 0) et tu ne pourras pas la reprendre.</li>' +
      '<li>Copier et coller sont désactivés.</li>' +
      (pleinEcranPossible() ? '<li><strong>Le quiz se fait en plein écran</strong> : il s’ouvre en plein écran quand tu commences ; si tu en sors, un message te demande d’y revenir.</li>' : ''));
    f.appendChild(regles);
    var m = el('p', 'quiz-message'); m.setAttribute('role', 'alert'); f.appendChild(m);
    if (quitte) { m.className = 'quiz-message info'; m.textContent = 'Tu as quitté le quiz : ta tentative a été envoyée à M. Colin telle quelle. Tu peux en commencer une nouvelle.'; }
    var a = el('div', 'quiz-actions');
    var go = el('button', 'bouton qn-commencer', 'Commencer le quiz noté <span aria-hidden="true">›</span>'); go.type = 'submit';
    a.appendChild(go); f.appendChild(a);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var p = i.value.replace(/\s+/g, ' ').trim();
      if (p.length < 2) { m.className = 'quiz-message ko'; m.textContent = 'Écris ton pseudo (celui donné en classe).'; i.focus(); return; }
      self.pseudo = p; try { sessionStorage.setItem('colineaire.pseudo', p); } catch (e) {}
      if (pleinEcranPossible()) demanderPleinEcran().then(function () { self.pleinEcran = enPleinEcran(); }, function () {});   // dans le clic : seul moment permis
      self.lancer();
    });
    carte.appendChild(f); r.appendChild(carte);
    setTimeout(function () { try { i.focus({ preventScroll: true }); } catch (e) {} }, 50);
  };
  QuizNote.prototype.lancer = function () {
    var self = this, cfg = this.cfg;
    var source = { etiquette: cfg.etiquette, titre: cfg.titre, sousTitre: 'Quiz noté · pseudo : ' + echapper(this.pseudo), questions: [],
                   tirage: { depuis: cfg.themes.slice(), n: cfg.note.n || 20, equilibre: !!cfg.equilibre } };   // equilibre : sous-banques en proportion (Seconde CH03)
    this.debut = new Date();
    this.tentative = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    this.racine._quiz = this;
    this.quiz = new Quiz(this.racine, source, { note: {
      maj: function (b) { self.preparer(b); },
      fin: function (res) { self.version = (self.version || 0) + 1; self.partiel = null; try { localStorage.removeItem(ENCOURS); } catch (e) {}
                            if (self.voile) self.voile.hidden = true; quitterPleinEcran(); return self.envoyer(res); },
      recommencer: function () { self.afficher(); self.racine.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    } });  this.preparer(this.quiz.bilanNote());               // quitter avant la première réponse : 0 / 20, envoyé aussi
  };
  QuizNote.prototype.envoyer = function (res) {
    var cfg = this.cfg, fin = new Date();
    var obj = { quiz: cfg.id, tentative: this.tentative, statut: 'terminé', pseudo: this.pseudo, debut: this.debut.toISOString(), fin: fin.toISOString(),
                duree: Math.round((fin - this.debut) / 1000), note: res.note, points: res.points, total: res.total, repondues: res.repondues, questions: res.details };
    var url = this.url;
    return chiffrerNote(cfg.note.cle, obj).then(function (paquet) {
      paquet.quiz = cfg.id;
      return poster(url, paquet).catch(function (e) { var l = lireAttente(); l.push(paquet); ecrireAttente(l); throw e; });
    });
  };
  function echapper(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pointsTexte(x) { return String(Math.round(x * 100) / 100).replace('.', ','); }
  /* points d'une question : « 0,5 point », « 0,75 point », « 2/3 de point », « 3/5 de point », « 7/12 de point » (charte
     § 11.2 septies, 16 nov. 2026) : demis et quarts en décimal, toute autre part en fraction IRRÉDUCTIBLE (le plus petit
     dénominateur qui convient) ; au-delà de 240, décimal à deux chiffres */
  function fractionPoints(x) {
    for (var d = 1; d <= 240; d++) {
      var k = Math.round(x * d);
      if (Math.abs(x - k / d) < 1e-9) return d === 1 || d === 2 || d === 4 ? pointsTexte(k / d) : k + '/' + d;
    }
    return pointsTexte(x);
  }
  function pointQuestion(x) { var t = fractionPoints(x); return t + (t.indexOf('/') >= 0 ? ' de point' : ' point'); }
  Quiz.prototype.validerNote = function (n) {
    var c = this.cartes[n], e = this.etat[n], q = c._q;
    if (this.noteFinie || e.repondue) return;
    var rep = c._saisie ? c._saisie.lire() : null;
    var r = c._saisie ? verifierReponse(q, rep) : c._lire();   // sans marquer les cases : rien ne trahit la réponse
    c._msg.className = 'quiz-message';
    if (q.type === 'exercice' && r.reste && r.reste.length) {
      var aCompleter = r.reste.filter(function (i) { return r.parties[i] && r.parties[i].etat === 'lecture' && r.parties[i].msg; });   // commencée, pas finie
      ecrireMsg(c._msg, 'Réponds à toutes les questions de l’exercice (il reste ' + (r.reste.length > 1 ? 'les questions ' : 'la question ') + numeros(r.reste) + ').'
        + aCompleter.map(function (i) { return ' Question ' + (i + 1) + ' : ' + r.parties[i].msg; }).join(''));
      c._msg.classList.add('info'); return;
    }
    if (r.etat === 'lecture') { ecrireMsg(c._msg, r.msg); c._msg.classList.add('info'); return; }
    e.repondue = true; e.res = r; e.rep = rep;
    e.brute = c._saisie ? rep : (c._lire && c._lire.valeurs ? c._lire.valeurs() : null);   // rapport détaillé (17 nov. 2026)
    // au prorata (M. Colin, 16 nov. 2026) : « compléter » (cases justes), tableau et arbre (cases justes), exercice (moyenne
    // de ses questions, chacune au prorata de ses cases) ; 1 ou 0 pour les autres types
    e.points = r.etat === 'juste' ? 1 : c._saisie ? pointsReponse(q, rep, r)
      : (q.type === 'cases' && typeof r.prorata === 'number' ? r.prorata : 0);
    c._fini = true;
    c._msg.textContent = 'Réponse enregistrée.'; c._msg.classList.add('info');
    c._bv.hidden = true; c._bs.hidden = true; c._bn.hidden = false; c._bn.className = 'bouton';
    c.querySelectorAll('.quiz-zone math-field').forEach(function (s) { s.readOnly = true; s.blur(); });
    c.querySelectorAll('.quiz-zone button').forEach(function (s) { s.disabled = true; });
    if (c._saisie) c._saisie.figer();
    window.mathVirtualKeyboard && window.mathVirtualKeyboard.hide();
    this.majPoints();
    if (this.opts.note.maj) this.opts.note.maj(this.bilanNote());   // rapport tenu prêt, au cas où l'élève quitte le quiz
    setTimeout(function () { try { c._bn.focus({ preventScroll: true }); } catch (x) {} }, 50);
  };
  Quiz.prototype.bilanNote = function () {        // note du moment : une question sans réponse compte 0
    var etat = this.etat, cartes = this.cartes || [], total = etat.length, pts = 0, rep = 0;
    etat.forEach(function (e) { pts += e.points || 0; if (e.repondue) rep++; });
    return { note: Math.round(pts / total * 20 * 100) / 100, points: Math.round(pts * 100) / 100, total: total, repondues: rep,
      details: this.def.questions.map(function (q, j) {
        var d = { ref: q.ref || '', theme: q.theme || '', type: q.type, points: Math.round((etat[j].points || 0) * 1e6) / 1e6, repondue: !!etat[j].repondue };
        try { rapportQuestion(d, q, etat[j], cartes[j] && cartes[j]._saisie); } catch (x) {}   // rapport détaillé : jamais bloquant
        return d; }) };
  };
  Quiz.prototype.terminerNote = function (force) {
    var self = this, etat = this.etat, total = etat.length;
    fermerVolet(); this.cartes.forEach(function (c) { c.hidden = true; });
    this.fin.innerHTML = '';
    var sans = []; etat.forEach(function (e, j) { if (!e.repondue) sans.push(j); });
    if (sans.length && !force && !this.noteFinie) {
      this.fin.appendChild(el('p', 'quiz-num', 'Avant de terminer'));
      this.fin.appendChild(el('p', 'quiz-detail', sans.length > 1 ? 'Il reste ' + sans.length + ' questions sans réponse (' + numeros(sans) + ') : elles compteront 0.'
        : 'Il reste une question sans réponse (' + numeros(sans) + ') : elle comptera 0.'));
      var a0 = el('div', 'quiz-actions');
      var rv = el('button', 'bouton', 'Revenir aux questions'); rv.type = 'button'; rv.addEventListener('click', function () { self.aller(sans[0]); });
      var tq = el('button', 'bouton secondaire', 'Terminer quand même'); tq.type = 'button'; tq.addEventListener('click', function () { self.terminerNote(true); });
      a0.appendChild(rv); a0.appendChild(tq); this.fin.appendChild(a0);
      this.fin.hidden = false; this.majPoints(); majLanguette(this);
      this.fin.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    var premiere = !this.noteFinie;
    this.noteFinie = true;
    var bn = this.bilanNote(), note = bn.note;
    if (premiere) {
      this.cartes.forEach(function (c, j) {                  // relecture : chaque carte dit ce qu'elle a rapporté, correction ouverte
        var e = etat[j], q = c._q;
        c._fini = true; c._bv.hidden = true; c._bs.hidden = false; c._bn.hidden = false; c._bn.className = 'bouton secondaire';
        c._bn.innerHTML = j + 1 < total ? 'Question suivante' : 'Revoir la note';
        c.querySelectorAll('.quiz-zone math-field').forEach(function (s) { s.readOnly = true; });
        c.querySelectorAll('.quiz-zone button').forEach(function (s) { s.disabled = true; });
        if (c._saisie) {
          c._saisie.figer();
          if (e.res && e.repondue && c._saisie.marquerFin) try { c._saisie.marquerFin(e.rep, e.res); } catch (x) {}   // tableau, arbre, exercice : chaque case / question marquée
          else if (e.res && q.type !== 'exercice') try { c._saisie.marquer(e.res); } catch (x) {}
        }
        var partiel = e.points > 0 && e.points < 1;
        if (q.type === 'cases' && e.repondue && c._lire && c._lire.marquerCases) try { c._lire.marquerCases(); } catch (x) {}
        c.classList.toggle('reussie', e.points === 1); c.classList.toggle('partielle', partiel); c.classList.toggle('ratee', !(e.points > 0));
        c._msg.className = 'quiz-message ' + (e.points === 1 ? 'ok' : partiel ? 'partiel' : 'ko');
        c._msg.textContent = !e.repondue ? 'Pas de réponse : 0 point.' : e.points === 1 ? 'Juste : 1 point.'
          : (partiel ? 'En partie juste : ' + pointQuestion(e.points) + '.' : 'Faux : 0 point.');
      });
      this.envoi = this.opts.note.fin(bn);
    }
    this.fin.appendChild(el('p', 'quiz-num', 'Note'));
    this.fin.appendChild(el('p', 'quiz-score qn-note', '<strong>' + pointsTexte(note) + ' / 20</strong>'));
    var justes = etat.filter(function (e) { return e.points === 1; }).length;
    this.fin.appendChild(el('p', 'quiz-detail', justes + ' question' + (justes > 1 ? 's' : '') + ' juste' + (justes > 1 ? 's' : '') + ' sur ' + total +
      ' · touche un numéro pour revoir une question et sa correction.'));
    var st = el('p', 'quiz-message info qn-envoi', 'Envoi du résultat à M. Colin…'); st.setAttribute('role', 'status'); this.fin.appendChild(st);
    var a = el('div', 'quiz-actions');
    var nt = el('button', 'bouton', 'Nouvelle tentative'); nt.type = 'button'; nt.addEventListener('click', function () { self.opts.note.recommencer(); });
    a.appendChild(nt); this.fin.appendChild(a);
    (this.envoi || Promise.resolve()).then(function () { st.className = 'quiz-message ok qn-envoi'; st.textContent = 'Résultat envoyé à M. Colin.'; },
      function () { st.className = 'quiz-message ko qn-envoi'; st.textContent = 'Le résultat n’a pas pu être envoyé (pas de connexion ?) : il est gardé sur cet appareil et partira à ta prochaine visite de ce quiz.'; });
    this.fin.hidden = false;
    this.majPoints(); majLanguette(this);
    this.fin.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  function Reglages(racine, cfg) {
    this.racine = racine; this.cfg = cfg;
    this.n = cfg.defaut || 20;
    this.coches = {}; var self = this;
    cfg.themes.forEach(function (id) { self.coches[id] = true; });
    this.afficher();
  }
  Reglages.prototype.banque = function (id) { var d = (window.QUIZ || {})[id]; return d ? d.questions.length : 0; };
  /* Nombre de questions qu'un tirage peut vraiment servir (TERM CH05, relecture du 17 nov. 2026) : une seule question
     par famille (q.famille) ; sans familles (Automatismes), c'est la taille des banques. */
  Reglages.prototype.servables = function (ch) {
    var vues = {}, n = 0;
    ch.forEach(function (id) { var d = (window.QUIZ || {})[id]; if (d) d.questions.forEach(function (q) { if (!q.famille) n++; else if (!vues[q.famille]) { vues[q.famille] = 1; n++; } }); });
    return n;
  };
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
    var self = this, ch = this.choisis(), dispo = ch.reduce(function (s, id) { return s + self.banque(id); }, 0), serv = this.servables(ch);
    var tous = ch.length === this.cfg.themes.length;
    this.bTout.textContent = tous ? 'Tout décocher' : 'Tout cocher';
    this.bLancer.disabled = !ch.length;
    this.resume.classList.toggle('alerte', !ch.length);
    this.resume.innerHTML = !ch.length ? 'Coche au moins un thème.'
      : '<strong>' + Math.min(this.n, serv) + ' questions</strong> tirées au hasard parmi ' + dispo +
        (tous ? ', dans tous les thèmes.' : ', dans ' + (ch.length === 1 ? 'le thème choisi.' : 'les ' + ch.length + ' thèmes choisis.')) +
        (this.n > serv ? (serv < dispo ? ' (Pas davantage : deux questions trop proches ne sont jamais posées ensemble.)' : ' (Il n’y en a pas davantage.)') : '');
  };
  Reglages.prototype.lancer = function () {
    var self = this, ch = this.choisis(); if (!ch.length) return;
    var n = Math.min(this.n, this.servables(ch));
    var tous = ch.length === this.cfg.themes.length;
    var def = { etiquette: this.cfg.etiquette, titre: this.cfg.titre,
      sousTitre: n + ' questions tirées au hasard' + (tous ? ' dans tous les thèmes' : ch.length === 1 ? ' : ' + ((this.cfg.noms && this.cfg.noms[ch[0]]) || window.QUIZ[ch[0]].titre).toLowerCase() : ' dans ' + ch.length + ' thèmes') + ', nouveau tirage à chaque essai.',
      tirage: { depuis: ch, n: n, equilibre: !!this.cfg.equilibre }, questions: [] };   // ordre au hasard, thèmes mélangés (M. Colin, 13 nov. 2026 : le calcul ne vient plus toujours en premier)
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
        function lancer() { if (r._quiz) return; r._quiz = cfg ? (cfg.note ? new QuizNote(r, cfg) : new Reglages(r, cfg)) : new Quiz(r, def); }
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
    lireIntervalles: lireIntervalles, FORMES: FORMES, verifierCoords: verifierCoords,
    // TOUS les types (quiz de chapitre, 14 nov. 2026) : réponse au format de reponseAttendue(q), voir la section 2 bis
    verifierReponse: verifierReponse, reponseAttendue: reponseAttendue,
    // pour les tests : monter un quiz sans tuile, découper une correction en étapes
    monter: function (r, def, opts) { return (r._quiz = new Quiz(r, def, opts)); }, etapes: construireEtapes, tirageEquilibre: tirageEquilibre, pointsCases: pointsCases, pointQuestion: pointQuestion,
    pointsGrille: pointsGrille, detailGrille: detailGrille, pointsReponse: pointsReponse, attenduRapport: attenduRapport,
    // rapport détaillé des quiz notés (notes.html, 17 nov. 2026) : mêmes tableaux, arbres et formules que le quiz
    dessinerTableau: dessinerTableau, dessinerArbre: dessinerArbre, rendre: rendre, questionRapport: questionRapport, variables: variables, chiffrerNote: chiffrerNote
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
