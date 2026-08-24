# WPass HotSpot template para MikroTik

Esta carpeta replica el concepto de Hotelinking, pero con marca y flujo propio de WPass.

## Uso rápido

1. Copia la carpeta `hotspot` completa al MikroTik.
2. En el perfil HotSpot selecciona:
   - `HTML Directory`: `hotspot`
   - `Login By`: `HTTP PAP`, `HTTP CHAP`, `HTTPS` y `MAC Cookie`
   - `HTTP Cookie Lifetime`: el tiempo que quieras mantener recordado el dispositivo
3. Sustituye en `hotspot/login.html`:
   - `__GATEWAY_LOCATOR__` por el localizador generado en WPass para ese gateway.
   - `__CLIENT_NAME__` por el nombre visible del cliente.
   - `__TAGLINE__` por el texto corto del cliente.
   - `__PRIMARY_COLOR__` por el color principal en hexadecimal.
4. Cambia el logo local sustituyendo `hotspot/img/logo.svg`.

La personalización principal del portal final se gestiona desde WPass en “Portales”: logo, color,
textos y URL de redirección tras acceder a Internet.

