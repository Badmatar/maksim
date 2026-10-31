# Бот не отвечает: проверка без раскрытия секретов

Если токен оказался на скриншоте/в чате, сначала отзовите его в BotFather (/revoke), получите новый, замените BOT_TOKEN в GitHub Repository secrets и Vercel Production, выполните новый deploy и установите webhook заново. Не вводите токен обычным сообщением в чат бота. Реальные значения токенов не нужны для обсуждения ошибок.

В GitHub Actions → Production setup → Run workflow → main доступна операция diagnostics. Дождитесь публикации коммита, добавившего диагностический маршрут, иначе будет 404. Нужны уже используемые Repository secrets BOT_TOKEN, WEBHOOK_SECRET и APP_URL. APP_URL должен быть https://maksim-seven.vercel.app (либо актуальный production-домен владельца), WEBHOOK_SECRET должен совпадать с Vercel.

Операция делает только read-only проверки: getMe/getWebhookInfo Telegram, GET health и защищённый GET /api/telegram/diagnostics. Она не запускает worker, не выдаёт доступы и не отправляет сообщения. Диагностический endpoint защищён WEBHOOK_SECRET, отвечает без кеширования и выдаёт только признаки наличия переменных, количества задач, системный статус планировщика и категории ошибок. Тексты сообщений, payload задач, пользователи, исходные ошибки и значения секретов не возвращаются.

Откройте этап Diagnose Telegram connection (read only), даже если весь workflow зелёный. Смотрите issues и warnings:

- BOT_TOKEN is missing in Vercel: токен задан только в GitHub. Добавьте его также в Vercel Production и redeploy.
- WEBHOOK_SECRET differs: сохраните одно и то же значение в GitHub и Vercel, redeploy и операция webhook.
- webhookMatchesApp=false: webhook не установлен либо указывает на старую публикацию. Перезапустите операцию webhook с правильным APP_URL.
- Разные имена ботов: GitHub BOT_TOKEN и NEXT_PUBLIC_BOT_USERNAME относятся к разным ботам.
- No completed scheduler run: сохраните и включите минутное задание cron-job.org, проверьте URL /api/cron и заголовок Authorization: Bearer CRON_SECRET.
- Статус планировщика старше 3 минут: проверьте историю cron-job.org и ошибки Vercel.
- failureTypes.BOT_TOKEN_missing_in_Vercel: ранее worker уже получал ошибку отсутствующего токена.
- telegram_authorization_error: проверьте актуальность BOT_TOKEN в Vercel после ротации.
- Старые failed-задачи сами не перезапускаются. После устранения причины отправьте новую команду /start и проверьте новые задачи; старые задачи восстанавливаются отдельно ответственным администратором с учётом возможной повторной доставки.

ok=true означает, что перечисленные проверки конфигурации прошли, но warnings могут указывать на остановившийся планировщик или старые ошибки. Полное подтверждение работы — новое сообщение /start, свежий завершившийся запуск планировщика и фактический ответ в Telegram. Проверка токена в GitHub не доказывает, что такой же токен сохранён в Vercel.
