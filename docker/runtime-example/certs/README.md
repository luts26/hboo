# REAL Local HTTPS Certificates

Generate REAL local certificates outside this repository after copying the
runtime template to `~/hboo-runtime/`.

```bash
cd ~/hboo-runtime
mkcert -install
mkcert \
  -cert-file certs/hboo.local.pem \
  -key-file certs/hboo.local-key.pem \
  hboo.local localhost 127.0.0.1
```

Do not commit generated certificate files or private keys.
