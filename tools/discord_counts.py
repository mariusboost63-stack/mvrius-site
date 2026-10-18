#!/usr/bin/env python3
"""Relève le nombre de membres (et de membres en ligne) des communautés de la section Projets.

Lancé toutes les heures par GitHub Actions (.github/workflows/discord-counts.yml). Le résultat,
discord.json, est publié sur la branche « data » du dépôt : le site s'en sert quand Discord ne
répond pas depuis le navigateur du visiteur (limite d'appels, bloqueur de publicité, VPN…).

Usage : python3 tools/discord_counts.py <fichier de sortie> [relevé précédent]
Les invitations sont lues dans index.html (attributs data-invite). Si un serveur ne répond pas,
sa valeur du relevé précédent est conservée.
"""
import datetime
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = os.environ.get("DISCORD_API", "https://discord.com/api/v10")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; mvriuus.fr-counts/1.0; +https://mvriuus.fr)", "Accept": "application/json"}


def invite_codes():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    return list(dict.fromkeys(re.findall(r'data-invite="([^"]+)"', html)))


def fetch(code):
    url = f"{API}/invites/{code}?with_counts=true"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=15) as res:
                data = json.load(res)
            return {"members": data["approximate_member_count"], "online": data.get("approximate_presence_count", 0)}
        except urllib.error.HTTPError as err:
            if err.code == 429 and attempt < 2:
                try:
                    retry = float(json.load(err).get("retry_after", 2))
                except (ValueError, AttributeError):
                    retry = 2
                time.sleep(min(retry, 30) + .5)
                continue
            raise
    raise RuntimeError("trop de tentatives")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = pathlib.Path(sys.argv[1])
    previous = {}
    if len(sys.argv) > 2 and pathlib.Path(sys.argv[2]).exists():
        try:
            previous = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")).get("servers", {})
        except (ValueError, AttributeError):
            previous = {}

    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
    servers, failed = {}, []
    for code in invite_codes():
        try:
            servers[code] = {**fetch(code), "checked": now}
            print(f"{code} : {servers[code]['members']} membres, {servers[code]['online']} en ligne")
        except Exception as err:  # serveur injoignable : on garde la valeur précédente
            failed.append(code)
            if code in previous:
                servers[code] = previous[code]
            print(f"{code} : échec ({err})", file=sys.stderr)
        time.sleep(1)  # Discord limite les appels rapprochés

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"updated": now, "servers": servers}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(servers) - len([c for c in failed if c in servers])} serveur(s) relevé(s), {len(failed)} échec(s)")
    if failed and not any(code not in failed for code in servers):
        sys.exit("Aucun serveur n'a répondu")


if __name__ == "__main__":
    main()
