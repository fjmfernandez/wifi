# Matriz de validación PR05

Los casos automáticos prueban el contrato y el simulador. Solo la columna “físico” permite cambiar un estado `BLOCKED_BY_LAB_VALIDATION`.

| ID  | Caso                                | Automatizable aquí                                           | Evidencia CHR                           | Evidencia RouterBOARD física | Gate                        |
| --- | ----------------------------------- | ------------------------------------------------------------ | --------------------------------------- | ---------------------------- | --------------------------- |
| R01 | Arranque, versión y `freeradius -C` | imagen informa 3.2.10 y health verde                         | log/commit/digest                       | mismo artefacto              | obligatorio                 |
| R02 | Cliente exacto + secreto incorrecto | válido acepta; secreto distinto no recibe respuesta          | pcap sin `bad-replies` válido           | repetir por WireGuard        | obligatorio                 |
| R03 | Message-Authenticator               | `radclient -b` y cliente `require_message_authenticator=yes` | RouterOS `yes-for-request-resp`         | modelo/versión objetivo      | obligatorio                 |
| R04 | Binding NAS                         | NAS correcto acepta; `NAS-Identifier` vecino rechaza         | identidad real                          | identidad real               | obligatorio                 |
| R05 | PAP                                 | lab seed acepta PAP                                          | HTTPS externo + PAP                     | navegador/CNA real           | `BLOCKED_BY_LAB_VALIDATION` |
| R06 | CHAP                                | lab seed acepta CHAP con `Cleartext-Password`                | flujo CHAP                              | navegador/CNA real           | `BLOCKED_BY_LAB_VALIDATION` |
| R07 | Rate/time/idle                      | reply exacto visible                                         | cronómetro/tráfico                      | tolerancia por modelo        | obligatorio                 |
| R08 | Interim recibido                    | reply 300 s                                                  | perfil `radius-interim-update=received` | intervalos observados        | obligatorio                 |
| R09 | Concurrencia                        | reply contiene `Port-Limit=1`, nunca `Simultaneous-Use`      | dos clientes                            | dos clientes reales          | obligatorio                 |
| R10 | Cuota total/Gigawords               | compilador y CHECK la rechazan                               | medir >4 GiB                            | corte físico                 | `BLOCKED_BY_LAB_VALIDATION` |
| R11 | Start/Interim/Stop                  | tres eventos; retransmisión exacta no duplica                | captura/DB                              | captura/DB                   | obligatorio                 |
| R12 | Dirección contadores                | conserva Input/Output sin semántica                          | tráfico asimétrico                      | tráfico asimétrico           | `BLOCKED_BY_LAB_VALIDATION` |
| R13 | Pérdida de SQL/Response             | sin SQL no hay ACK; al volver se deduplica                   | corte temporal                          | reintentos RouterOS          | obligatorio                 |
| R14 | `Class`                             | reply y accounting coinciden                                 | valor byte a byte                       | valor byte a byte            | obligatorio                 |
| R15 | Failover A→B                        | auth manual contra ambos                                     | orden/timeouts RouterOS                 | corte real de A              | obligatorio                 |
| R16 | Disconnect                          | script bloqueado salvo opt-in                                | ACK/NAK y sesión vecina                 | ACK/NAK y sesión vecina      | `BLOCKED_BY_LAB_VALIDATION` |
| R17 | CoA rate/timeouts                   | script bloqueado salvo opt-in                                | cambio y sesión vecina                  | cambio y sesión vecina       | `BLOCKED_BY_LAB_VALIDATION` |

Cada evidencia debe registrar modelo, serial anonimizado, RouterOS exacto, export antes/después, FreeRADIUS image digest, timestamp UTC, pcap sanitizado, logs, atributos request/reply y resultado esperado/observado. Nunca incluir shared secrets, `User-Password`, `CHAP-Password` ni PII.

Para L16/L17 prueba ambos puertos por separado, pero selecciona uno solo al certificar: 1700 es el default de `/radius/incoming`; 3799 es la asignación estándar habitual. Un ACK solo cuenta si se demuestra que la sesión objetivo cambió y una sesión vecina permaneció intacta.
