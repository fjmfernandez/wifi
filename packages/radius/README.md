# `@wifi/radius`

Contratos puros del borde RADIUS. Este paquete no abre sockets ni consulta PostgreSQL; compila únicamente la parte de política ya considerada segura y normaliza eventos para el worker.

## Decisiones implementadas

- `Port-Limit` es el atributo que se envía a RouterOS. `Simultaneous-Use` queda reservado para una comprobación server-side futura y nunca se compila como reply.
- `Acct-Interim-Interval` se conserva en segundos. El perfil HotSpot debe configurar `radius-interim-update=received` para que RouterOS lo respete.
- Los contadores se llaman `nasInputOctets`/`nasOutputOctets`. No se renombran todavía a upload/download.
- La huella contable incluye tenant, gateway, NAS, sesión, status, tiempos y contadores de 64 bits. Dos interims legítimos no colisionan.
- Los únicos puertos aceptados por el contrato CoA son 1700 y 3799, siempre de forma explícita.

## `BLOCKED_BY_LAB_VALIDATION`

PAP frente a CHAP, `Mikrotik-Total-Limit`/Gigawords, la orientación comercial de contadores y el selector exacto Disconnect/CoA no tienen una decisión de producción. El compilador rechaza cuotas totales y no exporta un constructor CoA.

La migración productiva de PostgreSQL es la fuente de verdad. Los nombres de interfaz acordados están en `RADIUS_RUNTIME_SQL_CONTRACT`; `infra/freeradius/lab/sql` ofrece solo un bootstrap desechable que implementa ese contrato.
