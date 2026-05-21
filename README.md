# 📡 Tenda Multi-AP Manager

A web-based management panel for **multiple Tenda access points**. Monitor, configure, compare, and update all your Tenda APs from a single dark-themed interface.

![Dark theme UI](https://img.shields.io/badge/UI-Dark%20Theme-1a1d28?style=flat-square)
![Docker](https://img.shields.io/badge/Deploy-Docker-2496ED?style=flat-square&logo=docker)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## Features

- **Dashboard** — Overview of all APs with online/offline status, model, and firmware
- **AP Detail** — Full config snapshot (radio, SSID, security, VLAN, QoS, roaming, clients)
- **Inline Edit** — Change settings directly from the UI with live apply
- **Compare** — Side-by-side diff of any two APs
- **Bulk Edit** — Copy Wi-Fi config from one AP to multiple targets
- **SSID Cleanup** — Disable unused SSIDs (#2–#8) across all APs
- **Reboot** — Reboot individual or multiple APs
- **Firmware** — Check online updates, upload .bin files, batch upgrade
- **Setup Wizard** — Auto-discover Tenda APs on your network with guided setup
- **Home Assistant** — MQTT auto-discovery for sensor integration
- **Multi-model** — Supports i27, OAP1200, and other Tenda business APs

## Supported Models

| Model | Status |
|-------|--------|
| Tenda i27 (V1.1) | ✅ Tested |
| Tenda OAP1200 (V2.0) | ✅ Tested |
| Other Tenda business APs | 🔄 Likely compatible (same API) |

The Tenda management API (`/goform/modules`) is shared across most Tenda business APs. If your model uses the same web interface, it will likely work.

## Quick Start

### Docker Compose (recommended)

1. Clone the repo:
```bash
git clone https://github.com/SimoneB79/tenda-multiap-manager.git
cd tenda-multiap-manager
```

2. Create your `.env` file:
```bash
cp .env.example .env
# Edit .env and set your AP password
```

3. Start:
```bash
docker compose up -d --build
```

4. Open `http://localhost:3000` — the setup wizard will guide you through AP discovery and configuration.

### Manual Setup

If you prefer to pre-configure your APs:

1. Copy `config/aps.example.json` to `config/aps.json`
2. Edit with your AP details (IP, name, model)
3. Set `TENDA_PASSWORD` in your `.env` file
4. Start the container

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TENDA_PASSWORD` | ✅ | — | Admin password for all APs |
| `PORT` | ❌ | `3000` | Web server port |
| `MQTT_BROKER` | ❌ | — | MQTT broker URL (e.g. `mqtt://mosquitto:1883`) |
| `MQTT_USER` | ❌ | — | MQTT username |
| `MQTT_PASSWORD` | ❌ | — | MQTT password |
| `POLL_INTERVAL` | ❌ | `120` | Status polling interval in seconds |

### AP Configuration (`config/aps.json`)

```json
{
  "password_env": "TENDA_PASSWORD",
  "refresh_interval_ms": 30000,
  "aps": [
    {
      "id": "office-ap",
      "name": "Office",
      "ip": "192.168.0.100",
      "model": "i27V1.1",
      "location": "First Floor"
    }
  ]
}
```

The `password_env` field specifies which environment variable holds the AP password. All APs must share the same admin password.

### Docker Compose Examples

**Standalone:**
```yaml
services:
  tenda-panel:
    build: .
    container_name: tenda-panel
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file: .env
    volumes:
      - ./config:/app/config
```

**With reverse proxy (Caddy/Nginx):**
```yaml
services:
  tenda-panel:
    build: .
    container_name: tenda-panel
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./config:/app/config
    networks:
      - proxy

networks:
  proxy:
    external: true
```

## Home Assistant Integration

The manager can publish AP status to MQTT for Home Assistant auto-discovery.

1. Set MQTT environment variables in your `.env`
2. Restart the container
3. Sensors appear automatically in Home Assistant under each AP device

**Published data per AP:**
- Online/offline status
- Client count (2.4 GHz / 5 GHz)
- Channel and power per radio
- SSID name
- Firmware version

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/aps` | List all APs with status |
| GET | `/api/aps/:id/snapshot` | Full config snapshot |
| GET | `/api/aps/:id1/compare/:id2` | Compare two APs |
| POST | `/api/aps/:id/set` | Write config to AP |
| POST | `/api/config/aps` | Update AP inventory |
| POST | `/api/cleanup/ssids` | Cleanup unused SSIDs |
| POST | `/api/reboot` | Reboot AP(s) |
| POST | `/api/aps/:id/uplink` | Set uplink detection |
| GET | `/api/modules/:model` | Module definitions |
| GET/POST | `/api/aps/:id/firmware/*` | Firmware operations |
| POST | `/api/setup/discover` | Scan subnet for Tenda APs |
| POST | `/api/setup/test` | Test AP connection |
| POST | `/api/setup/save` | Save setup configuration |

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** Vue.js 3 (SPA, no build step)
- **API:** Tenda `/goform/modules` (reverse-engineered)
- **Deploy:** Docker

## How It Works

The manager communicates with Tenda APs via their internal HTTP API:

1. **Login:** POST password (base64) to `/goform/modules` → session cookie
2. **Read config:** POST module requests (radio, SSID, security, etc.)
3. **Write config:** POST module parameters with the same endpoint
4. **Identity:** GET `/config/macro_config.js` (no auth) → model + firmware
5. **Firmware upload:** POST multipart to `/cgi-bin/upgrade`

All AP management runs over HTTP on your local network. No cloud dependency.

## Contributing

Contributions welcome! Especially:
- Support for additional Tenda models
- Translations / i18n
- Bug reports and feature requests

## License

MIT — see [LICENSE](LICENSE).
