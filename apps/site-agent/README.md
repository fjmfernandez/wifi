# WiFi ENTELSAT site-agent

Agente on-premise de salida única para inventario y cambios declarativos de gateways. Esta base implementa enrolamiento, identidad mTLS, comandos firmados, anti-replay, cola SQLite cifrada, health/readiness, backoff y apagado ordenado.

## Estado de seguridad

- El runtime es **`preview_only`**. Inventario, preview y preflight son las únicas capacidades anunciadas.
- `provisioning.apply` siempre devuelve `BLOCKED_BY_LAB_VALIDATION`; no existe una variable que lo habilite.
- El adaptador incluido no abre una conexión RouterOS. Un adaptador físico solo podrá añadirse después de L01–L21, revisión de privilegios y rollback en RouterBOARD aislado.
- No hay listener de gestión. El único listener es health en loopback (`127.0.0.1:3004`). WinBox, SSH y REST del router nunca se publican a Internet.
- Certificado, CA, clave privada, comandos y outbox se cifran con AES-256-GCM en SQLite. La clave de almacenamiento no se guarda en la base.
- Los logs solo aceptan campos escalares controlados y redactan nombres sensibles. Nunca registran token de enrolamiento, payloads, certificados, claves o respuestas RouterOS.

## Flujo operativo

1. El panel crea un token opaco con hash servidor, TTL corto, asociación exacta tenant/gateway y estado `unused`.
2. En el primer arranque el agente genera localmente una clave P-256 y envía solo su SPKI al endpoint fijo `POST /api/v1/site-agent/enroll` por HTTPS.
3. La API consume el token atómicamente una sola vez y devuelve certificado cliente, CA, identidad y secuencia inicial. El certificado debe incluir EKU `clientAuth` y SAN URI `urn:entelsat:wifi:agent:<identityId>`; el agente comprueba CA, firma, clave, identidad y vigencia antes de persistirlo.
4. El agente usa mTLS saliente para `POST /api/v1/site-agent/commands/lease` y `POST /api/v1/site-agent/events`.
5. Cada comando usa firma Ed25519 separada, tenant/gateway exactos, secuencia contigua, ventana temporal y tipo allowlisted.
6. El comando se persiste antes de ejecutarse. El resultado y su evento outbox se confirman en una misma transacción SQLite; la nube recibe el evento con `Idempotency-Key`.

La API de enrolamiento y comandos todavía no existe en `apps/api`. `cloud-port.ts` es el contrato/puerto estable y los tests usan un adaptador simulado que consume el token una vez. Hasta implementar el lado servidor, un despliegue sin identidad permanece vivo pero `not_ready`.

## Contrato de comandos v1

Tipos permitidos:

- `gateway.inventory.read`: payload vacío.
- `provisioning.preview`: `{ input, expectedFingerprint? }`.
- `provisioning.preflight`: `{ input, expectedFingerprint }`; ejecuta exclusivamente la lista read-only validada del plan de `@wifi/mikrotik`.
- `provisioning.apply`: se valida y se registra, pero devuelve el bloqueo de laboratorio sin tocar el router.

El contenido firmado es JSON canónico de todos los campos salvo `signature`. El `sequence` debe ser exactamente el siguiente de la identidad; un salto, replay, ID reutilizado, firma alterada, TTL excesivo u otro tenant/gateway falla cerrado.

## Arranque local

Copiar `.env.example`, generar una clave de almacenamiento y fijar la clave pública Ed25519 del plano de control. El token se facilita solo en el primer boot y debe retirarse del gestor de secretos tras enrolar.

```text
pnpm --filter @wifi/site-agent typecheck
pnpm --filter @wifi/site-agent test
pnpm --filter @wifi/site-agent build
```

En producción montar `/var/lib/wifi-site-agent` como volumen persistente con permisos del usuario no-root y usar `SITE_AGENT_DB_PATH=/var/lib/wifi-site-agent/site-agent.sqlite`. El contenedor debe tener filesystem raíz read-only, `no-new-privileges`, capacidades Linux eliminadas y egress limitado a `wifi.entelsat.com:443`, DNS/NTP aprobados y la red privada de gestión cuando exista un adaptador físico validado.

## Readiness

- `GET /health/live`: proceso operativo; no implica conectividad ni autorización de apply.
- `GET /health/ready`: exige SQLite, identidad, certificado no expirado, loop activo y comunicación reciente con la nube.
- `checks.apply` permanece `BLOCKED_BY_LAB_VALIDATION` de forma informativa y no convierte el proceso en no-ready, porque el modo publicado es preview.

## Pendientes obligatorios antes de apply real

- API transaccional para token de un uso, emisión/rotación/revocación mTLS, leases, firmas y recepción idempotente del outbox.
- Adaptador RouterOS HTTPS por LAN/túnel con usuarios read/apply separados y credenciales procedentes de un vault local, nunca variables o SQLite en claro.
- Evidencia L01–L21 y F09: preflight, diff, backup/export, apply, health probe, rollback y recuperación manual en CHR y RouterBOARD físico.
- Firma de actualización y protección anti-rollback del binario/contenedor.
