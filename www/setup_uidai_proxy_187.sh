#!/bin/bash
# =============================================================================
# 187 Indian VPS — Squid forward proxy for UIDAI only (DO bot connects here)
# Run on: 187.127.150.208
#
# Usage:
#   CLIENT_IP=143.110.244.100 bash setup_uidai_proxy_187.sh
# Optional auth:
#   PROXY_USER=rebel PROXY_PASS=YourSecret123 CLIENT_IP=143.110.244.100 bash setup_uidai_proxy_187.sh
# =============================================================================
set -e

CLIENT_IP="${CLIENT_IP:-143.110.244.100}"
PROXY_PORT="${PROXY_PORT:-3128}"
PROXY_USER="${PROXY_USER:-}"
PROXY_PASS="${PROXY_PASS:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash setup_uidai_proxy_187.sh"
  exit 1
fi

echo "╔══════════════════════════════════════════╗"
echo "║  UIDAI forward proxy — Indian VPS (187)  ║"
echo "╚══════════════════════════════════════════╝"
echo "  Allow client: $CLIENT_IP"
echo "  Port: $PROXY_PORT"

apt-get update -qq
apt-get install -y -qq squid apache2-utils curl

CONF="/etc/squid/squid.conf"
cp -a "$CONF" "${CONF}.bak.$(date +%s)" 2>/dev/null || true

AUTH_BLOCK=""
ACCESS_LINE="http_access allow bot_client"
if [ -n "$PROXY_USER" ] && [ -n "$PROXY_PASS" ]; then
  htpasswd -bc /etc/squid/passwd "$PROXY_USER" "$PROXY_PASS"
  chown proxy:proxy /etc/squid/passwd
  chmod 640 /etc/squid/passwd
  AUTH_BLOCK=$(cat <<'AUTH'

auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwd
auth_param basic realm UIDAI Proxy
acl authenticated proxy_auth REQUIRED
AUTH
)
  ACCESS_LINE="http_access allow bot_client authenticated"
  echo "  Auth: $PROXY_USER (password set)"
else
  echo "  Auth: IP whitelist only (no password)"
fi

cat > "$CONF" <<EOF
# Rebel UIDAI proxy — only cloud bot IP may connect
http_port ${PROXY_PORT}
${AUTH_BLOCK}

acl bot_client src ${CLIENT_IP}/32
acl SSL_ports port 443
acl Safe_ports port 80 443
acl CONNECT method CONNECT

http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
${ACCESS_LINE}
http_access deny all

visible_hostname uidai-proxy-india
dns_v4_first on
EOF

systemctl enable squid
systemctl restart squid

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow from "${CLIENT_IP}" to any port "${PROXY_PORT}" proto tcp comment 'UIDAI proxy DO bot' || true
fi

echo ""
echo "=== Local UIDAI test (direct from 187) ==="
if curl -fsS --connect-timeout 12 -o /dev/null https://myaadhaar.uidai.gov.in/retrieve-eid-uid; then
  echo "  ✅ UIDAI direct OK on this VPS"
else
  echo "  ❌ UIDAI direct FAIL — fix 187 before using as proxy"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ Proxy running on port ${PROXY_PORT}           ║"
echo "╚══════════════════════════════════════════╝"
echo ""
if [ -n "$PROXY_USER" ]; then
  echo "  On DO (143) set in .env:"
  echo "  UIDAI_PROXY=http://${PROXY_USER}:${PROXY_PASS}@$(curl -fsS https://ifconfig.me):${PROXY_PORT}"
else
  echo "  On DO (143) set in .env:"
  echo "  UIDAI_PROXY=http://$(curl -fsS https://ifconfig.me):${PROXY_PORT}"
fi
echo ""
echo "  Test FROM 143 VPS:"
if [ -n "$PROXY_USER" ]; then
  echo "  curl -x http://${PROXY_USER}:PASSWORD@$(hostname -I | awk '{print $1}'):${PROXY_PORT} -I https://myaadhaar.uidai.gov.in/retrieve-eid-uid"
else
  echo "  curl -x http://$(hostname -I | awk '{print $1}'):${PROXY_PORT} -I https://myaadhaar.uidai.gov.in/retrieve-eid-uid"
fi
