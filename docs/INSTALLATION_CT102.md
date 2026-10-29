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
