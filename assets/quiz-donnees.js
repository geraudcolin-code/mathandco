/* Colinéaire : contenu des quiz en accès libre (moteur : assets/quiz.js).
   enonce / correction : HTML, formules entre \( … \).
   type 'expr' : attendu (LaTeX), variable, gauche (lettre admise à gauche du « = »), gaucheObligatoire,
                 forme : 'libre' | 'affine' (y = mx + p) | 'polynome' (développée réduite) | 'puissance' (une seule puissance)
   type 'signes' : valeurs (racines rangées), lignes [{label, signes : [int, val, int, val, int]}], '+', '−', '0' ou '' */
window.QUIZ = window.QUIZ || {};
window.QUIZ['1ere-automatismes-1'] = {
  etiquette: 'Première · Automatismes',
  titre: 'Quiz 1 : cinq automatismes',
  questions: [
    {
      type: 'expr',
      enonce: '<p>On a l’égalité \\(x=\\dfrac{X}{X-1}\\).</p><p>Exprimer \\(X\\) en fonction de \\(x\\).</p>',
      prefixe: '\\(X=\\)', gauche: 'X', variable: 'x', attendu: '\\frac{x}{x-1}', forme: 'libre',
      correction: '<p>Pour \\(X\\neq1\\) : \\(x=\\dfrac{X}{X-1}\\)</p><p>c-à-d \\(x(X-1)=X\\)</p><p>c-à-d \\(xX-x=X\\)</p><p>c-à-d \\(xX-X=x\\)</p><p>c-à-d \\(X(x-1)=x\\)</p><p>c-à-d \\(X=\\dfrac{x}{x-1}\\) (pour \\(x\\neq1\\)).</p>'
    },
    {
      type: 'expr',
      enonce: '<p>Donner l’équation réduite de la droite passant par \\(A(2\\,;4)\\) et \\(B(5\\,;6)\\).</p>',
      gauche: 'y', gaucheObligatoire: true, variable: 'x', attendu: '\\frac{2}{3}x+\\frac{8}{3}', forme: 'affine',
      indiceForme: 'C’est bien la droite (AB), mais l’équation n’est pas sous la forme réduite y = mx + p.',
      correction: '<p>Coefficient directeur : \\(m=\\dfrac{y_B-y_A}{x_B-x_A}=\\dfrac{6-4}{5-2}=\\dfrac{2}{3}\\).</p><p>\\(A\\) est sur la droite : \\(4=\\dfrac{2}{3}\\times2+p\\), donc \\(p=4-\\dfrac{4}{3}=\\dfrac{8}{3}\\).</p><p>L’équation réduite est \\(y=\\dfrac{2}{3}x+\\dfrac{8}{3}\\).</p>'
    },
    {
      type: 'signes',
      enonce: '<p>Construire le tableau de signes de \\((x+8)(x-5)\\).</p>',
      valeurs: [-8, 5],
      lignes: [
        { label: '\\(x+8\\)', signes: ['−', '0', '+', '', '+'] },
        { label: '\\(x-5\\)', signes: ['−', '', '−', '0', '+'] },
        { label: '\\((x+8)(x-5)\\)', signes: ['+', '0', '−', '0', '+'] }
      ],
      correction: '<p>\\(x+8=0\\) pour \\(x=-8\\) et \\(x-5=0\\) pour \\(x=5\\) : on range \\(-8<5\\) sur la ligne des \\(x\\).</p><p>\\(x+8\\) et \\(x-5\\) sont des fonctions affines de coefficient directeur positif : chacune est négative avant sa racine, positive après.</p><p>La règle des signes donne : \\((x+8)(x-5)\\) est positif sur \\(]-\\infty\\,;-8[\\) et sur \\(]5\\,;+\\infty[\\), négatif sur \\(]-8\\,;5[\\), et nul en \\(-8\\) et en \\(5\\).</p>'
    },
    {
      type: 'expr',
      enonce: '<p>Donner la forme développée et réduite de</p><p>\\(A(x)=(2x+1)^2-(4x-3)^2\\).</p>',
      prefixe: '\\(A(x)=\\)', variable: 'x', attendu: '-12x^2+28x-8', forme: 'polynome',
      indiceForme: 'Le résultat est juste, mais l’expression n’est pas complètement développée et réduite.',
      correction: '<p>\\((2x+1)^2=4x^2+4x+1\\) et \\((4x-3)^2=16x^2-24x+9\\).</p><p>\\(A(x)=4x^2+4x+1-(16x^2-24x+9)\\)</p><p>\\(\\phantom{A(x)}=4x^2+4x+1-16x^2+24x-9\\)</p><p>\\(\\phantom{A(x)}=-12x^2+28x-8\\).</p>'
    },
    {
      type: 'expr',
      enonce: '<p>Donner une écriture simplifiée de \\(\\dfrac{\\left(a^3\\right)^4}{a^{10}}\\), pour \\(a\\neq0\\).</p>',
      prefixe: '\\(\\dfrac{\\left(a^3\\right)^4}{a^{10}}=\\)', variable: 'a', attendu: 'a^2', forme: 'puissance',
      indiceForme: 'C’est égal, mais on peut encore simplifier : une seule puissance de a.',
      correction: '<p>\\(\\left(a^3\\right)^4=a^{3\\times4}=a^{12}\\)</p><p>donc \\(\\dfrac{a^{12}}{a^{10}}=a^{12-10}=a^2\\).</p>'
    }
  ]
};
