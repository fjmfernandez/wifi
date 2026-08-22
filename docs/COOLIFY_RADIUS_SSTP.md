# ENTELSAT WiFi · FreeRADIUS + RouterBOARD por SSTP

## 1. Variables en Coolify

FreeRADIUS queda añadido al `infra/coolify/compose.production.yml` como servicio `radius`.
El servidor SSTP queda añadido como servicio `sstp-vpn`.

La app puede arrancar sin RouterBOARD real usando el cliente local por defecto. Para una prueba real, genera la línea desde el panel:

`wifi.entelsat.com/routerboard`

y pega el resultado en la variable de Coolify:

```env
RADIUS_CLIENTS_TSV=nombre_rb<TAB>ip_tunel_rb<TAB>secreto_radius
SSTP_USERS_TSV=usuario_sstp<TAB>clave_sstp<TAB>ip_tunel_rb
```

Ejemplo:

```env
RADIUS_CLIENTS_TSV=rb-prueba-001	10.255.0.2	xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SSTP_USERS_TSV=rb-prueba-001	clave-larga-sstp	10.255.0.2
```

Si Coolify no conserva el tabulador al pegar, puedes escribir `\t` literalmente entre campos. El contenedor lo convertirá a tab real al arrancar.

Si hay varios routers, usa una línea por router:

```env
RADIUS_CLIENTS_TSV=rb-prueba-001	10.255.0.2	secret1
rb-hotel-002	10.255.0.3	secret2
SSTP_USERS_TSV=rb-prueba-001	clave-larga-1	10.255.0.2
rb-hotel-002	clave-larga-2	10.255.0.3
```

Después redepliega en Coolify.

## 2. Servidor SSTP

El servicio `sstp-vpn` publica TCP `4443` por defecto para no ocupar el `443` que usa Coolify/HTTPS.

Variables principales:

```env
SSTP_PUBLIC_HOST=62.84.190.174
SSTP_PORT=4443
SSTP_LOCAL_IP=10.255.0.1
SSTP_POOL=10.255.0.2-254
SSTP_CLIENT_IP_RANGE=0.0.0.0/0
```

Cuando tengas IP pública fija del RouterBOARD, puedes cerrar `SSTP_CLIENT_IP_RANGE`, por ejemplo `62.175.165.90/32`.

El contenedor crea `/dev/ppp` al arrancar y se ejecuta en modo privilegiado porque PPP/SSTP necesita acceso de red de bajo nivel. Aun así, si el kernel del VPS no tiene PPP cargado, ejecútalo una vez en el host:

```sh
modprobe ppp_generic
ls -l /dev/ppp
```

Abre en firewall solo:

- TCP `4443` desde Internet o desde las IPs de los routers.

## 3. RADIUS

El servicio `radius` queda interno en el compose:

- UDP `1812` para autenticación RADIUS.
- UDP `1813` para accounting RADIUS.

El RouterBOARD enviará RADIUS a `10.255.0.1` por el túnel SSTP; el contenedor `sstp-vpn` redirige esos paquetes al contenedor `radius`.

## 4. RouterBOARD por SSTP

El RouterBOARD se conecta como `SSTP Client` hacia tu servidor VPN. El panel genera el script RouterOS con:

- interfaz SSTP;
- ruta al servidor RADIUS por el túnel;
- secreto RADIUS;
- `system identity` igual al `NAS Identifier`;
- perfil HotSpot con `use-radius=yes`;
- walled garden hacia `captive.wifi.entelsat.com`.

El script usa:

```text
connect-to=62.84.190.174
port=4443
verify-server-certificate=no
```

Para producción estricta, sustituye el certificado autosignado por un certificado real y activa la verificación en RouterOS.

## 5. Portal cautivo

La pantalla también genera `login.html`. Súbelo al MikroTik en:

```text
Files / hotspot / login.html
```

Ese HTML envía al portal:

```text
https://captive.wifi.entelsat.com/api/v1/captive/session/start
```

y usa un `gatewayLocator` seguro generado por la API.
