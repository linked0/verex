# scripts/ — what every command means (learning guide)

This folder has two scripts. This guide explains **each section** so the Docker, Postgres, and
GCP (Cloud SQL / Cloud Run / Secret Manager) commands aren't a black box.

| Script | What it does | Where it runs |
|--------|--------------|---------------|
| [`dev-local.sh`](dev-local.sh) | local dev DB (Docker Postgres) + schema + seed | your machine |
| [`deploy.sh`](deploy.sh) | deploy two services + managed DB to GCP (**DRAFT**) | Google Cloud |

## Concepts in 30 seconds
- **Docker** — runs software inside an isolated "container," so you don't install it on your Mac directly. We use it for a throwaway local Postgres.
- **Postgres** — the SQL database that stores markets & outcomes.
- **Cloud SQL** — Google's **managed Postgres** (the cloud version of your local Docker Postgres).
- **Cloud Run** — Google service that runs your app in containers, auto-scaling. Gives each service a `*.run.app` URL.
- **Secret Manager** — Google's vault for secrets (e.g. `DATABASE_URL`).

---

## `dev-local.sh` — line by line

### 1. Start Postgres in Docker
```bash
docker run -d --name verex-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=verex -p 5432:5432 postgres:16
```
| Part | Meaning |
|------|---------|
| `docker run` | start a new container |
| `-d` | **detached** — run in the background |
| `--name verex-pg` | give it a name so you can refer to it later (`docker stop verex-pg`) |
| `-e POSTGRES_PASSWORD=dev` | set an env var **inside** the container — Postgres uses it as the DB password |
| `-e POSTGRES_DB=verex` | create a database named `verex` on first start |
| `-p 5432:5432` | map container port 5432 → your Mac's port 5432, so you can connect at `localhost:5432` |
| `postgres:16` | the **image** to run — official Postgres v16 (downloaded once) |

Helper commands in the script:
- `docker ps -aq -f "name=^verex-pg$"` — list the container's id **if it already exists** (so we don't create it twice → idempotent).
- `docker start verex-pg` — start an existing, stopped container.
- `docker exec verex-pg pg_isready -U postgres` — ask Postgres "are you ready for connections?"; we loop until yes (the DB takes a second to boot).
- `docker stop verex-pg` / `docker rm -f verex-pg` — stop / delete the container.

### 2. The connection string (`DATABASE_URL`)
```
postgresql://postgres:dev@localhost:5432/verex
            └─user──┘ └pwd┘ └──host───┘ port └db┘
```
This is what Prisma (the API) uses to connect. Locally the host is `localhost:5432` (the port we mapped). **In the cloud it's different** — see deploy.sh.

### 3. Prisma (set up the tables + data)
- `prisma db push` — create the tables directly from `schema.prisma` (no migration files; fast for dev).
- `seed` — runs `prisma/seed.ts` to insert the 10 sample markets.

### 4. Write local env files
```bash
[ -f packages/api/.env ] || echo "DATABASE_URL=..." > packages/api/.env
```
`[ -f file ] || cmd` = "if the file does **not** exist, run cmd." So it only writes the env file
when missing (won't overwrite yours). Both files are git-ignored.

---

## `deploy.sh` — line by line (GCP)

### 1. Project + enable APIs
```bash
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com ... sqladmin.googleapis.com
```
- `config set project` — choose **which GCP project** all following commands act on.
- `services enable` — turn on the APIs we use. **GCP APIs are off by default**; you enable the ones you need (Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Cloud SQL Admin).

### 2. Cloud SQL (managed Postgres)
```bash
gcloud sql instances create verex-db --database-version=POSTGRES_16 --tier=db-f1-micro --region=...
gcloud sql databases create verex --instance=verex-db
gcloud sql users create verex --instance=verex-db --password=...
```
- `instances create` — create the **Postgres server** (`--tier=db-f1-micro` = smallest/cheapest).
- `databases create` — create the `verex` database inside that server.
- `users create` / `set-password` — the DB user + its password.
- `connectionName` (`project:region:instance`) — Cloud SQL's unique address.
- **Unix socket** — Cloud Run reaches Cloud SQL **not** via `localhost:5432`, but through a special socket path `/cloudsql/<connectionName>`. That's why the cloud URL ends with `?host=/cloudsql/...` instead of a normal host:port.

### 3. Secret Manager (store `DATABASE_URL`)
```bash
printf '%s' "$DATABASE_URL" | gcloud secrets create verex-database-url --data-file=-
gcloud secrets add-iam-policy-binding verex-database-url --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor
```
- `secrets create` / `versions add` — store the secret (each update is a new **version**).
- `--data-file=-` — read the secret value from **stdin** (the `| pipe`), so the password is **never typed on the command line or printed** — it goes straight into the vault.
- `add-iam-policy-binding ... secretAccessor` — give the Cloud Run **service account** permission to *read* that secret. (A service account = a non-human "robot" identity the running app uses.)

### 4. Deploy to Cloud Run
```bash
gcloud run deploy verex-api --source packages/api --region=... \
  --add-cloudsql-instances "$CONN_NAME" \
  --set-secrets "DATABASE_URL=verex-database-url:latest" \
  --allow-unauthenticated
```
- `run deploy --source packages/api` — **build** a container from that folder (via Cloud Build) and deploy it.
- `--add-cloudsql-instances` — attach the Cloud SQL instance so the app can reach it via the unix socket.
- `--set-secrets DATABASE_URL=verex-database-url:latest` — inject the secret from Secret Manager as the `DATABASE_URL` env var (`:latest` = newest version).
- `--set-env-vars NEXT_PUBLIC_API_URL=...` — a **non-secret** env var (plain value).
- `--allow-unauthenticated` — make the service **public** (anyone can open the URL). Without it, the URL would require Google auth.
- `status.url` — the auto `*.run.app` URL of the deployed service (your "staging" before the real domain).

### 5. Domain mapping (go live)
```bash
gcloud beta run domain-mappings create --service verex-web --domain verex.jaylabs.xyz --region=...
```
Points `verex.jaylabs.xyz` at the web service. GCP then prints a **DNS record** you add at your
domain registrar to prove ownership.

### Who authenticates the deploy?
**`gcloud` itself** — your `gcloud auth login` on your machine. The app's `AUTH_GOOGLE_*` /
`DATABASE_URL` are **cargo** carried *to* the app, not what authenticates the deploy.

---

## Safety
- `scripts/deploy.env` (your `PROJECT_ID`, and any `DB_PASSWORD`) is **git-ignored** — never committed.
- `deploy.sh` is a **DRAFT** — it creates **billable** resources (Cloud SQL, Cloud Run). Review and run it carefully (ideally to the `*.run.app` URL first; map the real domain last).
