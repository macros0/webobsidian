# Развёртывание Remote MCP — 2026-10-30

- Сервер: SSH alias webobsidian-proxmox → Proxmox CT102, /opt/webobsidian, Compose webobsidian.
- Релиз/image: remote-mcp-cbc1128f6f94 / webobsidian:remote-mcp-cbc1128f6f94.
- Исходники и runtime: /opt/webobsidian/releases/remote-mcp-cbc1128f6f94.
- Переданный архив SHA256: cbc1128f6f94ee4dce8420ac0368c1c242cec7397f2c0fbf0a2f97781c1ccb10.
- Образ построен из предыдущего проверенного runtime webobsidian:drafts-conflicts-c7f32f904ca4 и нового полного JS bundle/SPA; новый MCP SDK включён в bundle. Linux preflight выполнен в отдельном контейнере без production mounts: login, scoped key, initialize, 10 tools, list_tags, отказ записи без write.
- Резервная копия: /opt/webobsidian/backups/remote-mcp-cbc1128f6f94-20261030T090054Z (data.tar.gz, .env, compose и override, revision).
- Сохранены mounts vault/data, параметры auth, лимиты памяти/CPU и образ предыдущего релиза. settings.json после активации побайтно совпадает с резервной копией. Тестовые заметки в production vault не создавались.
- В override включены WEBOBSIDIAN_MCP_ENABLED=true и WEBOBSIDIAN_MCP_PUBLIC_URL=https://selbst-obsidian.duckdns.org/mcp.
- Публичный healthz подтвердил новый build; GET /mcp без ключа даёт 401. Nginx Proxy Manager уже передаёт маршрут и публичный Host, менять прокси не потребовалось.
- DEPLOYED_REVISION обновлён. Коммитов/push не было.
- Perplexity: live connector ещё не настроен. Требуется ключ WebObsidian read+search и Remote / Streamable HTTP / API Key. Browser automation не смогла открыть вкладку в текущем Comet; дальнейшая настройка передана пользователю.

## Откат

Восстановить docker-compose.override.yml из указанного backup и выполнить docker compose up -d --no-build webobsidian в /opt/webobsidian. Образ предыдущего релиза сохранён. Для отключения только MCP выставить WEBOBSIDIAN_MCP_ENABLED=false в override и пересоздать сервис. Не восстанавливать data.tar.gz без отдельной причины, чтобы не откатить последующие пользовательские изменения.

## Диагностика Perplexity после развёртывания

- Пользователь подтвердил: официальный DeepWiki (`https://mcp.deepwiki.com/mcp`, без auth, Streamable HTTP) добавился. Поэтому общий отказ создания коннекторов не установлен; проверяем различия auth/адреса.
- При попытках WebObsidian POST `/rest/sources/custom` на стороне Perplexity отвечает HTML Cloudflare 502. В access/error журналах нашего proxy host нет соответствующих обращений Perplexity к `/mcp`; раскрытие ключа или изменение auth не выполнялось.
- Внешние проверки `/healthz` из Austria/Germany/Spain вернули 200; проверка через существующий VPN также 200. Google Public DNS возвращает ожидаемый public A, 77.37.160.76.
- Ожидается сравнительный тест: DeepWiki с API Key=`diagnostic-not-a-secret` (без настоящих credentials). Он отделит ошибку ветки API Key Perplexity от обработки конкретного URL. До результата причина 502 остаётся неизвестной.

## Независимая проверка публичного MCP — 2026-10-30

Официальный MCP SDK из рабочего компьютера успешно подключился к `https://selbst-obsidian.duckdns.org/mcp` с предоставленным пользователем ключом. Проверены отдельно Authorization: Bearer и X-API-Key: initialize PASS, server webobsidian 0.1.0, tools/list — все 10 инструментов, tools/call list_tags — 34 тега. Время полного сценария: 427 ms и 70 ms соответственно. Содержимое тегов/заметок и секреты не выводились. Записей в vault не выполняли. Временный локальный probe-key.txt удалён после проверки.

Это подтверждает работоспособность публичного HTTPS, ключа и базового MCP workflow у независимого клиента. Причина отказа именно Perplexity остаётся неизвестной; успешный SDK тест не доказывает совместимость со всеми особенностями Perplexity. DeepWiki пользователь добавил с auth=None и с тестовой строкой в API Key. Пробный WebObsidian auth=None также дал 502. Cloudflare Tunnel не создавался, разрешение на него не получено.

## TCP и MikroTik — 2026-10-30

Во время согласованной попытки Perplexity выполнен 60-секундный захват только текстовых метаданных TCP на Proxmox для HTTPS-прокси 10.10.1.33. Окно: 14:19:44–14:20:44 UTC (17:19:44–17:20:44 МСК). Метаданные сохранены на Proxmox в /tmp/webobsidian-mcp-network-20261030T141944Z.log; payload/pcap не сохранялись. В 17:20:18.845 пришёл SYN с 44.214.171.155:5129, прокси отправлял SYN-ACK; наблюдались повторные SYN/SYN-ACK без завершающего ACK. Принадлежность IP Perplexity не доказана, но время совпадает с ручной попыткой. Это соединение не дошло до TLS/HTTP.

Рабочий доступ к роутеру описан в C:/Users/alexey/ai-workspace/VPN/ROUTER_ACCESS.md: network-audit с audit_ed25519 и pinned ED25519 host key, напрямую с рабочего компьютера. Старый RSA-путь через Proxmox/admin неактуален. Пользователь подтвердил текущий host fingerprint; он также совпал с ранее независимо закреплённым в VPN-проекте.

Проверено read-only: 44.214.171.155 входит в vpn-redirect через 44.192.0.0/10; HTTPS-прокси 10.10.1.33 входит в novpn. На Proxmox и NPM только main routing, шлюз 10.10.1.1. На MikroTik main default через 77.37.160.1/ether1, vpn default через 10.10.1.28. Общие VPN mangle правила исключают novpn; для рассматриваемого IP membership в ai-vpn-only не найден. Поэтому гипотеза обратного VPN-маршрута пока не подтверждена. Правила роутера не изменялись.

### Подтверждённая VPN-маркировка и исправление

Первое сопоставление списков не учитывало флаг disabled: запись novpn для 10.10.1.33 с комментарием NPM отключена. Вывод о действующем исключении выше был предварительным и неверным. Первый conntrack-фильтр также содержал порт внутри reply-src-address; в RouterOS 7.25 адрес/порт раздельны, этот опрос не дал данных.

Исправленный синхронный захват 17:33–17:34 МСК показал повторное соединение 44.214.171.155:2014 → 77.37.160.76:443: dstnat к 10.10.1.33:443, tcp-state=syn-recv, connection-mark=vpn-conn, SYN/SYN-ACK без ACK. Записи conntrack в router-live-connections-v2.txt. Причина: ответы NPM к адресам vpn-redirect маркируются и маршрутизируются через VPN. Это объясняет отсутствие HTTP access logs: до TLS/HTTP соединение не доходило.

В 17:37 МСК включено одно mangle/prerouting правило `MCP HTTPS: preserve dstnat reply route`: action=accept, src-address=10.10.1.33, protocol=tcp, src-port=443, connection-nat-state=dstnat, in-interface-list=LAN. Оно стоит перед `Mark VPN connections to bypass FastTrack`, после существующих AI VPN only правил. Исключение относится только к ответам на уже проброшенные входящие HTTPS-соединения; исходящие соединения NPM и существующие AI ограничения остаются под прежней политикой.

Снимки mangle/nat/filter/raw и команда отката сохранены в .superpowers/sdd/2026-10-30-remote-mcp/router-before-*.rsc и router-rollback.rsc (локально, git-ignored). Экспорты NAT и filter сравнены после исключения меняющегося timestamp заголовка — совпали. Общая таблица conntrack не очищалась.

Откат: `/ip firewall mangle remove [find where comment="MCP HTTPS: preserve dstnat reply route"]`. После включения пользователю предложена повторная проверка Perplexity; результат ещё ожидается.

### Подключение Perplexity подтверждено

Пользователь сообщил об успешном добавлении коннектора. В журнале Nginx 2026-10-30 17:41:01–17:41:02 МСК появились запросы Perplexity-MCP/1.0 с кодами 200/202; размер ответа discovery 6111 bytes соответствует списку инструментов. В 17:39 была уже достигавшая HTTP попытка с 401, затем успешная авторизованная регистрация. Таким образом, после узкого исправления маршрутизации клиент достиг MCP и прошёл handshake/discovery. Чтение конкретной заметки из чата Perplexity — отдельный следующий шаг. Туннели не создавались.

## Исправление поиска и выпуск search-refresh-f466341e0d32

Серверный снимок qmd-index.json имел mtime 2026-10-22 и 63 документа; файл Работа/СЭДО СФР/ЕЦП.md, изменённый 29 октября, в нём отсутствовал. initSearch() восстанавливал любой непустой старый снимок и обновлял только tasks; watcher ignoreInitial не добавлял уже существующие файлы.

Исправление: перед приёмом запросов initSearch() строит поиск по текущему vault. Это обновляет добавленные/изменённые/удалённые документы, метаданные и задачи; прежняя boot refreshTasks уже читала все файлы. Regression test сначала воспроизвёл отсутствие ЕЦП в устаревшем снимке, затем прошёл после исправления. Server: 244 passed, 9 skipped; MCP: 3 passed. Независимое ревью существенных ошибок не выявило. Linux preflight проверил точный сценарий: непустой индекс → остановка → новая ЕЦП.md → рестарт → успешный поиск.

Развёрнут image webobsidian:search-refresh-f466341e0d32, исходники /opt/webobsidian/releases/search-refresh-f466341e0d32. Backup /opt/webobsidian/backups/search-refresh-f466341e0d32-20261030T145238Z; предыдущий image remote-mcp-cbc1128f6f94 сохранён. Настройки совпали побайтно с резервной копией; контейнер healthy. Note contents не изменялись.

После развёртывания индекс содержит 65 доступных индексатору документов. ЕЦП.md присутствует, ЕЦП/ецп/ЭЦП возвращают по одному совпадению с точным путём Работа/СЭДО СФР/ЕЦП.md. СЭДО также включает этот файл. Оператору предложено обновить web UI и повторить запрос инструмента в Perplexity, не полагаясь на прежний нулевой результат.

## Внешние изменения без перезапуска — проверка NFS/SMB

Production использует NFS4 (/mnt/obsidian/vaults) и уже имел WEBOBSIDIAN_WATCH=polling. Текущий watcher опрашивает Markdown-файлы с interval=1000 ms, затем обновляет qmd через add/change/unlink. Startup rebuild покрывает изменения между запусками; polling покрывает изменения в работающей системе.

Проверено тем же production image search-refresh-f466341e0d32 в отдельном контейнере с пустой временной папкой того же NAS вне пользовательского vault. Windows-клиент создавал/изменял/удалял External.md по SMB; Linux-контейнер видел папку по NFS. Между действиями контейнер не перезапускался. Поиск через настоящий Agent REST API находил новый файл, находил новый текст и переставал находить старый после редактирования, затем переставал находить удалённый файл. Poll wait: 10.10s / 6.05s / 7.06s соответственно; эти времена начинаются после записи с Windows и SSH-вызова, не являются гарантией максимальной задержки. NFS metadata caching добавляет задержку поверх секундного polling.

Тестовые контейнер, API-key state и пустая NAS-папка удалены. Production-контейнер healthy; пользовательские заметки не изменялись. Настройки production не менялись: polling уже был включён. Для других NFS/SMB установок рекомендация polling добавлена в README/.env.example.
