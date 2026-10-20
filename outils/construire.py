#!/usr/bin/env python3
"""Site Colinéaire : ajout des corrections HTML et reconstruction du catalogue de l'espace élèves.

Usage
  python3 outils/construire.py ajouter <page.html|corrige.pdf> [...]   ajoute (ou remplace) des corrections et leurs PDF
  python3 outils/construire.py catalogue                                reconstruit seulement le catalogue
  python3 outils/construire.py ouvrir <motif> [...]                     ouvre des corrections aux élèves (acces.json)
  python3 outils/construire.py fermer <motif> [...]                     les referme
     motif : nom de fichier sans .html, éventuellement avec * (ex. 1ere-ch03-exercice-5, 2nde-ch03-*)

Le mot de passe des corrections n'est JAMAIS écrit dans le dépôt (il est public) : il est lu dans la variable
d'environnement MATHANDCO_MDP, sinon demandé au clavier.

Ce que fait le script
- « ajouter » : lit le <title> de la page ([1ère]CH03_Correction_Exercice5…), en déduit l'adresse
  corrections/1ere-ch03-exercice-5.html, ajoute à la fin de la page le petit script assets/deverrou.js
  (ouverture automatique quand l'élève a déjà saisi le mot de passe dans l'espace élèves), puis reconstruit.
  CORRIGÉ PDF (18 octobre) : un fichier .pdf nommé comme la correction ([1ère]CH03_Correction_Exercice5.pdf, donné
  sur la ligne de commande, ou posé à côté de la page .html) est CHIFFRÉ avec le mot de passe (le dépôt est public :
  un PDF en clair serait lisible par tous) dans corrections/1ere-ch03-exercice-5.pdf.bin ; l'espace élèves et la
  correction elle-même proposent alors « Corrigé PDF », déchiffré dans le navigateur au téléchargement.
  Format du .pdf.bin : « MCPDF1 » (6 octets), nombre d'itérations PBKDF2 (4 octets, gros-boutiste), sel (16),
  IV (12), puis le PDF chiffré (AES-256-GCM).
- ACCÈS (18 octobre) : acces.json, à la racine, liste les corrections OUVERTES aux élèves ({"ouvertes": [noms de
  fichiers sans .html]}). Une correction absente de la liste est grisée dans l'espace élèves et sa page refuse de
  s'ouvrir ; une correction AJOUTÉE arrive donc FERMÉE. M. Colin ouvre / ferme depuis admin.html (Espace professeur :
  enregistrement par l'API GitHub avec sa clé personnelle) ; Claude peut aussi le faire avec « ouvrir » / « fermer ».
- « catalogue » : déchiffre chaque correction avec le mot de passe pour lire son titre (« Exercice 7 Sens de
  variation »), range tout par classe puis chapitre, chiffre ce catalogue (AES-256-GCM, même procédé que les
  corrections) dans assets/catalogue.js et met à jour les cartes « classes » de la page d'accueil.
"""
import base64
import getpass
import html as H
import json
import os
import re
import sys
import unicodedata
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER = os.path.join(RACINE, 'corrections')
ITER = 600_000
BALISE = '<script src="../assets/deverrou.js?v=2" data-mathandco></script>'

# Classes, dans l'ordre d'affichage : préfixe du nom de fichier -> (identifiant, nom affiché)
CLASSES = {
    '2nd': ('seconde', 'Seconde'),
    '1ère': ('premiere', 'Première spécialité'),
    '1èreNonSpe': ('premiere-ms', 'Première, mathématiques spécifiques'),
    'TERM': ('terminale', 'Terminale spécialité'),
}
ORDRE = ['seconde', 'premiere', 'premiere-ms', 'terminale']
SLUG_CLASSE = {'seconde': '2nde', 'premiere': '1ere', 'premiere-ms': '1ere-ms', 'terminale': 'term'}

# Titres des chapitres (à compléter au fil de l'année ; sinon le titre est lu dans la page)
CHAPITRES = {
    ('seconde', 1): 'Nombres et calcul',
    ('seconde', 2): 'Vecteurs',
    ('seconde', 3): 'Calcul littéral, équations et inéquations',
    ('premiere', 1): 'Second degré',
    ('premiere', 2): 'Suites numériques',
    ('premiere', 3): 'Probabilités conditionnelles et indépendance',
    ('premiere', 4): 'Dérivation locale',
    ('terminale', 1): 'Suites et récurrence',
    ('terminale', 2): 'Limites de suites',
}


def mot_de_passe():
    m = os.environ.get('MATHANDCO_MDP')
    return m if m else getpass.getpass('Mot de passe des corrections : ')


def sans_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def analyser_nom(titre):
    """[1ère]CH03_Correction_Exercice5 -> dict(classe, chapitre, type, numero, nom_fichier)."""
    m = re.match(r'\[([^\]]+)\]\s*CH(\d+)_(.+)$', titre.strip())
    if not m or m.group(1) not in CLASSES:
        raise SystemExit(f'Nom non reconnu : « {titre} » (attendu : [CLASSE]CHxx_…)')
    cle, chap, reste = m.group(1), int(m.group(2)), m.group(3)
    cid = CLASSES[cle][0]
    base = f'{SLUG_CLASSE[cid]}-ch{chap:02d}'
    e = re.search(r'Exercice(\d+)$', reste)
    if reste.startswith('PolyATrou'):
        t, n, slug = 'poly', 0, f'{base}-poly-a-trous'
    elif reste.startswith('QuestionsFlash'):
        sujet = reste.split('_', 1)[1] if '_' in reste else ''
        t, n = 'flash', 0
        slug = f'{base}-questions-flash' + ('-' + re.sub(r'(?<!^)(?=[A-Z])', '-', sujet).lower() if sujet else '')
    elif e:
        t, n = 'exercice', int(e.group(1))
        prefixe = reste[: e.start()].replace('Correction_', '').strip('_')
        slug = f'{base}-' + (sans_accents(prefixe).lower().replace('_', '-') + '-' if prefixe else '') + f'exercice-{n}'
        if prefixe:
            t = 'evaluation'
    else:
        t, n, slug = 'autre', 0, f'{base}-' + sans_accents(reste).lower().replace('_', '-')
    return dict(classe=cid, chapitre=chap, type=t, numero=n, fichier=slug + '.html', nom=titre.strip())


def lire_titre(page):
    m = re.search(r'<title>(.*?)</title>', page, re.S)
    return H.unescape(m.group(1)).strip() if m else ''


def dechiffrer(page, mdp):
    m = re.search(r"const P = \{s:'([^']+)', i:'([^']+)', n:(\d+), c:'([^']+)'\}", page)
    if not m:
        return None
    s, i, n, c = m.groups()
    cle = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=base64.b64decode(s), iterations=int(n)).derive(mdp.encode())
    return json.loads(AESGCM(cle).decrypt(base64.b64decode(i), base64.b64decode(c), None))


def texte(fragment):
    if 'katex' in fragment or '<svg' in fragment or '<math' in fragment:
        return ''
    return re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


def infos_page(page, mdp, nom):
    """Titre et consigne lus dans la correction déchiffrée ; repli sur le sous-titre en clair."""
    sous = re.search(r'class="sous">([^<]*)<', page)
    sous = H.unescape(sous.group(1)).strip() if sous else ''
    titre, consigne = '', ''
    try:
        d = dechiffrer(page, mdp)
    except Exception:
        raise SystemExit(f'Mot de passe refusé pour « {nom} ».')
    if d:
        b = d['body']
        m = re.search(r'<div class="ex">(.*?)</div>', b, re.S)
        if m:
            span = re.search(r'<span[^>]*>(.*?)</span>', m.group(1), re.S)
            titre = texte(span.group(1)) if span else ''
            if not titre:
                titre = texte(re.sub(r'^\s*(Exercice\s*\d+|Questions flash)\s*', '', texte(m.group(1))))
        c = re.search(r'<div class="cons">(.*?)</div>', b, re.S)
        consigne = texte(c.group(1)) if c else ''
        if consigne.startswith(('1ère spécialité', 'Seconde', 'Première', 'Terminale')):
            consigne = ''
    if not titre:
        p = re.search(r'\(([^)]+)\)\s*$', sous)
        titre = p.group(1)[:1].upper() + p.group(1)[1:] if p else ''
    return titre, consigne, sous


def chapitre_depuis_sous(sous):
    m = re.search(r'chapitre\s*\d+\s*:\s*([^—]+)', sous)
    if not m:
        return ''
    t = m.group(1).strip()
    t = re.sub(r'\s*—.*$', '', t)
    return t[:1].upper() + t[1:]


def chiffrer_pdf(chemin, nom, mdp):
    """corrigé PDF chiffré -> corrections/<adresse>.pdf.bin (voir le format en tête du fichier)"""
    info = analyser_nom(nom)
    sel, iv = os.urandom(16), os.urandom(12)
    cle = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sel, iterations=ITER).derive(mdp.encode())
    donnees = open(chemin, 'rb').read()
    if not donnees.startswith(b'%PDF'):
        raise SystemExit(f'« {chemin} » n\'est pas un PDF.')
    sortie = info['fichier'][:-5] + '.pdf.bin'
    with open(os.path.join(DOSSIER, sortie), 'wb') as f:
        f.write(b'MCPDF1' + ITER.to_bytes(4, 'big') + sel + iv + AESGCM(cle).encrypt(iv, donnees, None))
    print('PDF chiffré :', os.path.basename(chemin), '->', 'corrections/' + sortie)


def ajouter(chemins, mdp):
    os.makedirs(DOSSIER, exist_ok=True)
    pdfs = [c for c in chemins if c.lower().endswith('.pdf')]
    for ch in pdfs:
        chiffrer_pdf(ch, os.path.splitext(os.path.basename(ch))[0], mdp)
    for ch in chemins:
        if ch in pdfs:
            continue
        page = open(ch, encoding='utf-8').read()
        titre = lire_titre(page)
        info = analyser_nom(titre)
        if 'data-mathandco' not in page:
            i = page.rfind('</body>')
            page = page[:i] + BALISE + page[i:] if i >= 0 else page + BALISE
        open(os.path.join(DOSSIER, info['fichier']), 'w', encoding='utf-8').write(page)
        print('ajouté :', titre, '->', 'corrections/' + info['fichier'])
        voisin = os.path.splitext(ch)[0] + '.pdf'               # corrigé PDF posé à côté de la page, de même nom
        if os.path.exists(voisin) and voisin not in pdfs and os.path.splitext(os.path.basename(voisin))[0] == titre:
            chiffrer_pdf(voisin, titre, mdp)


def chiffrer(obj, mdp):
    sel, iv = os.urandom(16), os.urandom(12)
    cle = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sel, iterations=ITER).derive(mdp.encode())
    c = AESGCM(cle).encrypt(iv, json.dumps(obj, ensure_ascii=False).encode(), None)
    b = lambda x: base64.b64encode(x).decode()
    return {'s': b(sel), 'i': b(iv), 'n': ITER, 'c': b(c)}


def catalogue(mdp):
    entrees = []
    for f in sorted(os.listdir(DOSSIER)):
        if not f.endswith('.html'):
            continue
        page = open(os.path.join(DOSSIER, f), encoding='utf-8').read()
        nom = lire_titre(page)
        info = analyser_nom(nom)
        titre, consigne, sous = infos_page(page, mdp, nom)
        info.update(titre=titre, consigne=consigne, sous=sous, fichier=f)
        entrees.append(info)
        print(f'  {nom:52s} {titre}')

    classes = []
    for cid in ORDRE:
        items = [e for e in entrees if e['classe'] == cid]
        if not items:
            continue
        nom_classe = next(v[1] for v in CLASSES.values() if v[0] == cid)
        chaps = []
        for num in sorted({e['chapitre'] for e in items}):
            lot = [e for e in items if e['chapitre'] == num]
            rang = {'poly': 0, 'exercice': 1, 'evaluation': 2, 'flash': 3, 'autre': 4}
            lot.sort(key=lambda e: (rang[e['type']], e['numero'], e['fichier']))
            titre_ch = CHAPITRES.get((cid, num)) or next((chapitre_depuis_sous(e['sous']) for e in lot if chapitre_depuis_sous(e['sous'])), '')
            chaps.append({'numero': num, 'titre': titre_ch, 'items': [
                dict({'type': e['type'], 'numero': e['numero'], 'titre': e['titre'], 'consigne': e['consigne'],
                      'href': 'corrections/' + e['fichier'], 'nom': e['nom']},
                     **({'pdf': 'corrections/' + e['fichier'][:-5] + '.pdf.bin', 'pdfnom': e['nom'] + '.pdf'}
                        if os.path.exists(os.path.join(DOSSIER, e['fichier'][:-5] + '.pdf.bin')) else {}))
                for e in lot]})
        classes.append({'id': cid, 'nom': nom_classe, 'chapitres': chaps})

    js = '/* Catalogue chiffré de l\'espace élèves (généré par outils/construire.py, ne pas modifier). */\n'
    js += 'window.CATALOGUE = ' + json.dumps(chiffrer({'classes': classes}, mdp)) + ';\n'
    open(os.path.join(RACINE, 'assets', 'catalogue.js'), 'w', encoding='utf-8').write(js)
    # l'espace élèves charge « catalogue.js?v=… » : la version change avec le catalogue (pas d'ancien catalogue en cache)
    import hashlib
    ev = os.path.join(RACINE, 'eleves.html')
    for ev in (os.path.join(RACINE, 'eleves.html'), os.path.join(RACINE, 'admin.html')):
        if not os.path.exists(ev):
            continue
        pe = open(ev, encoding='utf-8').read()
        pe = re.sub(r'assets/catalogue\.js(\?v=[\w]*)?"', 'assets/catalogue.js?v=' + hashlib.sha1(js.encode()).hexdigest()[:10] + '"', pe)
        open(ev, 'w', encoding='utf-8').write(pe)
    if not os.path.exists(FICHIER_ACCES):
        ecrire_acces([])

    # cartes « classes » de la page d'accueil (titres des chapitres et nombre de corrections, en clair)
    cartes = []
    for c in classes:
        n = sum(len(ch['items']) for ch in c['chapitres'])
        lignes = ''.join(f'<li><span class="ch-num">Chapitre {ch["numero"]}</span> {H.escape(ch["titre"])}</li>' for ch in c['chapitres'])
        cartes.append(
            f'<a class="classe" href="eleves.html#{c["id"]}">\n'
            f'  <h3>{H.escape(c["nom"])}</h3>\n'
            f'  <p class="classe-total">{n} corrections animées</p>\n'
            f'  <ul>{lignes}</ul>\n'
            f'  <span class="classe-lien">Ouvrir les corrections</span>\n</a>')
    acc = os.path.join(RACINE, 'index.html')
    page = open(acc, encoding='utf-8').read()
    page = re.sub(r'(<!-- debut:classes -->).*?(<!-- fin:classes -->)',
                  lambda m: m.group(1) + '\n' + '\n'.join(cartes) + '\n' + m.group(2), page, flags=re.S)
    total = sum(len(ch['items']) for c in classes for ch in c['chapitres'])
    page = re.sub(r'(<!-- debut:total -->).*?(<!-- fin:total -->)', lambda m: m.group(1) + str(total) + m.group(2), page, flags=re.S)
    open(acc, 'w', encoding='utf-8').write(page)
    npdf = sum(1 for c in classes for ch in c['chapitres'] for it in ch['items'] if 'pdf' in it)
    print(f'catalogue : {total} pages ({npdf} avec leur corrigé PDF), {len(classes)} classes')


FICHIER_ACCES = os.path.join(RACINE, 'acces.json')


def lire_acces():
    if not os.path.exists(FICHIER_ACCES):
        return []
    return json.load(open(FICHIER_ACCES, encoding='utf-8')).get('ouvertes', [])


def ecrire_acces(ouvertes):
    import datetime
    d = {'maj': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'ouvertes': sorted(set(ouvertes))}
    open(FICHIER_ACCES, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')


def basculer(motifs, ouvrir_):
    import fnmatch
    noms = sorted(f[:-5] for f in os.listdir(DOSSIER) if f.endswith('.html'))
    ens = set(lire_acces())
    for m in motifs:
        m = m[:-5] if m.endswith('.html') else m
        vus = [n for n in noms if fnmatch.fnmatch(n, m)]
        if not vus:
            raise SystemExit(f'Aucune correction ne correspond à « {m} ».')
        for n in vus:
            (ens.add if ouvrir_ else ens.discard)(n)
            print(('ouverte : ' if ouvrir_ else 'fermée : ') + n)
    ecrire_acces(ens)


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in ('ajouter', 'catalogue', 'ouvrir', 'fermer'):
        print(__doc__)
        sys.exit(1)
    if sys.argv[1] in ('ouvrir', 'fermer'):
        basculer(sys.argv[2:], sys.argv[1] == 'ouvrir')
        sys.exit(0)
    mdp = mot_de_passe()
    if sys.argv[1] == 'ajouter':
        ajouter(sys.argv[2:], mdp)
    catalogue(mdp)
