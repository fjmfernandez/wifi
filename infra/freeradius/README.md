# FreeRADIUS PR05

Base reproducible de FreeRADIUS 3.2.10 para el plano HotSpot de WPass. La imagen solo consulta la proyección mínima `radius_runtime`; no llama a la API, no contiene PII y no incorpora secretos en build, Git o logs.

## Artefacto y cadena de confianza

- Base oficial: `freeradius/freeradius-server:3.2.10` fijada también por digest `sha256:cc7fd136e7b03e7b332d94297530318e824a4ecfedbce54562cced723e71e812` (consultado 2026-08-16).
- Release upstream: <https://github.com/FreeRADIUS/freeradius-server/releases/tag/release_3_2_10>.
- Documentación 3.2.10: <https://www.freeradius.org/documentation/freeradius-server/3.2.10/>.
- El diccionario cargado es la descarga oficial de MikroTik; hashes y URL están en `vendor/PROVENANCE.md`.

La imagen se debe publicar por digest/SHA propio después de CI y SBOM. El tag upstream no es por sí solo una referencia inmutable.

## Flujo runtime

1. El entrypoint exige un fichero secreto de clientes NAS. Cada línea contiene exactamente `nombre<TAB>IP-origen-exacta<TAB>secreto-base64url`; no admite subred comodín. Genera `/run/freeradius/clients-runtime.conf` con `require_message_authenticator = yes`.
2. Lee la contraseña PostgreSQL desde un secreto, valida los parámetros no secretos y genera `/run/freeradius/sql-runtime.conf`. Fuera del laboratorio, TLS parte de `verify-full` y exige CA.
3. Ejecuta `freeradius -C` sin modo debug (para no volcar el DSN secreto). Si el diccionario, el cliente, SQL o la configuración son inválidos, el contenedor no abre tráfico.
4. FreeRADIUS consulta `credentials`/`reply_attributes`, ligando el usuario a `NAS-Identifier`, vigencia y, cuando exista, `Calling-Station-Id` normalizado.
5. Accounting escribe primero un `detail` restringido y después `accounting_inbox`. Una falla SQL se propaga: conforme a RFC 2866 no se emite `Accounting-Response` y el NAS retransmite. `ON CONFLICT` absorbe la copia exacta.

El spool local es evidencia defensiva, no una cola con replay automático en PR05. PR10 debe implementar/revisar el replay antes de depender del spool cuando el NAS agote reintentos.

## Contrato SQL

Los nombres estables son:

- `radius_runtime.credentials`;
- `radius_runtime.reply_attributes`;
- `radius_runtime.accounting_inbox`;
- `radius_runtime.post_auth_inbox`;
- vistas de adaptación `radcheck_compat` y `radreply_compat`.

`lab/sql/001-radius-runtime.sql` es únicamente un bootstrap desechable y no una migración productiva. La migración de `packages/database` es la fuente de verdad y debe conservar este contrato o versionarlo coordinadamente. El rol login solo recibe `SELECT` sobre la proyección, `INSERT` sobre inboxes y uso de sus secuencias; no obtiene `UPDATE`, `DELETE`, ownership ni `BYPASSRLS`.

La fila de credencial debe conservarse durante la vida máxima de sesión más la ventana de accounting tardío: el inbox resuelve tenant/gateway por `username + NAS-Identifier` incluso después de expirar la autorización.

## Laboratorio Docker

Requisitos: Docker Compose v2, OpenSSL y una shell POSIX (Linux, WSL o Git Bash).

```sh
cd infra/freeradius
sh scripts/init-lab-secrets.sh
docker compose -f compose.lab.yml config --quiet
docker compose -f compose.lab.yml build
sh scripts/verify-lab.sh
```

El compose levanta PostgreSQL, `radius-a`, `radius-b` y un contenedor con `radclient`. A solo se publica en loopback 1812/1813 y B en loopback 2812/2813. `verify-lab.sh` prueba PAP y CHAP como experimento, failover manual hacia B, atributos permitidos y Start/Interim duplicado/Stop con tres filas finales.

Para inspeccionar sin imprimir secretos:

```sh
docker compose -f compose.lab.yml ps
docker compose -f compose.lab.yml logs radius-a
docker compose -f compose.lab.yml exec -T postgres \
  psql -U lab_owner -d wifi_entelsat -c \
  'select status_type, session_time_seconds, nas_input_octets, nas_output_octets from radius_runtime.accounting_inbox order by id'
```

El reset del volumen es deliberadamente manual porque elimina evidencia del lab.

## Red y despliegue

| Flujo                                 |          Puerto | Exposición                                                        |
| ------------------------------------- | --------------: | ----------------------------------------------------------------- |
| MikroTik → RADIUS A/B auth            |        UDP 1812 | solo WireGuard/red privada, allowlist por IP exacta               |
| MikroTik → RADIUS A/B accounting      |        UDP 1813 | solo WireGuard/red privada, allowlist por IP exacta               |
| FreeRADIUS → PostgreSQL               |        TCP 5432 | red privada, TLS `verify-full` fuera del lab                      |
| worker/radclient → `/radius/incoming` | UDP 1700 o 3799 | solo túnel; un único valor coherente en router, firewall y emisor |

No publicar 1812/1813, 1700/3799, PostgreSQL, WinBox, SSH ni REST del router en Internet. Los dos nodos RADIUS deben terminar WireGuard y residir en dominios de fallo distintos. Si Coolify no publica UDP con health/failover verificables, usar VMs/hosts dedicados conectados por WireGuard.

Cada gateway usa secreto distinto y una IP de túnel estable. La rotación crea una nueva versión, materializa el fichero secreto y reinicia coordinadamente el nodo; FreeRADIUS carga clientes al arrancar. Nunca pasar secretos como argumentos CLI o variables visibles.

En RouterOS, HotSpot debe tener `use-radius` y accounting activos; el perfil debe usar `radius-interim-update=received` para respetar `Acct-Interim-Interval`. Un usuario local con el mismo nombre evita la consulta RADIUS y debe detectarse en preflight. El atributo `Class` se devuelve opaco y debe reaparecer en accounting.

## Límites deliberados

- `Port-Limit` sí se entrega. `Simultaneous-Use` no es reply y su comprobación server-side depende de la proyección de sesiones de PR10.
- PAP frente a CHAP sigue `BLOCKED_BY_LAB_VALIDATION`. El seed usa `Cleartext-Password` solo para comparar ambos caminos; no decide almacenamiento productivo.
- `Mikrotik-Total-Limit` y Gigawords están en el diccionario oficial, pero fuera de la allowlist y del compilador.
- La orientación de Input/Output se conserva como `nas_input_octets`/`nas_output_octets`.
- El script de Disconnect/CoA exige una bandera explícita de laboratorio, destino, sesión y usuario. No constituye soporte: L16/L17 debe fijar selector y registrar ACK/NAK contra RouterBOARD.
- CoA queda parametrizado solo a 1700 o 3799. RouterOS usa 1700 por defecto; 3799 exige cambio explícito extremo a extremo.

## Rollback

La imagen anterior se recupera por digest. Restaurar el secreto de clientes anterior y reiniciar devuelve la lista NAS previa. No se revierten ni borran filas de inbox; cualquier cambio productivo de esquema usa roll-forward. En router de laboratorio, restaurar el export/backup previo. PR05 no autoriza cambios en routers de producción.
