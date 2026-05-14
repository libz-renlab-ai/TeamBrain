# BPP HTTPS / VPC 部署指引

参考：`docs/superpowers/specs/2026-05-13-best-practice-push-design.md` §6.3
（HTTPS-only + VPC / 内网 only deployment）。

本文档说明把 BPP receiver（`bin-prod-server`）跑在 TLS 之后的三种 canonical
姿势，以及 VPC / 内网 only 部署的网络隔离要求。

---

## 1. 三种部署形态

| 形态 | TLS 终结点 | 适用场景 |
|------|------------|----------|
| A. Node 进程直接终结 TLS | 用 `wrapServerWithHttps`（`packages/digital-twin/src/bpp/https-server.ts`）包 `startMockServer` 出来的 `http.Server`，在 Node 进程内监听 443 | 小型单机 / 内网 only 部署、air-gapped 试点 |
| B. nginx 反代终结 TLS | nginx 监听 443，转发给 receiver 的 127.0.0.1:8080（HTTP） | 多 receiver、需要 rate-limit / WAF / Let's Encrypt 自动续期 |
| C. 云负载均衡终结 TLS | AWS ALB / GCP HTTPS LB 终结 TLS，转发给 receiver 内网 IP | 多区域 / 多 AZ，ACM 证书托管 |

形态 A 是本仓库提供的代码路径；形态 B / C 把 receiver 当成 plain-HTTP upstream，
此时**不需要**调用 `wrapServerWithHttps`，直接跑 `bin-prod-server` 即可。

---

## 2. 形态 A：Node 进程直接终结 TLS

### 2.1 生成自签名证书（开发 / 内网 only）

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout /etc/teamagent/bpp-key.pem \
  -out    /etc/teamagent/bpp-cert.pem \
  -days 3650 -nodes \
  -subj "/CN=bpp.internal.example.com" \
  -addext "subjectAltName=DNS:bpp.internal.example.com,IP:10.0.0.42"

chmod 600 /etc/teamagent/bpp-key.pem
chmod 644 /etc/teamagent/bpp-cert.pem
chown teamagent:teamagent /etc/teamagent/bpp-*.pem
```

> **不要**把自签名证书暴露到公网。客户端必须在 trust store 里显式信任这张
> 证书，或者部署到 VPC / VPN 内网。

### 2.2 用 `wrapServerWithHttps` 暴露 443

把 receiver entry 改成下面这种结构（仍然不改 `mock-server.ts`）：

```ts
import { startMockServer } from '@teamagent/digital-twin/mock-server';
import { wrapServerWithHttps } from '@teamagent/digital-twin/bpp/https-server';

const httpHandle = await startMockServer({
  port: 0, // 不要 bind plain HTTP 端口
  host: '127.0.0.1',
  outputDir: process.env.BPP_OUTPUT_DIR!,
});
// startMockServer 已经 listen 了；如果只想跑 HTTPS，先 close() 释放端口
await new Promise<void>((r) => httpHandle.server.close(() => r()));

const https = wrapServerWithHttps({
  httpsKeyPath: process.env.BPP_HTTPS_KEY!,
  httpsCertPath: process.env.BPP_HTTPS_CERT!,
  http: httpHandle.server,
});
https.listen(443, '0.0.0.0');
```

### 2.3 Let's Encrypt（公网公开 receiver）

公网域名上跑 Let's Encrypt 自动续期：

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d bpp.example.com
# 证书路径：
#   /etc/letsencrypt/live/bpp.example.com/fullchain.pem  → BPP_HTTPS_CERT
#   /etc/letsencrypt/live/bpp.example.com/privkey.pem    → BPP_HTTPS_KEY

# 续期：每 60 天 cron 一次；reload receiver
0 3 * * * certbot renew --quiet --post-hook "systemctl reload teamagent-bpp"
```

---

## 3. 形态 B：nginx 反代

```nginx
server {
    listen 443 ssl http2;
    server_name bpp.example.com;

    ssl_certificate     /etc/letsencrypt/live/bpp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bpp.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 64m;  # 配合 mock-server.MAX_BODY_BYTES = 32MB

    location /v1/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
```

Receiver 仍然跑 plain HTTP 在 127.0.0.1:8080，绝对不要暴露到 0.0.0.0。

---

## 4. 防火墙规则

| 形态 | 必须开放 | 必须 block |
|------|----------|-----------|
| A    | TCP 443 inbound | TCP 8080 / 8443 / 任何 plain HTTP |
| B    | TCP 443 inbound | TCP 8080 inbound（仅 nginx → 127.0.0.1 ok） |
| C    | LB 出口 443 | receiver 实例的 8080 不开放任何 inbound（VPC private subnet） |

`ufw` 示例（形态 A）：

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 443/tcp  # BPP HTTPS
sudo ufw enable
```

---

## 5. VPC / 内网 only IP allowlist

公司内网 / VPC 部署要求只接受白名单 IP，建议两层：

1. **网络层**：security group / `iptables` / `ufw` 只放行内网 CIDR
   （e.g. `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）。

2. **应用层**：在 nginx 或 receiver 前置一个 IP allowlist 中间件，拒绝白名单
   外的 source IP。formAreceiver 当前不内置 IP allowlist，由反代/网络层负责。

```nginx
# nginx 应用层 allowlist 示例
location /v1/ {
    allow 10.0.0.0/8;
    allow 172.16.0.0/12;
    deny  all;
    proxy_pass http://127.0.0.1:8080;
}
```

---

## 6. 验证 checklist

部署完后跑下面三条命令验证：

```bash
# 1) TLS 握手 OK，且证书 SAN 含部署域名
openssl s_client -connect bpp.example.com:443 -servername bpp.example.com \
  </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates

# 2) plain HTTP 8080 已关闭
nc -zv bpp.example.com 8080 2>&1 | grep -E 'refused|timed out|filtered'

# 3) /v1/inbox 走 HTTPS 返回 200（带白名单 IP 时）
curl -sS https://bpp.example.com/v1/inbox?receiver_id=test \
  --resolve bpp.example.com:443:10.0.0.42 \
  --cacert /etc/teamagent/bpp-cert.pem
```
