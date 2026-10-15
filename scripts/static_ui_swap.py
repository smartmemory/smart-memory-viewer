#!/usr/bin/env python3
# Vendored from smart-memory-infra@2d7dcd2fa42988d6e747fb5ed92b82e80eae80e6:
# scripts/static-ui/static_ui_swap.py. Keep recovery semantics aligned with that source.
"""Host side of deploy_static_ui.sh (review r1 F3/F7, r2 N1/N9). Stdlib only. Runs as root on the host:
  ssh host python3 - swap APP RUN TAG ASSET INDEX_SHA256 < static_ui_swap.py
  ssh host python3 - cleanup APP RUN < static_ui_swap.py
The staged tree is /var/www/.stage-APP-RUN (unique per run, uploaded by rsync). swap takes a per-app lock, re-verifies
the stage, records a durable state file (.static-deploy-APP.state: the inode identity of the new and old trees), then
atomically EXCHANGES stage and live (renameat2 RENAME_EXCHANGE on Linux, renameatx_np RENAME_SWAP on macOS), so
/var/www/APP is never missing. The old tree then sits at the stage path and is renamed to APP.bak-TAG (rollback).

Recovery is by identity, never by content (N9): any failure after the exchange (raised exception, signal, failed
postcheck, failed backup rename) exchanges back only if the live dir IS the new tree (same st_dev/st_ino), and only
the directory whose identity is the new tree is ever deleted. A crash leaves the state file; the next swap or
cleanup for that app runs recover() under the lock first:
  live=new, bak=old   -> finished, clear state
  live=new, stage=old -> exchange back (roll back), remove the new tree, clear state
  live=old            -> remove the stage if it is the new tree, clear state
  anything else       -> refuse; manual recovery required (state kept, paths printed)
cleanup removes .stage-APP-RUN when no exchange is recorded (it was never live), whatever its content (partial uploads).

Env (tests only): STATIC_WWW overrides /var/www; STATIC_TEST_FAIL_POSTCHECK=1; STATIC_TEST_RAISE_AT=postcheck|backup|
restore; STATIC_TEST_KILL_AT=exchanged (hard exit right after the exchange, leaving state for recovery).
"""
import ctypes, ctypes.util, errno, fcntl, hashlib, json, os, re, shutil, signal, stat, sys, time

WWW = os.environ.get("STATIC_WWW", "/var/www")
SAFE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
SAFE_ASSET = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._/-]*$")


class Fail(Exception):
    pass


def die(msg, code=1):
    print("FAIL: " + msg, file=sys.stderr)
    sys.exit(code)


def exchange(a, b):
    """Atomically exchange two paths. Raises OSError on failure (never exits: callers must be able to restore)."""
    if os.environ.get("STATIC_TEST_RAISE_AT") == "restore" and os.environ.get("_STATIC_RESTORING") == "1":
        raise OSError(errno.EIO, "injected restore failure (test)")
    libc = ctypes.CDLL(ctypes.util.find_library("c") or None, use_errno=True)
    at = ctypes.c_int(-2 if sys.platform == "darwin" else -100)  # AT_FDCWD
    fn = getattr(libc, "renameatx_np" if sys.platform == "darwin" else "renameat2", None)
    if fn is None:
        raise OSError(errno.ENOSYS, "no atomic exchange syscall available")
    if fn(at, a.encode(), at, b.encode(), ctypes.c_uint(2)) != 0:  # RENAME_EXCHANGE / RENAME_SWAP == 2
        e = ctypes.get_errno()
        raise OSError(e, f"exchange {a} <-> {b} failed: {errno.errorcode.get(e, e)}")


def ident(path):
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        return None
    if not stat.S_ISDIR(st.st_mode):
        return ["not-a-dir", st.st_ino]
    return [st.st_dev, st.st_ino]


def sha(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def fsync_dir():
    fd = os.open(".", os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def state_path(app):
    return f".static-deploy-{app}.state"


def write_state(app, st):
    tmp = state_path(app) + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.write(fd, json.dumps(st).encode())
        os.fsync(fd)
    finally:
        os.close(fd)
    os.rename(tmp, state_path(app))
    fsync_dir()


def read_state(app):
    p = state_path(app)
    if not os.path.lexists(p):
        return None
    if os.path.islink(p):
        die(f"{WWW}/{p} is a symlink; manual recovery required")
    with open(p) as fh:
        return json.load(fh)


def clear_state(app):
    if os.path.lexists(state_path(app)):
        os.unlink(state_path(app))
        fsync_dir()


def rm_if(path, want):
    """Remove path only if it is the directory with identity `want` (never by content)."""
    if want is not None and ident(path) == want:
        shutil.rmtree(path)
        return True
    return False


def manual(st, why):
    die(f"{why}; manual recovery required. state={WWW}/{state_path(st['app'])} live={WWW}/{st['live']} "
        f"stage={WWW}/{st['stage']} bak={WWW}/{st['bak']} (old tree identity {st['old']}, new {st['new']})")


def recover(app):
    st = read_state(app)
    if st is None:
        return
    new, old = st["new"], st["old"]
    live, stage, bak = st["live"], st["stage"], st["bak"]
    li, si, bi = ident(live), ident(stage), ident(bak)
    if li == new and bi == old:
        clear_state(app)
        print(f"recover: previous swap of {app} had completed (rollback={WWW}/{bak})")
    elif li == new and si == old:
        try:
            exchange(stage, live)
        except OSError as e:
            manual(st, f"recover: exchange back failed ({e})")
        rm_if(stage, new)
        clear_state(app)
        print(f"recover: rolled {app} back to the previous tree")
    elif li == old:
        rm_if(stage, new)
        clear_state(app)
        print(f"recover: {app} live is the previous tree; leftover new tree removed")
    else:
        manual(st, "recover: unexpected layout")


def lock(app, wait):
    fd = os.open(f".static-deploy-{app}.lock", os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    end = time.monotonic() + wait
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except OSError:
            if time.monotonic() >= end:
                die("another deploy holds the lock for " + app)
            time.sleep(0.5)


def on_signal(signum, frame):
    raise SystemExit(128 + signum)


def swap(app, run, tag, asset, isha):
    stage, live, bak = f".stage-{app}-{run}", app, f"{app}.bak-{tag}"
    recover(app)
    if not os.path.isdir(live) or os.path.islink(live):
        die(f"{WWW}/{live} is not a real directory")
    if os.path.lexists(bak):
        die(f"rollback name {bak} already exists")
    idx = os.path.join(stage, "index.html")
    if not os.path.isdir(stage) or os.path.islink(stage) or not os.path.isfile(idx) or os.path.islink(idx):
        die("stage missing or has no index.html")
    if sha(idx) != isha:
        die("stage index.html does not match the verified build")
    if asset.encode() not in open(idx, "rb").read():
        die("stage index.html does not reference the expected entry asset")
    ap = os.path.join(stage, asset)
    if not os.path.isfile(ap) or os.path.islink(ap):
        die("expected entry asset missing from the stage")
    st = {"app": app, "run": run, "live": live, "stage": stage, "bak": bak, "new": ident(stage), "old": ident(live),
          "phase": "pre-exchange"}
    write_state(app, st)
    try:
        exchange(stage, live)  # atomic: live is now the new tree, stage path holds the old one
    except OSError as e:
        if ident(live) == st["old"]:
            clear_state(app)
        die(f"exchange failed, live untouched: {e}")
    if os.environ.get("STATIC_TEST_KILL_AT") == "exchanged":
        os._exit(9)
    try:
        st["phase"] = "exchanged"
        write_state(app, st)
        if os.environ.get("STATIC_TEST_RAISE_AT") in ("postcheck", "restore"):
            raise OSError(errno.EIO, "injected postcheck error (test)")
        ok = os.path.isfile(os.path.join(live, "index.html")) and sha(os.path.join(live, "index.html")) == isha
        if os.environ.get("STATIC_TEST_FAIL_POSTCHECK") == "1":
            ok = False
        if not ok:
            raise Fail("post-swap check failed")
        if os.environ.get("STATIC_TEST_RAISE_AT") == "backup":
            raise OSError(errno.EIO, "injected backup rename error (test)")
        os.rename(stage, bak)
        fsync_dir()
        clear_state(app)
    except BaseException as e:
        why = str(e) if isinstance(e, Fail) else f"{type(e).__name__}: {e}"
        os.environ["_STATIC_RESTORING"] = "1"
        try:
            if ident(live) == st["new"] and ident(stage) == st["old"]:
                exchange(stage, live)
            elif ident(live) == st["new"] and ident(bak) == st["old"]:
                exchange(bak, live)
                os.rename(bak, stage)
            rm_if(stage, st["new"])
            if ident(live) != st["old"]:
                raise OSError(errno.EIO, "live is not the previous tree after restore")
            clear_state(app)
        except BaseException as e2:
            manual(st, f"{why}; restore FAILED ({type(e2).__name__}: {e2}); the previous tree is at the path with "
                       f"identity {st['old']}")
        die(f"{why}; previous tree restored")
    print(f"SWAPPED {app} rollback={WWW}/{bak}")


def cleanup(app, run):
    stage = f".stage-{app}-{run}"
    recover(app)  # dies (state kept) if the layout needs a human
    if os.path.islink(stage):
        os.unlink(stage)
    elif os.path.lexists(stage):
        if read_state(app) is not None:
            die("state still present after recovery; not removing the stage")
        shutil.rmtree(stage)  # no exchange recorded: this is our never-live upload, partial or not
    print("cleanup done")


def main():
    args = sys.argv[1:]
    if len(args) == 6 and args[0] == "swap":
        mode, app, run, tag, asset, isha = args
    elif len(args) == 3 and args[0] == "cleanup":
        mode, app, run = args
        tag, asset, isha = "x", "x", "0" * 64
    else:
        die("usage: swap APP RUN TAG ASSET INDEX_SHA256 | cleanup APP RUN")
    for v in (app, run, tag):
        if not SAFE.match(v):
            die("unsafe name")
    if not SAFE_ASSET.match(asset) or ".." in asset.split("/"):
        die("unsafe asset path")
    if not re.match(r"^[0-9a-f]{64}$", isha):
        die("bad index sha")
    for s in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT, signal.SIGPIPE):
        signal.signal(s, on_signal)
    os.chdir(WWW)
    lock(app, 0 if mode == "swap" else 60)
    if mode == "swap":
        swap(app, run, tag, asset, isha)
    else:
        cleanup(app, run)


if __name__ == "__main__":
    main()
