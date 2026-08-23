# WPass — matriz RBAC y alcances

**Estado:** propuesto  
**Modelo:** permiso atómico + alcance + condiciones  
**Regla:** deny-by-default; el código nunca pregunta “¿es admin?”, sino “¿posee este permiso sobre este recurso y bajo estas condiciones?”

## Leyenda

### Alcance

- `G`: plataforma global.
- `T`: tenant completo.
- `O`: organizaciones/grupos asignados.
- `S`: sedes asignadas.
- `J`: elevación just-in-time con ticket, motivo, TTL, 2FA y auditoría.
- `M`: datos personales enmascarados.
- `C`: solo registros con consentimiento/finalidad comercial válida.
- `—`: denegado.

### Acciones

- `R` read; `C` create; `U` update; `D` archive/delete funcional.
- `P` publish; `X` execute/deploy; `Q` disconnect.
- `E` export; `V` reveal; `A` approve.

`D` no permite borrar evidencia sujeta a retención. `V` no se deriva de `R`. Exportar PII exige a la vez permiso de exportar el recurso y `pii.export`.

## Catálogo atómico mínimo

| Namespace | Permisos atómicos |
|---|---|
| Plataforma | `tenant.read`, `tenant.create`, `tenant.update`, `tenant.suspend`, `tenant.delete` |
| Jerarquía | `{organization,site_group,site}.{read,create,update,delete}` |
| IAM | `membership.{read,create,update,delete}`, `role.{read,create,update,delete}`, `role_assignment.{read,create,update,delete}` |
| Red | `{zone,ssid,gateway}.{read,create,update,delete}`, `gateway.config.preview`, `gateway.config.deploy`, `gateway.config.rollback`, `gateway.secret.rotate`, `gateway.secret.reveal`, `gateway.monitoring.read` |
| Acceso | `access_policy.{read,create,update,delete,publish}`, `login_method.{read,create,update,delete}` |
| Portal | `portal.{read,create,update,delete,publish}`, `asset.{read,create,delete}` |
| Legal | `legal.{read,create,update,publish}`, `consent.read`, `consent.export`, `processing_purpose.{read,manage}` |
| Personas | `end_user.read`, `end_user.update`, `device.read`, `visit.read`, `pii.read`, `pii.export` |
| Derechos | `dsr.{read,create,approve,execute}` |
| Vouchers | `voucher.{read,create,revoke,extend,reveal,reprint,export}`, `voucher_batch.{read,create,revoke,export}` |
| Dispositivos | `authorized_device.{read,create,update,delete}`, `blocked_entity.{read,create,update,delete}` |
| Sesiones | `session.read`, `session.disconnect`, `accounting.read` |
| Reporting | `analytics.read`, `analytics.export_non_pii`, `export.read`, `export.download` |
| Integraciones | `integration.{read,create,update,delete}`, `integration.secret.rotate`, `integration.secret.reveal` |
| Evidencia | `audit.read`, `audit.export` |
| Comercial | `subscription.{read,update}`, `usage.read`, `invoice.{read,create,update,export}` |

Los verbos agrupados en esta tabla son registros separados del catálogo; la notación solo evita repetir nombres.

## Roles iniciales

| Rol | Alcance asignable | Propósito |
|---|---|---|
| Superadmin ENTELSAT | `G`; PII/secretos solo `J` | Administración de plataforma y emergencia |
| Técnico ENTELSAT | `J` tenant/sede | Red, RADIUS, agente y despliegues con ticket |
| Soporte solo lectura | `J:M` tenant/sede | Diagnóstico sin mutaciones ni PII clara |
| Administrador de cadena | `T/O` | Administración contractual y operativa del cliente |
| Administrador de sede | `S` | Operación de sedes concretas |
| Marketing | `O/S:C` | Portal, contenidos y analítica consentida |
| Recepción/vouchers | `S:M` | Emitir y operar acceso de huéspedes |
| Auditor/DPO | `T/O`; PII por expediente | Evidencia, finalidades, consentimientos y DSR |
| Facturación | `T/O` | Suscripción, uso e invoices; no PII huésped |

## Matriz de capacidades

| Recurso/acción | Superadmin | Técnico | Soporte RO | Admin cadena | Admin sede | Marketing | Recepción | Auditor/DPO | Facturación |
|---|---|---|---|---|---|---|---|---|---|
| Tenant leer/crear/actualizar/suspender | G:RCUX | J:R | J:R | T:R | S:R | O/S:R | S:R | T:R | T:R |
| Organización/grupo/sede CRUD | G:RCUD | J:R | J:R | T/O:RCUD | S:RU | O/S:R | S:R | T/O:R | T/O:R |
| Membership/roles/asignaciones | G:RCUD | — | — | T/O:RCUD | S:RCUD¹ | — | — | T/O:R | — |
| Zona/SSID CRUD | G:RCUD | J:RCUD | J:R | T/O:RCUD | S:RCUD | S:R | S:R | T/O:R | — |
| Gateway/monitorización CRUD | G:RCUD | J:RCUD | J:R | T/O:RCU | S:RCU | — | — | T/O:R | — |
| Preview de configuración | G:R | J:R | J:R | T/O:R | S:R | — | — | T/O:R | — |
| Deploy/rollback RouterOS | J:X | J:X | — | —² | —² | — | — | — | — |
| Rotar secreto gateway | J:U | J:U | — | — | — | — | — | metadata:R | — |
| Revelar secreto gateway | break-glass:V | break-glass:V | — | — | — | — | — | metadata:R | — |
| Política/login CRUD y publicar | G:RCUDP | J:RCUDP | J:R | T/O:RCUDP | S:RCUDP | S:R | S:R | T/O:R | — |
| Portal CRUD/publicar | J:RCUDP | J:R | J:R | T/O:RCUDP | S:RCUDP | O/S:RCUDP | S:R | T/O:R | — |
| Legal crear/versionar/publicar | J:R | — | J:R | T/O:RCUP | S:RCUP | S:R | S:R | T/O:R | — |
| Usuario/dispositivo/visita/sesión leer | J:M | J:M | J:M | T/O:R | S:R | O/S:C/M | S:M limitada | T/O:R | — |
| PII leer | J:V | — | — | T/O:V | S:V | O/S:C:V | — | expediente:V | contacto facturación |
| PII exportar | J:E³ | — | — | T/O:E³ | — | — | — | expediente:E³ | — |
| Consentimiento/DSR leer | J:R | J:M | J:M | T/O:R | S:R | comercial:C:R | — | T/O:R/E | — |
| DSR crear/aprobar/ejecutar | J:C/A/X | — | — | T/O:C/A³ | S:C | — | — | T/O:R | — |
| Voucher/lote leer/crear | J:RC | — | J:R | T/O:RC | S:RC | — | S:RC | T/O:R | — |
| Voucher revocar/extender/reimprimir | J:U | — | — | T/O:U | S:U | — | S:U | T/O:R | — |
| Voucher revelar/exportar | J:V/E³ | — | — | T/O:V/E³ | S:V/E | — | S:V/E | T/O:R | — |
| Autorizado/bloqueado CRUD | J:RCUD | J:RCUD | J:R | T/O:RCUD | S:RCUD | — | S:C/U⁴ | T/O:R | — |
| Sesión desconectar | J:Q | J:Q | — | T/O:Q | S:Q | — | — | — | — |
| Accounting leer | G:R | J:R | J:M | T/O:R | S:R | O/S:agregado | S:estado | T/O:R | — |
| Analytics no PII leer/exportar | G:R/E | J:R/E | J:R/E | T/O:R/E | S:R/E | O/S:R/E | S:R | T/O:R/E | T/O:R/E |
| Integración CRUD | G:RCUD | J:RCU red | J:R | T/O:RCUD | S:RCU | — | — | T/O:R | pago:R |
| Rotar/revelar secreto integración | J:U / break-glass:V | J:U / break-glass:V | — | U sin reveal | U sin reveal | — | — | metadata:R | pago:U sin reveal |
| Auditoría leer/exportar | G:R/E | J:R | J:R | T/O:R/E | S:R | solo propias:R | solo propias:R | T/O:R/E | facturación:R |
| Suscripción/uso/invoice | G:RCUDE | J:R | J:R | T/O:R/E | S:R | límites:R | — | T/O:R | T/O:RCU/E |

1. El admin de sede no puede asignar un rol superior, ampliar alcance ni modificar su propia asignación.  
2. Un futuro rol “técnico del cliente” puede obtener deploy tras formación; no se incluye en admin general.  
3. Reautenticación, motivo, TTL, auditoría y doble aprobación; nadie aprueba su propia solicitud.  
4. Recepción puede autorizar un dispositivo solo con plantilla, TTL máximo y sede propia; no crea bloqueos globales.

## Reglas de evaluación

1. Resolver el recurso real y su tenant antes de evaluar permiso.
2. Comprobar membership activa, rol, permiso atómico, alcance y vigencia.
3. Aplicar condiciones de finalidad (`C`), masking (`M`) y JIT (`J`).
4. Para PII: `resource.read` + `pii.read`; para exportar: `resource.export` + `pii.export`.
5. Para publish/deploy/disconnect: step-up 2FA y, según riesgo, motivo o aprobación.
6. Filtrar en DB y servicio; nunca cargar datos fuera de alcance para descartarlos después.
7. Auditar decisiones sensibles, incluidas denegaciones repetidas y cambios de alcance.
8. Un cambio de rol invalida sesiones/caches de autorización afectadas.

## Separación de funciones

- Quien solicita una exportación PII no la aprueba.
- Marketing no publica documentos legales ni cambia finalidades.
- Facturación no ve perfiles de huéspedes.
- Soporte no muta red, sesiones, vouchers ni PII.
- Un admin de sede no concede acceso fuera de su sede.
- El técnico puede desplegar, pero necesita JIT para una sede real y no obtiene PII por ser técnico.
- Reveal de secretos es break-glass; la operación normal es rotar.

## Identidades de servicio

| Identidad | Permisos mínimos | Prohibiciones |
|---|---|---|
| API runtime | CRUD por módulo y tenant actual; outbox/audit insert | `BYPASSRLS`, owner, lectura global |
| Worker | reclamar jobs tenant, procesar outbox/accounting, escribir proyecciones | job sin tenant, PII fuera de finalidad |
| FreeRADIUS | leer `radius_runtime`; insertar accounting/post-auth | tablas admin, PII, secretos de otros NAS |
| `site-agent` | heartbeat, leer sus comandos, subir evidencia de su gateway | listar otros gateways/tenants, comandos arbitrarios |
| CI migrator | aplicar migraciones en ventana controlada | servir requests, acceso humano ordinario |
| Export worker | leer dataset aprobado y escribir objeto tenant/TTL | aprobar, ampliar alcance, URLs permanentes |

Las credenciales de servicio son distintas por entorno, rotables, no interactivas y sin compartir secretos con usuarios humanos.

## Pruebas obligatorias

- Matriz positiva y negativa por cada permiso/rol/alcance.
- Intento de acceso cruzado cambiando UUID, tenant header, filtros, cursor y export scope.
- Admin de sede intentando asignarse rol de cadena.
- Marketing sin consentimiento intentando leer identidad clara.
- Soporte intentando mutar y leer PII.
- Solicitud/aprobación propia de export o DSR.
- Reutilización de URL de export y descarga tras TTL.
- Revocación de membership con sesión y caché activas.
- Service account accediendo a tablas no incluidas.
- RLS directa con rol runtime, worker y FreeRADIUS.

La matriz es un baseline de producto; no sustituye el acuerdo contractual de roles ni la revisión DPO de PII/exportaciones.
