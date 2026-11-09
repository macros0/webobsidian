# Установка WebObsidian в контейнере 102

Параметры установки `macros0/webobsidian` у владельца форка. Проверены 29 октября 2026 года.
Историческая инструкция `DEPLOYMENT.md` описывает чужую установку LXC 107 и для этого сервера не применяется.

## Сервер и доступ

| Параметр | Значение |
| --- | --- |
| Proxmox SSH | `root@10.10.1.21` |
| Proxmox UI | `https://10.10.1.21:8006` |
| LXC | `102`, Debian, amd64, hostname `docker` |
| Адрес приложения | `http://10.10.1.14:8787` |
| Пользовательский HTTPS-адрес | `https://selbst-obsidian.duckdns.org/` |
| Каталог установки внутри LXC | `/opt/webobsidian` |
| Compose project / контейнер | `webobsidian` / `webobsidian` |
| Compose | `/opt/webobsidian/docker-compose.yml` и `docker-compose.override.yml` |
| Настройки окружения | `/opt/webobsidian/.env`, содержит секреты, не выводить в логи |
| Локальный исходный код | `C:\Users\alexey\ai-workspace\webobsidian` |
| Репозиторий | `https://github.com/macros0/webobsidian` |

SSH-ключ на текущем компьютере:
`C:\Users\alexey\Documents\Codex\2026-10-22\https-github-com-xnohat-webobsidian-https\work\ssh\webobsidian_ct102_ed25519`.
Приватный ключ и пароли в Git не копировать. Ключ установлен для root на узле Proxmox;
команды внутри LXC выполнять через `pct exec 102 -- ...`.

```powershell
$ct102Key = 'C:\Users\alexey\Documents\Codex\2026-10-22\https-github-com-xnohat-webobsidian-https\work\ssh\webobsidian_ct102_ed25519'
ssh -i $ct102Key -o BatchMode=yes root@10.10.1.21 'pct status 102'
```

## Данные и ресурсы

- Synology: `10.10.1.5`, общая папка `\\DiskStation\obsidian\vaults`.
- В LXC NAS подключён по NFS 4.0 в `/mnt/obsidian`; vault: `/mnt/obsidian/vaults`.
- Bind mount Docker: `/mnt/obsidian/vaults` → `/vault`, чтение и запись.
  В Compose задан `create_host_path: false`, чтобы отсутствующий NAS не подменялся пустой папкой.
- App data: Docker volume `webobsidian_webobsidian-data` → `/data`.
  На хосте LXC: `/var/lib/docker/volumes/webobsidian_webobsidian-data/_data`.
- LXC: 4 CPU, RAM 1024 MiB, swap 1536 MiB. В нём также работают другие приложения.
- WebObsidian: RAM 384 MiB, memory+swap 768 MiB, CPU 0.75,
  `NODE_OPTIONS=--max-old-space-size=256`.
- Порт опубликован на `10.10.1.14:8787`; проверять этот адрес, а не loopback LXC.
- Для Nginx Proxy Manager: upstream scheme `http`, host `10.10.1.14`, port `8787`,
  WebSocket support включён; HTTPS завершается на прокси.

## Автозапуск и ожидание NAS

`webobsidian.service` использует `/opt/webobsidian` как WorkingDirectory:

- `RequiresMountsFor=/mnt/obsidian/vaults`;
- перед запуском проверяет mountpoint `/mnt/obsidian` и папку `vaults/.obsidian`;
- запускает `docker compose up -d --no-build`, останавливает `docker compose stop`.

`webobsidian-retry.timer` вызывает `webobsidian-retry.service`: первая попытка через 45 секунд
после загрузки, повтор через 60 секунд после завершения службы. Поздний старт Synology
не должен требовать ручного запуска приложения.

При плановом обслуживании сначала остановить timer, затем службу. После обслуживания
снова включить timer. Содержимое systemd units смотреть через `systemctl cat`.

## Обновление и откат

Собирать frontend и TypeScript локально (`npm run build`), затем устанавливать production
server dependencies в Linux Docker через `npm ci --omit=dev --workspace server`.
Не переносить Windows `node_modules` в Linux. В контекст установки нужны корневые
package/lockfile, manifests всех пяти workspaces и `server/dist`, `server/public`.
Полная frontend-сборка на LXC с 1 GiB RAM нежелательна.

Образы имеют неизменяемые теги по коммиту; для явно запрошенного развёртывания
незакоммиченной работы тег содержит базовый commit и SHA256 снимка исходников.
Фактический образ выбирается в
`docker-compose.override.yml`; изменение только `webobsidian:latest` не обновляет эту установку.
`DEPLOYED_REVISION` содержит полный SHA коммита либо базовый SHA и полный хеш снимка.

Перед переключением:

1. Проверить доступность NAS и наличие нового образа.
2. Сохранить старый image ID/тег, Compose, override, `.env`, `DEPLOYED_REVISION`.
3. Остановить retry timer и только контейнер WebObsidian.
4. Сделать согласованный архив `/data`. Backups хранятся в
   `/opt/webobsidian/backups/<UTC timestamp>/`, каталог mode 700, файлы mode 600.
   Это копия настроек/индексов, не резервная копия заметок на NAS.
5. Изменить тег в override и выполнить из `/opt/webobsidian`:
   `docker compose up -d --no-build --force-recreate webobsidian`.
6. Дождаться healthy, проверить build SHA, SPA/JS assets, авторизацию и сохранение настроек.
7. Возобновить retry timer.

При неуспехе восстановить `docker-compose.override.yml` и `DEPLOYED_REVISION` из backup,
затем повторить `docker compose up -d --no-build --force-recreate webobsidian`.
Возврат образа сам по себе не восстанавливает изменённые данные: архив `/data` хранить
отдельно. Не использовать `docker compose down -v`.

## Проверка состояния

### Установленная версия — русский перевод меню редактора, 9 ноября 2026

- Build `office-clipboard-fa2a7b532790`, image ID `sha256:0a0759f9f39bfd8c18ee782ce476673f164bdd013bf5a80caccc43748814c034`. Пакет `build/menu-russian-final-release/`.
- Заголовки контекстного меню используют действующий перевод: «Форматирование», «Абзац», «Вставка». Подписи уровней заголовков также переведены и меняются вместе с языком.
- Существующий серверный языковой пакет дополнен 29 недостающими строками до 981/981; все прежние 952 перевода сохранены. Исходный пакет сохранён локально в `build/menu-russian-release/language-before.json`.
- Backup `/opt/webobsidian/backups/office-clipboard-fa2a7b532790-20261109T151945Z`. Предыдущий образ `webobsidian:office-clipboard-fcdaad3de166` сохранён.
- Проверены production build, web typecheck, 25 тестов локализации/Office/команд редактора, изолированный Linux smoke, healthy/build, контрольные суммы SPA/assets и неизменность settings.json и `.env` при переключении. После перезагрузки HTTPS-страницы проверены русские подписи и раскрытие подменю «Абзац» с пунктами «Заголовок 1–6».
- Разделы Format/Paragraph/Insert присутствуют с 30 октября 2026 (commit `e3ba3fd`), до Office clipboard. Это подменю команд редактора; команды изменения документа недоступны в режиме чтения.

### Установленная версия — обмен с Office, 9 ноября 2026

- Build `office-clipboard-72988636e4e3`, image ID `sha256:c03e5d88ed0a58cdfce86f2fc12a51aa91de393231e90a31c7a27ca912ffaf5a`.
- Снимок frontend/переводов: `72988636e4e32d8d2c66d0002496d4b2a687bc6075b83cc776f238874175558b`, базовый commit `26dc8faa12ff95e6dfb6d75b65374fc61fdf07d6`. Локальный пакет `build/office-clipboard-release/`; серверная часть унаследована от `webobsidian:english-defaults-827418182aaf`.
- Backup `/opt/webobsidian/backups/office-clipboard-72988636e4e3-20261109T145436Z`: согласованный архив `/data`, Compose/override, `.env`, прежняя ревизия и идентификатор образа. Старый образ сохранён для отката.
- Проверены изолированный Linux smoke (auth, uploads, PDF/downloads, locks/CAS, SPA), healthy/build, контрольные суммы основных отдаваемых assets, неизменность settings.json и `.env`, NAS и активность service/retry timer. HTTP health подтверждён с рабочего компьютера. Локально прошли 9 профильных тестов, включая браузерный, и полный typecheck.
- Полный тестовый запуск: 398 server PASS, 3 SKIP; 529 web PASS и один сбой public PDF/Canvas из-за отсутствующего локального `server/public`. После копирования проверенных 467 frontend-файлов установленного пакета в этот каталог повторный public PDF/Canvas-тест PASS. Таким образом, все 530 web-сценариев прошли, один — отдельным повтором; исходники тестов и приложения не изменялись.
- При подготовке освобождены кэши apt и неиспользуемый кэш сборки Docker старше недели; после установки свободно около 1,1 ГиБ.
- В графическом браузере приложение и заметка открываются. После входа через `https://selbst-obsidian.duckdns.org/` проверены режим чтения, выделение заголовка и команда Copy for Microsoft Office: приложение подтвердило успешное копирование. На прямом HTTP-адресе команда сообщает отказ доступа к буферу; пользоваться HTTPS-адресом. Реальный обмен с настольными Word/Excel пока не проверен.

### Установленная версия — единый английский язык по умолчанию, 3 ноября 2026

- Build `english-defaults-827418182aaf`, commit `26dc8faa12ff95e6dfb6d75b65374fc61fdf07d6`, image ID `sha256:3a8196a516c356091abcb7d470e6394db425e2170940df74f53119ee6a2c393c`.
- Новая установка и сброс языка используют английские подписи PDF, меню файлов, сообщения редактора и уведомления о внешних изменениях независимо от языка браузера. Импортированный пользователем пакет продолжает определять выбранный язык.
- Production build и изолированный Linux smoke прошли. После переключения проверены healthy/build, контрольные суммы SPA/assets, доступность с рабочего компьютера и service/retry timer. Настройки приложения и `.env` совпали с резервной копией.
- Backup `/opt/webobsidian/backups/english-defaults-827418182aaf-20261103T070923Z`. Предыдущий образ `webobsidian:localization-4b2213c625cb` сохранён. Локальный пакет `build/english-defaults-release/`.

### Установленная версия — локализация с серверным хранением, 3 ноября 2026

- Build `localization-4b2213c625cb`, image ID `sha256:ecb46d016ea367397445b4203f3bad097ce15e3e86741096be6b6ee89628e0ec`.
- Settings → Language поддерживает пользовательский `.txt`, шаблон и сброс. Совместимые строки сохраняются на сервере и загружаются в браузерах после входа, при возвращении в окно и открытии настроек языка.
- Linux-образ собран из локальных production-артефактов с установкой server dependencies в Linux. Изолированный HTTP-тест проверил импорт, чтение другой авторизованной сессией, запись настроек, отклонение неверной версии пакета и сброс. Общий Linux smoke прошёл.
- Проверены healthy/build, контрольные суммы SPA и отдаваемых assets, доступность с рабочего компьютера и активность service/retry timer. Настройки и `.env` совпали с резервной копией.
- Backup `/opt/webobsidian/backups/localization-4b2213c625cb-20261103T054824Z`, предыдущий образ `webobsidian:canvas-flow-8a0c5da7bcf7` сохранён. Локальный пакет `build/localization-release/`. Рабочая копия развёрнута снимком без Git commit/push.

### Установленная версия — переносы текста и стрелки Canvas, 3 ноября 2026

- Build `canvas-flow-8a0c5da7bcf7`, image ID `sha256:0610b47718db92976c5c586eb61e31ae511994e4c3c1100941c708540405e26b`.
- Canvas использует шрифт 16px, гибкие вертикальные интервалы и наконечник с основанием 13px, длиной 10,4px и обводкой 1px.
- Все 516 web-тестов, production web build и изолированный Linux smoke прошли. Проверены healthy, build ID, совпадение отдаваемых файлов и настроек с резервной копией.
- Backup `/opt/webobsidian/backups/canvas-flow-8a0c5da7bcf7-20261103T002232Z`, предыдущий образ `webobsidian:pele-c8fe88d31202` сохранён. Локальный пакет `build/canvas-flow-release/`.

### Установленная версия — иконка сайта, 2 ноября 2026

- Build `favicon-a88455468a4a`, image ID `sha256:0ca49dacd783e37b7ec1799404e6442386538cc93e6ddf5b3feeb4e4ea80667c`.
- Добавлена официальная SVG-иконка Obsidian во вкладке браузера. Проверены production build, Linux smoke, healthy, SPA/asset hashes и совпадение настроек с backup.
- Резервная копия `/opt/webobsidian/backups/favicon-a88455468a4a-20261102T162308Z`, предыдущий образ `webobsidian:canvas-layout-332337470529` сохранён.
- Локальный пакет `build/favicon-release/`.

### Установленная версия — Canvas, 2 ноября 2026

- Build `canvas-layout-332337470529`, image ID `sha256:6650bcfac3e895d2e37a4b9d3b269d7944823f3a55ffbcb7fab36d85509f159d`.
- Исправлены отступы двухстрочной карточки 250×60, шрифт, рамка и штатная панель выбранной карточки. Начальный fit маленькой доски ограничен 100%.
- Три браузерных теста Canvas, production web build и изолированный Linux smoke прошли. Healthy, build ID, отдаваемые SPA/JS/CSS и совпадение настроек с резервной копией проверены.
- Резервная копия `/opt/webobsidian/backups/canvas-layout-332337470529-20261102T120623Z`. Предыдущий образ `webobsidian:canvas-layout-c31c06e2314e` сохранён.
- Локальный пакет `build/canvas-layout-final-release/`. Исходники развёрнуты как снимок рабочей копии. Commit и push не выполнялись.

### Установленная версия: цвет литералов и многострочные кавычки Live — 29 октября 2026

- Build: `cc8b061-worktree-a14ad1ae6b77`; source SHA256
  `a14ad1ae6b777d421a89c921b0225eb37ab1a85d899d33d2d54e2ad16e33b331`.
- Image ID: `sha256:c12aea787b1bef9bbc6248fb993410093974fd816f454acdf40e628c0cb9134b`.
- Backup: `/opt/webobsidian/backups/20261029T135417Z-literal-live/`; прежний образ сохранён.
- Включены обычный цвет `<LS_BEN>` во всех режимах и поведение многострочных
  парных backticks в Live, включая пустые строки, сверенное на точном примере.
- До выпуска: 188 server + 363 web PASS, 7 Windows skips; typecheck/build/HTTP smoke PASS.
  Пакет: 369 файлов, checksum архива проверена при передаче. После переключения
  проверены build/healthy, точные index/JS/CSS bytes, auth и service/retry timer;
  settings.json и .env совпадают с backup. Примечание: завершающая пустая CR-строка
  первоначального activate.sh дала ненулевой код уже после всех успешных проверок;
  окончания строк сценария исправлены, итог дополнительно проверен независимо.
- Локальный пакет: `build/deploy-ct102-live-span-final/`. Заметки на NAS не редактировались.


### Установленная версия: полный Editing Toolbar и параллельный рендеринг — 29 октября 2026

Повторная проверка по запросу развёртывания из чата рендеринга: все 159 текущих
runtime-исходников/manifests совпадают со снимком этого релиза (включая последние
исправления таблиц, compound headings и measured typography). Все runtime checksums,
image ID, healthy/build, отдаваемый index, auth/status и service/retry timer подтверждены.
Повторное переключение контейнера не требовалось; установленный код уже актуален.

- Build/image tag: `cc8b061-worktree-4b3d33dba0da`; базовый commit `cc8b061cfca326572e3af8e6b05e88e3b250d8fe` включает параллельную настройку CI.
- SHA256 снимка: `4b3d33dba0dafdab34975a7024b4f7c145d6a857afb0cc98b2bef1adcc0dcedc`.
- Image ID: `sha256:8b101cf909c292c2bb35bb0f7db73d18735e7e79695908c8e6b02b88d51287d2`.
- Релиз: `/opt/webobsidian/releases/cc8b061-worktree-4b3d33dba0da/`; runtime-пакет проверен по всем 369 контрольным суммам.
- Backup: `/opt/webobsidian/backups/20261029T133149Z-toolbar-full/`; сохранены data, settings, Compose/override, .env и предыдущая identity/image. Старый образ `webobsidian:ec98d13-worktree-c7914377d6f8` сохранён.
- Включены стандартный инвентарь64 панели, всплытия/палитры/формы, text tools/brush/cleanup, layouts/settings/import, а также законченные параллельные tables/fragments/transclusion/typography.
- Перед выпуском: 188 server +359 web PASS,7 Windows symlink skips; typecheck/build/desktop typecheck/build и disposable HTTP smoke PASS.
- После переключения: healthy и ожидаемый build, index/JS bytes, 401 защищённых API, auth/status, NAS, systemd service/retry timer PASS; settings.json и .env совпадают с backup.
- Пакет и сценарии локально: `build/deploy-ct102-toolbar-full/`. Исходный архив остался локально, на сервер передан runtime.
- Во время этой реализации Git commit/push не выполнялись; две параллельные CI-коммита учтены в идентичности сборки.


### Установленная версия: панель форматирования и `<LS_BEN>` — 29 октября 2026

- Версия приложения: `0.3.0`; build/image tag: `ec98d13-worktree-c7914377d6f8`.
- Базовый commit: `ec98d133d74b5635fbf1bc1f956f26f3d4291036`; поверх него установлен
  проверенный снимок незакоммиченных изменений. Git commit/push не выполнялись.
- SHA256 снимка исходников: `c7914377d6f835b97819a3b14e6985aa8e859f49bfabf2d29c4e78926edf81d7`.
  Полная идентичность записана в `DEPLOYED_REVISION`, состав — в `release.json` каталога релиза.
- Образ: `webobsidian:ec98d13-worktree-c7914377d6f8`, image ID
  `sha256:359a4c4cbf09ba5f49d22baebf21f92a83064b4e03320b2e7cb43fa6e0fc5850`.
- Каталог runtime-пакета и сценарий этого перехода:
  `/opt/webobsidian/releases/ec98d13-worktree-c7914377d6f8/`.
  Передан только runtime-пакет; полный архив исходников хранится локально в
  `build/deploy-ct102/source.tar.gz`. Windows-зависимости на сервер не переносились.
- В релиз вошли цвета текста/фона, палитра и плавающая панель выделения, а также
  параллельное исправление исчезающего `<LS_BEN>` в Live/Reading без изменения заметок.
- Backup перед переключением: `/opt/webobsidian/backups/20261029T113133Z-toolbar/`.
  Содержит согласованный `data.tar.gz`, прежние Compose/override, `.env`,
  `DEPLOYED_REVISION` и `previous-image.txt`; каталог 700, файлы 600.
- Предыдущий образ `webobsidian:ec98d13` сохранён для отката. Для возврата использовать
  override и `DEPLOYED_REVISION` из указанного backup; архив `/data` восстанавливать
  только отдельным осознанным действием, так как после обновления могли появиться новые настройки.
- Проверены healthy, build, совпадение SPA/JS с пакетом, 401 на закрытых API без сессии,
  auth/status, полное совпадение settings.json и `.env` с backup, NAS, systemd service
  и retry timer, доступность с рабочего компьютера. Совместные браузерные регрессии обеих
  доработок: 27 тестов PASS; перед упаковкой полный набор 186 server + 205 web PASS.

### Предыдущая версия на 29 октября 2026

- Версия приложения: `0.3.0`; build: `ec98d13`.
- Commit: `ec98d133d74b5635fbf1bc1f956f26f3d4291036`.
- Образ: `webobsidian:ec98d13`, image ID
  `sha256:ffdf331c5e2913149bd820210b72d8058b51ef2edc7a66e76e5fcfae16b1366a`.
- Пакет и runtime Dockerfile: `/opt/webobsidian/releases/ec98d13/`.
  `activate.sh` в этой папке — журналируемый сценарий этого перехода, привязан к старому тегу;
  не использовать его без адаптации для следующих обновлений.
- Backup перед обновлением: `/opt/webobsidian/backups/20261029T101930Z/`.
- Старый образ: `webobsidian:c41967a93317`; дополнительный тег `webobsidian:rollback-20261029`.
- Проверены healthy, ожидаемый SHA, SPA и JS bundle, отказ API без авторизации,
  доступность с рабочего компьютера, NAS и retry timer. Auth/Git settings, путь vault
  и `.env` совпали с резервной копией; автоочистка корзины отключена.
- Копия этой инструкции на сервере: `/opt/webobsidian/INSTALLATION_CT102.md`.

### Команды

Команды ниже выполнять внутри LXC 102:

```bash
docker inspect webobsidian --format '{{.Config.Image}} {{.State.Health.Status}}'
docker exec webobsidian wget -qO- http://127.0.0.1:8787/healthz
curl -fsS http://10.10.1.14:8787/healthz
systemctl is-active webobsidian.service webobsidian-retry.timer
mountpoint /mnt/obsidian
cat /opt/webobsidian/DEPLOYED_REVISION
```

Source-fork GitHub Actions deploy для LXC 107 в этом форке отключён условием repository.
Обновление этой установки выполняется по SSH; существующие deploy-скрипты с defaults
`/root/webobsidian` и LXC 107 напрямую здесь не запускать.
