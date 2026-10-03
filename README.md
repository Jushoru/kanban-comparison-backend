# Kanban Comparison Backend

Независимый NestJS backend для исследования по сравнению **React + Capacitor** и **React Native**. 
```text
React + Capacitor ─┐
                  ├── HTTPS / JSON ── NestJS REST API ── pg / TLS ── Aiven PostgreSQL
React Native ─────┘
```

Клиенты знают только URL API. `DATABASE_URL` и сертификат БД хранятся на сервере. Пользователи здесь — статический справочник исполнителей и авторов комментариев; регистрация и аутентификация не входят в эксперимент.

## Требования

- Node.js **24 LTS** рекомендуется; также поддерживается Node.js 22.
- npm и доступ к уже созданной владельцем удалённой PostgreSQL в Aiven.
- Права PostgreSQL на создание таблиц/индексов для миграции и чтение/изменение данных для API.
- Docker нужен только для сборки и запуска production-образа.

## Локальная разработка

Все команды выполняются **из корня этого репозитория**.

```sh
npm ci
```

Скопируйте `.env.example` в `.env`:

```powershell
# PowerShell
Copy-Item .env.example .env
```

```sh
# Linux/macOS
cp .env.example .env
```

Заполните `.env` реальными значениями только на своей машине:

```dotenv
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
PORT=3000
DB_POOL_MAX=2
NODE_ENV=development
CORS_ORIGINS=
```

Используйте URI из Aiven; специальные символы в логине/пароле должны быть URL-encoded. Приложение отклоняет отсутствующий или некорректный URI, отключённый TLS, некорректный `PORT` и размер пула. `.env`, сертификаты, ключи и журналы исключены из Git и Docker build context. В репозитории нет действующих credentials.

```sh
npm run db:migrate
npm run db:seed
npm run start:dev
```

`start:dev` запускает Nest с наблюдением за исходниками. PostgreSQL используется непосредственно в Aiven; запуск контейнеров для разработки не нужен.

- API: [http://localhost:3000/api](http://localhost:3000/api)
- Swagger UI: [http://localhost:3000/docs](http://localhost:3000/docs)
- OpenAPI JSON: [http://localhost:3000/docs-json](http://localhost:3000/docs-json)
- Проверка соединения: [http://localhost:3000/api/health](http://localhost:3000/api/health)

Для запуска собранного приложения:

```sh
npm run build
npm start
```

HTTP-сервер слушает `0.0.0.0` и `PORT` (по умолчанию 3000). При завершении Nest закрывает общий пул. Пул подключается по требованию: Swagger доступен даже при временной недоступности БД; `/api/health` выполняет `SELECT 1`, отвечает `200` при успехе и `503` при ошибке. Health проверяет соединение, но не наличие миграций.

### TLS и CA Aiven

TLS всегда включён, проверка сертификата и имени сервера не отключается. URI с `sslmode=require` поддерживается; backend удаляет этот параметр перед передачей в `pg`, чтобы он не перезаписал настройки проверяемого TLS.

Если сертификат Aiven требует отдельного CA, скачайте его в консоли Aiven и передайте содержимое через дополнительную переменную `DB_SSL_CA`. В `.env` можно использовать строку с буквальными `\n`:

```dotenv
DB_SSL_CA="-----BEGIN CERTIFICATE-----\nСОДЕРЖИМОЕ_CA\n-----END CERTIFICATE-----"
```

Если CA уже доверен Node.js, переменную можно не задавать. Поддерживаются также `sslmode=verify-ca` и `sslmode=verify-full`; в обоих случаях backend проверяет и CA, и имя сервера. Другие query-параметры URI отклоняются во избежание переопределения TLS. Значения соединения и внутренние ошибки PostgreSQL не возвращаются клиентам.

### CORS

В development/test разрешены `http`/`https` origins на `localhost`, `127.0.0.1` и `[::1]` с любым портом. В production используются только точные origins из списка через запятую:

```dotenv
CORS_ORIGINS=https://kanban.example.org,capacitor://localhost,http://localhost,https://localhost
```

Укажите только origins, фактически используемые вашими клиентами; без путей и завершающего `/`. `capacitor://localhost` и HTTP(S) localhost могут требоваться WebView в зависимости от конфигурации Capacitor. React Native обычно отправляет запросы без `Origin` — они разрешены. Swagger работает с origin самого backend. Пустой production-список не разрешает сторонним браузерным origins читать ответы. CORS не является аутентификацией.

## Структура

```text
src/
  database/           # единый pg.Pool, транзакции, CLI миграций/seed
  boards/             # доски и четыре начальных списка
  cards/              # CRUD, теги, исполнители, порядок и перемещения
  comments/
  users/
  tags/
  health/
  common/             # DTO параметров, ошибки и Swagger schemas
  config/             # проверка environment и CORS
  app.module.ts
  setup-app.ts
  main.ts
database/
  migrations/001_initial.sql
  seeds/001_reference_data.sql
test/
  postgres/           # отдельные интеграционные тесты удалённой PostgreSQL
Dockerfile
.dockerignore
.env.example
package.json
package-lock.json
tsconfig.json
tsconfig.build.json
```

Контроллеры обрабатывают HTTP и делегируют работу services. SQL находится в services, отдельном модуле выборок карточек и инфраструктуре БД. Все значения из запросов передаются через `$1`, `$2`, …; даже сортировка использует параметры в `CASE`, а не вставку пользовательского текста в SQL. Статические SQL-файлы миграций и seed выполняются как доверенный исходный код.

## Миграции и начальные данные

```sh
npm run db:migrate
npm run db:seed
```

`db:migrate` создаёт на пустой БД семь предметных таблиц: `boards`, `lists`, `cards`, `comments`, `users`, `tags`, `card_tags`. Сохраняются типы исходной модели (`text` IDs, `timestamp` для времени), внешние ключи и правила `CASCADE` / `SET NULL`. Добавлены индексы для внешних ключей, положения и времени создания. Составные уникальные индексы `(board_id, position)` и `(list_id, position)` одновременно обслуживают выборки по родителю и порядку.

Дополнительно создаётся техническая таблица `schema_migrations` с именем, SHA-256 и временем применения миграции. Это журнал миграций, не предметная сущность. Таблицы/схемы `auth`, `neon_auth`, `pgrst` не создаются. Runner не выполняет импорт или очистку чужих схем.

Повторный запуск миграции безопасен: применённые файлы пропускаются, изменение/удаление применённой миграции приводит к ошибке. Добавляйте следующие файлы по порядку, например `002_description.sql`. Переводы строк Windows/Linux нормализуются перед подсчётом checksum. Вся пачка выполняется одной транзакцией; PostgreSQL advisory lock защищает от параллельного запуска миграций и seed.

Seed использует фиксированные IDs и UPSERT:

| Пользователи | Теги |
| --- | --- |
| `user-alex` — Алексей | `tag-feature` — Feature |
| `user-maria` — Мария | `tag-bug` — Bug |
| `user-ivan` — Иван | `tag-research` — Research |
| | `tag-priority` — Priority |

Повторный seed восстанавливает эти справочные имена/цвета/даты без дубликатов, не удаляя доски, карточки или комментарии. Демонстрационная доска не создаётся автоматически: создайте её через Swagger. Это позволяет начинать оба эксперимента с одинаковых справочников и заданного клиентами сценария. Seed не является сбросом экспериментальных данных.

Миграции и seed **не запускаются при старте API**: выполните их отдельно перед публикацией ревизии.

## REST API

Все предметные маршруты имеют префикс `/api`. Тела запросов и ответов — JSON с `camelCase`; даты передаются в UTC. IDs — непрозрачные строки (новые сущности получают UUID). Точные DTO, nullable-поля, примеры, параметры и ошибки доступны в Swagger.

| Метод | Маршрут | Результат |
| --- | --- | --- |
| GET | `/api/health` | Проверка API и соединения с БД |
| GET | `/api/boards` | Список досок: `createdAt DESC`, затем `id ASC` |
| POST | `/api/boards` | Доска со списками Todo, In Progress, QA, Done |
| GET | `/api/boards/:id` | Доска, упорядоченные списки и карточки с тегами |
| GET | `/api/users` | Статические пользователи, по имени и ID |
| GET | `/api/tags` | Теги, по имени и ID |
| POST | `/api/cards` | Созданная карточка |
| GET | `/api/cards/:id` | Карточка с тегами |
| PATCH | `/api/cards/:id` | Обновлённая карточка |
| DELETE | `/api/cards/:id` | `204`, пустое тело |
| GET | `/api/cards/:id/comments` | Комментарии: `createdAt ASC`, затем `id ASC` |
| POST | `/api/cards/:id/comments` | Созданный комментарий |

Создание возвращает `201`, чтение и изменение — `200`. Несуществующая сущность/ссылка возвращает `404`, некорректные поля — `400`, конфликт — `409`, неожиданная ошибка сервера/БД — `500`. Формат ошибок: `{ "statusCode": 400, "message": ["..."], "timestamp": "..." }`; `message` может быть строкой. Stack trace, SQL и credentials в ответ не попадают.

Глобальный `ValidationPipe` использует `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Неизвестные поля отклоняются. Неявного преобразования строк в числа/boolean в JSON нет: `position: "1"` и `completed: "false"` невалидны. Пустые/пробельные названия запрещены. Лимиты: title 255, description 20 000, comment text 10 000, максимум 100 уникальных тегов, текстовые IDs до 200 символов.

### Пример сценария через Swagger

1. Выполните `POST /api/boards` с `{ "title": "Эксперимент", "description": "Общая доска" }`.
2. Скопируйте `lists[0].id` из ответа. Доска и все четыре списка создаются одной транзакцией, позиции списков — `0..3`.
3. Выполните `POST /api/cards`:

```json
{
  "listId": "ID_СПИСКА_TODO",
  "title": "Измерить холодный старт",
  "description": "Одинаковое устройство и сценарий",
  "assigneeId": "user-alex",
  "tagIds": ["tag-research"],
  "position": 0
}
```

4. Выполните `PATCH /api/cards/:id`, например:

```json
{
  "listId": "ID_СПИСКА_QA",
  "position": 0,
  "completed": true,
  "assigneeId": null,
  "tagIds": []
}
```

5. Добавьте комментарий: `POST /api/cards/:id/comments` с `{ "text": "Замеры готовы", "userId": "user-maria" }`.
6. Получите доску по её ID, при необходимости с `?sort=createdAt&direction=desc`.

### Порядок карточек и PATCH

- По умолчанию карточки внутри каждого списка выдаются по `position ASC`; списки всегда по `position ASC`.
- `GET /api/boards/:id?sort=position|createdAt&direction=asc|desc` меняет порядок выдачи карточек. При совпадении значений используется `id ASC`. Сортировка по дате не переписывает сохранённые позиции.
- Позиции всегда целые и непрерывные: `0..N-1`. При создании разрешено `0..N`; отсутствие позиции означает добавление в конец.
- При перемещении внутри списка позиция — конечный индекс `0..N-1`. При переносе в другой список — индекс вставки `0..N` целевого списка; без позиции карточка добавляется в конец. Позиции за пределами диапазона дают `400`.
- Можно переносить только между списками одной доски; другая доска даёт `409`. Отдельные операции над списками для заданного сценария не нужны.
- Пропущенные PATCH-поля сохраняются. `description: null` очищает описание; `assigneeId: null` снимает исполнителя; `tagIds: []` удаляет все связи с тегами. `tagIds` заменяет весь набор, а не добавляет к нему.
- `completed` независим от списка: перенос в Done не меняет флаг автоматически. Пустой PATCH отклоняется.
- Создание, изменение, перенос и удаление карточки выполняются в транзакции с блокировкой строки доски `FOR UPDATE`. Все API-записи на одну доску последовательно выполняются даже из разных экземпляров backend. Соседние позиции сдвигаются, а отложенное уникальное ограничение проверяет результат при COMMIT. Изменения разных досок могут выполняться параллельно.
- Поля PATCH применяются к состоянию, заново прочитанному после блокировки. Версионирования карточек нет: при изменении одного поля конкурирующими запросами побеждает последняя завершённая запись. При конфликте/тайм-ауте блокировки (`409`) клиент обновляет доску перед повтором.
- После изменения карточки клиент заново получает доску, чтобы увидеть все сдвинутые позиции. Чтение доски использует одну согласованную транзакционную snapshot.

## Проверки

```sh
npm run lint
npm run build
npm test
npm run test:smoke
```

Обычный `npm test` не требует сети, Aiven, Docker или локального PostgreSQL. Он проверяет HTTP-маршруты, валидацию, Swagger, CORS, сокрытие ошибок, параметры SQL, транзакции/откаты, runner миграций и инварианты перестановок. HTTP-тесты подменяют services, тесты транзакций подменяют `pg` — они не выдают эту проверку за выполнение SQL настоящей БД.

`test:smoke` после сборки по очереди запускает `node dist/main.js` и именно `npm run start:dev` на свободных портах, проверяет Swagger, OpenAPI, валидацию и ответ `503` при недоступной БД, затем останавливает только созданные им процессы. Используется заведомо недоступный тестовый URI без реальных credentials; рабочая БД не затрагивается. Это проверка запуска HTTP-сервера, а не интеграции с Aiven.

Для полной проверки SQL, индексов, каскадов, миграций, seed и конкурентных запросов используется отдельная команда:

```dotenv
# .env: отдельная удалённая тестовая БД, НЕ база с рабочими данными
TEST_DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/TEST_DATABASE?sslmode=require
# Если нужен CA, заполните также TEST_DB_SSL_CA в том же формате, что DB_SSL_CA.
```

```sh
npm run test:postgres
```

Этот набор требует `TEST_DATABASE_URL` и права `CREATE SCHEMA`. Он создаёт временную схему `kanban_test_<случайный ID>`, применяет настоящие SQL migrations, выполняет HTTP-сценарии через Nest и реальный `pg.Pool` размером 2, а затем удаляет только свою схему. Проверяются одновременные вставки, противоположные переносы, удаление, атомарный откат доски, сортировка, каскады и воспроизводимость seed. Отсутствующий URL приводит к явной ошибке, а не к незаметному пропуску тестов. При принудительном прерывании процесса временную схему может потребоваться убрать вручную.

## Docker: production image

Multi-stage Dockerfile использует Node.js 24 LTS, `npm ci`, `npm run build`, отдельную установку только production dependencies и запуск от пользователя `node`. Финальная команда — `node dist/main.js`. В образ не копируются локальные `.env`, сертификаты, dev dependencies или тесты.

Сборка под требуемую архитектуру:

```sh
docker build --platform linux/amd64 -t kanban-comparison-backend:local .
```

Локальный smoke-test образа с подключением к удалённой Aiven:

```sh
docker run --rm --name kanban-backend -p 8080:8080 --env-file .env -e NODE_ENV=production -e PORT=8080 kanban-comparison-backend:local
```

В другом терминале проверьте `/docs`, `/docs-json` и `/api/health` на `http://localhost:8080`. Например, в PowerShell:

```powershell
(Invoke-WebRequest http://localhost:8080/docs).StatusCode
(Invoke-RestMethod http://localhost:8080/docs-json).info
Invoke-RestMethod http://localhost:8080/api/health
```

Пример проверки production dependencies:

```sh
docker run --rm --entrypoint npm kanban-comparison-backend:local ls --omit=dev
```

Скомпилированные инструменты миграций включены в образ для отдельного ручного запуска при необходимости:

```sh
docker run --rm --env-file .env kanban-comparison-backend:local node dist/database/tools/migrate.js
docker run --rm --env-file .env kanban-comparison-backend:local node dist/database/tools/seed.js
```

Внутри production-образа используется скомпилированный CLI; команды `npm run db:migrate` / `db:seed` предназначены для checkout с установленными dev dependencies (`ts-node`).

## Подготовка к Yandex Serverless Containers

Владелец вручную подготавливает:

1. Aiven PostgreSQL, PostgreSQL URI, CA при необходимости и сетевой доступ из Yandex Cloud.
2. Yandex Cloud folder, Container Registry, контейнер и service account с правами чтения образа и вызова контейнера согласно выбранной схеме доступа.
3. Образ Linux AMD64, собранный по Dockerfile и загруженный в собственный Registry.
4. Environment/секреты ревизии: `DATABASE_URL`, при необходимости `DB_SSL_CA`, `DB_POOL_MAX=2`, `CORS_ORIGINS`, `NODE_ENV=production`. Не передавайте секреты через Docker build arguments.
5. Режим контейнера **HTTP server**. Yandex задаёт `PORT` сам; приложение уже слушает этот порт на `0.0.0.0`. Отдельный веб-сервер не нужен.
6. Запуск миграций и seed перед отправкой клиентского трафика, затем проверку публичного/доступного клиентам HTTPS URL на `/api/health`, `/docs` и `/docs-json`.
7. Одинаковый API base URL (`https://<backend>/api`) в обеих клиентских реализациях.

Размер пула — **на один экземпляр контейнера**. Для лимита соединений учитывайте `число одновременно работающих экземпляров × DB_POOL_MAX`, запас на миграции/администрирование и перекрытие ревизий. Ограничьте масштабирование под фактический лимит Aiven. Параметры ревизии, датасет и порядок измерений фиксируйте одинаково для обеих технологий.

Создание облачных ресурсов, IAM, загрузка образа и GitHub-настройки не выполняются этим проектом. API не содержит аутентификации; выбранный владельцем способ вызова контейнера должен соответствовать закрытому или публичному эксперименту.

## Официальные материалы

- [NestJS: ValidationPipe](https://docs.nestjs.com/techniques/validation)
- [NestJS: Swagger/OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [node-postgres: TLS и параметры connectionString](https://node-postgres.com/features/ssl)
- [Aiven: подключение из Node.js с проверкой CA](https://aiven.io/docs/products/postgresql/howto/connect-node)
- [Yandex Serverless Containers: runtime, AMD64 и PORT](https://yandex.cloud/en/docs/serverless-containers/concepts/runtime)
- [Node.js: версии LTS](https://nodejs.org/en/about/previous-releases)
