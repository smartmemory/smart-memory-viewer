"""Keep the newest N /var/www/sanctuary.bak-* rollback copies. Runs on the host via `python3 - KEEP`."""
import os
import re
import shutil
import sys

WWW = os.environ.get("SANCTUARY_WWW", "/var/www")
# sanctuary.bak-<sha12>-<YYYYMMDDHHMMSS>-<pid>-<hex8>, as written by deploy-sanctuary.sh
NAME = re.compile(r"^sanctuary\.bak-[0-9a-f]{7,40}-(\d{14})-\d+-[0-9a-f]{8}$")


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit() or int(sys.argv[1]) < 1:
        sys.exit("usage: prune_sanctuary_backups.py KEEP (KEEP >= 1)")
    keep = int(sys.argv[1])
    found = []
    for name in os.listdir(WWW):
        m = NAME.match(name)
        path = os.path.join(WWW, name)
        # Only real directories with our exact naming; anything else is left alone.
        if m and os.path.isdir(path) and not os.path.islink(path):
            found.append((m.group(1), name))
    found.sort()
    for _, name in found[:-keep]:
        shutil.rmtree(os.path.join(WWW, name))
        print(f"pruned {name}")
    print(f"kept {min(len(found), keep)} rollback copies")


if __name__ == "__main__":
    main()
