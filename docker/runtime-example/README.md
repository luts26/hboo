# HBOO REAL Runtime Template

This directory is a safe template for a REAL runtime outside the repository.
Do not put real credentials in this repository.

Target external layout:

```text
~/hboo-runtime/
    real.env
    compose.real.yaml
    app/
    nginx/
    certs/
```

REAL source isolation:

- `~/projects/hboo/` is the active DEV working copy.
- `~/hboo-runtime/app/` is a clean deployed Git snapshot.
- Do not mount the active DEV working tree into REAL containers.
- Do not edit application source directly in `~/hboo-runtime/app/`.
- Do not commit or push from the REAL runtime.

REAL MySQL:

- Use the dedicated Docker MySQL service `hboo-real-mysql`.
- Store real database state in Docker volume `hboo-real-mysql-data`.
- Keep it separate from DEV volume `hboo-dev-mysql-data`.
- The REAL backend connects internally through:

```text
DB_HOST=mysql
DB_PORT=3306
```

The REAL MySQL service also binds `127.0.0.1:3306:3306` so the host-running
Spring bank service can connect during the transition period.

REAL Adminer:

```text
http://hboo.local:8080
```

REAL credentials:

- Keep real credentials only in `~/hboo-runtime/real.env`.
- Never copy real credentials into this repository.
- Never commit `real.env`.
- Use placeholders in repository templates.

Suggested copy flow:

```bash
mkdir -p ~/hboo-runtime/nginx/conf.d ~/hboo-runtime/certs ~/hboo-runtime/app
cp docker/runtime-example/compose.real.yaml ~/hboo-runtime/compose.real.yaml
cp docker/runtime-example/real.env.example ~/hboo-runtime/real.env
cp docker/runtime-example/nginx/conf.d/real.conf ~/hboo-runtime/nginx/conf.d/real.conf
```

Then edit `~/hboo-runtime/real.env` manually outside this repository.

Start REAL later with an explicit env file:

```bash
cd ~/hboo-runtime
docker compose --env-file real.env -f compose.real.yaml up -d --build
```
