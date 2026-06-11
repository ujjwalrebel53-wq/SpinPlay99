#!/bin/bash
# UIDAI network diagnostic — run on VPS as root
set -e

echo "╔══════════════════════════════════════════╗"
echo "║  UIDAI Network Diagnostic                ║"
echo "╚══════════════════════════════════════════╝"
echo ""

echo "=== 1. VPS public IP ==="
IP=$(curl -fsS --connect-timeout 8 https://ifconfig.me 2>/dev/null || curl -fsS --connect-timeout 8 https://api.ipify.org 2>/dev/null || echo "unknown")
echo "  IP: $IP"
if command -v curl >/dev/null 2>&1 && [ "$IP" != "unknown" ]; then
  curl -fsS --connect-timeout 8 "https://ipinfo.io/${IP}/json" 2>/dev/null | head -8 || true
fi
echo ""

echo "=== 2. Local firewall (outbound) ==="
if command -v ufw >/dev/null 2>&1; then
  ufw status 2>/dev/null || true
else
  echo "  ufw not installed"
fi
iptables -L OUTPUT -n 2>/dev/null | head -5 || echo "  iptables: skip"
echo ""

echo "=== 3. General internet (should work) ==="
if curl -fsS --connect-timeout 8 -o /dev/null -w "  google.com HTTP %{http_code} (%{time_connect}s connect)\n" https://google.com; then
  echo "  ✅ Outbound HTTPS OK"
else
  echo "  ❌ Cannot reach google.com — VPS outbound broken"
fi
echo ""

echo "=== 4. UIDAI myaadhaar (browser /open) ==="
echo "  Target: myaadhaar.uidai.gov.in:443"
timeout 20 curl -v --connect-timeout 15 --max-time 20 \
  https://myaadhaar.uidai.gov.in/retrieve-eid-uid 2>&1 | tail -15 || \
  echo "  ❌ FAILED or TIMEOUT (UIDAI blocking datacenter IP?)"
echo ""

echo "=== 5. UIDAI tathya API (/pdf) ==="
timeout 20 curl -v --connect-timeout 15 --max-time 20 \
  https://tathya.uidai.gov.in/ 2>&1 | tail -10 || \
  echo "  ❌ FAILED or TIMEOUT"
echo ""

echo "=== 6. TCP port 443 probe ==="
for host in 103.57.226.193 103.58.114.193; do
  if timeout 12 bash -c "echo >/dev/tcp/${host}/443" 2>/dev/null; then
    echo "  ✅ TCP $host:443 open"
  else
    echo "  ❌ TCP $host:443 blocked/timeout"
  fi
done
echo ""

echo "=== VERDICT ==="
echo "  • google OK + UIDAI hang/reset = UIDAI blocks this VPS IP (common on DigitalOcean/AWS)"
echo "  • google FAIL = fix VPS outbound firewall first"
echo "  • Fix: Indian ISP VPS (not cloud DC), or home broadband, or Indian residential proxy"
echo ""
