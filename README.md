# EcoPulse API — Express + MySQL (Prisma)

Esto es una conversión del backend NestJS a **Express** manteniendo **Prisma**, pero cambiando la BD a **MySQL**.

## Requisitos
- Node 18+ (recomendado 20)
- MySQL 8 (o Docker)

## 1) Configuración rápida con Docker
```bash
cp .env.example .env
docker compose up -d --build
```

En otra terminal (o dentro del contenedor api) ejecuta migraciones:
```bash
# local (si tienes node en tu máquina)
npm install
npx prisma migrate dev --name init
```

> Si usas Docker, lo normal es ejecutar el comando en el contenedor:
```bash
docker compose exec api npx prisma migrate dev --name init
```

## 2) Local sin Docker
1. Levanta MySQL y crea la BD `ecopulse`.
2. Ajusta `DATABASE_URL` en `.env`.
3. Instala y migra:
```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

API en: `http://localhost:4000`

## Endpoints (igual que en Nest)
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (Bearer JWT)
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

- `GET /households` (Bearer JWT)
- `POST /households`
- `PATCH /households/:id`
- `DELETE /households/:id`
- `POST /households/:id/invites`
- `POST /households/join`
- `POST /households/join-by-code`
- `GET /households/:id/join-requests?status=PENDING|APPROVED|REJECTED`
- `POST /households/:id/join-requests/:reqId/approve`
- `POST /households/:id/join-requests/:reqId/reject`
- `GET /households/:id/members`

Ledger:
- `POST /households/:id/entries`
- `GET /households/:id/entries?from=...&to=...&limit=...`
- `GET /households/:id/summary?month=YYYY-MM`
- `PATCH /households/:id/entries/:entryId`
- `DELETE /households/:id/entries/:entryId`

Savings:
- `POST /households/:id/savings-goals`
- `GET /households/:id/savings-goals`
- `PATCH /households/:id/savings-goals/:goalId`
- `DELETE /households/:id/savings-goals/:goalId`
- `POST /households/:id/savings-goals/:goalId/txns`
- `GET /households/:id/savings-goals/:goalId/txns`
- `GET /households/:id/savings-goals/:goalId/summary`

Planned:
- `GET /households/:id/planned?month=YYYY-MM`
- `POST /households/:id/planned`
- `PATCH /households/:id/planned/:plannedId`
- `DELETE /households/:id/planned/:plannedId`
- `POST /households/:id/planned/:plannedId/settle`

Recurring:
- `GET /households/:id/recurring?month=YYYY-MM`
- `POST /households/:id/recurring`
- `PATCH /households/:id/recurring/:recurringId`
- `DELETE /households/:id/recurring/:recurringId`
- `POST /households/:id/recurring/:recurringId/post`

Devices:
- `POST /devices/register`

## Realtime (Socket.IO)
- Path: `/realtime`
- Mantiene el mismo "modo dev" del Nest: header `Authorization: Bearer dev:<USER_ID>`
- Emite eventos: `password_changed`, `join_request_new`, `join_request_decision`

> Si quieres que sea JWT real en sockets, dímelo y lo cambiamos.
