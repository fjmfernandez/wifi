# WPass worker

Runtime asíncrono de producción para las colas `accounting`, `outbox`, `exports` y
`retention`. El binario registra únicamente `accounting`: las demás colas siguen
cerradas de forma segura hasta disponer de sus efectos externos y aprobaciones.

## Estado operativo

| Cola         | Estado en `main`                 | Condición para activarla                                      |
| ------------ | -------------------------------- | ------------------------------------------------------------- |
| `accounting` | Activa y obligatoria por defecto | PostgreSQL, Redis, consumidor BullMQ y poller SQL sanos       |
| `outbox`     | No registrada                    | `OutboxPublisher` real e idempotente, más pruebas del destino |
| `exports`    | No registrada                    | Storage cifrado, aprobación, descarga de un uso y TTL         |
| `retention`  | No registrada                    | Snapshot aprobado, dry-run y gate legal/DPO                   |

`WORKER_REQUIRED_QUEUES=accounting` es el valor seguro por defecto. Si se exige
una cola sin handler (por ejemplo `accounting,outbox`), `/health/ready` responde
`503`; el runtime nunca crea un consumidor que confirme jobs sin efecto real.

## Flujo duradero de accounting

1. El poller llama a
   `radius_runtime.claim_accounting_events(worker_id, limit, lease_seconds)`.
   PostgreSQL reclama un lote acotado con `FOR UPDATE SKIP LOCKED` y entrega un
   `claim_token` UUID por fila.
2. BullMQ recibe solo referencias opacas (`tenantId`, ID de inbox y token), no el
   payload RADIUS ni PII.
3. El handler llama a `radius_runtime.complete_accounting_event(...)`. La función
   compara el token, serializa por sesión, reconcilia Start/Interim/Stop incluso
   fuera de orden y guarda el checkpoint en la misma transacción.
4. Solo `completed` o `already_applied` permiten confirmar el job. `claim_lost`
   se reintenta y `not_found` se rechaza permanentemente.
5. Ante un fallo, `radius_runtime.fail_accounting_event(...)` libera el claim con
   un `retry_at` duradero y código redactado. Un crash queda cubierto por el lease
   acotado y la fila vuelve a ser reclamable.

Las funciones son `SECURITY DEFINER`, usan `search_path` fijo, token CAS y
auditoría. El login de servicio es `wifi_jobs`; el adapter
`createWorkerDatabaseClient` fija `role=wifi_worker` como opción de inicio en
cada conexión física. El readiness comprueba además `current_role=wifi_worker`.
El worker no necesita ni recibe acceso directo cross-tenant a las tablas de cola.

## Outbox sin ACK ficticio

El repositorio, handler y poller de outbox implementan el mismo protocolo de
claim/token/checkpoint. `read_claimed_outbox_event` devuelve un estado explícito
y nunca marca el evento como publicado. El orden del handler es:

1. verificar el claim SQL exacto;
2. publicar con `event.id` como clave idempotente en el destino;
3. ejecutar `complete_outbox_event` solo después del éxito real.

El composition root no registra este handler porque todavía no existe un
`OutboxPublisher`/dispatcher de producción. El siguiente gate es implementar y
validar ese destino; que un evento haya llegado a BullMQ no equivale a publicarlo.

## Garantías del runtime

- TypeScript 6 estricto y payloads Zod cerrados, versionados y tenant-scoped.
- `jobId` estable, reintentos limitados, backoff exponencial con jitter,
  concurrencia acotada, timeout, recuperación de jobs stalled y retención
  limitada.
- Lease de idempotencia atómico en Redis. La marca Redis es solo una optimización:
  el handler siempre vuelve a verificar PostgreSQL antes de devolver
  `already-applied`.
- Logs JSON con correlación y redacción. No se registra `job.data`; BullMQ recibe
  códigos de error allowlisted o genéricos, nunca detalles sensibles del driver.
- Shutdown ordenado: detiene pollers, drena consumidores hasta el deadline, cierra
  productores, health HTTP, Redis y el pool PostgreSQL.
- `/health/live` indica que el proceso vive. `/health/ready` exige proceso no
  detenido, Redis, PostgreSQL con rol correcto, handlers, consumidores y pollers
  recientes para todas las colas obligatorias.

## Configuración

Copiar `.env.example` al gestor de secretos de Coolify. Variables esenciales:

- `DATABASE_URL`: credenciales del login `wifi_jobs`; nunca usar credenciales de
  migración/bootstrap.
- `REDIS_URL`: usar `rediss://` si sale de la red privada.
- `WORKER_REQUIRED_QUEUES`: una o más colas obligatorias; por defecto
  `accounting`.
- `WORKER_CLAIM_BATCH_SIZE`, `WORKER_CLAIM_INTERVAL_MS` y
  `WORKER_DATABASE_LEASE_SECONDS`: claim SQL acotado. El parser exige que el lease
  supere el timeout de procesamiento más el intervalo del poller.
- `WORKER_DATABASE_CONNECTION_LIMIT` y timeouts asociados: límites del pool.
- `WORKER_*_CONCURRENCY`, `WORKER_ATTEMPTS`, `WORKER_BACKOFF_MS` y
  `WORKER_PROCESSING_TIMEOUT_MS`: capacidad y reintentos BullMQ.

Healthcheck recomendado en Coolify: `GET /health/ready` por el puerto
`WORKER_HEALTH_PORT` (3003 por defecto). La ruta principal pública
`wpass.es` no debe exponer este puerto; úsese solo en la red interna del
despliegue.

## Gates técnicos que siguen abiertos

- Orientación exacta de contadores, Gigawords, cuotas y cualquier decisión de
  corte o CoA/Disconnect siguen `BLOCKED_BY_LAB_VALIDATION` con RouterOS físico.
  Accounting conserva datos NAS y sesiones, pero no declara validada esa
  semántica ni ejecuta desconexiones.
- Outbox requiere un publisher idempotente real antes de registrar su handler.
- Exports requiere storage y controles de aprobación/descarga.
- Retention `apply` requiere aprobación verificable y gate legal/DPO; que el
  payload incluya una referencia no constituye por sí solo autorización.

## Desarrollo

```bash
pnpm --filter @wifi-entelsat/database build
pnpm --filter @wifi/worker typecheck
pnpm --filter @wifi/worker test
pnpm --filter @wifi/worker build
```

Las pruebas del worker son unitarias puras: usan repositorios falsos y no
requieren Redis, PostgreSQL, red ni reloj real. Las pruebas de integración SQL y
del rol `wifi_worker` pertenecen al paquete de base de datos.
