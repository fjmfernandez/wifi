# WPass — puerta de decisiones antes del código

**Estado:** pendiente de aprobación  
**Fecha de referencia:** 2026-08-15  
**Regla:** no iniciar PRs de implementación hasta cerrar las decisiones 1–8. Las decisiones 9–10 pueden aprobarse con el valor recomendado y revisarse antes de staging.

Este documento reduce la especificación a diez decisiones que cambian el modelo de datos, la topología, la seguridad o el criterio de aceptación. Los valores recomendados permiten avanzar, pero no sustituyen la decisión del responsable de producto, del responsable de red ni la revisión jurídica.

## Cómo aprobar

En cada pregunta, completar **Decisión**, **Responsable** y **Fecha**. Una decisión distinta de la recomendada debe indicar el impacto aceptado. La aprobación conjunta mínima es:

- producto/negocio para 1–4 y 6;
- arquitectura/red para 2, 3, 5 y 6;
- DPO/asesoría jurídica para 1, 7–9;
- operaciones/soporte para 5, 6 y 10.

## 1. Frontera de tenant y responsable del tratamiento

**Pregunta:** ¿qué entidad constituye un tenant y quién determina finalidades y medios del tratamiento?

**Recomendación:** un tenant por cliente contractual que actúa como responsable del tratamiento; sus cadenas u organizaciones viven debajo del tenant. ENTELSAT actúa normalmente como encargado. Un partner futuro solo accede mediante asignaciones RBAC explícitas, nunca por herencia automática.

**Por qué bloquea:** define aislamiento, contratos, claves de cifrado, espacio de identidad, exportaciones, borrado y facturación.

**Decisión:** _pendiente_  
**Responsable:** _pendiente_  
**Fecha:** _pendiente_

## 2. Piloto, topología y capacidad objetivo

**Pregunta:** ¿el primer piloto será hotel, evento o empresa; cuántas sedes, gateways y sesiones concurrentes debe aceptar?

**Recomendación:** hotel de una sede; MikroTik siempre es el gateway HotSpot; los AP Reyee/Aruba/Omada quedan fuera de la gestión radio del MVP. Dimensionar laboratorio y staging a **2× el pico previsto**, una vez comunicado el pico real.

**Por qué bloquea:** determina UX, hardware físico, carga, SLA, idiomas, criterios de aceptación y si PMS es realmente imprescindible.

**Decisión:** _pendiente_  
**Pico previsto:** _pendiente_  
**Responsable:** _pendiente_  
**Fecha:** _pendiente_

## 3. Herencia cuando una sede pertenece a varios grupos

**Pregunta:** ¿cómo se resuelven configuraciones contradictorias entre tenant, organización, grupos y sede?

**Recomendación:** cada sede tiene como máximo un `config_parent_group_id`; los demás grupos son clasificación. Precedencia determinista: **sede > grupo padre > organización > tenant**. Toda publicación muestra diff efectivo y origen de cada valor.

**Por qué bloquea:** sin una regla única no pueden diseñarse constraints, previews, auditoría ni acciones masivas fiables.

**Decisión:** _pendiente_  
**Responsable:** _pendiente_  
**Fecha:** _pendiente_

## 4. Métodos incluidos y exclusiones reales del MVP

**Pregunta:** ¿qué métodos son obligatorios para aceptar el primer hito y exige el piloto PMS o pagos?

**Recomendación:** click-through, captura de email y PIN/voucher. La verificación OTP por email es un método distinto y no debe obligar a abrir webmail en el walled garden; se añade solo si el piloto aporta un flujo CNA viable. PMS, pagos, SMS, login social, campañas y TPV quedan fuera del primer hito. Si el piloto no puede aceptarse sin PMS, debe nombrarse ahora el PMS y replanificarse el alcance.

**Por qué bloquea:** PMS y pagos añaden proveedores, contingencia, contratos, datos personales y pruebas que no caben como “detalle” del flujo base.

**Decisión:** _pendiente_  
**PMS del piloto, si aplica:** _pendiente_  
**Responsable:** _pendiente_  
**Fecha:** _pendiente_

## 5. Matriz soportada de RouterOS, hardware y autenticación

**Pregunta:** ¿qué versiones y dos modelos físicos se certificarán, y se aprobará HTTPS/PAP o CHAP?

**Recomendación:** probar CHR y, como mínimo, el modelo real del piloto más un modelo mínimo soportado. Candidatos de laboratorio: RB5009UG+S+IN y hAP ax³; añadir CCR2004 solo si corresponde al piloto. Comparar RouterOS 7.21.5 long-term y 7.23.2 stable. Priorizar `login-by=https` + PAP con credencial efímera y verificador no reversible; CHAP queda como alternativa solo si el laboratorio la exige.

**Estado técnico:** `BLOCKED_BY_LAB_VALIDATION`.

**Por qué bloquea:** CHAP necesita material equivalente a contraseña clara en FreeRADIUS; cuotas, CoA, dirección de contadores y comportamiento CNA varían y no deben inferirse.

**Decisión:** _pendiente_  
**Modelos físicos:** _pendiente_  
**Responsable:** _pendiente_  
**Fecha:** _pendiente_

## 6. SLA, continuidad y dominio de fallo de RADIUS

**Pregunta:** ¿qué se promete cuando caen API, PostgreSQL, RADIUS, el túnel o la WAN de la sede?

**Recomendación:** sesiones ya autorizadas continúan según la política aplicada; nuevos logins fallan cerrados y muestran contingencia, nunca existe bypass global automático. Mantener un mecanismo explícito de emergencia con autorizaciones preemitidas y auditadas. Desplegar dos nodos FreeRADIUS fuera del mismo dominio de fallo del panel/Coolify, unidos por red privada.

**Valores que deben fijarse:** disponibilidad mensual, RTO, RPO, horario de soporte y tiempo máximo de conmutación RADIUS/WAN.

**Decisión:** _pendiente_  
**SLA/RTO/RPO:** _pendiente_  
**Responsable:** _pendiente_  
**Fecha:** _pendiente_

## 7. Modelo jurídico, región y subencargados

**Pregunta:** ¿se confirma cliente responsable/ENTELSAT encargado, alojamiento UE/EEE y qué proveedores pueden tratar datos?

**Recomendación:** datos y backups en UE/EEE; contrato de encargo por tenant; registro de subencargados; marketing solo con consentimiento separado. Realizar una evaluación de impacto antes de activar perfilado, localización aproximada o monitorización a gran escala.

**Estado:** `BLOCKED_BY_LEGAL_REVIEW`.

**Por qué bloquea:** cambia avisos, contratos, transferencias, borrado, cifrado y selección de proveedores.

**Decisión:** _pendiente_  
**DPO/asesoría:** _pendiente_  
**Fecha:** _pendiente_

## 8. Retención y consolidación de identidad

**Pregunta:** ¿durante cuánto tiempo se conserva cada clase y entre qué sedes puede unificarse una persona?

**Recomendación provisional:** logs de seguridad 30 días; accounting identificable 90 días; perfil 12 meses desde la última interacción; exportaciones 24 horas; backups 30 días. La unificación solo ocurre dentro del mismo `identity_space`, por defecto coincidente con el responsable del tratamiento. Nunca correlacionar globalmente MAC, email o teléfono.

**Estado:** `BLOCKED_BY_LEGAL_REVIEW`.

**Por qué bloquea:** condiciona particiones, jobs de borrado, backups, analítica y coste.

**Decisión:** _pendiente_  
**Tabla de retención aprobada por:** _pendiente_  
**Fecha:** _pendiente_

## 9. Acceso privilegiado de ENTELSAT, PII y exportaciones

**Pregunta:** ¿qué personal interno puede ver datos personales o material secreto?

**Recomendación:** ningún acceso permanente. Elevación JIT con tenant/sede, ticket, motivo, TTL, 2FA y reautenticación. Exportar PII exige permiso de recurso + `pii.export`, doble aprobación y descarga de un uso. Los secretos se rotan; no se muestran de forma ordinaria.

**Por qué bloquea:** define IAM, auditoría, soporte y responsabilidades ante abuso interno.

**Decisión:** _pendiente; puede aprobarse por defecto_  
**Responsable:** _pendiente_  
**Fecha:** _pendiente_

## 10. Revelado y reimpresión de vouchers

**Pregunta:** ¿“reimprimir” recupera el código anterior o rota el voucher?

**Recomendación:** revelado único y artefacto cifrado durante 15 minutos. Después se destruye el material recuperable; una reimpresión rota el código, revoca el anterior y deja evidencia. El hash/HMAC de validación permanece, nunca el código claro.

**Por qué bloquea:** una reimpresión ilimitada contradice el requisito de no almacenar secretos recuperables.

**Decisión:** _pendiente; puede aprobarse por defecto_  
**Responsable:** _pendiente_  
**Fecha:** _pendiente_

## Resultado de la puerta

| Decisión | Estado | Aprobador |
|---|---|---|
| 1. Tenant/controlador | Pendiente | — |
| 2. Piloto/capacidad | Pendiente | — |
| 3. Herencia | Pendiente | — |
| 4. Alcance de login | Pendiente | — |
| 5. Matriz RouterOS | Bloqueada por laboratorio | — |
| 6. SLA/continuidad | Pendiente | — |
| 7. Modelo jurídico | Bloqueada por revisión jurídica | — |
| 8. Retención/identidad | Bloqueada por revisión jurídica | — |
| 9. Acceso privilegiado | Pendiente | — |
| 10. Vouchers | Pendiente | — |

El código puede comenzar cuando 1–8 tengan decisión explícita y exista fecha reservada para completar las validaciones física y jurídica. La aprobación de diseño no equivale a validar RouterOS ni a dictamen legal.
