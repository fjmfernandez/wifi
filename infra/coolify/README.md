# Despliegue de WiFi ENTELSAT en Coolify

Esta plantilla despliega el plano web en una única pila Docker Compose. No publica PostgreSQL, Redis, la API ni el worker directamente; el panel y el portal consumen `/api/v1` mediante su proxy interno de mismo origen.

## Dominios

En Coolify, crea una aplicación desde Git con estos valores exactos:

- **Build Pack**: `Docker Compose` (no `Dockerfile` ni `Nixpacks`);
- **Branch**: `main`;
- **Base Directory**: `/`;
- **Docker Compose Location**: `/infra/coolify/compose.production.yml`;
- **Raw Compose Deployment**: desactivado;
- **Connect to Predefined Network**: desactivado.
- **Include Source Commit in Build**: activado.

El repositorio no contiene un `Dockerfile` en la raíz porque la aplicación está formada por siete servicios. Si el log muestra `open Dockerfile: no such file or directory`, el recurso se creó con el Build Pack incorrecto: cámbialo a Docker Compose o crea de nuevo el recurso con los valores anteriores.

El `build.context` de los servicios debe permanecer como `.`. Coolify ejecuta Compose con `--project-directory` apuntando a la raíz importada del repositorio; usar `../..` haría que Docker buscase `/infra/docker/...` fuera del proyecto y fallase con `lstat /infra: no such file or directory`.

Cuando Coolify cargue el Compose, asigna:

- servicio `admin`, puerto interno `3000`: `https://wifi.entelsat.com:3000`;
- servicio `captive`, puerto interno `3002`: `https://captive.wifi.entelsat.com:3002`.

El puerto indica a qué puerto interno debe dirigir Coolify; el navegador seguirá usando HTTPS 443. No asignes dominio ni puerto público a `api`, `worker`, `migrate`, `postgres` o `redis`.

Coolify crea y conecta automáticamente la red privada de la pila. No añadas redes personalizadas desde la interfaz; los servicios sin dominio ni `ports` publicados permanecen internos.

## Variables y secretos

Carga todas las variables de `.env.example` desde el almacén de secretos de Coolify. Cada rol PostgreSQL y cada finalidad criptográfica usa un secreto distinto. Usa valores aleatorios codificados como Base64 URL-safe, nunca frases. `SOURCE_COMMIT` debe ser el SHA desplegado, no `latest` ni un nombre de rama.

## Orden de puesta en marcha

1. Configura DNS `A/AAAA` de `wifi.entelsat.com` y `captive.wifi.entelsat.com` hacia Coolify.
2. Crea la pila sin desplegar y carga secretos.
3. La tarea `migrate` usa exclusivamente `wifi_bootstrap`, crea o rota los logins runtime y aplica migraciones antes de arrancar la API y el worker. `wifi_migrator` es un rol interno `NOLOGIN`; la API y el worker nunca reciben el secreto bootstrap.
4. Despliega y exige healthchecks verdes antes de enrutar tráfico.
5. Verifica `/api/v1/health/live` y `/api/v1/health/ready` a través de ambos orígenes.
6. Crea la primera cuenta de administración (ver más abajo). Sin ella no hay forma de entrar al panel.
7. Mantén FreeRADIUS A/B en dominios de fallo distintos, por WireGuard; no abras UDP RADIUS ni gestión MikroTik a Internet.

## Primera cuenta de administración

La pila no crea ningún usuario: `migrate` sólo aplica el esquema y rota los logins de PostgreSQL. La cuenta inicial se crea una vez, como tarea puntual sobre el contenedor `api` ya desplegado. El secreto `wifi_bootstrap` se pasa sólo a este comando; la API nunca lo recibe en su entorno.

```bash
docker compose -f infra/coolify/compose.production.yml exec \
  -e BOOTSTRAP_DATABASE_URL="postgresql://wifi_bootstrap:$POSTGRES_BOOTSTRAP_PASSWORD@postgres:5432/wifi_entelsat" \
  -e BOOTSTRAP_TENANT_SLUG=entelsat \
  -e BOOTSTRAP_TENANT_NAME="ENTELSAT" \
  -e BOOTSTRAP_ADMIN_EMAIL=entelsat@entelsat.com \
  -e BOOTSTRAP_ADMIN_PASSWORD='<contraseña de 12 caracteres o más>' \
  -e DATA_ENCRYPTION_KEY_VERSION=env-v1 \
  api node dist/cli/bootstrap-admin.js --show-secrets-once
```

La URI TOTP y los códigos de recuperación se imprimen una única vez: guárdalos antes de cerrar la consola. El comando es idempotente, así que una segunda ejecución informa de que el bootstrap ya se aplicó y no rota ni vuelve a mostrar secretos. `ADMIN_REQUIRE_MFA` está en `true`, de modo que el login exige el segundo factor desde el primer acceso.

El worker arranca solo la cola duradera `accounting`. Si se configura una cola sin handler de producción, su readiness queda en `503`; no confirma trabajos sin haber realizado el efecto real.

No cambies `RADIUS_CREDENTIAL_MODE=blocked` hasta adjuntar la evidencia del laboratorio físico para el modo elegido. El portal seguirá fallando cerrado en vez de guardar un verificador inseguro por accidente.

## Copias y continuidad

- Habilita PITR de PostgreSQL y copia cifrada fuera del host; prueba restauración mensualmente.
- Usa almacenamiento S3 en región UE para exportaciones y backups, con versionado, lifecycle y credenciales de mínimo privilegio.
- Redis no es fuente de verdad. Ante su pérdida se reconstruyen colas desde outbox/inbox.
- Las sesiones ya autorizadas deben continuar con la política aplicada. Los nuevos logins fallan cerrados si el plano AAA no está disponible.

## Puertas de producción

El despliegue técnico no elimina `BLOCKED_BY_LAB_VALIDATION` (RouterBOARD, CNA iOS/Android/Windows, PAP/CHAP, cuotas, CoA) ni `BLOCKED_BY_LEGAL_REVIEW` (textos, retención, responsables y subencargados).
