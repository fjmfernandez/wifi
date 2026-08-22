# ENTELSAT WiFi · FreeRADIUS + RouterBOARD por SSTP

## 1. Variables en Coolify

FreeRADIUS queda añadido al `infra/coolify/compose.production.yml` como servicio `radius`.

La app puede arrancar sin RouterBOARD real usando el cliente local por defecto. Para una prueba real, genera la línea desde el panel:

`wifi.entelsat.com/routerboard`

y pega el resultado en la variable de Coolify:

```env
RADIUS_CLIENTS_TSV=nombre_rb<TAB>ip_tunel_rb<TAB>secreto_radius
```

Ejemplo:

```env
RADIUS_CLIENTS_TSV=rb-prueba-001	10.255.0.2	xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Si hay varios routers, usa una línea por router:

```env
RADIUS_CLIENTS_TSV=rb-prueba-001	10.255.0.2	secret1
rb-hotel-002	10.255.0.3	secret2
```

Después redepliega en Coolify.

## 2. Puertos

El servicio publica:

- UDP `1812` para autenticación RADIUS.
- UDP `1813` para accounting RADIUS.

Para producción, permite esos puertos solo desde la red/túnel SSTP o desde IPs concretas. No los dejes abiertos a Internet sin firewall.

## 3. SSTP

El RouterBOARD se conecta como `SSTP Client` hacia tu servidor VPN. El panel genera el script RouterOS con:

- interfaz SSTP;
- ruta al servidor RADIUS por el túnel;
- secreto RADIUS;
- `system identity` igual al `NAS Identifier`;
- perfil HotSpot con `use-radius=yes`;
- walled garden hacia `captive.wifi.entelsat.com`.

## 4. Portal cautivo

La pantalla también genera `login.html`. Súbelo al MikroTik en:

```text
Files / hotspot / login.html
```

Ese HTML envía al portal:

```text
https://captive.wifi.entelsat.com/api/v1/captive/session/start
```

y usa un `gatewayLocator` seguro generado por la API.
