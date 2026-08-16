# Secretos locales del laboratorio

Ejecuta `scripts/init-lab-secrets.sh` desde Git Bash, WSL o Linux. Se crean cuatro archivos ignorados por Git con modo `0600`: contraseña owner de PostgreSQL, contraseña del rol `radius_runtime_login`, secreto RADIUS del NAS simulado y contraseña del usuario de prueba.

En staging/producción, Coolify o el orquestador debe montar equivalentes en `/run/secrets`. No se aceptan secretos por variables de entorno ni bloques `client` horneados en la imagen.
