# @wifi-entelsat/database

Núcleo de datos del PR03 para PostgreSQL 18 y Prisma 7. La migración SQL es la fuente de verdad para las garantías que Prisma no modela: roles, schemas, `FORCE RLS`, políticas, constraints parciales, triggers append-only y privilegios.

## Requisitos

- PostgreSQL 18, porque se usa `uuidv7()`.
- Un login `wifi_bootstrap` exclusivo de despliegue con privilegios de superusuario para crear o ajustar roles `BYPASSRLS`, schemas y `btree_gist`; nunca se reutiliza por API, workers o RADIUS.
- Una conexión runtime distinta, miembro únicamente del rol de grupo que corresponda.

Variables esperadas, nunca versionadas con valores reales:

- `DATABASE_URL`: conexión directa de `wifi_bootstrap` para Prisma CLI; el seed solo se admite fuera de producción.
- `TEST_DATABASE_URL`: conexión administrativa a una base efímera ya migrada y sembrada para las pruebas de catálogo/RLS.
- `WIFI_API_PASSWORD`, `WIFI_JOBS_PASSWORD`, `WIFI_RADIUS_PASSWORD`: secretos inyectados al proceso `psql` que ejecuta `scripts/bootstrap-roles.sql`.

## Flujo reproducible

```text
pnpm install
pnpm validate
pnpm generate
psql "$DATABASE_URL" --file scripts/bootstrap-roles.sql
pnpm migrate:deploy
pnpm seed
pnpm test
```

`db push` está prohibido. El seed es sintético, determinista e idempotente; no debe ejecutarse en producción.

## Contexto tenant

Toda operación runtime se ejecuta dentro de una transacción y fija el tenant con:

```sql
SELECT set_config('app.current_tenant_id', $1::text, true);
```

El tercer argumento `true` hace el valor local a la transacción. Ausencia, UUID inválido o un tenant diferente fallan cerrados. Nunca se acepta un tenant enviado por el cliente sin resolverlo desde la identidad y el alcance autorizados.

## Roles e identidades

Roles de grupo `NOLOGIN`:

- `wifi_app_runtime`
- `wifi_worker`
- `wifi_radius_runtime`
- `wifi_audit_writer`
- `wifi_export_worker`
- `wifi_migrator`
- `wifi_backup` (excepción `BYPASSRLS`, solo para backup automatizado)
- `wifi_monitoring`

La migración no crea usuarios `LOGIN`, passwords ni secretos. `scripts/bootstrap-roles.sql` crea o rota de forma idempotente `wifi_api`, `wifi_jobs` y `wifi_radius` desde variables de entorno y les concede un solo rol de grupo con `INHERIT FALSE`. `createApiDatabaseClient` y `createWorkerDatabaseClient` fijan el rol allowlisted con la opción de startup de PostgreSQL en cada conexión física del pool. FreeRADIUS configura su rol del mismo modo. Un healthcheck de despliegue debe verificar `current_role`.

`wifi_bootstrap` es el propietario de despliegue y aplica migraciones directamente. No es `wifi_migrator`: este último permanece `NOLOGIN` y solo posee funciones `SECURITY DEFINER`/privilegios internos. El secreto bootstrap se restringe a la red y job de despliegue, se rota y nunca se monta en contenedores runtime.

## Contrato FreeRADIUS

La migración productiva es la fuente de verdad para `radius_runtime.credentials`, `reply_attributes`, `accounting_inbox`, `post_auth_inbox` y las vistas `radcheck_compat`/`radreply_compat`. Las vistas son `SECURITY_BARRIER` + `security_invoker`; RADIUS recibe columnas de lectura concretas, `INSERT` append-only y solo las columnas necesarias para resolver `ON CONFLICT` idempotente. El rol sigue siendo `NOBYPASSRLS`; sus políticas globales están limitadas a esta superficie de infraestructura.

## API del paquete

El build genera Prisma dentro de `src/generated`, compila `dist` y publica exports ESM/tipos:

```text
pnpm --filter @wifi-entelsat/database generate
pnpm --filter @wifi-entelsat/database build
pnpm --filter @wifi-entelsat/database test
```

Exports principales: `PrismaClient`, `createDatabaseClient`, `createApiDatabaseClient`, `createWorkerDatabaseClient`, `withTenant`, `resolveCaptiveLocatorHash`, `resolveCaptiveAttemptHash`, `DATABASE_RUNTIME_ROLES` y sus tipos. La allowlist de roles del adapter contiene únicamente `wifi_app_runtime` y `wifi_worker`; nunca se acepta un rol desde input HTTP.

Lookups pre-tenant `SECURITY DEFINER`, con `search_path` fijo y grants solo a `wifi_app_runtime`:

- `app.resolve_captive_locator(bytea)` → tenant, gateway, site y orígenes HTTPS permitidos.
- `app.resolve_captive_attempt(bytea)` → tenant e intento pendiente/no expirado.
- `app.lookup_admin_auth(bytea)` → proyección mínima de password scrypt/lock y tenants activos para un HMAC exacto.
- `app.resolve_admin_session(bytea)` → sesión activa y tenants activos para un hash de token exacto.

## Contrato worker durable

`wifi_worker` no tiene acceso directo a `app.outbox_events` ni `radius_runtime.accounting_inbox`. Solo puede usar:

- `app.claim_outbox_events(worker_id, limit, lease_seconds)`; lote 1..500, lease 5..900 s, `SKIP LOCKED`.
- `app.read_claimed_outbox_event(worker_id, tenant_id, event_id, claim_token)`; devuelve `{result,event}` con `claimed`, `already_applied`, `claim_lost` o `not_found`, sin hacer ACK.
- `app.complete_outbox_event(...)` → `completed`, `already_applied`, `claim_lost` o `not_found`.
- `app.fail_outbox_event(..., error, retry_at)`; libera el lease y persiste backoff/error.
- `radius_runtime.claim_accounting_events(worker_id, limit, lease_seconds)`; mismo contrato de lease.
- `radius_runtime.complete_accounting_event(...)` → fila `(result, session_id)` con los mismos estados; proyecta `radius_sessions` idempotentemente bajo advisory lock y conserva `stopped` ante Start/Interim tardíos.
- `radius_runtime.fail_accounting_event(..., error, retry_at)`; libera el lease y persiste backoff/error.

Cada claim/complete/fail genera auditoría encadenada. El `claim_token` es el único token CAS: un handler nunca vuelve a reclamar por ID.

## Límites conocidos

- `Crypt-Password` es el valor operativo preferido. Cualquier uso de `Cleartext-Password`, CHAP o MS-CHAP continúa sujeto al gate de laboratorio físico; la base solo acepta el conjunto versionado de atributos.
- Retención, particionado definitivo e `identity_space` siguen sujetos a capacidad/DPO. Los índices iniciales están presentes sin fijar una política legal.
- El runtime nunca recibe el secreto ni los privilegios de `wifi_bootstrap`.
