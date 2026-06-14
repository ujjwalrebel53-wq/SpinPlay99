#!/usr/bin/env python3
"""Generate panel/laptop.php — lightweight 2D clone of sex.php."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "panel" / "sex.php"
DST = ROOT / "panel" / "laptop.php"

LAPTOP_CSS = """
    /* ─── LAPTOP MODE: flat 2D, no GPU effects ─── */
    #bg3d{display:none!important}
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .laptop-banner{background:#1a1a24;border-bottom:1px solid var(--border);padding:8px 16px;font-size:12px;color:var(--muted);text-align:center}
    .laptop-banner a{color:var(--accent);text-decoration:none}
    .laptop-banner strong{color:var(--text)}
    *{animation:none!important;will-change:auto!important}
    .orb,.particle-canvas,#particleCanvas{display:none!important}
    header,.login-card,.login-page,#loginPage,.sidebar,.dev-item,.fb-tab,.mini-stat,.config-card,.modal-box,.modal-overlay,.fb-drop-menu,.btn,.btn-sm,.btn-fb{
      backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
      box-shadow:none!important;
    }
    header{background:var(--surface)!important}
    #loginPage{background:var(--bg)!important}
    .login-card{background:var(--card)!important}
    .sidebar{background:var(--surface)!important}
    .dev-item,.fb-tab,.mini-stat,.config-card,.modal-box{background:var(--card)!important}
    .dev-item:hover,.fb-tab:hover,.btn:hover,.btn-sm:hover,.btn-fb:hover{transform:none!important;box-shadow:none!important}
    .i3d,.i3d-anim,.i3d-swap,.logo-icon-3d,.logo-mark{
      transform:none!important;filter:none!important;animation:none!important;text-shadow:none!important;
      display:inline!important;
    }
    .i3d-swap .em-b,.i3d-anim .em-b{display:none!important}
    .status-pill.connected .status-dot,.dev-dot.online,.hero-badge.online::before,.rt-dot{box-shadow:none!important}
    body::before{display:none!important}
    .dev-hero::after{display:none!important}
    .modal-overlay{background:rgba(0,0,0,0.65)!important}
    .rebel-wizard-fill{transition:none!important}
    .tbl-wrap{box-shadow:none!important}
"""

REPLACEMENTS = [
    ("<title>Rebel Panel — Real-Time Dashboard</title>",
     "<title>Rebel Panel — Laptop Mode (2D)</title>"),
    ('<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet"/>',
     "<!-- laptop mode: system fonts only -->"),
    (".login-logo .panel-sub{font-family:'Space Mono',monospace;",
     ".login-logo .panel-sub{font-family:ui-monospace,monospace;"),
    ("function ico(e,c){return '<span class=\"i3d'+(c?' '+c:'')+'\">'+e+'</span>';}",
     "function ico(e,c){return e;}"),
]

def patch_ico_anim(text: str) -> str:
    old = """function icoAnim(type,c){
  var m=EMOJI_ANIMS[type];
  if(!m) return ico(type,c);
  var cls='i3d'+(c?' '+c:'');
  if(m.swap) return '<span class="'+cls+' i3d-swap"><span class="em-a">'+m.a+'</span><span class="em-b">'+m.b+'</span></span>';
  return '<span class="'+cls+' i3d-anim i3d-anim-'+m.anim+'"><span class="em-a">'+m.a+'</span></span>';
}"""
    new = """function icoAnim(type,c){
  var m=EMOJI_ANIMS[type];
  if(!m) return ico(type,c);
  return m.a||type;
}"""
    return text.replace(old, new)

def patch_init3d(text: str) -> str:
    text = text.replace(
        "(function(){initAllFirebase();init3DScene();})();",
        "(function(){initAllFirebase();})();",
    )
    start = text.find("function init3DScene(){")
    if start < 0:
        return text
    end = text.find("\n// ═══ CLIENTS CACHE", start)
    if end < 0:
        end = text.find("\nfunction getClientsCacheMeta", start)
    if end < 0:
        return text
    return text[:start] + "function init3DScene(){/* disabled in laptop mode */}\n\n" + text[end + 1 :]

def patch_aadhar_paths(text: str) -> str:
    return text.replace(
        "var list=[path, dir+'sex.php', dir+'aadhar.php', '/api/aadhar'];",
        "var list=[path, dir+'laptop.php', dir+'sex.php', dir+'aadhar.php', '/api/aadhar'];",
    )

def patch_auth_paths(text: str) -> str:
    return text.replace(
        "var REBEL_PANEL_SELF=(location.pathname.split('/').pop()||'sex.php').toLowerCase();",
        "var REBEL_PANEL_SELF='laptop.php';",
    )

def main():
    text = SRC.read_text(encoding="utf-8")
    if "</style>" in text:
        text = text.replace("</style>", LAPTOP_CSS + "\n  </style>", 1)
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    text = patch_ico_anim(text)
    text = patch_init3d(text)
    text = patch_aadhar_paths(text)
    text = patch_auth_paths(text)
    banner = (
        '<div class="laptop-banner"><strong>Laptop Mode</strong> — flat 2D UI, same features as '
        '<a href="sex.php">sex.php</a>. Optimized for low-end devices.</div>\n'
    )
    text = text.replace("<body>\n\n<div id=\"bg3d\">", "<body>\n" + banner + "\n<div id=\"bg3d\" style=\"display:none\">")
    text = text.replace(
        '<div class="panel-sub">REAL-TIME DASHBOARD</div>',
        '<div class="panel-sub">LAPTOP MODE · 2D</div>',
        1,
    )
    text = text.replace(
        '<div class="panel-sub">Real-Time Dashboard</div>',
        '<div class="panel-sub">Laptop Mode · Lightweight</div>',
        1,
    )
    text = text.replace(
        '<div class="footer-brand"><strong>Rebel Panel</strong> — SpinPlay99 Real-Time Dashboard</div>',
        '<div class="footer-brand"><strong>Rebel Panel</strong> — Laptop Mode (2D) · <a href="sex.php" style="color:var(--accent)">Full graphics</a></div>',
    )
    DST.write_text(text, encoding="utf-8")
    print(f"Wrote {DST} ({len(text)} bytes)")

if __name__ == "__main__":
    main()
