# Local HTTPS Certificates

Generate local certificates with mkcert. Do not commit generated certificate files or private keys.

Desktop-only development:

```bash
mkcert -install
mkcert \
  -cert-file docker/nginx/certs/hboo.local.pem \
  -key-file docker/nginx/certs/hboo.local-key.pem \
  hboo.local localhost 127.0.0.1
```

Desktop and same-Wi-Fi mobile testing:

```bash
LAN_IP="$(ip route get 1.1.1.1 | awk '{print $7; exit}')"

mkcert -install
mkcert \
  -cert-file docker/nginx/certs/hboo.local.pem \
  -key-file docker/nginx/certs/hboo.local-key.pem \
  hboo.local localhost 127.0.0.1 "$LAN_IP"
```

Use `https://hboo.local/` on the development machine and `https://<developer-lan-ip>/` from another device on the same LAN.

For mobile HTTPS/PWA testing, install and trust the mkcert local CA on the mobile device too. No router configuration should be required for direct LAN-IP access if both devices are on the same LAN and the firewall/client isolation does not block access.
