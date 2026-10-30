# Remote MCP and Perplexity

WebObsidian supports two independent ways to expose the same ten tools:

| Connection | Address / command | Credentials |
|---|---|---|
| Local stdio | `node mcp-server/dist/index.js` or `npm run mcp` | `WEBOBSIDIAN_BASE_URL` + `WEBOBSIDIAN_API_KEY` |
| Remote Streamable HTTP | `https://notes.example.com/mcp` | WebObsidian API key on every request |

The local command and its existing configuration remain valid. `/api/v1` is REST, not an MCP URL.
The HTTP endpoint is disabled by default. OAuth and legacy HTTP+SSE are not implemented.

## Enable remote access

Build with `npm run build`. Configure the server (or Compose `.env`):

```dotenv
WEBOBSIDIAN_MCP_ENABLED=true
WEBOBSIDIAN_MCP_PUBLIC_URL=https://selbst-obsidian.duckdns.org/mcp
WEBOBSIDIAN_MCP_ALLOWED_ORIGINS=
```

The public URL is an example, not a statement that this server has been deployed. HTTPS is required except for loopback testing. A present Origin must match the public origin or an exact CSV entry in ALLOWED_ORIGINS; server-to-server requests without Origin are accepted. Keep Host equal to the configured public authority. Never use wildcard origins.

Restart WebObsidian. Use a reverse proxy with a valid TLS certificate. In an existing nginx HTTPS virtual host on the same machine:

```nginx
location = /mcp {
    proxy_pass http://127.0.0.1:8787/mcp;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 120s;
}
```

nginx forwards Accept, Content-Type and MCP-Protocol-Version by default. Match the application's request-body limit if overriding nginx's `client_max_body_size`. Do not redirect this route to a browser login or inject an interactive challenge.

For Caddy on the same host:

```caddyfile
selbst-obsidian.duckdns.org {
    @mcp path /mcp
    handle @mcp {
        reverse_proxy 127.0.0.1:8787
    }
    handle {
        reverse_proxy 127.0.0.1:8787
    }
}
```

Use HTTP_BIND=127.0.0.1 when the proxy runs on the host. In a Docker network, proxy to the webobsidian service instead of proxy-container localhost. Never add a shared privileged API key to the server environment for HTTP MCP.

## Perplexity Pro example

1. In WebObsidian → Settings → API Keys create `perplexity` with **read + search**. Copy the secret shown once.
2. In Perplexity open **Plugins → Add custom → Add MCP connector** (older UI: Customize → Connectors).
3. Select **Remote**, name **WebObsidian**, URL **https://selbst-obsidian.duckdns.org/mcp** after deploying it.
4. Advanced: **Streamable HTTP**, **API Key**, and **Public** network access for a direct HTTPS proxy. Put the WebObsidian secret in the credentials field; it is not a Perplexity API key.
5. Add and activate the connector. Select it in a new chat and ask: “Используя WebObsidian, найди заметки про ЭЦП и составь краткую инструкцию со ссылками на исходные заметки”.
6. To allow changes, use a separate key with write scope. Verify creation of one disposable note. A read/search key must fail when asked to modify or delete a note.
7. Revoke the test key in WebObsidian; the next request must fail authentication.

A connector does not require purchasing Perplexity API credits. Subscription limits still apply; Computer has separate usage/credit accounting. Consult current account terms before use.

**Validation status:** on 2026-10-30 the user successfully added WebObsidian in Perplexity Pro. Nginx logged `Perplexity-MCP/1.0` POST responses 200/202 and tool discovery at 17:41 MSK. The independent official SDK also passed Bearer and X-API-Key authentication, all ten tools and list_tags (34 tags). The earlier registration 502 was resolved by fixing asymmetric reply routing on MikroTik, not by changing MCP authentication. Reading an actual note through Perplexity is the next user acceptance step. See [deployment and diagnostic record](superpowers/plans/2026-10-30-remote-mcp-deployment.md).

[Official Perplexity setup](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors), checked 2026-10-30. [Plan and acceptance criteria](superpowers/plans/2026-10-30-remote-mcp.md).

## Diagnostics and rollback

Search, tags and backlinks share the server index with the web application. An
`INDEX_NOT_READY` tool error is retryable after initial indexing/verification;
do not interpret it as zero matches. Responses with `index.phase: degraded` can
contain older results while the server retries filesystem access. This behavior
applies to both local stdio and remote HTTP. Direct `read_note` by a known path
does not require the search index. For NFS/SMB external edits and manual recovery,
see [indexing and freshness](INDEXING.md).

- 401: missing, invalid or revoked key. A browser cookie does not authenticate MCP.
- Tool error 403: missing scope. A transport 403 can also indicate invalid Host or Origin.
- 404: HTTP MCP disabled or wrong proxy route; an HTML response indicates a routing problem.
- 405 on authenticated GET/DELETE: expected for this stateless implementation. Connect using Streamable HTTP POST, not a standalone SSE URL.
- 429: shared per-key rate limit across REST and MCP, including protocol handshake requests.
- 409 tool error: reread the note and resolve the version conflict; do not blindly retry writes.

MCP does not alter the meaning of write permissions: write includes deletion to the configured vault trash. Tools/list advertises all ten tools; enforcement happens on each operation. A key is checked again on every request. Revocation does not undo a write already in progress.

Disable WEBOBSIDIAN_MCP_ENABLED and restart to remove remote access. The endpoint then returns 404; local stdio and REST remain available. No vault/settings migration is required. Roll back an image using the same volumes.

Automated local integration (disposable vault, no production key): `npm run build` then `npm run test:mcp`.

## Router policy routing caveat

A server behind port forwarding must return replies through the same WAN path. In this installation, NPM's novpn address-list entry was disabled: replies from 10.10.1.33 to remote addresses in vpn-redirect received vpn-conn and were sent to the VPN gateway. The client repeatedly sent SYN and never completed TCP, so no HTTP access record appeared.

A narrowly scoped mangle/prerouting accept rule now precedes the general VPN connection-mark rule: source 10.10.1.33, TCP source port 443, connection-nat-state=dstnat, ingress LAN. It keeps replies for forwarded HTTPS connections in main routing while preserving existing AI VPN-only rules, outbound NPM policy, NAT and access filters. This example is specific to this network; inspect routing before applying it elsewhere.
