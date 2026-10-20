# RamLaal — Advanced Minecraft 24/7 AFK Bot

[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Minecraft Version](https://img.shields.io/badge/Minecraft-1.20%20--%2026.3%20(777)-blue.svg)](https://minecraft.net/)
[![License: ISC](https://img.shields.io/badge/License-ISC-brightgreen.svg)](LICENSE)

A high-performance, intelligent 24/7 Minecraft bot built on [Mineflayer](https://github.com/PrismarineJS/mineflayer). Designed to keep servers alive, load chunks for automated farms, and simulate natural player activity with zero spam.

---

## ✨ Features

- **🧠 Realistic Human Behavior:** Navigates smoothly with head sway, crouch adjustments, curiosity nods toward new block placements, and item fidgeting.
- **🛡️ Anti-Cheat & Kick-Safe Navigation:** Advanced obstacle detection, tick-level collision avoidance, and forced-move stabilization to avoid `invalid_player_movement` kicks on Paper/Spigot.
- **🛌 Smart Auto-Sleep:** Automatically detects when night or thunderstorms begin, rushes to nearby beds to skip the night, and synchronizes with sleeping players.
- **⚔️ Automated Base Defense:** Scans for hostile mobs within range, equips weapons/armor, and defends base anchors without floating or tripping movement checks.
- **📦 Morning Chest Sorting:** Deposits collected mob drops and ground loot into base storage chests every morning.
- **🌾 Maximum Chunk Simulation:** Operates at an extended 32-chunk view/simulation radius to keep mob farms and redstone contraptions continuously active.
- **🔄 Auto-Reconnect & Crash Resilience:** Recovers from server restarts, kicks, and network timeouts with configurable exponential backoff.
- **🌐 24/7 Cloud Ready:** Embedded lightweight HTTP server on port 3000 to pass health checks on platforms like Render, Koyeb, Railway, and Bot-Hosting.
- **🔇 Stealth Mode:** Operates silently in chat and mutes transient connection noise in server consoles.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- A Java Edition Minecraft server (Aternos, Paper, Fabric, Vanilla, Falix, etc.)

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/rajtilak-2020/RamLaal.git
cd RamLaal
npm install
```
*(The automated post-install script applies version compatibility patches for modern protocols.)*

### 2. Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```
Open `.env` and fill in your server details:
```env
MC_HOST=your-server-ip.com
MC_PORT=25565
MC_USERNAME=RamLaal
MC_VERSION=26.3
MC_AUTH=offline
VIEW_DISTANCE=32
MUTED=true
```

### 3. Start the Bot
```bash
npm start
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :---: | :--- |
| `MC_HOST` | `mc.krajtilak.in` | Minecraft server host / domain |
| `MC_PORT` | `25565` | Server port |
| `MC_USERNAME` | `RamLaal` | Bot player name |
| `MC_VERSION` | `26.3` | Target protocol version (leave empty for auto-detect) |
| `MC_AUTH` | `offline` | `offline` (cracked servers) or `microsoft` (premium accounts) |
| `RECONNECT_DELAY_MS`| `15000` | Wait duration (ms) before reconnecting after a disconnect |
| `PORT` | `3000` | HTTP port for cloud keep-alive health checks |
| `MUTED` | `true` | When `true`, completely mutes all in-game bot chat output |
| `VIEW_DISTANCE` | `32` | Render and chunk simulation distance in chunks |

---

## ☁️ Deployment

### Running 24/7 with PM2 (Linux VPS / Raspberry Pi)
```bash
npm install -g pm2
pm2 start index.js --name ramlaal-bot
pm2 save
pm2 startup
```

### Free Cloud Containers (Koyeb, Render, Bot-Hosting)
1. Fork or push this repository to GitHub.
2. Link your repository in your cloud provider as a **Web Service** or **Background Worker**.
3. Set your environment variables in the provider dashboard.
4. The bot automatically starts the HTTP health-check server on port `3000` to keep the container awake.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
