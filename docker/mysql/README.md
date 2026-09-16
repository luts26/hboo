# HBOO MySQL

Local database imports are intentionally run explicitly, not mounted into
`/docker-entrypoint-initdb.d`. This keeps repeated local development predictable:
the named Docker volume owns live database state, and imports happen only when
you run them.

Public repository files provide schema, migrations, and synthetic development
seeds. Real personal database dumps must stay local and ignored.

The public schema file is:

```text
docker/mysql/schema/schema.sql
```

Start MySQL:

```bash
docker compose up -d mysql
```

Import a local dump only when needed:

```bash
./docker/mysql/import-dump.sh docker/mysql/init/local-dev.sql
```

The dump does not include `CREATE DATABASE` or `USE`, so the script imports into
the DEV-only `hboo_dev` database created by the MySQL container.

Host-running Spring should connect through the published host port:

```text
jdbc:mysql://127.0.0.2:${DEV_MYSQL_PORT:-3307}/hboo_dev
```

Containers in Compose should connect to:

```text
mysql:3306
```

Do not commit real database dumps with personal financial history to a public
repository. Keep real dumps ignored and create a sanitized demo seed separately
when a public seed is needed.

Never use the Docker DEV MySQL service for the REAL database. The real database
belongs to host-installed MySQL and is not selected by repository `.env` files.
