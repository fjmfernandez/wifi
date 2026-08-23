# API WPass

## Bootstrap inicial de tenant y administrador

La creación inicial se ejecuta como un job de despliegue aislado. Usa
exclusivamente la identidad PostgreSQL `wifi_bootstrap`; esa URL nunca debe
montarse en el contenedor runtime de la API.

Variables requeridas:

```text
BOOTSTRAP_DATABASE_URL=postgresql://wifi_bootstrap:...@postgres:5432/wifi
BOOTSTRAP_TENANT_SLUG=wpass
BOOTSTRAP_TENANT_NAME=WPass
BOOTSTRAP_ADMIN_EMAIL=administracion@example.com
BOOTSTRAP_ADMIN_PASSWORD=<secreto robusto de al menos 16 caracteres>
ADMIN_EMAIL_HMAC_KEY_BASE64=<misma clave de 32 bytes que usa la API>
DATA_ENCRYPTION_MASTER_KEY_BASE64=<misma clave de 32 bytes que usa la API>
DATA_ENCRYPTION_KEY_VERSION=env-v1
```

Opcionales: `BOOTSTRAP_DATA_REGION` (`eu-es`), `BOOTSTRAP_TIMEZONE`
(`Europe/Madrid`), `BOOTSTRAP_TOTP_ISSUER` (`WPass`) y
`BOOTSTRAP_TOTP_LABEL` (`Autenticador principal`).

Tras aplicar migraciones, ejecuta desde un terminal seguro:

```text
pnpm --filter @wifi/api bootstrap:admin -- --show-secrets-once
```

La confirmación explícita es obligatoria porque la salida contiene una URI
TOTP y diez códigos de recuperación. No copies esa salida a tickets ni logs
persistentes. La operación usa un advisory lock y una sola transacción: una
repetición exacta informa `already_exists` sin generar, rotar ni volver a
mostrar secretos; cualquier estado parcial o divergente aborta sin modificar
datos. Correo y TOTP quedan cifrados, el correo se indexa mediante HMAC, la
contraseña usa scrypt y los códigos de recuperación solo se guardan como HMAC.

El acceso normal sigue realizándose desde `https://wpass.es/`; la URI
bootstrap no forma parte de la superficie HTTP.
