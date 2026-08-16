# Local development infrastructure

This Compose project supplies disposable local dependencies. It is not a production topology and
publishes every port on `127.0.0.1` only.

## Start

1. Copy `.env.example` to `.env`.
2. Set unique local values for `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, and
   `MINIO_ROOT_PASSWORD`. Generate them with a password manager or `openssl rand -base64 32`.
3. Run `pnpm infra:config`, then `pnpm infra:up`.

`infra/dev/.env` is ignored by Git. The example deliberately contains no usable credentials.

## Endpoints

| Dependency    | Local endpoint           | Readiness signal                                         |
| ------------- | ------------------------ | -------------------------------------------------------- |
| PostgreSQL    | `127.0.0.1:5432`         | `pg_isready` plus `SELECT 1`                             |
| Redis         | `redis://127.0.0.1:6379` | `redis-cli ping`                                         |
| S3 API        | `http://127.0.0.1:9000`  | `minio-init` completes after an authenticated connection |
| MinIO console | `http://127.0.0.1:9001`  | same server as the S3 API                                |
| Mailpit SMTP  | `127.0.0.1:1025`         | Mailpit's built-in `readyz` command                      |
| Mailpit UI    | `http://127.0.0.1:8025`  | `GET /readyz`                                            |
| OTLP/gRPC     | `http://127.0.0.1:4317`  | collector health endpoint                                |
| OTLP/HTTP     | `http://127.0.0.1:4318`  | collector health endpoint                                |
| OTel health   | `http://127.0.0.1:13133` | health-check extension                                   |

The collector intentionally exports telemetry to its debug log only. Production must use a remote
backend, authentication, encryption, retention controls, and restricted network paths.

## MinIO maintenance boundary

The pinned MinIO and `mc` images are historical community artifacts. In April 2026 the upstream
community repository was archived and its maintainers announced source-only distribution; these
images no longer receive community binary updates. They remain here only to provide a deterministic
S3-compatible development target. Do not promote them to staging or production. Use the selected
managed S3 service or another actively maintained, license-reviewed S3-compatible implementation.

## Data lifecycle

`pnpm infra:down` stops the project and preserves named volumes. To erase local service data, run
the explicit Docker Compose `down --volumes` operation only after confirming the project name and
that no needed local data remains.
