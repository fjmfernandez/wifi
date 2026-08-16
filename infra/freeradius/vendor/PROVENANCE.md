# Procedencia del diccionario MikroTik

- Fuente primaria: <https://manual.mikrotik.com/assets/319783011_MikroTik_Vendor_attributes.txt>
- Página que enlaza el recurso: <https://manual.mikrotik.com/docs/authentication-authorization-accounting/radius/>
- Recuperado: 2026-08-16
- SHA-256 de la descarga oficial de 3328 bytes: `c2b7378c4e313e92dbb55116b50939d917535932b0b37b6d425affaae82ca37b`
- SHA-256 de este snapshot normalizado con salto LF final: `4efa0850b7b2fcfb5ef53ac961e9b642b4384fe023bf31b22dcabe0ca85e1bb4`

El Dockerfile sustituye `dictionary.mikrotik` incluido en la imagen por este snapshot. No se añaden aliases ni atributos locales. Los atributos de cuota total permanecen presentes porque pertenecen al diccionario oficial, pero no están permitidos en `radius_runtime.reply_attributes` mientras sigan `BLOCKED_BY_LAB_VALIDATION`.
