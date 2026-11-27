"""Minification du CSS et du JavaScript, sans dépendance (utilisée par tools/build.py).

Le but est d'alléger les fichiers servis sans prendre de risque :
- CSS : commentaires retirés, espaces superflus supprimés (les chaînes entre guillemets restent intactes) ;
- JS : commentaires et indentation retirés, espaces superflus supprimés. Les chaînes, les gabarits
  (`…${…}…`) et les expressions régulières (/…/) sont recopiés tels quels, et un retour à la ligne
  n'est retiré que là où il ne peut pas terminer une instruction.
"""
import re

_CSS_TOKENS = re.compile(r'("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|/\*.*?\*/)', re.S)


def minify_css(src):
    out = []
    for k, piece in enumerate(_CSS_TOKENS.split(src)):
        if k % 2:  # chaîne (gardée) ou commentaire (retiré)
            if not piece.startswith("/*"):
                out.append(piece)
            continue
        piece = re.sub(r"\s+", " ", piece)
        piece = re.sub(r"\s*([{};,>])\s*", r"\1", piece)
        piece = re.sub(r":\s+", ":", piece)
        piece = re.sub(r"\s+!important", "!important", piece)
        out.append(piece)
    css = "".join(out).strip()
    return css.replace(";}", "}") + "\n"


_WORD = re.compile(r"[A-Za-z0-9_$\\\u0080-\uffff]")
# Après ces mots, « / » ouvre une expression régulière (et non une division)
_REGEX_AFTER_WORDS = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
                      "case", "do", "else", "yield", "await"}
# Un retour à la ligne après l'un de ces caractères ne peut pas terminer une instruction
_JOIN_AFTER = set("{([,;=:?&|!<>*%^~")
# … ni avant l'un de ceux-ci
_JOIN_BEFORE = set(")]},;:?")


def _word(c):
    return bool(c) and bool(_WORD.match(c))


def minify_js(src):
    out = []          # morceaux produits
    i, n = 0, len(src)
    braces = 0        # profondeur des accolades { } dans le code
    templates = []    # profondeur des accolades à l'ouverture de chaque ${ … } d'un gabarit
    prev_word = ""    # dernier mot recopié (pour reconnaître « return /…/ »)
    pending = ""      # espace en attente : "", " " ou "\n"

    def last_char():
        for chunk in reversed(out):
            if chunk:
                return chunk[-1]
        return ""

    def emit(text, word=""):
        nonlocal pending, prev_word
        if pending:
            p, q = last_char(), text[0]
            if pending == "\n":
                if p and p not in _JOIN_AFTER and q not in _JOIN_BEFORE:
                    out.append("\n")
                elif _word(p) and _word(q):
                    out.append(" ")
            elif (_word(p) and _word(q)) or (p in "+-" and q == p) or (p == "/" and q in "/*"):
                out.append(" ")
            pending = ""
        out.append(text)
        prev_word = word

    def regex_allowed():
        p = last_char()
        if not p:
            return True
        if _word(p):
            return prev_word in _REGEX_AFTER_WORDS
        return p not in ")]}\"'`"

    while i < n:
        c = src[i]
        if c in " \t\r\n":
            j = i
            while j < n and src[j] in " \t\r\n":
                j += 1
            if out:
                pending = "\n" if ("\n" in src[i:j] or pending == "\n") else (pending or " ")
            i = j
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                raise ValueError("Commentaire /* non fermé")
            if out:
                pending = "\n" if ("\n" in src[i:j] or pending == "\n") else (pending or " ")
            i = j + 2
            continue
        if c in "\"'":
            j = i + 1
            while src[j] != c:
                if src[j] == "\\":
                    j += 1
                elif src[j] == "\n":
                    raise ValueError(f"Chaîne non fermée vers le caractère {i}")
                j += 1
            emit(src[i:j + 1])
            i = j + 1
            continue
        if c == "`" or (c == "}" and templates and templates[-1] == braces):
            if c == "}":
                templates.pop()
            j = i + 1
            while True:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == "`":
                    j += 1
                    break
                if src.startswith("${", j):
                    j += 2
                    templates.append(braces)
                    break
                j += 1
            if c == "}":  # suite d'un gabarit : collée à ce qui précède, sans espace
                pending = ""
            emit(src[i:j])
            i = j
            continue
        if c == "/" and regex_allowed():
            j, in_class = i + 1, False
            while True:
                ch = src[j]
                if ch == "\\":
                    j += 2
                    continue
                if ch == "\n":
                    raise ValueError(f"Expression régulière non fermée vers le caractère {i}")
                if ch == "[":
                    in_class = True
                elif ch == "]":
                    in_class = False
                elif ch == "/" and not in_class:
                    break
                j += 1
            j += 1
            while j < n and _word(src[j]):
                j += 1  # drapeaux (g, i, u…)
            emit(src[i:j])
            i = j
            continue
        if _word(c):
            j = i
            while j < n and _word(src[j]):
                j += 1
            word = src[i:j]
            emit(word, word)
            i = j
            continue
        if c == "{":
            braces += 1
        elif c == "}":
            braces -= 1
        emit(c)
        i += 1
    return "".join(out) + "\n"
