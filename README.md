# Aternos Minecraft AFK Bot

A lightweight Node.js Minecraft bot powered by [Mineflayer](https://github.com/PrismarineJS/mineflayer). It connects to your Aternos server, walks forward and backward periodically to keep the server alive, and automatically reconnects if disconnected.

---

## ⚠️ Important Note About Vercel Hosting

**Vercel cannot host a Minecraft bot.** 
- Vercel is a **serverless** platform designed for web apps and short-lived HTTP requests (functions terminate automatically after 10–60 seconds).
- A Minecraft bot requires a **persistent, 24/7 TCP connection** to stay in the game world.

### Recommended Free / Low-Cost Alternatives
If you want 24/7 cloud hosting for free or cheap:
1. **[Koyeb](https://www.koyeb.com/)** – Has a free tier supporting continuous web service containers.
2. **[Render](https://render.com/)** – Free Web Service (the included HTTP server on port 3000 satisfies Render's health checks; use a free ping tool like UptimeRobot to keep it active).
3. **[Railway](https://railway.app/)** – Simple persistent container deployment.
4. **Local machine / Raspberry Pi** – You can run it on your own computer in the background using `pm2`.

---

## ⚙️ Aternos Server Setup

1. **Enable Cracked Mode (Required if using offline bot)**:
   - Go to your [Aternos Dashboard](https://aternos.org/options/).
   - Turn **ON** the **"Cracked"** toggle switch.
2. **Get your Dynamic IP and Port**:
   - When you start your Aternos server, click the **Connect** button on the server page.
   - Note the **IP** (e.g., `myserver.aternos.me`) and the numeric **Port** (e.g., `34821`).

---

## 🚀 How to Run Locally

### 1. Configure the Bot
Edit the `.env` file with your server details:
```env
MC_HOST=myserver.aternos.me
MC_PORT=34821
MC_USERNAME=AFK_Bot
MC_AUTH=offline
```

### 2. Start the Bot
```bash
npm start
```

### 3. Run in the Background (Optional with PM2)
If you want the bot to run continuously on your Linux machine even if you close the terminal:
```bash
npm install -g pm2
pm2 start index.js --name mc-afk-bot
pm2 logs mc-afk-bot
```

---

## 🎮 What the Bot Does
- Automatically connects to your server.
- Moves forward for 1.2s, pauses, and moves backward for 1.2s.
- Performs random head turns and jumps to avoid anti-AFK detection.
- Respawns automatically if killed.
- Automatically attempts to reconnect every 15 seconds if disconnected or kicked.
