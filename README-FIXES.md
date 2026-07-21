# EcoPulseBack — correcciones críticas

Este paquete está corregido directamente sobre la versión enviada por el usuario.

## Cambios aplicados

- Socket.IO ya no acepta tokens falsos `dev:<userId>`; valida el mismo JWT que la API HTTP.
- CORS HTTP y Socket.IO usan `CORS_ORIGINS`/`APP_URL` y dejan de aceptar cualquier origen.
- Los JWT quedan restringidos a HS256, con soporte para issuer y audience.
- Se eliminan los secretos predeterminados del restablecimiento de contraseña.
- La firma del token de recuperación se compara con `timingSafeEqual`.
- Se rechazan tokens de recuperación con fecha futura o caducados.
- bcrypt utiliza `BCRYPT_ROUNDS`; `HASH` queda reservado para el HMAC determinista del correo.
- Validación de variables críticas al arrancar.
- Apagado limpio del servidor y Prisma.
- Docker multi-stage, ejecución como usuario sin privilegios y comando de producción correcto.
- `.gitignore`, `.dockerignore` y `.env.example` seguros.

## Instalación

```bash
cp .env.example .env
# Completa todas las variables obligatorias
npm ci
npm run build
npm start
```

## Variables obligatorias

`DATABASE_URL`, `JWT_SECRET`, `HASH`, `RESET_SECRET` y `RESET_PEPPER`.
Los cuatro secretos deben tener al menos 32 caracteres.

No cambies `HASH` en una base de datos existente: se usa para localizar los correos ya registrados.

## Socket.IO

Envía el JWT mediante una de estas formas:

```js
io(API_URL, {
  path: '/realtime',
  auth: { token: accessToken }
});
```

También se admite `Authorization: Bearer <token>` en entornos que permiten esa cabecera durante el handshake.

## Credenciales filtradas

Si alguna cuenta de servicio o secreto estuvo publicado anteriormente, revócalo/rotalo. Añadirlo a `.gitignore` no invalida una credencial ya expuesta.
