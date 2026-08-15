# WiFi ENTELSAT — ADRs propuestos

**Estado global:** propuesto; requiere aprobación  
**Fecha de referencia:** 2026-08-15  
**Alcance:** arquitectura del MVP, sin código ni configuración de producción

Cada registro usa los estados `propuesto`, `aceptado`, `rechazado` o `supersedido`. Una decisión marcada `BLOCKED_BY_LAB_VALIDATION` no puede pasar a `aceptado` solo mediante revisión documental.

## Baseline técnico verificado, todavía no fijado

Los números siguientes son candidatos para el spike de compatibilidad del PR 02, no un lockfile:

| Componente | Línea candidata | Motivo y condición |
|---|---:|---|
| Node.js | 24 LTS | Usar una línea LTS, no Node 26 Current. |
| Next.js | 16.2 Active LTS | Aplicar siempre el último parche de seguridad de la línea LTS antes de fijar. |
| NestJS/Fastify | Nest 11.1 / Fastify compatible | Fijar el par exacto tras ejecutar tests HTTP, OpenAPI y plugins. |
| ORM | Prisma ORM 7 | Es la línea recomendada para producción; Prisma Next/8 sigue en desarrollo. |
| PostgreSQL | 18.4 | Línea soportada; retroceder a 17.10 solo si el spike detecta incompatibilidad demostrada. |
| Redis | 8.8 | Validar la versión soportada por BullMQ y la política de persistencia. |
| FreeRADIUS | 3.2.10 | Mantener 3.2.x; no adoptar 4.x durante el MVP. |
| RouterOS | 7.21.5 long-term y 7.23.2 stable | Certificar ambas en laboratorio; producción usará una sola línea aprobada por modelo. |
| OpenTelemetry JS | trazas/métricas estables | Logs JS continúan en desarrollo: logs JSON estructurados siguen siendo la fuente operativa. |

Regla de fijación: versión exacta en `packageManager`, lockfile inmutable, imágenes por digest/SHA, SBOM y registro de fecha/fuente. Los parches de seguridad pueden actualizarse dentro de la línea aceptada con CI completa; un cambio de major requiere ADR o adenda.

## ADR-001 — MVP estricto y monolito modular

**Estado:** propuesto  
**Decisión:** implementar un monolito modular TypeScript para el plano de control y un worker separado. Los módulos iniciales son IAM/tenancy, organizaciones/sedes/red, políticas, portal/legal, captive access, vouchers, dispositivos, RADIUS/sesiones, auditoría y exportación.

Campañas, PMS, pagos, TPV, NMS completo, editor libre, SSO enterprise y API pública comercial quedan fuera del MVP. Solo se reservan contratos/adaptadores, no tablas ni flujos especulativos que compliquen AAA.

**Consecuencias:** transacciones y despliegues simples; límites de módulo obligatorios; prohibidas dependencias circulares y consultas directas a tablas de otro módulo sin puerto interno definido.

**Verificación:** diagrama de dependencias en CI y tests de arquitectura.  
**Revisa:** pregunta 4.

## ADR-002 — Separación de superficies y dominios de fallo

**Estado:** propuesto  
**Decisión:** desplegar como contenedores independientes:

- `admin-web`, solo panel administrativo;
- `captive-portal`, aplicación pública ligera, mismo origen para HTML/API/assets preautenticación siempre que sea posible;
- `api`, monolito modular escalable horizontalmente;
- `worker`, tareas asíncronas;
- `site-agent`, ejecutado en sede;
- FreeRADIUS, PostgreSQL, Redis, object storage y collector de observabilidad.

El portal no importa componentes ni autenticación del admin. AAA/captive no dependen de campañas, editor, exportaciones ni email comercial. Redis/BullMQ no participa en la ruta síncrona mínima de autorización.

**Consecuencias:** una caída del panel no corta portal ni RADIUS; todavía existe dependencia de API/PostgreSQL para emitir nuevas autorizaciones. Esa limitación se declara, se mide y no se oculta bajo “alta disponibilidad”.

**Verificación:** pruebas de fallo F01–F08 del plan de laboratorio.

## ADR-003 — Aislamiento tenant en cuatro capas

**Estado:** propuesto  
**Decisión:** aplicar simultáneamente:

1. `tenant_id NOT NULL` en toda tabla de negocio, job, evento, clave de objeto y caché;
2. claves únicas `(tenant_id, id)` y FKs compuestas `(tenant_id, fk_id)`;
3. autorización por permiso y alcance en la aplicación;
4. PostgreSQL RLS con `FORCE ROW LEVEL SECURITY`, rol runtime no propietario y sin `BYPASSRLS`.

Cada operación tenant se ejecuta dentro de una transacción que establece contexto local con `set_config(..., true)`. Migraciones, tareas de plataforma y RADIUS usan roles distintos. El superadmin no reutiliza silenciosamente el rol ordinario: el acceso transversal es JIT, explícito y auditado.

**Consecuencias:** más disciplina en repositorios, jobs y tests; RLS es defensa adicional, no sustituto de autorización. S3, Redis, telemetría y exportaciones requieren pruebas negativas propias.

**Verificación:** suite que intenta leer, mutar, enlazar, exportar y procesar jobs de otro tenant; debe fallar tanto por API como por DB.

## ADR-004 — Prisma 7 con migraciones SQL revisables

**Estado:** propuesto  
**Decisión:** usar Prisma ORM 7 y PostgreSQL. Toda migración generada se revisa y puede ampliarse con SQL para RLS, constraints de exclusión, índices parciales, particiones, triggers append-only y FKs compuestas. `db push` queda prohibido salvo bases efímeras desechables.

**Contexto:** a la fecha de referencia Prisma 7 es la línea recomendada para producción; Drizzle 1.0 continúa en beta. Prisma no elimina la necesidad de SQL nativo para las garantías requeridas.

**Consecuencias:** buen cliente tipado y ecosistema maduro, a cambio de mantener una capa SQL explícita. El schema Prisma no se considera la única fuente de verdad: migraciones aplicadas y tests de catálogo también lo son.

**Verificación:** migration dry-run desde cero y desde N-1, `prisma migrate diff`, comprobación de políticas/constraints en catálogo y rollback expand-contract.

## ADR-005 — FreeRADIUS como autoridad del plano de acceso

**Estado:** propuesto  
**Decisión:** FreeRADIUS decide `Access-Accept/Reject` sin llamada HTTP síncrona a la API. La API crea en una única transacción la autorización, credencial efímera y atributos RADIUS aplicables. FreeRADIUS consulta una proyección SQL mínima, sin PII y ligada a `NAS-Identifier`, gateway, tenant, expiración, MAC/attempt cuando corresponda y versión exacta de política.

El outbox se usa para efectos laterales, no para hacer visible una credencial necesaria para el login inmediato. FreeRADIUS dispone de un rol SQL de privilegio mínimo: lectura de autorización/proyección y escritura de accounting/post-auth, sin acceso a tablas administrativas o PII.

**Consecuencias:** latencia y disponibilidad predecibles; PostgreSQL sigue siendo dependencia de nuevos logins. Un usuario local RouterOS con el mismo nombre evita la consulta RADIUS, por lo que el aprovisionamiento debe eliminar/impedir colisiones.

**Verificación:** NAS simulado, colisión local real, expiración, gateway equivocado y credencial reproducida.

## ADR-006 — Transporte RADIUS privado y dos nodos

**Estado:** propuesto, sujeto a pregunta 6  
**Decisión:** RADIUS UDP 1812/1813 viaja exclusivamente dentro de WireGuard/red privada con secreto distinto por gateway. Dos nodos FreeRADIUS viven fuera del dominio de fallo del panel/Coolify. RadSec se evalúa después de estabilizar el MVP; no se expone RADIUS ni gestión MikroTik a Internet.

Disconnect/CoA usa un puerto único fijado en router, FreeRADIUS y firewall. RouterOS usa UDP 1700 por defecto para `/radius incoming`; si se adopta el estándar 3799, se configurará explícitamente.

**Consecuencias:** menor complejidad inicial que RadSec y riesgo UDP contenido por túnel. La topología exacta, failover y persistencia de accounting dependen del SLA.

**Verificación:** L09 y L16–L20.  
**Estado de red:** `BLOCKED_BY_LAB_VALIDATION`.

## ADR-007 — Portal externo con credencial efímera y HTTPS/PAP como candidato

**Estado:** propuesto  
**Decisión candidata:** `login.html` del router hace POST al portal. Los valores publicados por RouterOS son entrada no confiable: un identificador embebido en HTML no es secreto y RouterOS no firma el formulario. El sistema:

- identifica el gateway por configuración registrada;
- reconstruye el origen de login desde esa configuración, sin reenviar ciegamente `link-login`;
- limita `link-orig` y destinos poslogin a esquemas/hosts permitidos;
- usa state/nonce de un uso, hash, TTL corto y protección replay;
- vincula la credencial RADIUS a autorización, gateway/NAS y contexto esperado;
- nunca pone credenciales en URL ni logs.

Se prueba primero `login-by=https` + PAP: permite verificar credenciales efímeras con un hash no reversible. CHAP requiere `Cleartext-Password` conocido por FreeRADIUS y solo se aceptará si el laboratorio demuestra una necesidad superior.

**Consecuencias:** exige certificado válido en el HotSpot y flujo CNA real. Portal/API/assets preauth deben evitar terceros y comodines en walled garden.

**Verificación:** L02–L09.  
**Estado:** `BLOCKED_BY_LAB_VALIDATION`.

## ADR-008 — Mapeo de políticas a RADIUS con evidencia

**Estado:** propuesto  
**Decisión:** versionar la política y guardar en cada autorización los atributos efectivos. Base documental:

- rate: `Mikrotik-Rate-Limit`; `rx` es subida del cliente y `tx` descarga desde la perspectiva del router;
- tiempo: `Session-Timeout`, `Idle-Timeout`;
- interims: `Acct-Interim-Interval` con perfil `radius-interim-update=received`;
- concurrencia: `Port-Limit` para RouterOS más `Simultaneous-Use` como comprobación server-side de FreeRADIUS, no como atributo enviado al NAS;
- cuotas RX/TX y Gigawords según diccionario oficial.

`Mikrotik-Total-Limit`, orientación contable observada, CoA y cualquier burst avanzado permanecen bloqueados hasta prueba física. Una política no se edita después de usarse: se crea una versión.

**Consecuencias:** soporte explicable y reproducible; la UI solo presenta combinaciones verificadas por versión/modelo.

**Verificación:** L10–L17.  
**Estado parcial:** `BLOCKED_BY_LAB_VALIDATION`.

## ADR-009 — Accounting append-only, idempotente y reconciliable

**Estado:** propuesto  
**Decisión:** conservar evento crudo redactado y proyección de sesión. La huella determinista no puede ser solo `NAS + Acct-Session-Id + event_type`, porque descartaría todos los Interim legítimos. Incluye al menos tenant/gateway, NAS, session-id, status, event/session time y contadores normalizados; una retransmisión exacta comparte huella.

Start abre/reconcilia, Interim avanza contadores monotónicos y Stop cierra. Un Start posterior puede cerrar como huérfana una sesión cuyo Stop se perdió, siguiendo reglas documentadas y sin inventar consumo. `Class` se devuelve intacto y se usa como correlación opaca. Se guardan `received_at` y tiempo del NAS por separado.

**Consecuencias:** más almacenamiento y lógica de reconciliación; permite auditoría, reintentos y dashboards correctos. Partición mensual y BRIN se validan con volumen real.

**Verificación:** L13–L15, incluidos retransmisión, Stop perdido, reboot y transferencia asimétrica.

## ADR-010 — Agente de sede declarativo y sin gestión pública

**Estado:** propuesto  
**Decisión:** el agente inicia una sesión mTLS saliente, tiene identidad por dispositivo y recibe comandos firmados/idempotentes con allowlist. Opera con usuario RouterOS dedicado de mínimo privilegio por LAN/túnel privado. Cada cambio sigue `desired revision → preflight → diff → aprobación → backup/export → apply → health probe → commit o rollback`.

Se ofrecen tres modos: router nuevo, integrar red existente y solo HotSpot. Ninguno ejecuta cambios destructivos de red sin confirmación explícita. El fallback de desconexión es una acción separada, precisa y auditada.

**Consecuencias:** aprovisionamiento más lento de construir pero recuperable; requiere estrategia de actualización firmada y anti-rollback del agente.

**Verificación:** pérdida de conectividad durante cada fase, replay de comando, revisión de privilegios y restauración manual.

## ADR-011 — Secretos, vouchers e identificadores no correlacionables

**Estado:** propuesto  
**Decisión:** envelope encryption con clave/versión por entorno y, donde proceda, por tenant. Shared secrets RADIUS se descifran solo para materializarlos en tmpfs/configuración restringida del nodo; no se guardan en claro en tablas ni logs.

Vouchers usan `code_hmac`; revelado único y ciphertext con TTL corto opcional. Después del TTL, “reimprimir” rota y revoca. Email, teléfono y MAC se cifran y tienen HMAC ciego con clave de `identity_space`; no existe hash global que permita correlación entre clientes.

**Consecuencias:** búsquedas por blind index, rotación planificada y recuperación más deliberada. Revelar no es un permiso ordinario; se prefiere rotar.

**Verificación:** escaneo de logs/dumps/backups, rotación de claves, destrucción de reveal y pruebas de aislamiento criptográfico.

## ADR-012 — Legal acceptance, consentimiento y finalidad son hechos distintos

**Estado:** propuesto, sujeto a revisión jurídica  
**Decisión:** separar:

- aceptación de condiciones/prestación WiFi (`legal_acceptances`);
- decisiones de consentimiento por finalidad (`consent_events`: concedido, rechazado, retirado);
- documento y versión legal inmutables;
- base jurídica, finalidad, idioma, evidencia y responsable.

Rechazar o retirar marketing no bloquea el WiFi gratuito. La identidad se consolida únicamente dentro de un `identity_space` aprobado. Retención y borrado se ejecutan por clase, incluidos exports, object storage y tombstones de restauración.

**Consecuencias:** modelo más explícito y menos riesgo de consentimiento forzado; requiere textos y tabla de retención aprobados por DPO.

**Verificación:** pruebas de rechazo/retiro, cambio de versión legal, DSR y restore que no reintroduce PII borrada.  
**Estado:** `BLOCKED_BY_LEGAL_REVIEW`.

## ADR-013 — Auditoría, idempotencia y outbox como capacidades de plataforma

**Estado:** propuesto  
**Decisión:** toda mutación sensible escribe auditoría redactada en la misma transacción de negocio. `audit_logs` es append-only con integridad verificable y sin secretos/PII innecesaria. Las APIs repetibles usan `idempotency_keys` con tenant, actor, operación, request hash, respuesta y TTL. El outbox transaccional alimenta worker/webhooks sin dual writes.

**Consecuencias:** mayor coste de almacenamiento; reintentos seguros y evidencia coherente. Nadie puede aprobar su propia exportación PII.

**Verificación:** replays concurrentes, caída entre commit/publicación, intento de UPDATE/DELETE de auditoría y redacción automática.

## ADR-014 — Continuidad explícita, sin fail-open oculto

**Estado:** propuesto, sujeto a pregunta 6  
**Decisión:**

- admin caído: portal, API captive y RADIUS continúan;
- Redis caído: captive/AAA básico continúa; jobs y funciones no críticas se pausan;
- API o PostgreSQL caídos: sesiones existentes siguen; nuevas altas/autorizaciones fallan cerradas;
- un RADIUS caído: conmuta al segundo;
- ambos RADIUS caídos: sesiones existentes siguen según RouterOS; nuevos logins fallan cerrados;
- agente caído: no hay despliegues ni fallback de gestión, pero AAA directo continúa;
- WAN de sede caída: no se promete Internet; la recuperación no duplica accounting.

Un acceso de emergencia, si se aprueba, usa autorizaciones preemitidas, alcance/TTL/límite explícitos y auditoría; nunca desactiva globalmente HotSpot.

**Consecuencias:** comportamiento honesto y seguro, con disponibilidad inferior para nuevos logins durante ciertas caídas. El SLA puede exigir una arquitectura más costosa.

**Verificación:** matriz de fallos y RTO/RPO aprobados antes de staging.

## Fuentes primarias de referencia

- [MikroTik: HotSpot captive portal](https://manual.mikrotik.com/docs/authentication-authorization-accounting/hotspot-captive-portal/)
- [MikroTik: personalización y autenticación externa](https://manual.mikrotik.com/docs/authentication-authorization-accounting/hotspot-captive-portal/hotspot-customisation/)
- [MikroTik: RADIUS y atributos](https://manual.mikrotik.com/docs/authentication-authorization-accounting/radius/)
- [MikroTik: changelogs RouterOS](https://mikrotik.com/download/changelogs?channelFilter=stable)
- [FreeRADIUS: protocolos y formatos de contraseña](https://www.freeradius.org/documentation/freeradius-server/3.2.9/concepts/protocol/authproto.html)
- [FreeRADIUS 3.2.10](https://lists.freeradius.org/hyperkitty/list/freeradius-announce%40lists.freeradius.org/2026/6/)
- [PostgreSQL: Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
- [PostgreSQL: política de versiones](https://www.postgresql.org/support/versioning/)
- [Prisma: Prisma 7 recomendado para producción](https://www.prisma.io/blog/the-next-evolution-of-prisma-orm)
- [Prisma Migrate: SQL personalizable](https://docs.prisma.io/docs/orm/prisma-migrate)
- [Node.js: líneas LTS](https://nodejs.org/en/about/previous-releases)
- [Next.js: releases y avisos de seguridad](https://nextjs.org/blog)
- [OpenTelemetry JavaScript: estado de señales](https://opentelemetry.io/docs/languages/js/)
- [Coolify: Docker Compose](https://coolify.io/docs/knowledge-base/docker/compose)
- [Coolify: health checks](https://coolify.io/docs/knowledge-base/health-checks)
- [EDPB: consentimiento](https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en)
- [EDPB: responsable y encargado](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en)
- [RGPD, texto oficial](https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32016R0679)
