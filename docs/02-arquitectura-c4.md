# WiFi ENTELSAT — arquitectura C4 inicial

**Estado:** propuesto  
**Fecha:** 2026-08-15  
**Alcance:** MVP; los diagramas describen responsabilidades y límites, no despliegues ya validados

## Principios de lectura

- **Plano de control:** panel, configuración, publicación, auditoría, privacidad y reporting.
- **Plano de acceso:** portal captive, emisión de autorización, FreeRADIUS, accounting y sesión en RouterOS.
- La ruta crítica del WiFi no depende de campañas, editor, email comercial, exportaciones ni panel.
- Las flechas que cruzan la LAN de invitados, la LAN de gestión, WireGuard o proveedores externos cruzan límites de confianza.

## C4 nivel 1 — contexto del sistema

```mermaid
flowchart LR
    Guest["Huésped / dispositivo no confiable"]
    Customer["Personal del cliente: cadena, sede, recepción y marketing"]
    Entelsat["Personal ENTELSAT: operaciones, soporte y técnica"]
    DPO["DPO / auditor"]
    System["WiFi ENTELSAT SaaS"]
    Router["Gateway MikroTik RouterOS 7"]
    AP["AP y red de acceso de terceros"]
    Mail["Proveedor de email transaccional"]
    Infra["GitHub, registry, Coolify y proveedor UE/EEE"]
    Future["PMS, TPV, pagos y CRM — fuera del MVP"]

    Guest -->|"Se asocia y autentica"| AP
    AP -->|"Entrega tráfico invitado"| Router
    Guest -->|"Portal HTTPS / CNA"| System
    Router <-->|"AAA, accounting y Disconnect/CoA por red privada"| System
    Customer -->|"Administra su alcance"| System
    Entelsat -->|"Opera con RBAC/JIT"| System
    DPO -->|"Consulta evidencia y DSR"| System
    System -->|"Envía mensajes transaccionales"| Mail
    Infra -->|"Ejecuta y despliega artefactos firmados"| System
    Future -.->|"Adaptadores posteriores"| System
```

### Actores y objetivos

| Actor/sistema | Objetivo | Confianza inicial |
|---|---|---|
| Huésped | Obtener acceso bajo una política y ejercer derechos | No confiable; MAC/IP/formulario son claims |
| MikroTik | Interceptar, consultar AAA, aplicar límites y contabilizar | Confiable solo tras identidad NAS, túnel y secreto/certificado |
| Cliente | Configurar exclusivamente sus organizaciones/sedes | Confiable dentro de permiso y alcance, no por rol nominal |
| ENTELSAT | Operar plataforma y red | Sin acceso permanente a PII/secretos; JIT cuando proceda |
| DPO/auditor | Revisar legalidad y evidencia | Solo lectura; exportación ligada a expediente |
| Proveedores | Entregar infraestructura o mensajes | Externos; contrato, minimización y egress controlado |

## C4 nivel 2 — contenedores

```mermaid
flowchart TB
    subgraph GuestZone["Sede — zona invitada no confiable"]
        Device["Dispositivo huésped / CNA"]
        Router["MikroTik HotSpot"]
    end

    subgraph MgmtZone["Sede — red de gestión"]
        Agent["site-agent\nidentidad mTLS, sin listener público"]
    end

    subgraph Cloud["Nube ENTELSAT — UE/EEE"]
        Admin["admin-web\nNext.js"]
        Portal["captive-portal\nNext.js ligero ES/EN"]
        API["api\nNestJS/Fastify modular"]
        Worker["worker\nBullMQ y tareas programadas"]
        RadiusA["FreeRADIUS A\n3.2.x"]
        RadiusB["FreeRADIUS B\n3.2.x"]
        DB[("PostgreSQL\napp / radius_runtime / audit")]
        Redis[("Redis\ncolas, locks, rate limits, caché")]
        S3[("Object storage\nassets, exports, backups")]
        OTel["OTel Collector + métricas/logs"]
    end

    Admin -->|"HTTPS admin"| API
    Device -->|"HTTP interceptado / HTTPS portal"| Router
    Router -->|"POST de variables no confiables"| Portal
    Portal -->|"Mismo origen mediante reverse proxy / HTTPS"| API
    API -->|"Transacción de dominio + proyección AAA"| DB
    API -->|"Jobs no críticos"| Redis
    Worker --> Redis
    Worker --> DB
    Worker --> S3
    Portal -->|"Snapshot publicado y assets preauth"| S3
    Router <-->|"RADIUS 1812/1813 por WireGuard"| RadiusA
    Router <-->|"RADIUS 1812/1813 por WireGuard"| RadiusB
    RadiusA <-->|"Auth projection + accounting inbox"| DB
    RadiusB <-->|"Auth projection + accounting inbox"| DB
    Agent -->|"mTLS saliente: heartbeat/comandos"| API
    Agent -->|"API RouterOS local, mínimo privilegio"| Router
    Worker -.->|"Disconnect/CoA; fallback vía agente"| Router
    Admin --> OTel
    Portal --> OTel
    API --> OTel
    Worker --> OTel
    RadiusA --> OTel
    RadiusB --> OTel
    Agent --> OTel
```

### Responsabilidades y datos permitidos

| Contenedor | Responsabilidad | Puede persistir | No debe conocer |
|---|---|---|---|
| `admin-web` | UX administrativa | Solo estado cliente efímero | Secretos, credenciales captive, conexión DB |
| `captive-portal` | Render publicado y flujo captive | Cookie/state mínimo, sin perfil completo | IAM admin, facturación, campañas no publicadas |
| `api` | Única puerta de escritura de dominio | Datos transaccionales y auditoría | Shared secrets en logs o respuestas |
| `worker` | Outbox, accounting, retención, exports, email | Checkpoints/jobs idempotentes | Acceso transversal sin `tenant_id` |
| FreeRADIUS | AAA, post-auth, accounting, Disconnect/CoA | Proyección AAA e inbox mínimo | PII, portal, RBAC admin |
| `site-agent` | Inventario y cambios declarativos | Estado/cola local cifrada mínima | Credenciales de otros gateways o tenants |
| Redis | Efímero, colas y rate limits | IDs opacos con tenant | Fuente de verdad o PII clara |
| Object storage | Assets, exports y backups | Objetos cifrados y prefijados por tenant | ACL pública accidental o secretos sin cifrar |

## C4 nivel 3 — componentes del monolito modular

```mermaid
flowchart LR
    IAM["IAM admin\nTOTP, sesiones, passkeys futuras"]
    Tenancy["Tenancy y RBAC\npermisos + alcance"]
    Sites["Organizaciones y red\norg, grupo, sede, zona, SSID, gateway"]
    Policies["Políticas\nversionado y compilador RADIUS"]
    Portal["Portal\nversiones, bloques y publicación"]
    Legal["Legal y privacidad\naceptaciones, consentimientos, DSR"]
    Captive["Orquestador captive\nstate, login y autorización"]
    Access["Access\nemail, PIN, voucher y dispositivos"]
    Sessions["Sesiones\nconsulta y desconexión"]
    Provision["Agente/provisión\ndesired state y despliegues"]
    Audit["Auditoría e idempotencia"]
    Export["Exportaciones y reporting MVP"]
    Outbox["Outbox transaccional"]
    RadiusProjection[("radius_runtime")]

    IAM --> Tenancy
    Tenancy --> Sites
    Sites --> Policies
    Sites --> Portal
    Portal --> Legal
    Captive -->|"Puertos de lectura"| Portal
    Captive -->|"Puertos de lectura"| Legal
    Captive --> Access
    Access --> Policies
    Access -->|"Misma transacción"| RadiusProjection
    Policies --> RadiusProjection
    Sessions --> RadiusProjection
    Provision --> Sites
    Audit --> Outbox
    IAM --> Audit
    Tenancy --> Audit
    Sites --> Audit
    Policies --> Audit
    Portal --> Audit
    Legal --> Audit
    Access --> Audit
    Sessions --> Audit
    Provision --> Audit
    Export --> Audit
```

### Reglas de dependencia

1. Un módulo es propietario de sus tablas y repositorios.
2. Otro módulo consume un puerto de aplicación o un evento; no importa el repositorio ajeno.
3. La creación de `access_authorization` y su proyección RADIUS ocurre en la misma transacción.
4. Reporting usa sesiones normalizadas, no paquetes RADIUS crudos.
5. El outbox publica efectos posteriores al commit; nunca habilita un login que necesita consistencia inmediata.
6. `Captive` no puede depender de Redis, BullMQ, campañas, email comercial o exports para completar click/email/PIN.

## Secuencia crítica 1 — login captive externo

```mermaid
sequenceDiagram
    autonumber
    participant G as Huésped/CNA
    participant M as MikroTik HotSpot
    participant P as captive-portal
    participant A as API captive
    participant DB as PostgreSQL
    participant R as FreeRADIUS

    G->>M: Solicitud HTTP antes de autenticar
    M-->>G: login.html
    G->>P: POST mac/ip/link-login/link-orig/error
    Note over P: Todos los valores recibidos son no confiables
    P->>A: Iniciar attempt con gateway locator
    A->>DB: Crear state/nonce hash + TTL
    DB-->>A: captive_attempt
    A-->>P: Portal publicado + métodos
    G->>P: Aceptación y click/email/PIN
    P->>A: Autorizar con state y evidencia
    A->>DB: TX: autorización + credencial efímera + atributos
    DB-->>A: Commit
    A-->>G: Form POST a origen HotSpot reconstruido
    G->>M: username/password efímeros por HTTPS
    M->>R: Access-Request por WireGuard
    R->>DB: Consultar credencial ligada a NAS/contexto
    DB-->>R: Verificador + atributos efectivos
    R-->>M: Access-Accept / Reject
    M-->>G: Acceso o error seguro
```

Controles imprescindibles:

- el gateway locator es público y no autentica;
- el host/puerto de retorno se reconstruye desde inventario, no desde `link-login`;
- `link-orig` no puede actuar como open redirect;
- la credencial expira, tiene usos limitados y se vincula a gateway/NAS y contexto esperado;
- ninguna credencial aparece en URL, analytics, logs o referer;
- el RADIUS real, no el POST inicial, confirma NAS y `Calling-Station-Id`.

## Secuencia crítica 2 — accounting y reconciliación

```mermaid
sequenceDiagram
    autonumber
    participant M as MikroTik
    participant R as FreeRADIUS
    participant I as Accounting inbox
    participant W as Worker
    participant S as radius_sessions

    M->>R: Start / Interim / Stop
    R->>I: INSERT evento crudo redactado + fingerprint
    alt Retransmisión exacta
        I-->>R: Conflicto idempotente, mismo resultado
    else Evento nuevo
        I-->>R: Persistido
    end
    R-->>M: Accounting-Response
    W->>I: Reclamar evento no procesado
    W->>S: Abrir, avanzar o cerrar sesión
    W->>I: Marcar procesado con checkpoint
    Note over W,S: Start posterior puede reconciliar Stop perdido sin duplicar sesión activa
```

La huella incluye tenant/gateway, NAS, `Acct-Session-Id`, status, tiempo de evento/sesión y contadores de 64 bits. No se deduplica únicamente por `event_type`.

## Secuencia crítica 3 — cambio declarativo de gateway

```mermaid
sequenceDiagram
    autonumber
    participant U as Técnico autorizado
    participant A as API
    participant G as site-agent
    participant M as RouterOS

    U->>A: Solicitar preview de revision deseada
    A->>G: Lease + comando firmado de preflight
    G->>M: Leer inventario/configuración
    M-->>G: Estado observado
    G-->>A: Preflight + diff + riesgos
    U->>A: Aprobar revisión exacta con 2FA
    A->>G: Apply idempotente de esa revisión
    G->>M: Backup/export y cambios allowlisted
    G->>M: Health probes
    alt Salud correcta
        G-->>A: Applied + hash evidencia
    else Pérdida o degradación
        G->>M: Rollback de revisión
        G-->>A: Rolled back / needs manual recovery
    end
```

## Comportamiento ante fallos

| Fallo | Sesiones existentes | Nuevos logins | Operación admin | Decisión |
|---|---|---|---|---|
| `admin-web` | Continúan | Continúan | Panel no disponible | Aislado del acceso |
| Redis/BullMQ | Continúan | Click/email/PIN básico debe continuar | Jobs/exports se pausan | Redis no está en hot path |
| API captive | Continúan | Fallan cerrados | Parcialmente degradada | No fail-open |
| PostgreSQL | Continúan mientras RouterOS las mantenga | Fallan cerrados | No disponible | Requiere HA/RTO |
| Un FreeRADIUS | Continúan | Conmutan al segundo | Visible como alerta | Dos nodos |
| Ambos FreeRADIUS | Continúan según política aplicada | Fallan cerrados | Alerta crítica | Emergencia explícita opcional |
| `site-agent` | AAA directo continúa | Continúan si RADIUS/túnel funciona | Sin deploy/fallback | Agente no es proxy AAA |
| WAN sede | No se promete Internet | No se promete acceso | Heartbeat perdido | Reconciliar al volver |

## Límites de confianza y STRIDE inicial

| Límite/activo | Riesgo STRIDE prioritario | Control de diseño | Evidencia requerida |
|---|---|---|---|
| POST `login.html` | Spoofing/tampering/open redirect | Entrada no confiable, origen reconstruido, state/nonce, TTL, binding NAS/MAC | L02–L04 |
| Voucher/PIN | Spoofing/replay/DoS | Alta entropía, HMAC, comparación constante, rate limit y redención atómica | Tests de enumeración y concurrencia |
| RADIUS por red | Spoofing/disclosure/tampering | WireGuard, secreto por gateway, Message-Authenticator, allowlist NAS | L08–L09 |
| Disconnect/CoA | Elevation/DoS | Puerto privado, atributos de selección exactos, ACK/NAK, permisos separados | L16–L17 |
| Accounting | Tampering/repudiation | Inbox append-only, fingerprint, Class, tiempos separados, reconciliación | L13–L15 |
| RLS/tenant | Disclosure/elevation | FK compuesta, RLS forzada, rol sin BYPASSRLS, tests negativos | Suite multi-tenant |
| Agente/RouterOS | Elevation/tampering | mTLS, comandos firmados/idempotentes, usuario mínimo, preflight/rollback | Prueba de replay y pérdida |
| PII/exports | Disclosure/repudiation | HMAC por identity space, cifrado, JIT, doble aprobación, TTL | DSR y export auditado |
| Assets/HTML | XSS/SSRF/disclosure | Tipos/tamaño, sanitización, CSP, origen aislado, egress allowlist | DAST/CSP/upload tests |
| Logs/telemetría | Disclosure | Redacción, cardinalidad controlada, prohibición de secretos/PII | Escaneo automatizado |

## Decisiones aún no representables como “hecho”

- HTTPS/PAP frente a CHAP: `BLOCKED_BY_LAB_VALIDATION`.
- Cuotas totales/Gigawords, dirección contable y selector CoA: `BLOCKED_BY_LAB_VALIDATION`.
- Modelos y versión RouterOS de producción: `BLOCKED_BY_LAB_VALIDATION`.
- Topología HA, RTO/RPO y emergencia: pendiente de pregunta 6.
- Responsable/encargado, retención, identity spaces y DPIA: `BLOCKED_BY_LEGAL_REVIEW`.

## Fuentes primarias

- [MikroTik HotSpot](https://manual.mikrotik.com/docs/authentication-authorization-accounting/hotspot-captive-portal/)
- [MikroTik HotSpot customisation](https://manual.mikrotik.com/docs/authentication-authorization-accounting/hotspot-captive-portal/hotspot-customisation/)
- [MikroTik RADIUS](https://manual.mikrotik.com/docs/authentication-authorization-accounting/radius/)
- [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
- [Coolify Docker Compose](https://coolify.io/docs/knowledge-base/docker/compose)
- [Coolify health checks](https://coolify.io/docs/knowledge-base/health-checks)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
