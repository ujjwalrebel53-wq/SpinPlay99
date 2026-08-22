<?php
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$num = preg_replace('/\D/', '', isset($_REQUEST['num']) ? $_REQUEST['num'] : '');
if (strlen($num) > 10) $num = substr($num, -10);
if (strlen($num) < 10) {
  http_response_code(400);
  echo json_encode(['error' => 'Valid 10-digit mobile number required']);
  exit;
}

$url = 'https://anon-num-info.vercel.app/num?key=305temp&num=' . rawurlencode($num);
$raw = false;
$code = 0;

function aadhar_http_get($url, $sslVerify) {
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => 35,
      CURLOPT_SSL_VERIFYPEER => $sslVerify,
      CURLOPT_SSL_VERIFYHOST => $sslVerify ? 2 : 0,
      CURLOPT_HTTPHEADER => ['Accept: application/json', 'User-Agent: RebelPanel-Aadhar/1.0']
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return ['body' => $body, 'code' => $code, 'err' => $err];
  }
  $ctx = stream_context_create([
    'http' => ['timeout' => 35, 'ignore_errors' => true, 'header' => "Accept: application/json\r\nUser-Agent: RebelPanel-Aadhar/1.0\r\n"],
    'ssl' => ['verify_peer' => $sslVerify, 'verify_peer_name' => $sslVerify]
  ]);
  $body = @file_get_contents($url, false, $ctx);
  $code = 0;
  if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
  if (!$code && $body !== false) $code = 200;
  return ['body' => $body, 'code' => $code, 'err' => $body === false ? 'file_get_contents failed' : ''];
}

foreach ([true, false] as $verify) {
  $res = aadhar_http_get($url, $verify);
  $raw = $res['body'];
  $code = $res['code'];
  if ($raw !== false && $code >= 200 && $code < 300) {
    echo $raw;
    exit;
  }
}

http_response_code(502);
echo json_encode([
  'error' => 'Upstream Aadhar API unreachable',
  'detail' => isset($res['err']) ? $res['err'] : 'connection failed'
]);
