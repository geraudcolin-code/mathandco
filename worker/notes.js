// Résultats des QUIZ NOTÉS (M. Colin, 15 nov. 2026). Les pages du site restent servies telles quelles (fichiers
// statiques) ; ce Worker ne répond qu'à /api/quiz-notes :
//   POST {quiz, epk, iv, ct}  → range un résultat CHIFFRÉ par la page de l'élève (clé publique du professeur) ;
//   GET  ?quiz=…              → rend les résultats chiffrés : seule la page notes.html, avec le mot de passe du
//                               professeur, sait les déchiffrer (pseudo, note, détail ne sont jamais lisibles ici).
const TABLE = `CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz TEXT NOT NULL,
  recu TEXT NOT NULL, paquet TEXT NOT NULL)`;
const QUIZ = /^[a-z0-9-]{3,60}$/;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/api/quiz-notes') return new Response('Page introuvable', { status: 404 });
    await env.DB.prepare(TABLE).run();
    if (req.method === 'POST') {
      const t = await req.text();
      // rapport détaillé (17 nov. 2026) : énoncés, réponses et bonnes réponses dans le paquet. Mesuré sur le pire tirage de
      // 1ère CH03 (les 20 questions les plus longues) : ~10 000 caractères compressé (11 200 avec des réponses de 300
      // caractères), ~45 000 sans compression (vieux navigateurs) ; quiz.js n'envoie jamais plus de 60 000 (limite de
      // sendBeacon : 64 Kio ; rapport allégé au-delà). Limite à 90 000 : marge, et sous les 100 Ko d'une requête D1 (une ligne D1 : 2 Mo)
      if (t.length > 90000) return json({ erreur: 'trop long' }, 413);
      let o; try { o = JSON.parse(t); } catch (e) { return json({ erreur: 'illisible' }, 400); }
      if (!o || !QUIZ.test(o.quiz || '') || typeof o.ct !== 'string' || typeof o.iv !== 'string' || !o.epk || typeof o.epk.x !== 'string')
        return json({ erreur: 'incomplet' }, 400);
      const paquet = JSON.stringify({ epk: { x: o.epk.x, y: String(o.epk.y) }, iv: o.iv, ct: o.ct });
      await env.DB.prepare('INSERT INTO notes (quiz, recu, paquet) VALUES (?, ?, ?)').bind(o.quiz, new Date().toISOString(), paquet).run();
      return json({ ok: true });
    }
    if (req.method === 'GET') {
      const quiz = url.searchParams.get('quiz') || '';
      if (!QUIZ.test(quiz)) return json({ erreur: 'quiz ?' }, 400);
      const r = await env.DB.prepare('SELECT id, recu, paquet FROM notes WHERE quiz = ? ORDER BY id').bind(quiz).all();
      return json(r.results.map(x => ({ id: x.id, recu: x.recu, paquet: JSON.parse(x.paquet) })));
    }
    return json({ erreur: 'méthode' }, 405);
  }
};
