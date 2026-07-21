<?php
require_once __DIR__ . '/rebel_bot_lib.php';

rebel_admin_session_start();

if (isset($_GET['rebel_firebase_api']) || isset($_POST['rebel_firebase_api'])) {
    rebel_firebase_api_handle(true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['rebel_admin_login'])) {
    $pass = (string)($_POST['password'] ?? '');
    if (rebel_admin_login($pass)) {
        header('Location: admin.php');
        exit;
    }
    $loginError = 'Galat password';
}

if (isset($_GET['logout'])) {
    rebel_admin_logout();
    header('Location: admin.php');
    exit;
}

$loggedIn = rebel_admin_logged_in();
$projects = rebel_firebase_list();
$data = rebel_firebase_load();

function rebel_avatar_url_admin(): string
{
    if (is_file(__DIR__ . '/assets/rebel-avatar.jpg')) {
        return 'assets/rebel-avatar.jpg';
    }
    if (is_file(__DIR__ . '/rebel-avatar.jpg')) {
        return 'rebel-avatar.jpg';
    }
    return 'https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/main/IMG_20260609_231734_741.jpg';
}

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="theme-color" content="#050508"/>
<title>Rebel Admin — Firebase</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet"/>
<style>
:root{
  --bg:#050508;--surface:#0d0d14;--card:#14141f;--border:#2a2a3a;
  --accent:#ff3c3c;--accent2:#ff9500;--text:#e8e8f0;--muted:#6b6b88;
  --success:#00ff9d;--error:#ff4466;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;
  background:radial-gradient(ellipse 80% 50% at 50% -20%,rgba(255,60,60,0.12),transparent),var(--bg)}
.wrap{max-width:720px;margin:0 auto;padding:24px 16px 48px}
.mono{font-family:'Space Mono',monospace}
.hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:12px}
.logo img{width:44px;height:44px;border-radius:14px;border:1.5px solid var(--accent);object-fit:cover}
.logo h1{font-size:20px;font-weight:800}
.logo em{color:var(--accent);font-style:normal}
.badge{font-size:10px;padding:6px 10px;border-radius:100px;border:1px solid rgba(0,255,157,0.25);color:var(--success);background:rgba(0,255,157,0.08)}
.card{padding:20px;border-radius:18px;background:var(--card);border:1px solid var(--border);margin-bottom:16px}
.card h2{font-size:15px;margin-bottom:14px;font-weight:800}
.sub{font-size:12px;color:var(--muted);margin:-8px 0 16px;line-height:1.5}
.field{margin-bottom:12px}
.field label{display:block;font-size:11px;color:var(--muted);margin-bottom:6px;letter-spacing:.5px}
.field input{width:100%;padding:14px 12px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;outline:none}
.field input:focus{border-color:var(--accent)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 18px;border:none;border-radius:12px;font-family:'Syne',sans-serif;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none}
.btn-primary{background:linear-gradient(135deg,var(--accent),#cc2020);color:#fff;width:100%}
.btn-ghost{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.btn-danger{background:rgba(255,68,102,0.12);color:var(--error);border:1px solid rgba(255,68,102,0.25);padding:8px 12px;font-size:12px}
.err{color:var(--error);font-size:12px;margin-bottom:12px}
.proj{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px;border-radius:14px;background:var(--surface);border:1px solid var(--border);margin-bottom:10px}
.proj-name{font-weight:800;font-size:14px;margin-bottom:4px}
.proj-meta{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;word-break:break-all}
.empty{text-align:center;padding:28px;color:var(--muted);font-size:13px}
.links{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.toast-wrap{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:999;display:flex;flex-direction:column;gap:8px}
.toast{padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.toast.ok{background:rgba(0,255,157,0.15);border:1px solid rgba(0,255,157,0.35);color:var(--success)}
.toast.err{background:rgba(255,68,102,0.15);border:1px solid rgba(255,68,102,0.35);color:var(--error)}
.hint{font-size:11px;color:var(--muted);margin-top:12px;padding:12px;border-radius:12px;background:rgba(255,149,0,0.08);border:1px solid rgba(255,149,0,0.2)}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="logo">
      <img src="<?= htmlspecialchars(rebel_avatar_url_admin(), ENT_QUOTES, 'UTF-8') ?>" alt="Rebel"/>
      <div>
        <h1>Rebel <em>Admin</em></h1>
        <div class="mono" style="font-size:10px;color:var(--muted)">Firebase project manager</div>
      </div>
    </div>
    <?php if ($loggedIn): ?>
      <div class="links">
        <span class="badge">● Live sync</span>
        <a class="btn btn-ghost" href="mobile.php">Open Mobile Panel</a>
        <a class="btn btn-ghost" href="admin.php?logout=1">Logout</a>
      </div>
    <?php endif; ?>
  </div>

  <?php if (!$loggedIn): ?>
    <div class="card">
      <h2>Admin Login</h2>
      <p class="sub">Yahan se Firebase projects add karo — woh automatically <strong>mobile.php</strong> panel mein dikhenge.</p>
      <?php if (!empty($loginError)): ?><div class="err"><?= htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
      <form method="post">
        <input type="hidden" name="rebel_admin_login" value="1"/>
        <div class="field">
          <label>ADMIN PASSWORD</label>
          <input type="password" name="password" placeholder="Default: rebeladmin" required autofocus/>
        </div>
        <button class="btn btn-primary" type="submit">Login</button>
      </form>
      <div class="hint">Pehli baar default password: <span class="mono">rebeladmin</span> — login ke baad <span class="mono">rebel_admin.json</span> mein change kar sakte ho.</div>
    </div>
  <?php else: ?>
    <div class="card">
      <h2>+ Add Firebase Project</h2>
      <p class="sub">Jo project yahan add hoga, woh mobile panel mein auto sync ho jayega (har ~20 sec check).</p>
      <div class="field"><label>PROJECT NAME</label><input id="fbName" placeholder="Panel 1 / Client ABC"/></div>
      <div class="field"><label>FIREBASE DATABASE URL</label><input id="fbUrl" placeholder="https://xxx-default-rtdb.firebaseio.com"/></div>
      <div class="field"><label>DATABASE SECRET / AUTH KEY (optional)</label><input id="fbSecret" placeholder="Firebase legacy secret"/></div>
      <div class="field"><label>WEB API KEY (optional — live updates)</label><input id="fbApiKey" placeholder="AIza..."/></div>
      <button class="btn btn-primary" type="button" onclick="addProject()">Add Firebase Project</button>
    </div>

    <div class="card">
      <h2>Active Projects <span class="mono" style="color:var(--muted);font-size:11px">(<?= count($projects) ?>)</span></h2>
      <div id="projList">
        <?php if (!$projects): ?>
          <div class="empty">Abhi koi Firebase project nahi — upar se add karo</div>
        <?php else: ?>
          <?php foreach ($projects as $p): ?>
            <div class="proj" data-id="<?= htmlspecialchars((string)($p['id'] ?? ''), ENT_QUOTES, 'UTF-8') ?>">
              <div>
                <div class="proj-name"><?= htmlspecialchars((string)($p['name'] ?? ''), ENT_QUOTES, 'UTF-8') ?></div>
                <div class="proj-meta"><?= htmlspecialchars((string)($p['databaseURL'] ?? ''), ENT_QUOTES, 'UTF-8') ?></div>
                <div class="proj-meta" style="margin-top:4px">schema: <?= htmlspecialchars((string)($p['schema'] ?? 'auto'), ENT_QUOTES, 'UTF-8') ?></div>
              </div>
              <button class="btn btn-danger" type="button" onclick="deleteProject('<?= htmlspecialchars((string)($p['id'] ?? ''), ENT_QUOTES, 'UTF-8') ?>')">Delete</button>
            </div>
          <?php endforeach; ?>
        <?php endif; ?>
      </div>
    </div>

    <div class="hint">
      Mobile panel API: <span class="mono">admin.php?rebel_firebase_api=1</span><br/>
      Last updated: <span class="mono" id="updatedAt"><?= (int)($data['updated'] ?? 0) ?></span>
    </div>
  <?php endif; ?>
</div>
<div class="toast-wrap" id="toasts"></div>

<?php if ($loggedIn): ?>
<script>
var API_URL='admin.php?rebel_firebase_api=1';
function toast(msg,ok){
  var w=document.getElementById('toasts'),d=document.createElement('div');
  d.className='toast '+(ok?'ok':'err');d.textContent=msg;w.appendChild(d);
  setTimeout(function(){d.remove();},2800);
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function renderProjects(projects){
  var el=document.getElementById('projList');
  if(!projects||!projects.length){el.innerHTML='<div class="empty">Abhi koi Firebase project nahi — upar se add karo</div>';return;}
  el.innerHTML=projects.map(function(p){
    return '<div class="proj" data-id="'+esc(p.id)+'"><div><div class="proj-name">'+esc(p.name)+'</div>'+
      '<div class="proj-meta">'+esc(p.databaseURL)+'</div>'+
      '<div class="proj-meta" style="margin-top:4px">schema: '+esc(p.schema||'auto')+'</div></div>'+
      '<button class="btn btn-danger" type="button" onclick="deleteProject(\''+esc(p.id)+'\')">Delete</button></div>';
  }).join('');
}
function apiPost(body){
  return fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),credentials:'same-origin'})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,data:j};});});
}
function addProject(){
  var name=document.getElementById('fbName').value.trim();
  var url=document.getElementById('fbUrl').value.trim().replace(/\/$/,'');
  var secret=document.getElementById('fbSecret').value.trim();
  var apiKey=document.getElementById('fbApiKey').value.trim();
  if(!name||!url){toast('Name aur Firebase URL zaroori hai',false);return;}
  apiPost({action:'add',name:name,databaseURL:url,secret:secret,apiKey:apiKey}).then(function(res){
    if(res.data&&res.data.ok){
      toast('Added: '+name,true);
      document.getElementById('fbName').value='';
      document.getElementById('fbUrl').value='';
      document.getElementById('fbSecret').value='';
      document.getElementById('fbApiKey').value='';
      refreshList();
    }else{
      toast((res.data&&res.data.error)||'Add failed',false);
    }
  }).catch(function(){toast('Network error',false);});
}
function deleteProject(id){
  if(!confirm('Delete this Firebase project?'))return;
  apiPost({action:'delete',id:id}).then(function(res){
    if(res.data&&res.data.ok){toast('Project removed',true);refreshList();}
    else toast((res.data&&res.data.error)||'Delete failed',false);
  }).catch(function(){toast('Network error',false);});
}
function refreshList(){
  fetch(API_URL,{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.json();}).then(function(d){
    if(d&&d.ok){
      renderProjects(d.projects||[]);
      if(d.updated)document.getElementById('updatedAt').textContent=d.updated;
    }
  }).catch(function(){});
}
</script>
<?php endif; ?>
</body>
</html>
