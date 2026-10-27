# MAKSIM MASHKOV · Digital Ecosystem

Telegram-бот и веб-панель управления практиками, продуктами, оплатами, сообществом и мероприятиями. Next.js 16, TypeScript, grammY (webhook), Prisma 6 с PostgreSQL driver adapter, Tailwind CSS и shadcn/ui Button. Авторизация — Telegram Login с серверной проверкой подписи и ролей.

## Запуск

```sh
npm ci
cp .env.example .env  # только если .env ещё нет; заполните значения
npm run db:generate
# Создайте локальную PostgreSQL БД либо docker compose up -d
npm run db:local     # только новая disposable БД на localhost
npm run db:seed
npm run dev
```

Worker запускается отдельно: `npm run worker`. В Vercel его вызывает защищённый минутный cron. Продакшен-миграции: `npm run db:deploy` с DIRECT_URL. Для тестов нужна отдельная TEST_DATABASE_URL с именем базы `_test`.

```sh
npm run typecheck
npm test
npm run build
```

[Развёртывание и переменные](docs/deployment.md) · [Руководство владельца](docs/owner-guide.md) · [Эксплуатация и резервирование](docs/operations.md) · [Приёмка и ограничения](docs/acceptance.md)

**Текущее состояние:** локальная реализация; production-бот, Neon, Vercel, мониторинг и реальные материалы ещё нужно подключить. Ручное подтверждение реализовано по ТЗ; перед продажей цифрового контента внутри Telegram необходимо учесть требования Telegram Stars. Квитанция не является доказательством банковского поступления.
