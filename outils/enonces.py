#!/usr/bin/env python3
"""Énoncés PDF des corrections (M. Colin, 24 nov. 2026) : « un bouton pour avoir que le PDF du sujet ou de l'exercice ».

    MATHANDCO_MDP=… MATHANDCO_MDP_PROF=… python3 outils/enonces.py [motif …]     # tout, ou les pages qui correspondent
    python3 outils/enonces.py --annales <dossier annales/<id>>                     # annales publiques (en clair)

- ÉNONCÉ D'UN EXERCICE : l'image d'énoncé déjà contenue dans la correction (data.ITEMS.file, ou l'image de l'onglet
  Énoncé, data-src de #imgEnonce), mise en page A4 (largeur ≤ 17 cm, découpée entre deux lignes de texte si elle est plus
  haute qu'une page), en-tête « Énoncé · … ». Énoncé écrit en HTML (pages anciennes, ex. Première CH03) : rendu de
  l'élément .enonce par le navigateur (playwright). -> corrections/<page>.enonce.pdf.bin, chiffré avec le mot de passe
  des ÉLÈVES, même quand la correction est fermée (choix de M. Colin : l'énoncé est toujours disponible) — SAUF pour
  les évaluations (DS, interrogations, bac blanc) : énoncé et sujet suivent la correction (fermée -> mot de passe du
  professeur), M. Colin, 24 nov. 2026. `--synchroniser` les rechiffre d'après acces.json.
- SUJET COMPLET (devoirs surveillés, interrogations, devoirs maison, bacs blancs) : les énoncés des exercices du même
  sujet mis bout à bout (ou le sujet original s'il est posé dans colineaire-atelier/docs/sujets/<groupe>.pdf, chemin
  modifiable par COLINEAIRE_SUJETS) -> corrections/<groupe>.sujet.pdf.bin, chiffré avec le mot de passe des élèves.
- Format du .pdf.bin : celui des corrigés (« MCPDF1 », voir construire.py).
Les PDF produits sont aussi gardés en clair dans /tmp/enonces_pdf/ pour contrôle (jamais dans le dépôt).
"""
import base64
import glob
import io
import json
import os
import re
import sys
import tempfile

import img2pdf
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import construire as C  # noqa: E402

DOSSIER = C.DOSSIER
# sujets originaux (énoncés : ils restent dans l'atelier privé, jamais en clair dans ce dépôt public)
SUJETS = os.environ.get('COLINEAIRE_SUJETS') or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'colineaire-atelier', 'docs', 'sujets')
CONTROLE = '/tmp/enonces_pdf'
TYPES = ('exercice', 'dm', 'evaluation')
RX = re.compile(r"const P = \{s:'([^']+)', i:'([^']+)', n:(\d+), c:'([^']+)'\}")
DPI = 200                       # résolution des pages A4 produites
A4 = (int(21 / 2.54 * DPI), int(29.7 / 2.54 * DPI))
MARGE_X, HAUT, BAS = int(2.0 / 2.54 * DPI), int(2.2 / 2.54 * DPI), int(1.6 / 2.54 * DPI)
LARG_MAX = A4[0] - 2 * MARGE_X  # 17 cm
POLICE = None
for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
    if os.path.exists(f):
        POLICE = f


def _police(t):
    return ImageFont.truetype(POLICE, t) if POLICE else ImageFont.load_default()


# ---------------------------------------------------------------------------------------------------- lecture des pages
def donnees(chemin, mdps):
    """page de correction -> (dict {'body', 'data'} ou None, mot de passe qui l'a ouverte) ; page en clair acceptée"""
    page = open(chemin, encoding='utf-8').read()
    m = RX.search(page)
    if not m:
        return None, None
    for mdp in mdps:
        try:
            return C.dechiffrer(page, mdp), mdp
        except Exception:
            pass
    return None, None


def donnees_claires(chemin):
    """page de contrôle (annales, en clair) : const DATA = {...} ou objets SCREENS/ITEMS/IMGS séparés"""
    page = open(chemin, encoding='utf-8').read()
    out = {}
    for k in ('ITEMS', 'IMGS'):
        m = re.search(r'\b' + k + r'\s*=\s*(?=\{)', page)
        if m:
            dec = json.JSONDecoder()
            out[k], _ = dec.raw_decode(page[m.end():])
    return {'body': page, 'data': out}


def image_enonce(d):
    """-> PIL.Image de l'énoncé, ou None (énoncé en HTML)"""
    data, body = d.get('data') or {}, d.get('body') or ''
    imgs = data.get('IMGS') or {}
    cles = []
    it = data.get('ITEMS')
    if isinstance(it, dict) and it.get('file'):
        cles.append(it['file'])
    m = re.search(r'id="imgEnonce"[^>]*data-src="([^"]+)"', body)
    if m:
        cles.append(m.group(1))
    for k in cles:
        v = imgs.get(k)
        if v:
            b64 = v.split(',', 1)[1] if v.startswith('data:') else v
            return Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGB')
    return None


def image_html(chemin, mdp):
    """énoncé écrit en HTML : la page protégée est ouverte dans le navigateur et l'élément .enonce est photographié"""
    import functools
    import http.server
    import threading
    from playwright.sync_api import sync_playwright
    import shutil
    racine = os.path.dirname(os.path.dirname(os.path.abspath(chemin)))       # la page lit ../acces.json : servie en http
    ouvre = mdp
    if mdp != os.environ.get('MATHANDCO_MDP'):     # correction FERMÉE : copie temporaire (hors du dépôt) rechiffrée
        tmp = tempfile.mkdtemp()                    # pour les élèves et déclarée ouverte, comme sur le site une fois ouverte
        os.makedirs(os.path.join(tmp, 'corrections'))
        os.symlink(os.path.join(racine, 'assets'), os.path.join(tmp, 'assets'))
        cible = os.path.join(tmp, 'corrections', os.path.basename(chemin))
        shutil.copy(chemin, cible)
        ouvre = os.environ['MATHANDCO_MDP']
        C.rechiffrer_page(cible, [mdp, ouvre], ouvre)
        json.dump({'ouvertes': sorted(set(C.lire_acces()) | {os.path.basename(chemin)[:-5]})}, open(os.path.join(tmp, 'acces.json'), 'w'))
        racine, chemin = tmp, cible
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(
        type('Muet', (http.server.SimpleHTTPRequestHandler,), {'log_message': lambda *a: None}), directory=racine))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/' + os.path.relpath(os.path.abspath(chemin), racine)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=2.5)
        pg.goto(url)
        pg.fill('#mdp', ouvre)
        pg.click('#ouvrir')
        pg.wait_for_selector('.enonce', timeout=20000)
        pg.wait_for_timeout(800)
        pg.evaluate("""() => {
          const e = document.querySelector('.enonce');
          const w = e.getBoundingClientRect().width;
          e.querySelectorAll('.qn.cur').forEach(q => q.classList.remove('cur'));      // question en cours : pas de cadre
          e.querySelectorAll('.dat').forEach(x => { x.style.background = 'none'; x.style.boxShadow = 'none'; });
          // on ne garde que la chaîne des parents de l'énoncé (les sélecteurs de la page s'appliquent toujours),
          // les feuilles de style et les définitions SVG des formules ; tout le reste est retiré
          for (let a = e; a && a !== document.body; a = a.parentElement) {
            [...a.parentElement.children].forEach(x => {
              if (x === a || x.tagName === 'STYLE' || x.tagName === 'LINK' || x.tagName === 'SCRIPT') return;
              if (x.tagName.toLowerCase() === 'svg' && x.querySelector('defs, symbol')) return;
              x.remove();
            });
            const p = a.parentElement;
            if (p !== document.body) p.style.cssText += ';overflow:visible;max-height:none;height:auto;position:static;transform:none;display:block;margin:0;padding:0';
          }
          const enc = e.parentElement;
          enc.style.cssText += ';width:' + w + 'px;padding:8px;background:#fff;position:static';
          document.body.style.cssText += ';margin:0;background:#fff;overflow:visible';
          document.documentElement.style.overflow = 'visible';
          window.scrollTo(0, 0);
        }""")
        pg.wait_for_timeout(500)
        e = pg.query_selector('.enonce').evaluate_handle('x => x.parentElement').as_element()
        png = e.screenshot()
        b.close()
    srv.shutdown()
    return Image.open(io.BytesIO(png)).convert('RGB')


# ---------------------------------------------------------------------------------------------------------- mise en page
def rogne(im):
    g = im.convert('L')
    bb = Image.eval(g, lambda v: 255 if v < 235 else 0).getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    p = 6
    return im.crop((max(0, x0 - p), max(0, y0 - p), min(im.width, x1 + p), min(im.height, y1 + p)))


def lignes_blanches(im):
    """indices des lignes (presque) blanches de l'image"""
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    pas = max(1, w // 400)
    blanc = []
    for y in range(h):
        if all(px[x, y] > 225 for x in range(0, w, pas)):
            blanc.append(y)
    return set(blanc)


def morceaux(im, hmax):
    """coupe une image trop haute entre deux lignes de texte (dans une bande blanche), jamais au milieu d'une ligne"""
    if im.height <= hmax:
        return [im]
    blanc = lignes_blanches(im)
    out, y = [], 0
    while im.height - y > hmax:
        c = y + hmax
        while c > y + hmax * 0.5 and not (c in blanc and c - 1 in blanc and c - 2 in blanc):
            c -= 1
        if c <= y + hmax * 0.5:
            c = y + hmax
        out.append(im.crop((0, y, im.width, c)))
        y = c
        while y < im.height and y in blanc:
            y += 1
    if y < im.height:
        out.append(im.crop((0, y, im.width, im.height)))
    return out


def largeur_cible(im):
    """largeur à l'impression : 17 cm au plus ; une image étroite (moins de 1 600 px) garde ~250 px par pouce"""
    return min(LARG_MAX, int(im.width / 250 * DPI))


def pages_a4(blocs, entete):
    """blocs : images à poser l'une sous l'autre -> liste de pages A4 (PIL), en-tête et numéro en petit gris"""
    pages, cur, y = [], None, None

    def nouvelle():
        p = Image.new('RGB', A4, 'white')
        d = ImageDraw.Draw(p)
        d.text((MARGE_X, int(0.9 / 2.54 * DPI)), entete, fill=(110, 110, 118), font=_police(int(DPI * 0.11)))
        d.text((A4[0] - MARGE_X, int(0.9 / 2.54 * DPI)), 'Par M.COLIN', fill=(110, 110, 118), font=_police(int(DPI * 0.09)),
               anchor='ra')
        return p
    hutile = A4[1] - HAUT - BAS
    for bloc in blocs:
        bloc = rogne(bloc)
        lw = largeur_cible(bloc)
        im = bloc.resize((lw, max(1, round(bloc.height * lw / bloc.width))), Image.LANCZOS)
        for mo in morceaux(im, hutile):
            if cur is None or y + mo.height > A4[1] - BAS:
                if cur is not None:
                    pages.append(cur)
                cur, y = nouvelle(), HAUT
            cur.paste(mo, (MARGE_X, y))
            y += mo.height + int(0.6 / 2.54 * DPI)
    if cur is not None:
        pages.append(cur)
    n = len(pages)
    for i, p in enumerate(pages):
        ImageDraw.Draw(p).text((A4[0] // 2, A4[1] - int(0.8 / 2.54 * DPI)), f'{i + 1} / {n}', fill=(110, 110, 118),
                               font=_police(int(DPI * 0.09)), anchor='ma')
    return pages


def pdf_de_pages(pages):
    """pages PIL -> octets PDF (PNG 64 couleurs, sans perte visible sur du texte, léger)"""
    flux = []
    for p in pages:
        q = p.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.NONE)
        b = io.BytesIO()
        q.save(b, 'PNG', optimize=True)
        flux.append(b.getvalue())
    mm = img2pdf.mm_to_pt
    return img2pdf.convert(flux, layout_fun=img2pdf.get_layout_fun((mm(210), mm(297))))


def chiffre(octets, mdp, sortie):
    sel, iv = os.urandom(16), os.urandom(12)
    cle = C.PBKDF2HMAC(algorithm=C.hashes.SHA256(), length=32, salt=sel, iterations=C.ITER).derive(mdp.encode())
    with open(sortie, 'wb') as f:
        f.write(b'MCPDF1' + C.ITER.to_bytes(4, 'big') + sel + iv + C.AESGCM(cle).encrypt(iv, octets, None))


# ------------------------------------------------------------------------------------------------------------- libellés
CLASSE_LIB = {'seconde': 'Seconde', 'premiere': 'Première spécialité', 'premiere-specifique': 'Première spécifique',
              'terminale': 'Terminale spécialité'}


def entete_de(info):
    cl = CLASSE_LIB.get(info['classe'], '')
    if info.get('bacblanc'):
        q = 'Automatismes' if not info['numero'] else f"Exercice {info['numero']}"
        return f"Énoncé · {cl} · Bac blanc {info['bacblanc']} · {q}"
    ch = f"Chapitre {info['chapitre']}" if info.get('chapitre') else ''
    return ' · '.join(x for x in ('Énoncé', cl, ch, f"Exercice {info['numero']}") if x)


groupe_de = C.groupe_de


# --------------------------------------------------------------------------------------------------------------- travail
def traiter(motifs, mdp, mdp_prof):
    import fnmatch
    os.makedirs(CONTROLE, exist_ok=True)
    faits, manque, groupes = 0, [], {}
    for chemin in sorted(glob.glob(os.path.join(DOSSIER, '*.html'))):
        f = os.path.basename(chemin)
        if motifs and not any(fnmatch.fnmatch(f[:-5], m[:-5] if m.endswith('.html') else m) for m in motifs):
            continue
        page = open(chemin, encoding='utf-8').read()
        try:
            info = C.analyser_nom(C.lire_titre(page))
        except BaseException:
            continue
        if info['type'] not in TYPES:
            continue
        d, m = donnees(chemin, [mdp, mdp_prof])
        if d is None:
            manque.append((f, 'illisible'))
            continue
        im = image_enonce(d)
        if im is None and '<div class="enonce">' in d.get('body', ''):
            try:
                im = image_html(chemin, m)
            except Exception as e:  # noqa: BLE001
                manque.append((f, 'rendu HTML : ' + str(e)[:80]))
                continue
        if im is None:
            manque.append((f, "pas d'énoncé trouvé"))
            continue
        octets = pdf_de_pages(pages_a4([im], entete_de(info)))
        open(os.path.join(CONTROLE, f[:-5] + '.enonce.pdf'), 'wb').write(octets)
        chiffre(octets, vers_enonce(f, info, mdp, mdp_prof), os.path.join(DOSSIER, f[:-5] + '.enonce.pdf.bin'))
        faits += 1
        g = groupe_de(f)
        if g:
            groupes.setdefault(g, []).append((info['numero'], im, info))
    for g, lot in sorted(groupes.items()):
        ecrire_sujet(g, lot, mdp, motifs, mdp_prof)
    print(f'énoncés : {faits} PDF ; sujets complets : {len(groupes)}')
    for f, pourquoi in manque:
        print('  sans énoncé :', f, '—', pourquoi)
    return faits, manque


def vers_enonce(fichier, info, mdp, mdp_prof):
    """évaluations (DS, interrogations, bac blanc) : l'énoncé suit la correction — chiffré avec le mot de passe du
    professeur tant qu'elle est fermée (M. Colin, 24 nov. 2026 : « pour les DS ne laisse pas ça possible ») ; les autres
    énoncés (exercices, DM) sont toujours chiffrés avec celui des élèves"""
    if info['type'] != 'evaluation':
        return mdp
    return mdp if fichier[:-5] in set(C.lire_acces()) else mdp_prof


def vers_sujet(g, mdp, mdp_prof):
    """sujet complet d'une évaluation : lisible par les élèves dès qu'un exercice du sujet est ouvert"""
    membres = [os.path.basename(c)[:-5] for c in glob.glob(os.path.join(DOSSIER, g + '-*.html'))
               if C.groupe_de(os.path.basename(c)) == g]
    if not re.search(r'-(ds\d*|interro|interrogation-flash|bac-blanc)', g):
        return mdp
    return mdp if set(membres) & set(C.lire_acces()) else mdp_prof


def synchroniser(mdp, mdp_prof):
    """rechiffre énoncés et sujets des évaluations selon acces.json (sans les refaire)"""
    n = 0
    for b in sorted(glob.glob(os.path.join(DOSSIER, '*.enonce.pdf.bin'))):
        f = os.path.basename(b)[:-len('.enonce.pdf.bin')] + '.html'
        if not os.path.exists(os.path.join(DOSSIER, f)):
            continue
        info = C.analyser_nom(C.lire_titre(open(os.path.join(DOSSIER, f), encoding='utf-8').read()))
        n += bool(C.rechiffrer_pdf(b, [mdp, mdp_prof], vers_enonce(f, info, mdp, mdp_prof)))
    for b in sorted(glob.glob(os.path.join(DOSSIER, '*.sujet.pdf.bin'))):
        g = os.path.basename(b)[:-len('.sujet.pdf.bin')]
        n += bool(C.rechiffrer_pdf(b, [mdp, mdp_prof], vers_sujet(g, mdp, mdp_prof)))
    return n


def ecrire_sujet(g, lot, mdp, motifs=None, mdp_prof=None):
    """sujet complet : l'original posé dans outils/sujets/<groupe>.pdf, sinon les énoncés bout à bout ; quand seuls
    quelques exercices ont été refaits (motifs), les autres énoncés du sujet sont relus dans les pages"""
    orig = os.path.join(SUJETS, g + '.pdf')     # original distribué aux élèves (atelier)
    if os.path.exists(orig):
        octets = open(orig, 'rb').read()
    else:
        nums = {n for n, _, _ in lot}
        for chemin in sorted(glob.glob(os.path.join(DOSSIER, g + '-*.html'))):
            f = os.path.basename(chemin)
            if groupe_de(f) != g:
                continue
            info = C.analyser_nom(C.lire_titre(open(chemin, encoding='utf-8').read()))
            if info['numero'] in nums:
                continue
            d, _ = donnees(chemin, [mdp, os.environ.get('MATHANDCO_MDP_PROF', '')])
            im = image_enonce(d) if d else None
            if im is not None:
                lot.append((info['numero'], im, info))
        lot.sort(key=lambda x: x[0])
        info = lot[0][2]
        tete = entete_de(info).replace('Énoncé', 'Sujet', 1)
        tete = re.sub(r' · (Exercice \d+|Automatismes)$', '', tete)
        octets = pdf_de_pages(pages_a4([im for _, im, _ in lot], tete))
    open(os.path.join(CONTROLE, g + '.sujet.pdf'), 'wb').write(octets)
    chiffre(octets, vers_sujet(g, mdp, mdp_prof or mdp), os.path.join(DOSSIER, g + '.sujet.pdf.bin'))


# --------------------------------------------------------------------------------------------------- annales (publiques)
def annales(dossier):
    """annales/<id>/exercice-N.html (en clair) -> exercice-N-enonce.pdf et sujet.pdf (publics, sans chiffrement)"""
    ims = []
    for chemin in sorted(glob.glob(os.path.join(dossier, 'exercice-*.html')), key=lambda c: int(re.search(r'(\d+)\.html$', c).group(1))):
        n = int(re.search(r'(\d+)\.html$', chemin).group(1))
        im = image_enonce(donnees_claires(chemin))
        if im is None:
            print('  sans énoncé :', chemin)
            continue
        sid = os.path.basename(os.path.normpath(dossier))
        tete = f'Énoncé · Bac {sid[:4]} · {sid[5:].replace("_", " · ")} · Exercice {n}'
        open(os.path.join(dossier, f'exercice-{n}-enonce.pdf'), 'wb').write(pdf_de_pages(pages_a4([im], tete)))
        ims.append(im)
    if ims:
        sid = os.path.basename(os.path.normpath(dossier))
        open(os.path.join(dossier, 'sujet.pdf'), 'wb').write(
            pdf_de_pages(pages_a4(ims, f'Sujet · Bac {sid[:4]} · {sid[5:].replace("_", " · ")}')))
    return len(ims)


if __name__ == '__main__':
    if '--annales' in sys.argv:
        for d in sys.argv[sys.argv.index('--annales') + 1:]:
            print(d, annales(d), 'énoncés')
        sys.exit(0)
    mdp, mdp_prof = os.environ.get('MATHANDCO_MDP'), os.environ.get('MATHANDCO_MDP_PROF')
    if not mdp or not mdp_prof:
        raise SystemExit('Donner les deux mots de passe : MATHANDCO_MDP=… MATHANDCO_MDP_PROF=… python3 outils/enonces.py')
    if sys.argv[1:2] == ['--synchroniser']:
        print(synchroniser(mdp, mdp_prof), 'fichiers rechiffrés')
        sys.exit(0)
    traiter(sys.argv[1:], mdp, mdp_prof)
