# Security Configuration Guide

This document provides comprehensive instructions for configuring security settings when self-hosting this FastAPI application. The application implements multiple layers of protection against Denial of Service (DoS) attacks and unauthorized access, with flexible configuration options to suit different deployment scenarios.

## Table of Contents

1. [Overview](#overview)
2. [Security Features](#security-features)
3. [Deployment Scenarios](#deployment-scenarios)
   - [Private Network Deployment](#private-network-deployment)
   - [Public Network Deployment](#public-network-deployment)
4. [NAT and Shared Client IPs](#nat-and-shared-client-ips)
5. [Configuration Reference Table](#configuration-reference-table)
6. [Configuration Examples](#configuration-examples)
   - [Example 1: Internal Network Only](#example-1-internal-network-only)
   - [Example 2: Behind Nginx Reverse Proxy](#example-2-behind-nginx-reverse-proxy)
   - [Example 3: Public Internet with Cloudflare](#example-3-public-internet-with-cloudflare)
   - [Example 4: Public Internet with IP Restrictions](#example-4-public-internet-with-ip-restrictions)
7. [Security Warnings](#security-warnings)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This application protects OAuth endpoints against abuse through multiple security layers. All OAuth endpoints (`/register`, `/authorize`, `/token`, etc.) are unauthenticated by design (following OAuth 2.0 specifications) and rely entirely on configurable security mechanisms for protection.

---

## Security Features

This application provides the following security capabilities:

- **Rate Limiting**: Configurable request limits per IP address to prevent abuse
- **Access Control**: IP-based and domain-based allowlisting for public deployments
- **Flexible Storage**: In-memory or Redis-backed persistence for rate limiting state

---

## Deployment Scenarios

### Private Network Deployment (Preferred usage method)

**Use this when:**
- Application is accessible only within your corporate network
- All users connect from trusted internal IPs
- You have network-level access controls (firewalls, VPNs)

**Characteristics:**
- Lower rate limits (assumes smaller user base)
- No additional IP/domain restrictions
- Simpler configuration

**Default Rate Limits:**
- Standard endpoints: 5 requests per 60 seconds per IP
- Registration endpoint: 10 registrations per hour per IP
- Max clients per IP: 5

### Public Network Deployment

**Use this when:**
- Some MCP hosts (Claude) requires the MCP servers to be publicly accessible to be able to connect and use them. In such cases, this mode should be used.

**Characteristics:**
- Higher rate limits (accommodates more users)
- Requires IP allowlist or domain allowlist
- Additional security validation

**Default Rate Limits:**
- Standard endpoints: 100 requests per 60 seconds per IP
- Registration endpoint: 50 registrations per hour per IP
- Max clients per IP: unlimited (set to 0 to disable, or specify a limit)

---

## NAT and Client IPs

All rate limiting is keyed on the **client IP as seen by the server**, and the IP the server observes differs significantly between the two deployment scenarios.

### Private Network Deployments

In a private network deployment, the server receives each user's **individual private IP address**. Rate-limit counters and client-per-IP caps therefore apply per user, which is why the defaults can be kept tight (5 req / 60 s, max 5 clients per IP).

### Public Network Deployments

In a public network deployment, users connect from their organisation's network over the internet. The server receives the organisation's **shared public IP** (their NAT gateway) rather than each user's private IP. This means all users from the same organisation share a single rate-limit bucket and a single client-per-IP cap.

To accommodate this, raise the limits to reflect the expected number of users from the same organisation, and configure an IP or domain allowlist to restrict access to known networks:

```bash
# Allow the organisation's public IP range
TRUSTED_PUBLIC_NETWORKS=203.0.113.0/24
# Or restrict by domain
# TRUSTED_DOMAINS_ALLOWLIST=.*\.example\.com (TRUSTED_DOMAINS_ALLOWLIST is depreciated)

# Adjust limits to account for multiple users sharing one public IP
PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_COUNT=100
PUBLIC_OAUTH_MAX_CLIENTS_PER_IP=50   # or 0 for unlimited
```


---

## Configuration Reference Table

The following table lists all available security configuration options. Configure these via environment variables when deploying the application.

### Core Configuration

| Variable | Default | Description | Depends On | Example Values |
|----------|---------|-------------|------------|----------------|
| `DEPLOYMENT_SCENARIO` | `private_network` | Determines the security profile and access control behavior. Use `private_network` for internal deployments and `public_network` for internet-facing deployments. | None | `private_network`, `public_network` |
| `STORAGE_BACKEND` | `memory` | Storage backend for rate limiting state. Use `memory` for single-instance deployments and `redis` for multi-instance or high-availability setups. | None | `memory`, `redis` |
| `SESSION_SECRET_KEY` | `supersecretkey` | Secret key for session management. **Change this in production!** | None | `<random-32-byte-string>` |

### Proxy Configuration

| Variable | Default | Description | Depends On | Example Values |
|----------|---------|-------------|------------|----------------|
| `BEHIND_PROXY` | `false` | Set to `true` when application is behind a reverse proxy, load balancer, or CDN. Enables client IP extraction from proxy headers. | None | `true`, `false` |
| `TRUSTED_PROXY_LIST` | Empty | Comma-separated list of IP addresses or CIDR ranges of trusted proxies. **Required when `BEHIND_PROXY=true`**. Only these IPs can provide client IP via forwarded headers. | `BEHIND_PROXY=true` | `10.0.1.100`, `10.0.1.0/24`, `173.245.48.0/20,103.21.244.0/22` |
| `CLIENT_IP_HEADER` | None | Custom HTTP header to extract client IP from (overrides default `X-Forwarded-For` logic). Use when your proxy/CDN provides a specific header. | `BEHIND_PROXY=true` | `CF-Connecting-IP`, `X-Real-IP`, `X-Client-IP` |

### Access Control (Public Network Only)

| Variable | Default | Description | Depends On | Example Values |
|----------|---------|-------------|------------|----------------|
| `TRUSTED_PUBLIC_NETWORKS` | Empty | Comma-separated list of allowed IP addresses, CIDR ranges, or regex patterns. **Required in `public_network` mode** (unless using domain allowlist). | `DEPLOYMENT_SCENARIO=public_network` | `203.0.113.0/24`, `198.51.100.50`, `203\.0\.113\..*` |
| `TRUSTED_DOMAINS_ALLOWLIST` (DEPRECIATED) | Empty | Comma-separated list of domain regex patterns allowed to access the application. Alternative to IP allowlisting in `public_network` mode. | `DEPLOYMENT_SCENARIO=public_network` | `api.example.com`, `.*\.example\.com` |

### Rate Limiting - Global

| Variable | Default | Description | Depends On | Example Values |
|----------|---------|-------------|------------|----------------|
| `GLOBAL_OAUTH_RATE_LIMIT_CAPACITY` | `30` | Maximum number of requests allowed per window across **all** IPs (server-wide cap). Applies regardless of deployment scenario. | None | `30`, `50`, `100` |
| `GLOBAL_OAUTH_RATE_LIMIT_WINDOW` | `60` | Time window in seconds for the global rate limit. | None | `60`, `120` |

### Rate Limiting - Private Network

| Variable | Default | Description | Depends On | Example Values |
|----------|---------|-------------|------------|----------------|
| `PRIVATE_OAUTH_STANDARD_RATE_LIMIT_COUNT` | `5` | Maximum requests allowed for standard OAuth endpoints (per IP, per window). | `DEPLOYMENT_SCENARIO=private_network` | `5`, `10`, `20` |
| `PRIVATE_OAUTH_STANDARD_RATE_LIMIT_WINDOW` | `60` | Time window in seconds for standard endpoint rate limit. | `DEPLOYMENT_SCENARIO=private_network` | `60`, `120` |
| `PRIVATE_OAUTH_REGISTRATION_RATE_LIMIT_COUNT` | `10` | Maximum client registrations allowed (per IP, per window). | `DEPLOYMENT_SCENARIO=private_network` | `10`, `20` |
| `PRIVATE_OAUTH_REGISTRATION_RATE_LIMIT_WINDOW` | `3600` | Time window in seconds for registration rate limit (default: 1 hour). | `DEPLOYMENT_SCENARIO=private_network` | `3600`, `7200` |
| `PRIVATE_OAUTH_MAX_CLIENTS_PER_IP` | `5` | Maximum number of active OAuth clients allowed per IP address. | `DEPLOYMENT_SCENARIO=private_network` | `5`, `10`, `20` |

### Rate Limiting - Public Network

| Variable | Default | Description | Depends On | Example Values |
|----------|---------|-------------|------------|----------------|
| `PUBLIC_OAUTH_STANDARD_RATE_LIMIT_COUNT` | `100` | Maximum requests allowed for standard OAuth endpoints (per IP, per window). | `DEPLOYMENT_SCENARIO=public_network` | `100`, `200` |
| `PUBLIC_OAUTH_STANDARD_RATE_LIMIT_WINDOW` | `60` | Time window in seconds for standard endpoint rate limit. | `DEPLOYMENT_SCENARIO=public_network` | `60`, `120` |
| `PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_COUNT` | `50` | Maximum client registrations allowed (per IP, per window). | `DEPLOYMENT_SCENARIO=public_network` | `50`, `100` |
| `PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_WINDOW` | `3600` | Time window in seconds for registration rate limit (default: 1 hour). | `DEPLOYMENT_SCENARIO=public_network` | `3600`, `7200` |
| `PUBLIC_OAUTH_MAX_CLIENTS_PER_IP` | `0` | Maximum number of active OAuth clients per IP. Set to `0` for unlimited. | `DEPLOYMENT_SCENARIO=public_network` | `0`, `20`, `50` |

### OAuth Client Registration

| Variable | Default | Description | Depends On | Example Values |
|----------|---------|-------------|------------|----------------|
| `OAUTH_ALLOWED_REDIRECT_URIS` | Empty (allow all) | Comma-separated list of redirect URI patterns that dynamically registered clients may use. `*` is a wildcard. Registrations (`/register`) and authorization requests (`/authorize`) with any other redirect URI are rejected with `invalid_redirect_uri`. When empty, all redirect URIs are allowed. End the host part of a pattern with `/` or `:` (e.g. `https://example.com/*`, not `https://example.com*`), otherwise it also matches hosts like `example.com.evil.com`. | None | `http://127.0.0.1:*/*,http://localhost:*/*`, `https://claude.ai/api/mcp/auth_callback`, `cursor://*` |

### Redis Configuration

| Variable | Default | Description | Depends On | Example Values |
|----------|---------|-------------|------------|----------------|
| `REDIS_HOST` | `localhost` | Hostname or IP address of Redis server. | `STORAGE_BACKEND=redis` | `localhost`, `redis.internal.company.com` |
| `REDIS_PORT` | `6379` | Port number of Redis server. | `STORAGE_BACKEND=redis` | `6379` |
| `REDIS_PASSWORD` | Empty | Password for Redis authentication (if required). | `STORAGE_BACKEND=redis` | `<your-redis-password>` |

---

## Environment Variables Reference

### Core Security Settings

#### `DEPLOYMENT_SCENARIO`

**Description**: Determines the security profile and access control behavior.

**Allowed Values**: `private_network` | `public_network`

**Default**: `private_network`

**When to Use**:
- `private_network`: Internal deployments, VPN-only access, corporate networks
- `public_network`: Internet-facing deployments requiring IP/domain restrictions

**Example**:
```bash
DEPLOYMENT_SCENARIO=public_network
```

---

### Proxy Configuration

#### `BEHIND_PROXY`

**Description**: Indicates whether the application is deployed behind a reverse proxy (Nginx, Apache, load balancer, CDN).

**Allowed Values**: `true` | `false`

**Default**: `false`

**When to Use**: Set to `true` when using Nginx, Apache, Cloudflare, AWS ALB, or any reverse proxy. This enables extraction of the real client IP from forwarded headers.

**Example**:
```bash
BEHIND_PROXY=true
```

---

#### `TRUSTED_PROXY_LIST`

**Description**: Comma-separated list of IP addresses or CIDR ranges that are trusted to provide client IP information via forwarded headers.

**Format**: `IP1,IP2/CIDR,IP3`

**Default**: Empty (no proxies trusted)

**When to Use**: Set this to the IP addresses of your reverse proxies, load balancers, or CDN edge servers.

**Examples**:
```bash
# Single proxy
TRUSTED_PROXY_LIST=10.0.1.100

# Multiple proxies
TRUSTED_PROXY_LIST=10.0.1.100,10.0.1.101,10.0.1.102

# CIDR range for load balancer pool
TRUSTED_PROXY_LIST=10.0.1.0/24

# Cloudflare IPv4 ranges (partial example)
TRUSTED_PROXY_LIST=173.245.48.0/20,103.21.244.0/22,103.22.200.0/22

# Multiple formats
TRUSTED_PROXY_LIST=10.0.1.100,192.168.1.0/24,172.16.0.1
```

**💡 Tip**: For Cloudflare, use their [published IP ranges](https://www.cloudflare.com/ips/). For AWS ALB, use your VPC CIDR ranges.

---

#### `CLIENT_IP_HEADER`

**Description**: Specify a custom HTTP header to extract the client IP address from. This overrides the default `X-Forwarded-For` logic.

**Default**: `None` (uses standard proxy header logic)

**When to Use**: 
- Cloudflare provides `CF-Connecting-IP`
- Some CDNs provide `X-Real-IP`
- Custom proxy configurations with non-standard headers

**Examples**:
```bash
# Cloudflare
CLIENT_IP_HEADER=CF-Connecting-IP

# Generic reverse proxy
CLIENT_IP_HEADER=X-Real-IP

# Custom header
CLIENT_IP_HEADER=X-Client-IP
```

---

### Access Control (Public Network Only)

These settings only apply when `DEPLOYMENT_SCENARIO=public_network`.

#### `TRUSTED_PUBLIC_NETWORKS`

**Description**: Comma-separated list of IP addresses, CIDR ranges, or regex patterns that are allowed to access the application.

**Format**: Supports both CIDR notation and regex patterns

**Default**: Empty (all IPs blocked in public_network mode)

**When to Use**: In `public_network` mode, use this to allowlist specific IPs or IP ranges that should have access.

**Examples**:
```bash
# Allow specific IP
TRUSTED_PUBLIC_NETWORKS=203.0.113.10

# Allow office network
TRUSTED_PUBLIC_NETWORKS=203.0.113.0/24

# Allow multiple ranges
TRUSTED_PUBLIC_NETWORKS=203.0.113.0/24,198.51.100.0/24

# Regex pattern (advanced)
TRUSTED_PUBLIC_NETWORKS=203\.0\.113\..*

# Mixed formats
TRUSTED_PUBLIC_NETWORKS=203.0.113.0/24,198\.51\.100\..*,192.0.2.50
```

**💡 Tip**: Start with your office/datacenter IPs. Add VPN exit IPs if remote workers need access.

---

#### `TRUSTED_DOMAINS_ALLOWLIST` (DEPRECIATED)

**Description**: Comma-separated list of domain patterns (regex) that are allowed to access the application via the `Host` header.

**Format**: Regex patterns (case-insensitive)

**Default**: Empty (all domains blocked in public_network mode)

**When to Use**: In `public_network` mode, use this to restrict access to specific domains. Useful when you have multiple domains pointing to the same application.

**Examples**:
```bash
# Exact domain
TRUSTED_DOMAINS_ALLOWLIST=api.example.com

# Multiple domains
TRUSTED_DOMAINS_ALLOWLIST=api.example.com,mcp.example.com

# Wildcard subdomains (regex)
TRUSTED_DOMAINS_ALLOWLIST=.*\.example\.com

# Multiple patterns
TRUSTED_DOMAINS_ALLOWLIST=.*\.example\.com,api\.company\.net,.*\.internal\.corp
```

**💡 Tip**: If you only use one domain, specify it exactly. Use regex patterns only when needed.

---

### Rate Limiting Configuration

Rate limits are automatically selected based on `DEPLOYMENT_SCENARIO`. You can override these defaults by setting the environment variables explicitly.

#### Global Rate Limit

A server-wide cap that applies to all requests regardless of deployment scenario or client IP. It acts as an upper bound before per-IP limits are evaluated.

```bash
GLOBAL_OAUTH_RATE_LIMIT_CAPACITY=30   # max requests allowed in the window (server-wide)
GLOBAL_OAUTH_RATE_LIMIT_WINDOW=60     # window duration in seconds
```

#### Private Network Limits

```bash
# Standard endpoints (authorize, token, callback, etc.)
PRIVATE_OAUTH_STANDARD_RATE_LIMIT_COUNT=5        # 5 requests
PRIVATE_OAUTH_STANDARD_RATE_LIMIT_WINDOW=60      # per 60 seconds

# Client registration endpoint
PRIVATE_OAUTH_REGISTRATION_RATE_LIMIT_COUNT=10   # 10 registrations
PRIVATE_OAUTH_REGISTRATION_RATE_LIMIT_WINDOW=3600  # per hour (3600 seconds)

# Max OAuth clients per IP
PRIVATE_OAUTH_MAX_CLIENTS_PER_IP=5               # Maximum 5 active clients per IP
```

#### Public Network Limits

```bash
# Standard endpoints
PUBLIC_OAUTH_STANDARD_RATE_LIMIT_COUNT=100       # 100 requests
PUBLIC_OAUTH_STANDARD_RATE_LIMIT_WINDOW=60       # per 60 seconds

# Client registration endpoint
PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_COUNT=50    # 50 registrations
PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_WINDOW=3600   # per hour

# Max OAuth clients per IP
PUBLIC_OAUTH_MAX_CLIENTS_PER_IP=0                # 0 = unlimited (or set a specific limit)
```

**💡 Customization**: You can override any of these values. For example, to tighten public network registration limits:

```bash
PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_COUNT=20
PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_WINDOW=3600
PUBLIC_OAUTH_MAX_CLIENTS_PER_IP=10
```

---

### Storage Backend Configuration

#### `STORAGE_BACKEND`

**Description**: Choose the storage backend for rate limiting state.

**Allowed Values**: `memory` | `redis`

**Default**: `memory`

**When to Use**:
- `memory`: Single-instance deployments, development environments
- `redis`: Multi-instance deployments, high-availability setups, when you need persistent rate limiting across restarts

**Example**:
```bash
STORAGE_BACKEND=redis
```

---

#### Redis Configuration (when `STORAGE_BACKEND=redis`)

```bash
REDIS_HOST=localhost       # Redis server hostname
REDIS_PORT=6379           # Redis server port
REDIS_PASSWORD=           # Redis password (if required)
```

**Example**:
```bash
STORAGE_BACKEND=redis
REDIS_HOST=redis.internal.company.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-redis-password
```

**💡 Benefits of Redis**:
- Shared state across multiple application instances
- Persistent rate limiting (survives application restarts)
- Better performance at high scale

---

## Configuration Examples

### Example 1: Internal Network Only

**Scenario**: Application deployed on internal network, accessible only via VPN or within corporate network.

```bash
# Deployment scenario
DEPLOYMENT_SCENARIO=private_network

# No proxy
BEHIND_PROXY=false

# Use default private network rate limits (automatically applied)
# PRIVATE_OAUTH_STANDARD_RATE_LIMIT_COUNT=5
# PRIVATE_OAUTH_STANDARD_RATE_LIMIT_WINDOW=60
# PRIVATE_OAUTH_REGISTRATION_RATE_LIMIT_COUNT=10
# PRIVATE_OAUTH_REGISTRATION_RATE_LIMIT_WINDOW=3600
# PRIVATE_OAUTH_MAX_CLIENTS_PER_IP=5

# Storage
STORAGE_BACKEND=memory
```

---

### Example 2: Behind Nginx Reverse Proxy

**Scenario**: Application behind Nginx on the same internal network. Nginx handles SSL termination and forwards requests.

```bash
# Deployment scenario
DEPLOYMENT_SCENARIO=private_network

# Proxy configuration
BEHIND_PROXY=true
TRUSTED_PROXY_LIST=10.0.1.50        # Nginx server IP

# Use default private network rate limits
# (automatically applied based on DEPLOYMENT_SCENARIO)

# Storage
STORAGE_BACKEND=memory
```

**Nginx configuration example**:
```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

### Example 3: Public Internet with Cloudflare

**Scenario**: Public-facing deployment using Cloudflare CDN. Need to restrict access to specific partner IPs.

```bash
# Deployment scenario
DEPLOYMENT_SCENARIO=public_network

# Proxy configuration (Cloudflare)
BEHIND_PROXY=true
CLIENT_IP_HEADER=CF-Connecting-IP
TRUSTED_PROXY_LIST=173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22

# Access control - allow specific partner IPs and office network
TRUSTED_PUBLIC_NETWORKS=203.0.113.0/24,198.51.100.50,192.0.2.0/25

# Optional: domain restriction
# TRUSTED_DOMAINS_ALLOWLIST=api.yourcompany.com (TRUSTED_DOMAINS_ALLOWLIST is depreciated)

# Public network rate limits (defaults are reasonable)
# PUBLIC_OAUTH_STANDARD_RATE_LIMIT_COUNT=100
# PUBLIC_OAUTH_STANDARD_RATE_LIMIT_WINDOW=60
# PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_COUNT=50
# PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_WINDOW=3600
# PUBLIC_OAUTH_MAX_CLIENTS_PER_IP=0  # unlimited

# Storage (use Redis for multi-instance Cloudflare origin setup)
STORAGE_BACKEND=redis
REDIS_HOST=redis.internal.yourcompany.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
```

---

### Example 4: Public Internet with IP Restrictions

**Scenario**: Public deployment but only specific customers should have access. Each customer has a known IP range.

```bash
# Deployment scenario
DEPLOYMENT_SCENARIO=public_network

# Behind AWS ALB
BEHIND_PROXY=true
TRUSTED_PROXY_LIST=10.0.0.0/16      # VPC CIDR range

# Access control - customer IPs only
TRUSTED_PUBLIC_NETWORKS=203.0.113.0/24,198.51.100.0/28,192.0.2.50,192.0.2.51

# Higher registration limits for known customers
PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_COUNT=100
PUBLIC_OAUTH_REGISTRATION_RATE_LIMIT_WINDOW=3600
PUBLIC_OAUTH_MAX_CLIENTS_PER_IP=20

# Storage
STORAGE_BACKEND=redis
REDIS_HOST=redis.us-east-1.amazonaws.com
REDIS_PORT=6379
```

---

## Security Warnings

Understanding these security risks is crucial for safe deployment. Improper configuration can expose your application to attacks.

### ⚠️ Warning: Enabling Proxy Mode Without Trusted Proxy List

**Risk Level**: **CRITICAL**

**Misconfiguration**:
```bash
BEHIND_PROXY=true
# TRUSTED_PROXY_LIST is not set or empty
```

**Risk**: Attackers can spoof their IP address by sending fake `X-Forwarded-For` headers. This bypasses rate limiting and access controls entirely, as the application will trust the attacker's claimed IP.

**Correct Configuration**:
```bash
BEHIND_PROXY=true
TRUSTED_PROXY_LIST=10.0.1.50  # Your actual proxy IP
```

---

### ⚠️ Warning: Using Custom IP Header Without Trust Validation

**Risk Level**: **CRITICAL**

**Misconfiguration**:
```bash
CLIENT_IP_HEADER=X-Client-IP
# Without proper proxy configuration or when proxy doesn't strip client headers
```

**Risk**: If your proxy doesn't strip client-provided headers with the same name, attackers can inject arbitrary IPs to bypass rate limiting and access controls.

**Mitigation**: 
- Only use `CLIENT_IP_HEADER` when you fully control the proxy/CDN
- Ensure your proxy strips any client-provided headers matching your chosen header name
- Verify `TRUSTED_PROXY_LIST` is properly configured

---

### ⚠️ Warning: Public Network Mode Without Access Controls

**Risk Level**: **HIGH**

**Misconfiguration**:
```bash
DEPLOYMENT_SCENARIO=public_network
# Both TRUSTED_PUBLIC_NETWORKS and TRUSTED_DOMAINS_ALLOWLIST are empty
```

**Risk**: All requests are blocked by default in public network mode. Your application will be inaccessible without at least one access control method configured.

**Correct Configuration**:
```bash
DEPLOYMENT_SCENARIO=public_network
TRUSTED_PUBLIC_NETWORKS=203.0.113.0/24  # Your allowed IPs
```

---

### ⚠️ Warning: Domain Allowlisting Without TLS (Public Network)

**Risk Level**: **HIGH**

**Risk**: Domain-based access control (`TRUSTED_DOMAINS_ALLOWLIST`) works by checking the `Host` header of incoming requests. Any HTTP client can freely set this header to an arbitrary value, meaning a malicious actor can trivially spoof a trusted domain name and bypass domain-based access controls entirely.

**Requirement**: In public network deployments, **TLS must be configured** at your reverse proxy or load balancer. With proper TLS termination, the domain is validated through certificate negotiation before the request ever reaches the application, making Host header spoofing ineffective.

> Domain allowlisting is **not a substitute for TLS** — it is only a meaningful control *on top of* TLS. Exposing this application over plain HTTP on a public network renders `TRUSTED_DOMAINS_ALLOWLIST` protection ineffective.

TRUSTED_DOMAINS_ALLOWLIST is to be depreciated. Please avoid using/setting it in production.

---

### ⚠️ Warning: Using Default Session Secret

**Risk Level**: **HIGH**

**Misconfiguration**:
```bash
# Using the default value or a weak secret
SESSION_SECRET_KEY=supersecretkey
```

**Risk**: Session cookies can be forged, leading to unauthorized access and session hijacking.

**Correct Configuration**:
```bash
# Generate a strong random secret
SESSION_SECRET_KEY=$(openssl rand -base64 32)
# Or manually set a strong secret
SESSION_SECRET_KEY=your-very-long-random-secret-string-here
```

---

### ⚠️ Warning: Insufficient Rate Limits

**Risk Level**: **MEDIUM**

**Misconfiguration**:
```bash
PUBLIC_OAUTH_STANDARD_RATE_LIMIT_COUNT=10000
PUBLIC_OAUTH_STANDARD_RATE_LIMIT_WINDOW=1
```

**Risk**: Overly permissive rate limits provide no protection against DoS attacks. Attackers can overwhelm your application with requests.

**Recommendation**: Start with conservative defaults and increase only if legitimate traffic is being blocked. Monitor rate limit hits in logs.

---

### ⚠️ Warning: Redis Connection Without Authentication

**Risk Level**: **MEDIUM**

**Misconfiguration**:
```bash
STORAGE_BACKEND=redis
REDIS_HOST=publicly-accessible-redis.example.com
# REDIS_PASSWORD is not set
```

**Risk**: Unauthorized access to Redis can allow attackers to manipulate rate limiting state, view sensitive data, or cause denial of service.

**Correct Configuration**:
```bash
STORAGE_BACKEND=redis
REDIS_HOST=redis.internal.company.com  # Use internal network
REDIS_PASSWORD=strong-redis-password
# Also configure Redis with requirepass and bind to internal IPs only
```

---

### ⚠️ Warning: Trusting All Proxy IPs

**Risk Level**: **MEDIUM**

**Misconfiguration**:
```bash
BEHIND_PROXY=true
TRUSTED_PROXY_LIST=0.0.0.0/0  # Trusts all IPs as proxies
```

**Risk**: Any client can send forged forwarded headers, completely bypassing IP-based security controls.

**Correct Configuration**: Only list your actual proxy IPs:
```bash
TRUSTED_PROXY_LIST=10.0.1.50,10.0.1.51  # Specific proxy IPs only
```

---

## Troubleshooting

### Issue: Legitimate Users Being Rate Limited

**Symptoms**: Users receiving `429 Too Many Requests` errors

**Solutions**:

1. **Check if rate limits are too restrictive**:
   ```bash
   # Increase standard rate limit
   PRIVATE_OAUTH_STANDARD_RATE_LIMIT_COUNT=10
   PRIVATE_OAUTH_STANDARD_RATE_LIMIT_WINDOW=60
   ```

2. **Verify client IP detection**:
   - Check application logs to see what IP is being detected
   - If behind proxy, ensure `BEHIND_PROXY=true` and `TRUSTED_PROXY_LIST` is set correctly

3. **Check for NAT/shared IPs**:
   - Multiple users behind the same corporate or office NAT gateway all appear to the server as a single IP address, so rate-limit counters are exhausted collectively rather than individually. See the [NAT and Client IPs](#nat-and-client-ips) section for a full explanation and recommended configuration adjustments.
   - Increase limits for private networks or switch to the public network profile if the user base has grown beyond the defaults.

---

### Issue: Rate Limiting Not Working

**Symptoms**: No rate limiting is being applied, even after many requests

**Solutions**:

1. **Verify deployment scenario is set**:
   ```bash
   DEPLOYMENT_SCENARIO=private_network  # or public_network
   ```

2. **Check if IP detection is working**:
   - Look for log messages: "Could not determine client IP"
   - Verify proxy configuration if behind reverse proxy

3. **Ensure storage backend is accessible**:
   - If using Redis, verify connection:
     ```bash
     redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping
     ```

---

### Issue: Wrong Client IP Detected Behind Proxy

**Symptoms**: Logs show internal proxy IP instead of real client IP

**Solutions**:

1. **Enable proxy mode**:
   ```bash
   BEHIND_PROXY=true
   TRUSTED_PROXY_LIST=10.0.1.50  # Your proxy IP
   ```

2. **Use custom header if available**:
   ```bash
   CLIENT_IP_HEADER=CF-Connecting-IP  # For Cloudflare
   # or
   CLIENT_IP_HEADER=X-Real-IP
   ```

3. **Verify proxy is sending headers**:
   - Check that proxy forwards `X-Forwarded-For` or custom IP header
   - Example Nginx config:
     ```nginx
     proxy_set_header X-Real-IP $remote_addr;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     ```

---

### Issue: Redis Connection Failures

**Symptoms**: Application errors, rate limiting not working, connection timeouts

**Solutions**:

1. **Verify Redis is accessible**:
   ```bash
   redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping
   # Should return: PONG
   ```

2. **Check network connectivity**:
   ```bash
   telnet $REDIS_HOST $REDIS_PORT
   # or
   nc -zv $REDIS_HOST $REDIS_PORT
   ```

3. **Verify credentials**:
   ```bash
   REDIS_PASSWORD=correct-password
   ```

4. **Fallback to memory storage** (temporary):
   ```bash
   STORAGE_BACKEND=memory
   ```


## Summary

This application provides flexible, production-ready security configurations for OAuth endpoint protection. Key takeaways:

- ✅ Choose the correct **deployment scenario** for your use case
- ✅ Configure **proxy settings** accurately if behind a reverse proxy
- ✅ Set **rate limits** appropriate for your traffic patterns
- ✅ Use **IP/domain allowlists** for public deployments
- ✅ Deploy **Redis** for multi-instance setups
- ✅ Monitor and adjust settings based on real-world usage

For additional security questions or issues, please refer to the application logs and this documentation.
