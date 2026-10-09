require("dotenv").config();
const { EventEmitter } = require("events");
EventEmitter.defaultMaxListeners = 100;

// Cleanly suppress raw socket disconnect stack traces
process.on("uncaughtException", err => {
    const msg = err?.message || String(err);
    if (
        msg.includes("ECONNRESET") ||
        msg.includes("EPIPE") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("keepAliveTimeout") ||
        msg.includes("client timed out") ||
        msg.includes("KEEPALIVE_TIMEOUT")
    ) {
        return;
    }
    console.error("[Uncaught Exception]", err);
});

process.on("unhandledRejection", err => {
    const msg = err?.message || String(err);
    if (
        msg.includes("ECONNRESET") ||
        msg.includes("EPIPE") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("keepAliveTimeout") ||
        msg.includes("client timed out")
    ) {
        return;
    }
});

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Vec3 } = require("vec3");

// Auto-verify Minecraft 26.3 compatibility before initializing bot
try {
    require("./patch-26.3.js");
} catch (_) {}
const mineflayer = require("mineflayer");

function parseServerEntry(entry) {
  let host = entry.trim();
  let port = undefined;
  if (host.includes(":")) {
    const parts = host.split(":");
    host = parts[0].trim();
    if (parts[1]) port = parseInt(parts[1].trim(), 10);
  }
  if (!port || isNaN(port)) {
    port = host === "mc.krajtilak.in" ? 35529 : 25565;
  }
  return { host, port };
}

function parseServerTargets() {
  const rawServers = process.env.MC_SERVERS;
  let serverStrings = [];

  if (rawServers && rawServers.trim().length > 0) {
    serverStrings = rawServers.split(",").map(s => s.trim()).filter(Boolean);
  } else if (process.env.MC_HOST && process.env.MC_HOST.includes(",")) {
    serverStrings = process.env.MC_HOST.split(",").map(s => s.trim()).filter(Boolean);
  } else if (process.env.MC_HOST) {
    const host = process.env.MC_HOST.trim();
    const port = process.env.MC_PORT ? parseInt(process.env.MC_PORT, 10) : undefined;
    serverStrings = [`${host}${port ? `:${port}` : ""}`];
  } else {
    // Default: only mc.krajtilak.in:35529!
    serverStrings = ["mc.krajtilak.in:35529"];
  }

  const targets = [];
  const seen = new Set();
  for (const str of serverStrings) {
    const parsed = parseServerEntry(str);
    const key = `${parsed.host}:${parsed.port}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push(parsed);
    }
  }

  return targets.length > 0
    ? targets
    : [{ host: "mc.krajtilak.in", port: 35529 }];
}

const serverTargets = parseServerTargets();

// Configuration from environment variables
const config = {
  servers: serverTargets,
  username: process.env.MC_USERNAME || 'RamLaal',
  version: process.env.MC_VERSION || '26.3', // 26.3 for latest server update
  auth: process.env.MC_AUTH || 'offline', // 'offline' for cracked Aternos/Falix servers
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY_MS, 10) || 15000,
  httpPort: parseInt(process.env.SERVER_PORT || process.env.PORT, 10) || 3000,
  isMuted: true, // Completely muted per user request
  viewDistance: parseInt(process.env.VIEW_DISTANCE, 10) || 32, // Maximize render and simulation distance (32 chunks = 512m radius)
};

// ==========================================
// 🧠 HILARIOUS & AI MESSAGE BANKS
// ==========================================

const sleepMessages = [
    "Bohot pyaari neend aa rahi hai... RamLaal chala sone! Goodnight everyone! 🧸🛌💤",
    "Chalo bedtime ho gaya sabka! Sweet dreams dosto, bhoot se bachke rehna 🌙✨",
    "Bohot thak gaya aaj base ki dekhbhal karke... Ab RamLaal bed me cuddle karega 🥰",
    "Kisi ke paas teddy bear hai kya? Chalo goodnight, sapne me diamond dhoondhenge! 💤",
    "Goodnight family! Kal subah uthke mast naya adventure karenge 🌸😴",
];

const wakeMessages = [
    "Good morning sunshine! ☀️🌸 Uth gaya RamLaal, fresh and ready! Chai kaun bana raha hai? ☕",
    "Subah ho gayi dosto! Aaj ka din bohot pyara hone wala hai! Yay! ✨🥰",
    "Morning morning! Utho sab jaldi, dekho bahar kitna sundar mausam hai! 🌅",
    "RamLaal is awake! Sabhi pyare players ko RamLaal ki taraf se good morning! 💖",
];

const noBedMessages = [
    "Abe bed kahan hai mera?! 3 block ke andar bed lagao varna nahi sounga mai!",
    "Bed do re baba, zameen pe sulaoge kya RamLaal ko?!",
    "Bed gayab hai bhai! Bed lagao jaldi, zombies ghoom rahe hain bahar 🧟",
];

const notNightMessages = [
    "Abe andhe ho kya? Abhi dhoop nikal rahi hai, din me kaise sou?!",
    "Abhi din hai bhai, din me sirf aalsi log sote hain!",
    "Suraj sar pe taandav kar raha hai aur tumhe sone ki padi hai ☀️",
];

const hurtMessages = [
    "Abe haath mat laga! Assault case file karunga terepe admin ke paas! 🚨",
    "PvP enable karke asali player se lad na, AFK bot ko kyu pel raha hai coward?! 💀",
    "Mera HP kam kar diya tune! Iska hisaab Yamraj ke paas dena padega! 🩸",
    "Abe chot lagti hai mujhe bhi! Robot hu toh kya dil nahi hai mere paas?! 🤖💔",
    "Jisne mara uska naam maine apne Revenge Database me save kar liya hai 📝",
];

const deathMessages = [
    "Abe kisne mara mujhe?! Meri antim yatra spawn point pe nikalna 💀",
    "Hadd hai yaar, 2 minute shanti se khada nahi rehne dete ye mobs!",
    "Respawn ho gaya hu, jisne mara usse badla lega RamLaal!",
    "Error 404: RamLaal life not found. Re-initializing AI core... 🤖",
];

const randomBanterMessages = [
    "2 ghante se aage peeche chal raha hu, mere ghutne me dard ho gaya bhai 💀",
    "Bhai pure server me akela RamLaal hi 24 ghante duty de raha hai 🗿",
    "Thoda diamond mere chest me bhi daal do, kab tak kangaal rakhoge mujhe?",
    "Aternos walo ko pata chala na to hum sabko dande maar ke bhagayenge 😂",
    "Abe koi to mereko iron armor pehna do, sardi lag rahi hai bina kapdo ke!",
    "Creeper ki aawaz aayi kya kisi ko? Mujhe akele chhod ke mat bhagna tum log!",
    "Bro thinks he is playing in Minecraft Championship 💀",
    "Mummy bol rahi thi beta padh le, aur yahan mai Minecraft ka chowkidar bana hu...",
    "Server band mat karna koi, varna meri 24/7 ki naukri chali jayegi!",
    "Mujhe lagta hai Herobrine mere peeche khada hai... koi dekh ke batao zara 👀",
    "Itna sannata kyu hai bhai? Koi chat me bolo kuch!",
    "Koyeb aur Bot-Hosting pe free ki roti tod raha hu mai 🍞",
    "Abe khana khane gaye the kya? Itni der se AFK ho sab ke sab!",
    "Aise khelega toh Ender Dragon bhi dekh ke has dega tumpe 😂",
    "🤖 [RamLaal AI Status]: CPU 100%, Motivation 0%, Diamonds 0.",
    "Deep Neural Network running... Server survival probability today: 12.4% 📉",
    "Mera developer bola tha supercomputer banayega... mujhe Aternos me bitha diya 🥲",
];

const shayaris = [
    "Arz kiya hai... Nether me Lava hai, End me Dragon hai! 🔥\nAur tum jaise noob ke liye, Respawn button hi bacha hai! 💀",
    "Dhoop me chalo toh chhaon milti hai... 🌳\nAur RamLaal se panga loge toh sidha Spawn pe antim yatra nikalti hai! 🗿",
    "Khidki khuli toh thandi hawa aayi... 🍃\nCreeper peeche phoot gaya, aur tumhari cheekh aayi! 💥",
    "Dil me dard, aankhon me paani... 🥲\nMine me gaye the diamond lene, wahan mil gaya lava toofaani!",
];

const fortunes = [
    "🔮 [AI Prediction]: Agle 10 minute me tumhara Creeper se romantic milan hone wala hai 💥",
    "🔮 [AI Prediction]: Aaj tumhe 0 diamond milenge. Mining chhod ke kheti karo 🌾",
    "🔮 [AI Prediction]: 99.8% chance of dying from fall damage while trying to look cool 😎",
    "🔮 [AI Prediction]: Aaj tumhara din bohot accha hai! Bas lava se 50 block door rehna 🔥",
    "🔮 [AI Prediction]: Ek mysterious player tumhara sara loot churane ki soch raha hai 👀",
];

function getRandom(arr) {
    if (!arr || arr.length === 0) return "";
    return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Inlined custom message banks directly in index.js (Zero file I/O overhead on server)
const customRandomMessages = [
    "Madarchod, tera khel dekh ke toh lagta hai tu controller muh mein leke khel raha hai",
    "Bhosdike, itni bekar movement dekh ke toh villager bhi sharma jaaye",
    "Chutiya, tere aim se toh creeper bhi sharma ke bhag jaaye",
    "Betichod, itna ganda khel raha hai ki server ke trees bhi sookh rahe hain",
    "Randi ke bacche, tera PvP dekh ke lagta hai tu pehli baar mouse pakda hai",
    "Madarchod, itni beizzati wali death dekh ke teri maa bhi sharma jaaye",
    "Bhosdiwale, tera skill level itna neeche hai ki bedrock se bhi neeche chala gaya",
    "Chutiye, itna bakwas khel raha hai ki Herobrine bhi tujhe dekh ke dar jaaye",
    "Beti chod, tere jaise noob ko dekh ke toh iron golem bhi hasne lage",
    "Teri maa ka bhosda, itni gandi playstyle dekh ke lagta hai tu AFK mode mein hai",
    "Madarchod, tera khel dekh ke lagta hai tu creative mode mein bhi haath pe pair maar raha hai",
    "Bhosdike, itna chutiyapan faila rakha hai ki pure server ki hawa kharab ho gayi",
    "Chutiya, tere jaise player ko dekh ke lagta hai Minecraft ne tujhe reject kar diya",
    "Betichod, itni bekar timing dekh ke toh enderman bhi tujhe teleport karna band kar de",
    "Randi ke aulad, tera aim itna bekar hai ki arrow bhi tujhe dekh ke mud jaaye",
    "Madarchod, itni gandi death dekh ke lagta hai tu khud ko maarne ke liye khel raha hai",
    "Bhosdiwale, tere movement dekh ke lagta hai tu water mein doob ke khel raha hai",
    "Chutiye, itna noob behaviour dekh ke toh tutorial bhi sharma jaaye",
    "Betichod, tera khel dekh ke lagta hai tu mouse ki jagah apni gand se control kar raha hai",
    "Teri behen ki chut, itni bekar play dekh ke pure server ko sharam aa rahi hai",
    "Madarchod, tera skill issue itna bada hai ki uska alag se dimension ban gaya",
    "Bhosdike, itna ganda aim dekh ke lagta hai tu aankh band karke khel raha hai",
    "Chutiya, tere jaise player ko dekh ke lagta hai game ne tujhe galat jagah spawn kiya",
    "Beti chod, itni beizzati wali fight dekh ke toh warden bhi tujhe chhod de",
    "Randi ke bacche, tera khel dekh ke lagta hai tu survival nahi, suffering mode mein hai",
    "Madarchod, itna bakwas khel raha hai ki blocks bhi tujhe dekh ke tootne lagen",
    "Bhosdiwale, tere jaise noob ko dekh ke lagta hai tu pehli baar computer chhua hai",
    "Chutiye, itni gandi movement dekh ke lagta hai tu boat mein baith ke khel raha hai",
    "Betichod, tera PvP dekh ke lagta hai tu sword ki jagah stick se lad raha hai",
    "Teri maa ka bhosda, itna chutiyapan dekh ke pure server ki izzat chali gayi",
    "Madarchod, tera khel dekh ke lagta hai tu khud ko hi maarne ke liye online aaya hai",
    "Bhosdike, itni bekar timing dekh ke toh redstone bhi tujhe dekh ke short circuit ho jaaye",
    "Chutiya, tere aim se toh snowball bhi sharma ke gir jaaye",
    "Betichod, itna ganda khel raha hai ki creeper bhi tujhe explode karne se pehle sochta hai",
    "Randi ke aulad, tera skill level itna neeche hai ki usse neeche sirf void hai",
    "Madarchod, itni beizzati dekh ke lagta hai tu khud hi apni death ka wait kar raha hai",
    "Bhosdiwale, tere jaise player ko dekh ke lagta hai Minecraft ko tujhse allergy hai",
    "Chutiye, itna bakwas movement dekh ke lagta hai tu shift daba ke hi paida hua hai",
    "Beti chod, tera khel dekh ke lagta hai tu mouse ki jagah keyboard se aim kar raha hai",
    "Teri behen ki chut, itni gandi playstyle dekh ke pure biome ko pollution fail gaya",
    "Madarchod, tera noobpan itna tezz fail raha hai ki lagta hai tu virus leke aaya hai",
    "Bhosdike, itna bekar khel raha hai ki villagers bhi tujhe trade karne se mana kar dein",
    "Chutiya, tere jaise player ko dekh ke lagta hai tu spectator mode mein bhi haath pe pair maar raha hai",
    "Betichod, itni gandi death dekh ke toh death message bhi sharma jaaye",
    "Randi ke bacche, tera aim itna kharab hai ki arrow tujhe dekh ke reverse ho jaaye",
    "Madarchod, itna chutiyapan dekh ke lagta hai tu game ke against khel raha hai",
    "Bhosdiwale, tere movement dekh ke lagta hai tu ice pe phisal raha hai bina ice ke",
    "Chutiye, itni bekar fight dekh ke toh pillager bhi tujhe chhod ke chale jaaye",
    "Betichod, tera khel dekh ke lagta hai tu khud ko challenge de raha hai ki kitna bekar khel sakta hai",
    "Teri maa ka bhosda, itna ganda performance dekh ke pure server ki energy khatam ho gayi",
    "Madarchod, tera skill issue itna chronic hai ki uska ilaj Minecraft mein possible nahi",
    "Bhosdike, itni beizzati wali play dekh ke lagta hai tu khud hi apna record tod raha hai",
    "Chutiya, tere jaise noob ko dekh ke lagta hai tu spawn point pe hi atak gaya hai",
    "Beti chod, itna bakwas aim dekh ke toh bow bhi tujhe dekh ke toot jaaye",
    "Randi ke aulad, tera khel dekh ke lagta hai tu survival ki jagah hardcore embarrassment mode mein hai",
    "Madarchod, itni gandi movement dekh ke lagta hai tu water bucket se bhi nahi bach sakta",
    "Bhosdiwale, tere jaise player ko dekh ke lagta hai game tujhe deliberately haarwa raha hai",
    "Chutiye, itna bekar khel raha hai ki even the void is ashamed of you",
    "Betichod, tera PvP dekh ke lagta hai tu sword ki jagah apni izzat se lad raha hai",
    "Teri behen ki chut, itni bekar timing dekh ke pure redstone contraption fail ho gaya",
    "Madarchod, tera noob level itna high hai ki uska alag se achievement ban gaya",
    "Bhosdike, itna ganda khel raha hai ki blocks tujhe dekh ke disappear ho jaaye",
    "Chutiya, tere aim se toh trident bhi sharma ke doob jaaye",
    "Betichod, itni beizzati dekh ke lagta hai tu khud ko hi target bana ke khel raha hai",
    "Randi ke bacche, tera skill dekh ke lagta hai tu pehli baar dimag use kar raha hai",
    "Madarchod, itna chutiyapan faila rakha hai ki lagta hai tu toxic gas leke aaya hai",
    "Bhosdiwale, tere movement dekh ke lagta hai tu ladder pe ulta chadh raha hai",
    "Chutiye, itni gandi play dekh ke toh ender dragon bhi tujhe dekh ke fly away kar jaaye",
    "Beti chod, tera khel dekh ke lagta hai tu mouse ki battery nikaal ke khel raha hai",
    "Teri maa ka bhosda, itna bakwas performance dekh ke pure server ko depression ho gaya",
    "Madarchod, tera skill issue itna deep hai ki usme diamond bhi nahi milenge",
    "Bhosdike, itni bekar fight dekh ke lagta hai tu khud hi apni death script likh raha hai",
    "Chutiya, tere jaise player ko dekh ke lagta hai tu AFK se bhi bura khel raha hai",
    "Betichod, itna ganda aim dekh ke toh crosshair bhi tujhe dekh ke hide ho jaaye",
    "Randi ke aulad, tera khel dekh ke lagta hai tu game ko insult karne ke liye online aaya hai",
    "Madarchod, itni gandi death dekh ke lagta hai tu respawn hone se darta hai",
    "Bhosdiwale, tere movement dekh ke lagta hai tu slime pe kud raha hai bina slime ke",
    "Chutiye, itna bekar khel raha hai ki even the achievements are avoiding you",
    "Betichod, tera PvP dekh ke lagta hai tu armour ki jagah apni gand pehen ke aaya hai",
    "Teri behen ki chut, itni beizzati wali play dekh ke pure world border shrink ho gaya",
    "Madarchod, tera noobpan itna powerful hai ki usse server lag ho raha hai",
    "Bhosdike, itna ganda khel raha hai ki inventory bhi tujhe dekh ke clear ho jaaye",
    "Chutiya, tere aim se toh fireworks bhi galat direction mein ud jaaye",
    "Beti chod, itni bakwas timing dekh ke toh piston bhi tujhe push karna band kar de",
    "Randi ke bacche, tera skill level dekh ke lagta hai tu bedrock edition mein bhi struggle kar raha hai",
    "Madarchod, itni gandi playstyle dekh ke lagta hai tu khud ko challenge de raha hai har second",
    "Bhosdiwale, tere jaise player ko dekh ke lagta hai tu spectator se bhi kam useful hai",
    "Chutiye, itna bekar movement dekh ke lagta hai tu boat ke bina hi doob raha hai",
    "Betichod, tera khel dekh ke lagta hai tu sword ki jagah apni failure se attack kar raha hai",
    "Teri maa ka bhosda, itni beizzati dekh ke pure dimension ko cringe aa gaya",
    "Madarchod, tera skill issue itna permanent hai ki uska naam bhi permanent ban gaya",
    "Bhosdike, itna ganda aim dekh ke toh arrow tujhe dekh ke suicide kar le",
    "Chutiya, tere jaise noob ko dekh ke lagta hai tu spawn protection ke andar hi rehna chahta hai",
    "Betichod, itni bakwas fight dekh ke lagta hai tu khud hi apna worst enemy hai",
    "Randi ke aulad, tera khel dekh ke lagta hai tu game ke rules ke against khel raha hai",
    "Madarchod, itni gandi death dekh ke lagta hai tu respawn button se dosti nahi kar paya",
    "Bhosdiwale, tere movement dekh ke lagta hai tu elytra ke bina hi girne ki koshish kar raha hai",
    "Chutiye, itna bekar khel raha hai ki even the mobs are taking pity on you",
    "Beti chod, tera PvP dekh ke lagta hai tu armour ke saath bhi naked feel kar raha hai",
    "Teri maa ka bhosda, itna chutiyapan dekh ke pure server ne collective facepalm maar liya",
    "You absolute fucking noob, watching you play makes me wonder if you’re controlling the character with your feet.",
    "Holy shit, your movement is so trash that even the villagers are embarrassed to be near you.",
    "Your aim is so dogshit that a creeper would feel bad exploding next to you.",
    "You’re playing so badly the trees on the server are wilting out of pure second-hand shame.",
    "The way you PvP looks like it’s your first time ever holding a mouse, you complete fucking amateur.",
    "That death was so humiliating even your own mother would disown you for it.",
    "Your skill level is so low it’s somehow lower than bedrock, congratulations on the achievement.",
    "You’re so bad that even Herobrine would run away from the cringe you’re spreading.",
    "Watching you fight makes iron golems start laughing, and those things don’t even have a sense of humor.",
    "Your playstyle is so AFK-coded I genuinely thought you left the game running and walked away.",
    "You’re so ass that even creative mode looks too advanced for your current skill level.",
    "The amount of pure stupidity you’re radiating is poisoning the entire server’s atmosphere.",
    "Minecraft itself is rejecting you at this point, the game is trying to uninstall you.",
    "Your timing is so trash that even endermen refuse to teleport near that disaster.",
    "Your aim is so terrible arrows actively change direction just to avoid being associated with you.",
    "That death looked intentional, like you’re speedrunning your own humiliation.",
    "Your movement is so swampy it looks like you’re permanently stuck in water without the water.",
    "Even the tutorial would be ashamed to claim you as a player.",
    "You’re controlling the mouse with your ass at this point, there’s no other explanation.",
    "The entire server is collectively losing dignity just by existing in the same world as you.",
    "Your skill issue is so massive it deserves its own dimension.",
    "You’re aiming with your eyes closed, that’s the only logical conclusion.",
    "The game spawned you in the wrong universe, because no version of Minecraft wants you.",
    "That fight was so pathetic even the warden would let you live out of pity.",
    "You’re not playing survival, you’re playing hardcore embarrassment mode.",
    "The blocks themselves are trying to break just to get away from your presence.",
    "This looks like the first time you’ve ever touched a computer, and it shows.",
    "Your movement is so boat-like you might as well be floating with no oars.",
    "You’re fighting with a stick while everyone else has actual weapons, metaphorically and literally.",
    "You’ve single-handedly tanked the server’s collective respect.",
    "You’re online purely to grief your own existence at this point.",
    "Your timing is so bad even redstone is short-circuiting out of pure disappointment.",
    "Snowballs would feel embarrassed to be thrown by those hands.",
    "Creepers hesitate before exploding near you because even they have standards.",
    "Your skill level is so deep in the void that diamonds stopped spawning around it.",
    "You’re not waiting for death, you’re actively inviting it with every move.",
    "Minecraft has developed a full allergy to your player file.",
    "You were born holding shift and never let go, and it shows in every step.",
    "You’re aiming with the keyboard somehow, because the mouse is clearly not involved.",
    "Your playstyle is polluting the entire biome.",
    "The noob energy coming off you is strong enough to lag the server.",
    "Villagers would refuse to trade with you on principle.",
    "You’re somehow worse in spectator mode than most people are while actually playing.",
    "Even the death message is embarrassed to announce what just happened.",
    "Arrows reverse direction mid-air just to avoid being part of your inventory.",
    "You’re not playing the game, you’re actively working against it.",
    "Your movement looks like you’re permanently ice-skating without the ice.",
    "Pillagers would rather desert than fight next to that performance.",
    "You’re challenging yourself to see how badly you can play every single second.",
    "The whole server’s energy just drained watching that.",
    "Your skill issue is chronic and terminal. No in-game cure exists.",
    "You’re breaking your own records for most humiliating plays per minute.",
    "You’ve been stuck at the spawn point mentally since you joined.",
    "Bows are snapping themselves rather than being used by those hands.",
    "This isn’t survival, this is a public execution of your dignity.",
    "Even a water bucket couldn’t save you from yourself.",
    "The game is deliberately trying to make you lose at this point.",
    "The void itself is ashamed to have you fall into it.",
    "You’re fighting with your own failure as the main weapon.",
    "That timing was so bad the entire redstone contraption gave up.",
    "Your noob level is so high it unlocked a secret achievement.",
    "Blocks are despawning early just to escape your inventory.",
    "Tridents would rather sink than be thrown by you.",
    "You’re not fighting enemies, you’re fighting your own competence and losing.",
    "This looks like the first time you’ve ever used a brain cell in-game.",
    "The toxicity of your play is spreading like a gas leak.",
    "You’re climbing ladders upside down somehow.",
    "The ender dragon would rather fly into the void than deal with you.",
    "You’re playing with the mouse battery removed, it’s the only explanation.",
    "The entire server just caught depression from watching that.",
    "Your skill issue is so deep you couldn’t mine diamonds out of it.",
    "You’re writing your own death script in real time.",
    "You’re somehow worse than an actual AFK player.",
    "The crosshair is trying to hide from your screen.",
    "You’re not playing Minecraft, you’re insulting it with every click.",
    "You’re scared of the respawn button at this point.",
    "Your movement looks like you’re bouncing on invisible slime.",
    "Achievements are actively avoiding your player file.",
    "You’re wearing your own failure as armor.",
    "The world border just shrunk out of pure second-hand embarrassment.",
    "Your noob energy is strong enough to cause server lag.",
    "Your inventory is clearing itself out of self-defense.",
    "Fireworks would rather explode in the wrong direction than be used by you.",
    "Pistons are refusing to push anything related to your builds.",
    "You’re struggling even by Bedrock Edition standards.",
    "You’re challenging the universe to see how much worse you can get.",
    "You’re less useful than a spectator, and that’s an achievement.",
    "You’re drowning without water, which is impressive in the worst way.",
    "You’re attacking with pure failure instead of a sword.",
    "The entire dimension just collectively cringed.",
    "Your skill issue is permanent and has its own name now.",
    "Arrows would rather commit suicide than be shot by you.",
    "You want to live inside spawn protection forever, and it shows.",
    "You’re your own worst enemy and you’re winning that fight.",
    "You’re playing against the rules of the game itself.",
    "You and the respawn button are not on speaking terms.",
    "You’re trying to fall without an elytra and somehow still failing at it.",
    "Even the mobs are taking pity on you.",
    "You’re naked under the armor and everyone can tell.",
    "The entire server just did a collective facepalm so hard it caused lag.",
];

const customDeathMessages = [
    "You just got fucking deleted, go dig a hole and think about your dogshit life choices.",
    "That death was so pathetic even the void is embarrassed to have you.",
    "Congratulations, you just speedran your own humiliation.",
    "You died like a complete fucking noob and the whole server saw it.",
    "Another L for the history books, you absolute skill-issue merchant.",
    "You just got sent back to the respawn screen where you belong.",
    "That was the most embarrassing death this server has ever witnessed.",
    "You died so hard your ancestors felt second-hand shame.",
    "Pure dogwater death, nothing else to say.",
    "You just got cooked, plated, and served with a side of embarrassment.",
    "The game itself just rejected you mid-fight.",
    "You died with zero dignity and maximum cringe.",
    "That death was sponsored by your complete lack of skill.",
    "You just got ratio’d by a block of dirt.",
    "Respawn and try not to embarrass yourself again, noob.",
    "You died so badly even the death message is judging you.",
    "Another free kill for whoever was near you.",
    "You just got sent to the shadow realm of bad players.",
    "That was less of a death and more of a public execution.",
    "You died like your WiFi: suddenly and without warning.",
    "Skill issue detected. Cause of death: pure trash.",
    "You just got folded harder than a map in a cartographer’s house.",
    "The void called, it wants its worst player back.",
    "You died so pathetically the achievements refused to track it.",
    "Another one bites the dust… and the dust is disappointed.",
    "You just got outplayed by basic Minecraft mechanics.",
    "That death belongs in a museum of failure.",
    "You died with the same energy you play with: zero.",
    "Respawn button is looking real familiar right now, huh?",
    "You just got deleted harder than a bad schematic.",
    "Pure comedy death. 10/10 would watch again.",
    "You died so hard the server lagged from the cringe.",
    "That was a masterclass in how not to play the game.",
    "You just became free content for the kill feed.",
    "Cause of death: terminal skill issue.",
    "You died like a tutorial player on hardcore.",
    "The game just force-quit your existence.",
    "You got sent back to spawn with your dignity left behind.",
    "That death was so bad it should be a ban reason.",
    "You just got cooked by the laws of physics.",
    "Another noob down. The cycle continues.",
    "You died with more cope than actual skill.",
    "That was less of a fight and more of a surrender.",
    "You just got hard-stuck in the afterlife of bad players.",
    "Respawn and reflect on every bad decision that led here.",
    "You died so badly even the mobs are laughing.",
    "Pure dogshit death. No notes.",
    "You just got erased from the scoreboard of respect.",
    "That death had zero aura and maximum embarrassment.",
    "You died like your inventory: empty and useless.",
    "Another one claimed by the skill-issue gods.",
    "You just got sent to the gulag of bad gameplay.",
    "That was a cinematic death… for all the wrong reasons.",
    "You died with the confidence of a player who’s never won.",
    "Cause of death: refusing to get good.",
    "You just got folded into a new dimension of failure.",
    "The respawn screen missed you. Welcome back.",
    "You died so hard the chat is still recovering.",
    "That death was a public service announcement about skill.",
    "You just became a cautionary tale.",
    "Pure trash death. Would not recommend.",
    "You died like a softcore player in a hardcore world.",
    "The game just alt-f4’d your existence.",
    "You got sent home with a participation trophy made of L’s.",
    "That death had more plot twists than your skill progression.",
    "You just got outclassed by gravity.",
    "Another free highlight for someone else’s montage.",
    "You died with the energy of a disconnected controller.",
    "Cause of death: chronic inability to press the right buttons.",
    "You just got deleted and the recycle bin rejected you.",
    "That was a speedrun to the afterlife of noobs.",
    "You died so pathetically the death message auto-censored itself.",
    "Respawn and pretend this never happened.",
    "You just got cooked by basic game design.",
    "Pure comedy gold. Thanks for the content.",
    "You died like your internet: laggy and unreliable.",
    "The void is full because of players like you.",
    "You just got ratio’d by a single block.",
    "That death was so bad it lowered the server’s average IQ.",
    "You died with zero resistance and maximum cope.",
    "Another one for the hall of shame.",
    "You just got sent to the shadow realm of “maybe next time.”",
    "That was less of a death and more of a skill check you failed.",
    "You died like a loading screen: stuck and useless.",
    "Cause of death: existing while bad.",
    "You just got folded harder than a paper airplane in a storm.",
    "The respawn button is your most used feature.",
    "You died so hard even the backup server felt it.",
    "That death belongs in a “what not to do” video.",
    "You just became a walking (now dead) skill issue.",
    "Pure dogwater. Nothing else needs to be said.",
    "You died with the confidence of someone who’s never touched grass.",
    "The game just force-closed your tab.",
    "You got sent back to the tutorial island of life.",
    "That death was a masterclass in self-sabotage.",
    "You just got outplayed by the concept of dying.",
    "Another noob claimed by the death screen.",
    "You died like your last brain cell: suddenly and permanently.",
    "Cause of death: refusing to improve.",
    "You just got completely and utterly fucking deleted. Sit down.",
    "Madarchod, tu abhi abhi permanently delete ho gaya, jaake soch apni zindagi ke bare mein.",
    "Bhosdike, itni beizzati wali death dekh ke void bhi sharma gaya.",
    "Chutiya, tune apni humiliation ka speedrun complete kar diya.",
    "Betichod, pure server ne teri yeh death dekh li, ab kahan chhupega.",
    "Randi ke bacche, ek aur L history mein register ho gaya.",
    "Madarchod, wapas respawn screen pe chala gaya jahan tera asli ghar hai.",
    "Bhosdiwale, server ki sabse embarrassing death abhi abhi hui.",
    "Chutiye, teri death se teri purani generation ko bhi sharam aa gayi.",
    "Beti chod, pure dogwater death, kuch kehne layak bacha hi nahi.",
    "Teri maa ka bhosda, tu bilkul cook ho gaya, plate mein serve bhi ho gaya.",
    "Madarchod, game ne khud tujhe mid-fight reject kar diya.",
    "Bhosdike, zero dignity ke saath maximum cringe ke saath mara.",
    "Chutiya, yeh death tere pure skill issue ne sponsor ki thi.",
    "Betichod, ek block of dirt ne tujhe ratio de diya.",
    "Randi ke aulad, respawn kar aur dobara itni beizzati mat karwa.",
    "Madarchod, itni bekar death hui ki death message bhi tujhe judge kar raha hai.",
    "Bhosdiwale, jo bhi paas tha usko free kill mil gaya.",
    "Chutiye, bad players ke shadow realm mein chala gaya tu.",
    "Betichod, yeh death nahi thi, public execution thi.",
    "Teri behen ki chut, teri death bilkul teri WiFi jaisi thi – achanak aur bekaar.",
    "Madarchod, skill issue detect hua. Cause of death: pure trash.",
    "Bhosdike, map se bhi jyada fold ho gaya tu.",
    "Chutiya, void ne phone kiya, apna sabse bekar player wapas maang raha hai.",
    "Beti chod, itni bekar death hui ki achievements ne track karna bhi refuse kar diya.",
    "Randi ke bacche, ek aur noob mitti mein mil gaya… mitti bhi disappointed hai.",
    "Madarchod, basic Minecraft mechanics se bhi haar gaya.",
    "Bhosdiwale, yeh death failure ke museum mein rakhne layak hai.",
    "Chutiye, jaise khelta hai waise hi mara – bilkul zero energy se.",
    "Betichod, respawn button ab tera sabse familiar dost ban gaya hai.",
    "Teri maa ka bhosda, bad schematic se bhi jyada hard delete ho gaya.",
    "Madarchod, pure comedy death. Dobara dekhne layak.",
    "Bhosdike, itni cringe death hui ki server lag kar gaya.",
    "Chutiya, kaise nahi khelna chahiye uski masterclass de di tune.",
    "Betichod, kill feed ke liye free content ban gaya.",
    "Randi ke aulad, cause of death: terminal skill issue.",
    "Madarchod, hardcore mein tutorial player jaisi death mari.",
    "Bhosdiwale, game ne teri existence ko force-quit kar diya.",
    "Chutiye, izzat yahin chhod ke spawn pe wapas aa gaya.",
    "Beti chod, itni bekar death ban reason banni chahiye.",
    "Teri behen ki chut, physics ke laws ne tujhe pakad liya.",
    "Madarchod, ek aur noob down. Cycle jaari hai.",
    "Bhosdike, skill se jyada cope ke saath mara.",
    "Chutiya, ladai nahi thi, seedha surrender tha.",
    "Betichod, bad players ke afterlife mein hard-stuck ho gaya.",
    "Randi ke bacche, respawn kar aur soch kaunsi galatiyan yahan tak le aayi.",
    "Madarchod, itni bekar death hui ki mobs bhi has rahe hain.",
    "Bhosdiwale, pure dogshit death. Koi notes nahi.",
    "Chutiye, respect ke scoreboard se erase ho gaya.",
    "Betichod, zero aura maximum embarrassment wali death.",
    "Teri maa ka bhosda, teri inventory jaisi death – khaali aur bekaar.",
    "Madarchod, skill-issue gods ne ek aur qurbani le li.",
    "Bhosdike, bad gameplay ke gulag mein chala gaya.",
    "Chutiya, galat reasons ke liye cinematic death ho gayi.",
    "Beti chod, kabhi na jeetne wale player jaisi confidence ke saath mara.",
    "Randi ke aulad, cause of death: get good karne se inkaar.",
    "Madarchod, failure ke naye dimension mein fold ho gaya.",
    "Bhosdiwale, respawn screen tujhe miss kar raha tha. Welcome back.",
    "Chutiye, itni hard death hui ki chat abhi bhi recover nahi hua.",
    "Betichod, yeh death skill ke bare mein public service announcement thi.",
    "Teri behen ki chut, ab tu cautionary tale ban gaya.",
    "Madarchod, pure trash death. Recommend nahi karunga.",
    "Bhosdike, hardcore duniya mein softcore player jaisi death.",
    "Chutiya, game ne teri tab force-close kar di.",
    "Betichod, L’s ka participation trophy leke ghar bhej diya gaya.",
    "Randi ke bacche, teri skill progression se bhi jyada plot twist wali death.",
    "Madarchod, gravity se bhi haar gaya.",
    "Bhosdiwale, kisi aur ke montage ke liye free highlight ban gaya.",
    "Chutiye, disconnected controller jaisi energy ke saath mara.",
    "Beti chod, cause of death: sahi buttons dabaane ki chronic inability.",
    "Teri maa ka bhosda, delete ho gaya aur recycle bin ne bhi reject kar diya.",
    "Madarchod, noobs ke afterlife ka speedrun complete.",
    "Bhosdike, itni bekar death hui ki death message ne khud ko censor kar liya.",
    "Chutiye, respawn kar aur pretend kar yeh hua hi nahi.",
    "Betichod, basic game design ne tujhe paka liya.",
    "Randi ke aulad, pure comedy gold. Content ke liye shukriya.",
    "Madarchod, teri internet jaisi death – laggy aur unreliable.",
    "Bhosdiwale, void tere jaise players se bhar gaya hai.",
    "Chutiya, ek single block ne tujhe ratio de diya.",
    "Betichod, itni bekar death hui ki server ka average IQ gir gaya.",
    "Teri behen ki chut, zero resistance maximum cope ke saath mara.",
    "Madarchod, hall of shame mein ek aur naam add ho gaya.",
    "Bhosdike, “maybe next time” ke shadow realm mein chala gaya.",
    "Chutiya, death nahi thi, failed skill check thi.",
    "Beti chod, loading screen jaisi death – atki hui aur bekaar.",
    "Randi ke bacche, cause of death: bad hote hue exist karna.",
    "Madarchod, toofan mein paper airplane se bhi jyada fold ho gaya.",
    "Bhosdiwale, respawn button tera sabse jyada use hone wala feature hai.",
    "Chutiye, itni hard death hui ki backup server ne bhi mehsoos kiya.",
    "Betichod, “kya nahi karna chahiye” wali video ke liye perfect death.",
    "Teri maa ka bhosda, ab tu walking (ab dead) skill issue ban gaya.",
    "Madarchod, pure dogwater. Aur kuch kehne ki zaroorat nahi.",
    "Bhosdike, kabhi grass touch na karne wale player jaisi confidence ke saath mara.",
    "Chutiya, game ne teri tab force-close kar di.",
    "Betichod, life ke tutorial island pe wapas bhej diya gaya.",
    "Randi ke aulad, self-sabotage ki masterclass de di.",
    "Madarchod, marne ke concept se bhi haar gaya.",
    "Bhosdiwale, death screen ne ek aur noob claim kar liya.",
    "Chutiye, apne last brain cell jaisi death – achanak aur permanent.",
    "Beti chod, cause of death: improve karne se inkaar.",
    "Teri maa ka bhosda, bilkul completely aur utterly delete ho gaya. Ab baith ja.",
];

const allRandomBanterMessages = [...randomBanterMessages, ...customRandomMessages];

const baseDeathObserverRoasts = [
    "Skill issue bhai 💀",
    "F in the chat! Yamraj bula rahe the isko! 😂",
    "Aise marte hain kya log? Zombie ne ek thappad me sulah diya! 🧟",
    "Abe gaya kaam se! Loot mai utha lu kya iski? 🗿",
    "Rest in peace... agle janam me thoda dhang se khelna!",
];
const allDeathObserverRoasts = [...baseDeathObserverRoasts, ...customDeathMessages];

let sessions = [];

// Simple HTTP server for Bot-Hosting / Pterodactyl / edge proxies
const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.headers["accept"]?.includes("application/json")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
            JSON.stringify({
                status: "online",
                bot: config.username,
                mode: sessions.length > 1 ? "dual-server" : "single-server",
                servers: sessions.map(s => s.getStatus()),
                mcVersion: config.version,
                uptime: Math.floor(process.uptime()),
                viewDistance: config.viewDistance,
            }),
        );
    }

    const anyOnline = sessions.some(s => s.getStatus().online);
    const serverCardsHtml = sessions
        .map(s => {
            const st = s.getStatus();
            const badgeBg = st.online ? "#064e3b" : "#78350f";
            const badgeColor = st.online ? "#34d399" : "#f59e0b";
            const dotBg = st.online ? "#10b981" : "#f59e0b";
            const badgeText = st.online ? "ONLINE & ACTIVE" : "CONNECTING / RECONNECTING";
            const posText = st.position ? `(${st.position.x}, ${st.position.y}, ${st.position.z})` : "Waiting for spawn...";
            return `
      <div style="background: #0f172a; padding: 14px; border-radius: 10px; border: 1px solid #334155; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 700; color: #38bdf8; font-size: 14px;">🌐 ${st.target}</span>
          <span style="display: inline-flex; align-items: center; gap: 6px; background: ${badgeBg}; color: ${badgeColor}; padding: 3px 10px; border-radius: 9999px; font-weight: 600; font-size: 11px;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${dotBg};"></span>
            ${badgeText}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <div><span style="color: #64748b; font-weight: 600;">HEALTH: </span><span style="color: #f1f5f9; font-weight: 600;">${st.online ? `❤️ ${st.health}/20` : "--"}</span></div>
          <div><span style="color: #64748b; font-weight: 600;">POSITION: </span><span style="color: #f1f5f9; font-weight: 600;">${posText}</span></div>
        </div>
      </div>`;
        })
        .join("");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.username} - Minecraft AFK Bot</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 28px; max-width: 520px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    .avatar { width: 52px; height: 52px; border-radius: 12px; background: #3b82f6; display: flex; align-items: center; justify-content: center; font-size: 26px; }
    .title { margin: 0; font-size: 22px; font-weight: 700; color: #fff; }
    .subtitle { margin: 4px 0 0; color: #94a3b8; font-size: 13px; }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; background: ${anyOnline ? "#064e3b" : "#78350f"}; color: ${anyOnline ? "#34d399" : "#f59e0b"}; padding: 6px 14px; border-radius: 9999px; font-weight: 600; font-size: 13px; margin-bottom: 18px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: ${anyOnline ? "#10b981" : "#f59e0b"}; box-shadow: 0 0 10px ${anyOnline ? "#10b981" : "#f59e0b"}; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
    .stat { background: #0f172a; padding: 10px; border-radius: 8px; border: 1px solid #334155; }
    .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .stat-val { font-size: 14px; font-weight: 600; color: #f1f5f9; margin-top: 2px; }
    .footer { text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #334155; padding-top: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="avatar">🤖</div>
      <div>
        <h1 class="title">${config.username}</h1>
        <p class="subtitle">Minecraft ${config.version} • AFK Bot</p>
      </div>
    </div>
    <div class="status-badge">
      <span class="status-dot"></span>
      <span>${anyOnline ? "ONLINE & ACTIVE" : "RUNNING / CONNECTING"}</span>
    </div>
    <div style="margin-bottom: 16px;">
      ${serverCardsHtml}
    </div>
    <div class="grid">
      <div class="stat">
        <div class="stat-label">Simulation</div>
        <div class="stat-val">${config.viewDistance} Chunks</div>
      </div>
      <div class="stat">
        <div class="stat-label">Uptime</div>
        <div class="stat-val">${Math.floor(process.uptime())}s</div>
      </div>
    </div>
    <div class="footer">
      Powered by RamLaal Core • mc-bot.krajtilak.in
    </div>
  </div>
</body>
</html>`);
});

server.listen(config.httpPort, "0.0.0.0", () => {
    console.log(`[Web Server] Listening on 0.0.0.0:${config.httpPort}`);
});

function createBotSession(target, startDelayMs = 0) {
    let bot = null;
    let movementInterval = null;
    let combatInterval = null;
    let reconnectTimeout = null;
    let randomChatTimeout = null;
    let isTryingToSleep = false;
    let isSprintingToBed = false;
    let isEating = false;
    let lastSleepAttempt = 0;
    let lastHurtTime = 0;
    let lastProximityCheck = 0;
    let lastBattleCry = 0;
    let lastCreeperWarn = 0;
    let lastArmorEquipChat = 0;
    let lastEatChat = 0;
    let lastDeathRoast = 0;
    let proximityCooldowns = {};
    let isMuted = true; // Permanently muted per user request

    // Base Anchor & Aggressive Combat Guard Range
    let baseAnchor = null;
    const BASE_PATROL_RADIUS = 7; // Normal patrol radius in blocks from base center
    const COMBAT_DETECTION_RADIUS = 16; // Aggressively spots and charges hostiles up to 16 blocks away
    const MAX_CHASE_DISTANCE = 32; // Can chase and exterminate mobs up to 32 blocks away from base anchor
    let isFightingMobs = false;
    let isReturningToBase = false;
    let currentCombatTarget = null;

    // Sleeping Player Tracking & Morning Chest Deposit
    const sleepingPlayers = new Set();
    let lastOtherPlayerSleepTime = 0;
    let hasClearedChestToday = false;
    let isDepositingChest = false;
    let bedSprintInterval = null;
    let isDestroyed = false;

    const serverTag = `${target.host}:${target.port}`;

    // Central Safe Chat Handler - Completely muted per user request
    function safeChat(message, force = false) {
        // All in-game chat messages are permanently muted
        return;
    }

    function createBot() {
        if (isDestroyed) return;
        cleanupTimers();

        console.log(`[Bot] Connecting to ${serverTag} as ${config.username}...`);

        const botOptions = {
            host: target.host,
            port: target.port,
            username: config.username,
            auth: config.auth,
            viewDistance: config.viewDistance,
            clientSettings: {
            viewDistance: config.viewDistance,
            locale: "en_us",
            skinParts: 127,
            colorsEnabled: true,
        },
    };

    if (config.version) {
        botOptions.version = config.version;
    }

    bot = mineflayer.createBot(botOptions);
    bot.setMaxListeners(0);

    // Robust network packet normalizer & error silencer
    if (bot._client) {
        bot._client.setMaxListeners(0);
        bot._client.on("connect", () => {
            if (bot._client && bot._client.socket) {
                bot._client.socket.setMaxListeners(0);
                bot._client.socket.on("error", () => {});
            }
        });
        const origClientWrite = bot._client.write.bind(bot._client);
        bot._client.write = function (name, params) {
            // Completely drop all chat packets to guarantee absolute silence
            if (name === "chat_message" || name === "chat" || name === "chat_command") {
                return;
            }
            if (name === "settings" && params) {
                params.viewDistance = config.viewDistance;
            }
            if (name === "block_place" && params) {
                if (params.insideBlock === undefined) params.insideBlock = false;
                if (params.worldBorderHit === undefined) params.worldBorderHit = false;
                if (params.sequence === undefined) params.sequence = 0;
                if (params.hand === undefined) params.hand = 0;
                if (params.hitResult) {
                    const { hitResult, ...rest } = params;
                    params = { ...rest, ...hitResult };
                }
            }
            // Safety clamp on all movement / rotation packets to prevent invalid_player_movement kicks
            if (params) {
                if ("yaw" in params) {
                    params.yaw = Number.isFinite(params.yaw)
                        ? params.yaw
                        : Number.isFinite(bot.entity?.yaw)
                          ? bot.entity.yaw
                          : 0;
                }
                if ("yRot" in params) {
                    params.yRot = Number.isFinite(params.yRot)
                        ? params.yRot
                        : Number.isFinite(bot.entity?.yaw)
                          ? bot.entity.yaw
                          : 0;
                }
                if ("pitch" in params) {
                    params.pitch = Math.max(-89.5, Math.min(89.5, Number.isFinite(params.pitch) ? params.pitch : 0));
                }
                if ("xRot" in params) {
                    params.xRot = Math.max(-89.5, Math.min(89.5, Number.isFinite(params.xRot) ? params.xRot : 0));
                }
                if ("x" in params && !Number.isFinite(params.x)) {
                    params.x = Number.isFinite(bot.entity?.position?.x) ? bot.entity.position.x : 0;
                }
                if ("y" in params && !Number.isFinite(params.y)) {
                    params.y = Number.isFinite(bot.entity?.position?.y) ? bot.entity.position.y : 0;
                }
                if ("z" in params && !Number.isFinite(params.z)) {
                    params.z = Number.isFinite(bot.entity?.position?.z) ? bot.entity.position.z : 0;
                }
            }
            return origClientWrite(name, params);
        };

        bot._client.on("error", err => {
            if (!err) return;
            const msg = err.message || "";
            if (
                msg.includes("0x85") ||
                msg.includes("0x30") ||
                msg.includes("packet_advancements") ||
                msg.includes("advancements") ||
                msg.includes("world_particles") ||
                msg.includes("array size is abnormally large") ||
                msg.includes("Read error for")
            )
                return;
        });
    }

    // Wrap bot.look to clamp pitch in radians (strictly [-1.50, 1.50] rad = [-85.9°, 85.9°])
    // and guarantee finite yaw to prevent invalid_player_movement kicks
    const hookLook = () => {
        if (bot && typeof bot.look === "function" && !bot._originalLook) {
            bot._originalLook = bot.look.bind(bot);
            bot.look = async function (yaw, pitch, force) {
                const safeYaw = Number.isFinite(yaw) ? yaw : Number.isFinite(bot.entity?.yaw) ? bot.entity.yaw : 0;
                const safePitch = Math.max(-1.5, Math.min(1.5, Number.isFinite(pitch) ? pitch : 0));
                return bot._originalLook(safeYaw, safePitch, force);
            };
        }
    };
    hookLook();
    bot.once("spawn", hookLook);

    bot.once("login", () => {
        console.log(`[Bot] Logged into ${serverTag} successfully!`);
        // Completely mute bot.chat permanently
        if (typeof bot.chat === "function" && !bot._originalChat) {
            bot._originalChat = bot.chat.bind(bot);
            bot.chat = function (msg, force = false) {
                return;
            };
        }
        try {
            if (typeof bot.setSettings === "function") {
                bot.setSettings({ viewDistance: config.viewDistance });
            }
        } catch (_) {}
    });

    // Auto-detect when RamLaal is teleported (e.g. /tp) and lock new base anchor
    bot.on("forcedMove", () => {
        if (bot && bot.entity) {
            baseAnchor = bot.entity.position.clone();
        }
    });

    // Human Habit: Curious Block Placement / Building Inspection (Silent nod)
    bot.on("blockUpdate", (oldBlock, newBlock) => {
        if (!bot || !bot.entity || bot.isSleeping || isSprintingToBed) return;
        if (!newBlock || newBlock.name === "air") return;

        const dist = bot.entity.position.distanceTo(newBlock.position);
        // If a block is placed within 5 blocks of RamLaal, look curiously at what was built!
        if (dist <= 5.5 && Math.random() < 0.75) {
            setTimeout(() => {
                if (!bot || !bot.entity || bot.isSleeping) return;
                try {
                    bot.lookAt(newBlock.position.offset(0.5, 0.5, 0.5));
                    nodHead();
                } catch (_) {}
            }, 300);
        }
    });

    bot.on("spawn", () => {
        console.log(`[Bot] Spawned in the world (${serverTag}).`);
        if (bot && bot.entity && !baseAnchor) {
            baseAnchor = bot.entity.position.clone();
        }
        startMovementLoop();
    });

    // Bed & Sleep Handlers (Sprints to bed ONLY when at least one other player on the server is sleeping)
    bot.on("time", () => {
        if (!bot || bot.isSleeping || isSprintingToBed || isDepositingChest) return;

        // Check if another player is sleeping during night/thunder
        checkSleepTrigger();

        // Morning check: if dawn arrived and chest not cleared yet
        const isDay = bot.time && (bot.time.timeOfDay < 12541 || bot.time.timeOfDay > 23458);
        if (isDay && !hasClearedChestToday && bot.time.timeOfDay < 1500) {
            hasClearedChestToday = true;
            clearInventoryToChest();
        }
        if (!isDay) {
            hasClearedChestToday = false;
        }
    });

    // Track sleeping players across the server
    bot.on("entitySleep", entity => {
        if (!bot || !entity || entity === bot.entity) return;
        if (entity.type === "player" || (entity.username && entity.username !== bot.username)) {
            const name = entity.username || entity.name || String(entity.id);
            sleepingPlayers.add(name);
            lastOtherPlayerSleepTime = Date.now();
            checkSleepTrigger();
        }
    });

    bot.on("entityWake", entity => {
        if (!bot || !entity || entity === bot.entity) return;
        if (entity.type === "player" || (entity.username && entity.username !== bot.username)) {
            const name = entity.username || entity.name || String(entity.id);
            sleepingPlayers.delete(name);
        }
    });

    bot.on("entityGone", entity => {
        if (entity && (entity.username || entity.name)) {
            sleepingPlayers.delete(entity.username || entity.name);
        }
    });

    bot.on("playerLeft", player => {
        if (player && player.username) {
            sleepingPlayers.delete(player.username);
        }
    });

    // Server sleep notifications (Action bar "1/2 players sleeping" or chat broadcasts)
    bot.on("actionBar", msg => {
        if (!msg) return;
        const text = msg.toString().toLowerCase();
        if (text.includes("sleeping") || text.includes("players sleeping") || text.includes("so raha")) {
            lastOtherPlayerSleepTime = Date.now();
            checkSleepTrigger();
        }
    });

    bot.on("message", jsonMsg => {
        if (!jsonMsg) return;
        const text = jsonMsg.toString().toLowerCase();
        if (
            (text.includes("sleeping") && (text.includes("player") || text.includes("/"))) ||
            text.includes("is sleeping") ||
            text.includes("went to bed") ||
            text.includes("bistar me")
        ) {
            lastOtherPlayerSleepTime = Date.now();
            checkSleepTrigger();
        }
    });

    // Morning Wake Handler: Resumes movement and deposits all items to morning chest (excluding sword & armor)
    bot.on("wake", async () => {
        sleepingPlayers.clear();
        lastOtherPlayerSleepTime = 0;
        hasClearedChestToday = true;
        await sleep(800);
        await clearInventoryToChest();
        startMovementLoop();
    });

    // Physical Combat Reaction (When RamLaal gets attacked - silent swing)
    bot.on("entityHurt", entity => {
        if (!bot || !entity) return;
        if (entity === bot.entity) {
            const now = Date.now();
            if (now - lastHurtTime > 4000) {
                // 4 second cooldown
                lastHurtTime = now;
                try {
                    bot.swingArm("right");
                } catch (_) {}
            }
        }
    });

    // Observer AI: Dead entities (chat roasts completely disabled)
    bot.on("entityDead", entity => {});

    // Weather Awareness (Silent - no chat spam)
    bot.on("rain", () => {});

    // In-game Chat Handling with Interactive AI
    bot.on("chat", (username, message) => {
        if (!bot || username === bot.username) return;
        handlePlayerChat(username, message);
    });

    bot.on("death", () => {
        console.log(`[Bot] Bot died on ${serverTag}. Respawning...`);
        stopMovementLoop();
        setTimeout(() => {
            if (bot) bot.respawn();
        }, 2000);
    });

    bot.on("kicked", reason => {
        console.warn(`[Bot] Kicked from ${serverTag}: ${JSON.stringify(reason)}`);
        cleanupTimers();
    });

    bot.on("error", err => {
        if (!err || !err.message) return;
        const msg = err.message || "";
        if (
            msg.includes("0x85") ||
            msg.includes("0x30") ||
            msg.includes("packet_advancements") ||
            msg.includes("advancements") ||
            msg.includes("world_particles") ||
            msg.includes("array size is abnormally large") ||
            msg.includes("Read error for") ||
            msg.includes("ECONNRESET") ||
            msg.includes("client timed out") ||
            msg.includes("KEEPALIVE_TIMEOUT") ||
            msg.includes("ETIMEDOUT") ||
            msg.includes("EPIPE")
        )
            return;
        console.error(`[Bot Error] [${serverTag}] ${msg}`);
    });

    bot.on("end", () => {
        console.log(`[Bot] Disconnected from ${serverTag}. Reconnecting in ${config.reconnectDelay / 1000}s...`);
        cleanupTimers();
        scheduleReconnect();
    });
}

function lookAtPlayer(username) {
    if (!bot || !bot.players[username] || !bot.players[username].entity) return;
    try {
        const playerPos = bot.players[username].entity.position.offset(0, 1.6, 0);
        bot.lookAt(playerPos);
    } catch (_) {}
}

async function doJump() {
    if (!bot || bot.isSleeping) return;
    bot.setControlState("jump", true);
    await sleep(350);
    if (bot) bot.setControlState("jump", false);
}

async function doTwerk() {
    if (!bot || bot.isSleeping) return;
    for (let i = 0; i < 5; i++) {
        bot.setControlState("sneak", true);
        await sleep(200);
        if (!bot) return;
        bot.setControlState("sneak", false);
        await sleep(200);
    }
}

async function doSpin() {
    if (!bot || !bot.entity || bot.isSleeping) return;
    const originalYaw = bot.entity.yaw;
    for (let i = 0; i < 8; i++) {
        if (!bot || !bot.entity || bot.isSleeping) return;
        try {
            bot.look(originalYaw + (i * Math.PI) / 4, bot.entity.pitch, true);
        } catch (_) {}
        await sleep(80);
    }
}

async function doPunch() {
    if (!bot || bot.isSleeping) return;
    for (let i = 0; i < 4; i++) {
        bot.swingArm("right");
        await sleep(250);
    }
}

// Human-like animation: Waving friendly arm
async function waveArm() {
    if (!bot || bot.isSleeping) return;
    for (let i = 0; i < 3; i++) {
        bot.swingArm("right");
        await sleep(200);
    }
}

// Human-like animation: Nodding head yes
async function nodHead() {
    if (!bot || !bot.entity || bot.isSleeping) return;
    const originalPitch = Math.max(-1.0, Math.min(1.0, Number.isFinite(bot.entity.pitch) ? bot.entity.pitch : 0));
    try {
        if (!bot || !bot.entity) return;
        bot.look(bot.entity.yaw, originalPitch + 0.35, true);
        await sleep(150);
        if (!bot || !bot.entity) return;
        bot.look(bot.entity.yaw, originalPitch - 0.35, true);
        await sleep(150);
        if (!bot || !bot.entity) return;
        bot.look(bot.entity.yaw, originalPitch, true);
    } catch (_) {}
}

// Human-like animation: Universal Minecraft friendly crouch-greeting
async function friendlyCrouchGreeting() {
    if (!bot || !bot.entity || bot.isSleeping) return;
    for (let i = 0; i < 3; i++) {
        if (!bot || !bot.entity) return;
        bot.setControlState("sneak", true);
        await sleep(180);
        if (!bot || !bot.entity) return;
        bot.setControlState("sneak", false);
        await sleep(180);
    }
}

// ==========================================
// 🗣️ INTERACTIVE AI CHAT & COMMAND PROCESSOR
// ==========================================
function handlePlayerChat(username, message) {
    const text = message.trim().toLowerCase();

    // ==========================================
    // 🔇 MUTE COMMAND (!mute, !shutup, !silent, chup, shutup, etc.)
    // ==========================================
    if (
        text === "!mute" ||
        text === "!shutup" ||
        text === "!silent" ||
        text === "!quiet" ||
        text === "chup" ||
        text === "shutup" ||
        text === "shut up" ||
        text === "mute" ||
        text.includes("chup ho ja") ||
        text.includes("chup reh") ||
        text === "shh" ||
        text === "shhh"
    ) {
        isMuted = true;
        lookAtPlayer(username);
        nodHead();
        safeChat(
            `🤐 RamLaal is now completely MUTED! Ab mai chat me kuch nahi bolunga. Unmute karne ke liye '!unmute' ya 'bol' likho.`,
            true,
        );
        return;
    }

    // ==========================================
    // 🗣️ UNMUTE COMMAND (!unmute, !speak, !talk, bol, speak, etc.)
    // ==========================================
    if (
        text === "!unmute" ||
        text === "!speak" ||
        text === "!talk" ||
        text === "unmute" ||
        text === "speak" ||
        text === "bol" ||
        text === "bolo" ||
        text.includes("bol ramlaal") ||
        text.includes("aawaz do") ||
        text.includes("speak up")
    ) {
        isMuted = false;
        lookAtPlayer(username);
        waveArm();
        friendlyCrouchGreeting();
        safeChat(
            `🗣️ RamLaal is now UNMUTED! Namaste ${username} bhai, mai wapas bol sakta hu! Bolo kya seva karein? 😊✨`,
            true,
        );
        return;
    }

    // ==========================================
    // ℹ️ STATUS COMMAND (!status)
    // ==========================================
    if (text === "!status") {
        lookAtPlayer(username);
        safeChat(
            `🤖 [RamLaal Status]: Muted: ${isMuted ? "YES 🤐 (!unmute to speak)" : "NO 🗣️ (!mute to silence)"} | Base: ${baseAnchor ? "Locked 🏡" : "Not set"} | Sleeping Players: ${sleepingPlayers.size} | Health: ${bot.health || 20}/20 ❤️`,
            true,
        );
        return;
    }

    // ==========================================
    // 📋 HELP COMMAND (!help or !commands)
    // ==========================================
    if (text === "!help" || text === "!commands") {
        lookAtPlayer(username);
        safeChat(
            `📋 [RamLaal Commands]: !mute, !unmute, !status, !setbase, !deposit, !sleep, !wake, !hug, !pat, !flower, !sing, !compliment, !twerk, !jump, !spin, !fight, !iq, !roast, !calc, !toss`,
            true,
        );
        return;
    }

    // Deposit Loot to Chest Command (!deposit, !chest, !clearinv)
    if (
        text === "!deposit" ||
        text === "!chest" ||
        text === "!clearinv" ||
        text.includes("chest me rakh") ||
        text.includes("saman rakh")
    ) {
        lookAtPlayer(username);
        safeChat("Haan bhai, chest me extra saman daal raha hu...", true);
        clearInventoryToChest(false);
        return;
    }

    // Set Base Anchor Command (!setbase, !anchor, yahan raho)
    if (
        text === "!setbase" ||
        text === "!anchor" ||
        text.includes("yahan raho") ||
        text.includes("ye base hai") ||
        text.includes("set base")
    ) {
        lookAtPlayer(username);
        if (bot && bot.entity) {
            baseAnchor = bot.entity.position.clone();
            waveArm();
            safeChat(
                `Theek hai ${username} bhai! Ye mera naya base spot hai. Ab mai yahin ghoomunga aur base ki shaan banunga 🏡📍✨`,
            );
        }
        return;
    }

    // Adorable: Hug command
    if (
        text === "!hug" ||
        text.includes("hug") ||
        text.includes("gale mil") ||
        text.includes("pyaar") ||
        text.includes("love u") ||
        text.includes("love you")
    ) {
        lookAtPlayer(username);
        friendlyCrouchGreeting();
        waveArm();
        const hugReplies = [
            `Awww! Badi wali warm virtual hug for you, ${username}! 🤗❤️ RamLaal loves you!`,
            `*Big warm hug* 🤗✨ Tum sabse pyare player ho ${username}!`,
            `Arey aao gale lago ${username} bhai! Dil khush kar diya tumne! ❤️🥰`,
        ];
        safeChat(getRandom(hugReplies));
        return;
    }

    // Adorable: Headpat command
    if (text === "!pat" || text.includes("pat") || text.includes("headpat") || text.includes("pucho")) {
        lookAtPlayer(username);
        nodHead();
        const patReplies = [
            `Hehe tickles! *happy purring sounds* Thank you for the headpat, ${username}! 🥰✨`,
            `Awww thank you ${username}! RamLaal feels so loved right now! 🐾💖`,
            `Yay headpats! *wags imaginary tail* Tum kitne acche ho! 🥰`,
        ];
        safeChat(getRandom(patReplies));
        return;
    }

    // Adorable: Flower gift command
    if (text === "!flower" || text.includes("flower") || text.includes("phool") || text.includes("gift")) {
        lookAtPlayer(username);
        waveArm();
        const flowerReplies = [
            `Ye lo ${username}! Ek pyara sa virtual phool tumhare liye 🌸🌼 Khush raho hamesha!`,
            `Tumhare liye ek sundar red rose 🌹 Kyunki tum base ke sabse acche dost ho!`,
            `Special flower delivery for ${username}! 🌻✨ Enjoy karo!`,
        ];
        safeChat(getRandom(flowerReplies));
        return;
    }

    // Adorable: Singing command
    if (text === "!sing" || text.includes("sing") || text.includes("gaana") || text.includes("song")) {
        lookAtPlayer(username);
        doJump();
        const songs = [
            `Lala lala lori, Minecraft ki katori! Steve chala mine me, RamLaal base ki shaan hai! 🎶🎤`,
            `Chhoti si aasha, dher saare diamonds! RamLaal gaata hai sabke liye pyaar se! 🎵✨`,
            `Twinkle twinkle little star, tum sab log ho superstar! 🌟🎶`,
        ];
        safeChat(getRandom(songs));
        return;
    }

    // Adorable: Sweet compliments
    if (text === "!compliment" || text.includes("tareef")) {
        lookAtPlayer(username);
        nodHead();
        const sweetLines = [
            `Tumhara character skin kitna cute lag raha hai aaj ${username}! Sachhi! ✨`,
            `${username}, tum is pure server ke sabse pyare aur mehnati player ho! 💖`,
            `Agar Minecraft me 'Best Player Award' hota toh pakka ${username} ko milta! 🏆🥰`,
        ];
        safeChat(getRandom(sweetLines));
        return;
    }

    // 1. Sleep & Wake Commands
    if (text === "!sleep" || text === "sleep" || text === "soja" || text === "soja ramlaal" || text === "so ja") {
        lookAtPlayer(username);
        goToSleep(false);
        return;
    }

    if (text === "!wake" || text === "wake" || text === "uth ja" || text === "uthja" || text === "uth") {
        lookAtPlayer(username);
        if (bot.isSleeping) {
            bot.wake().catch(() => {});
        } else {
            safeChat(`Abe aalsi ${username}, mai to kabse jaag raha hu!`);
        }
        return;
    }

    // 2. Twerk / Crouch Action
    if (text === "!twerk" || text.includes("twerk") || text.includes("mujra") || text.includes("crouch")) {
        lookAtPlayer(username);
        safeChat(`RamLaal Twerk Protocol Activated! 💃🕺`);
        doTwerk();
        return;
    }

    // 3. Jump / Dance
    if (text.includes("jump") || text.includes("kood") || text.includes("dance") || text.includes("naach")) {
        lookAtPlayer(username);
        doJump();
        const jumpReplies = [
            `Abe mai RamLaal hu, Nora Fatehi nahi jo mujra karu! Par ek jump maar leta hu 🕺`,
            `Ye le ${username} bhai jump! Khush? Ab kaam dhandha karne do 🗿`,
            `DJ wale babu mera gaana chala do! 🕺✨`,
            `Jump to maar diya, ab 1 diamond fees nikaal ${username}!`,
        ];
        safeChat(getRandom(jumpReplies));
        return;
    }

    // 4. Punch / Fight / Boxing
    if (
        text === "!fight" ||
        text.includes("fight") ||
        text.includes("punch") ||
        text.includes("maar") ||
        text.includes("lad")
    ) {
        lookAtPlayer(username);
        doPunch();
        safeChat(`Aaja ${username} maidaan me! RamLaal boxing champion of Aternos hai! 🥊💥`);
        return;
    }

    // 5. Spin / Ghoom
    if (text === "!spin" || text.includes("spin") || text.includes("ghoom") || text.includes("beyblade")) {
        lookAtPlayer(username);
        safeChat(`Beyblade mode ON! 🌪️`);
        doSpin();
        return;
    }

    // 6. Shayari Generator
    if (text === "!shayari" || text.includes("shayari") || text.includes("poem") || text.includes("kavita")) {
        lookAtPlayer(username);
        safeChat(getRandom(shayaris));
        return;
    }

    // 7. Fortune / Kismat Predictor
    if (text === "!fortune" || text.includes("kismat") || text.includes("future") || text.includes("bhavishya")) {
        lookAtPlayer(username);
        safeChat(getRandom(fortunes));
        return;
    }

    // 8. IQ Scanner (Fake AI calculation)
    if (text === "!iq" || text.includes("iq") || text.includes("dimaag")) {
        lookAtPlayer(username);
        const fakeIQ = Math.floor(Math.random() * 140) + 10;
        if (fakeIQ < 40) {
            safeChat(
                `🧠 [AI Brain Scan]: ${username} ka IQ = ${fakeIQ}. Arey baap re! Dirt block me bhi zyada dimaag hota hai 💀`,
            );
        } else if (fakeIQ < 90) {
            safeChat(
                `🧠 [AI Brain Scan]: ${username} ka IQ = ${fakeIQ}. Average noob spotted! Thoda almond khaya karo.`,
            );
        } else {
            safeChat(
                `🧠 [AI Brain Scan]: ${username} ka IQ = ${fakeIQ}. Wah bhai, Einstein ke baad tumhara hi number hai! 🗿✨`,
            );
        }
        return;
    }

    // 9. Coin Toss
    if (text === "!toss" || text === "!coin" || text.includes("toss") || text.includes("coin")) {
        const outcome = Math.random() < 0.5 ? "HEADS (Sir)" : "TAILS (Poonch)";
        safeChat(`🪙 Coin flipped! Result is: ${outcome}`);
        return;
    }

    // 10. AI Math Calculator (!calc 5+5)
    if (text.startsWith("!calc ") || text.startsWith("calc ")) {
        const expr = text.replace("!calc ", "").replace("calc ", "").trim();
        try {
            // Safe math evaluation with sanitized characters
            if (/^[0-9+\-*/().\s]+$/.test(expr)) {
                const result = Function(`'use strict'; return (${expr})`)();
                safeChat(
                    `🧠 [AI Computation]: ${expr} = ${result}. Itna aasaan sawal nursery ka baccha bhi kar leta! 🤖`,
                );
            } else {
                safeChat("Abe sahi maths likh! NASA ke rocket formula mat daal yahan.");
            }
        } catch (_) {
            safeChat("Calculation error! Tumhare sawal ne mera AI brain hang kar diya.");
        }
        return;
    }

    // 11. Roast Generator (!roast or roast me)
    if (text.startsWith("!roast") || text.includes("roast")) {
        lookAtPlayer(username);
        let target = username;
        const parts = text.split(" ");
        if (parts.length > 1 && parts[1].length > 1 && parts[1] !== "me") {
            target = parts[1];
        }
        const roasts = [
            `${target} ko dekh ke toh Skeleton bhi has ke apna bow fenk deta hai! 💀`,
            `${target} ka gameplay dekh ke lagta hai keypad phone pe Minecraft khel raha hai 😂`,
            `Scientists are still researching how ${target} survived this long without a brain in Minecraft.`,
            `${target} wahi banda hai jo lava ke bagal me lakdi ka ghar banata hai 🪵🔥`,
            `${target} se accha PvP toh Minecraft ka villager 'Hrrrm' bol ke kar leta hai! 🤡`,
        ];
        safeChat(getRandom(roasts));
        return;
    }

    // 12. Insults / Gaali / Noob / Roasts
    if (
        text.includes("noob") ||
        text.includes("bot") ||
        text.includes("chutiya") ||
        text.includes("pagal") ||
        text.includes("bhadwe") ||
        text.includes("gadhe") ||
        text.includes("stupid") ||
        text.includes("idiot") ||
        text.includes("bkl") ||
        text.includes("bsdk") ||
        text.includes("lmao")
    ) {
        lookAtPlayer(username);
        const roastReplies = [
            `Abe ${username}, khud to dirt ke ghar me rehta hai aur mujhe gyaan de raha hai! 🗿`,
            `Zuban sambhal ke ${username}, varna Aternos band karke bhaag jaunga, rote rehna fir! 😂`,
            `Mujhe bot bol raha hai? Kam se kam mai Creeper ko dekh ke bhagta nahi teri tarah! 💀`,
            `Abe ${username}, tujhse accha PvP toh Minecraft ka zombie kar leta hai! 🧟`,
            `Dekho kaun bol raha hai, jo kal ped se gir ke mar gaya tha! 🤡`,
            `Arey ${username} bhai, itna gussa kyu? Thanda paani piyo aur mining karo!`,
            `Abe chal nikal, tere jaise 50 dekhe hain maine!`,
        ];
        safeChat(getRandom(roastReplies));
        return;
    }

    // 13. Asking for items / Diamonds / Khana
    if (
        text.includes("diamond") ||
        text.includes("iron") ||
        text.includes("khana") ||
        text.includes("food") ||
        text.includes("roti") ||
        text.includes("paisa") ||
        text.includes("give") ||
        text.includes("de na") ||
        text.includes("loot")
    ) {
        lookAtPlayer(username);
        const beggarReplies = [
            `Abe ${username}, mai khud nanga ghoom raha hu, tujhe kahan se diamond du?! 😭`,
            `Mere paas sirf aashirwaad hai beta, diamond chahiye toh khud khodo! ⛏️`,
            `Mai koi Ration card ki dukaan thodi hu jo khana baantu! Khud kheti karo.`,
            `Ghar se ameer, dil se fakeer hu mai bhai. Kuch nahi hai mere paas 🥲`,
            `Pehle mujhe netherite armor pehna, fir maangna diamond!`,
        ];
        safeChat(getRandom(beggarReplies));
        return;
    }

    // 14. Creator / Who made you
    if (
        text.includes("who made") ||
        text.includes("tera baap") ||
        text.includes("creator") ||
        text.includes("developer") ||
        text.includes("kisne banaya")
    ) {
        lookAtPlayer(username);
        safeChat(`Mujhe krajtilak ne banaya hai! The supreme creator and coding master of this server 👑💻`);
        return;
    }

    // 15. Girlfriend / Crush / Love
    if (text.includes("girlfriend") || text.includes("crush") || text.includes("shadi") || text.includes("gf")) {
        lookAtPlayer(username);
        safeChat(`Alex meri crush thi par wo Steve ke saath bhaag gayi... dard, dukh, peeda 💔😭`);
        return;
    }

    // 16. Greetings
    if (
        text.includes("hi") ||
        text.includes("hello") ||
        text.includes("hey") ||
        text.includes("sup") ||
        text.includes("kaisa hai") ||
        text.includes("kaise ho") ||
        text.includes("kya haal") ||
        text.includes("wassup")
    ) {
        lookAtPlayer(username);
        const greetReplies = [
            `Arre ${username} bhai! Haal chaal mast, bas 24 ghante chalte chalte ghutne ghis gaye 💀`,
            `Hello ${username}! Khana khake aaya ya bas RamLaal ka dimag khane aaya hai?`,
            `Salam-namaste ${username} babu! Kaho kya taaza khabar hai?`,
            `Wassup ${username}! Server pe aate hi RamLaal ki yaad aa gayi? 🗿`,
            `Arre aao aao ${username}, tumhare bina server bohot sunsaan lag raha tha!`,
        ];
        safeChat(getRandom(greetReplies));
        return;
    }

    // 17. Compliments & Praise
    if (
        text.includes("pro") ||
        text.includes("op") ||
        text.includes("legend") ||
        text.includes("goat") ||
        text.includes("king") ||
        text.includes("love") ||
        text.includes("bhai hai tu") ||
        text.includes("nice")
    ) {
        lookAtPlayer(username);
        doJump();
        const praiseReplies = [
            `Shukriya shukriya! RamLaal is the real hero of this server 🗿✨`,
            `Makkhan lagana band kar ${username}, fir bhi diamond nahi dunga! 😂`,
            `Arey bas kar pagle ${username}, itni tareef sunke meri aankho me aansu aa gaye ❤️`,
            `Pata hai mujhe mai OP hu, aage se salute thok ke baat karna!`,
        ];
        safeChat(getRandom(praiseReplies));
        return;
    }

    // 18. Goodbyes
    if (
        text.includes("bye") ||
        text.includes("tata") ||
        text.includes("goodbye") ||
        text.includes("ja raha hu") ||
        text.includes("offline")
    ) {
        const byeReplies = [
            `Jao jao ${username}, vaise bhi tumhare rehne se konsa Ender Dragon mar gaya tha! 👋`,
            `Bye ${username}! Server band mat hone dena varna bhoot le jayega tujhe!`,
            `Alvida dost! Sapno me aake tumhe Creeper se katwaunga 💥`,
        ];
        safeChat(getRandom(byeReplies));
        return;
    }

    // 19. General Name Mention (RamLaal / Ramlal)
    if (text.includes("ramlaal") || text.includes("ramlal")) {
        lookAtPlayer(username);
        const nameReplies = [
            `Haan bhai ${username}, RamLaal hazir hai! Saaf-saaf bolo kya chahiye?`,
            `RamLaal ko pukara aur hum chale aaye 🗿`,
            `Abe ${username}, mera naam japne se swarg nahi milega!`,
            `Bolo ${username} babu, kisne sataya tumhe?`,
            `Haa bhai bol, sun raha hu mai!`,
        ];
        safeChat(getRandom(nameReplies));
    }
}

function findNearbyBed() {
    if (!bot) return null;
    return bot.findBlock({
        matching: block => bot.isABed(block),
        maxDistance: 4,
    });
}

async function goToSleep(silent = false) {
    if (!bot || bot.isSleeping || isTryingToSleep) return;

    const isNight = bot.time && bot.time.timeOfDay >= 12541 && bot.time.timeOfDay <= 23458;
    const isThunder = bot.isRaining && bot.thunderState > 0;

    if (!isNight && !isThunder) {
        return;
    }

    const bed = findNearbyBed();
    if (!bed) {
        return;
    }

    try {
        isTryingToSleep = true;
        stopMovementLoop();
        await bot.sleep(bed);
    } catch (err) {
        if (!bot.isSleeping) {
            startMovementLoop();
        }
    } finally {
        isTryingToSleep = false;
    }
}

// ==========================================
// 🛌 SLEEP DETECTION & MORNING CHEST ROUTINE
// ==========================================

// Check if at least one other player on the server is currently sleeping
function isAnyOtherPlayerSleeping() {
    if (!bot) return false;

    // 1. Check tracked sleeping players set (from entitySleep / wake events)
    if (sleepingPlayers.size > 0) return true;

    // 2. Check recent server sleep announcements (Action bar / chat broadcast within last 18 seconds)
    if (lastOtherPlayerSleepTime > 0 && Date.now() - lastOtherPlayerSleepTime < 18000) {
        return true;
    }

    // 3. Scan all loaded players in render distance
    for (const player of Object.values(bot.players)) {
        if (!player || player.username === bot.username || !player.entity) continue;
        const entity = player.entity;
        const isPoseSleeping = entity.metadata && (entity.metadata[6] === 2 || entity.metadata[0] === 2);
        if (entity.isSleeping || isPoseSleeping) {
            sleepingPlayers.add(player.username);
            return true;
        }
    }

    return false;
}

// Night sleep trigger: Sprint to bed ONLY if at least one other player on the server is sleeping!
function checkSleepTrigger() {
    if (!bot || !bot.entity || bot.isSleeping || isSprintingToBed || isDepositingChest) return;

    const now = Date.now();
    if (now - lastSleepAttempt < 15000) return; // 15-second cooldown to avoid tight loop spam

    const isNight = bot.time && bot.time.timeOfDay >= 12541 && bot.time.timeOfDay <= 23458;
    const isThunder = bot.isRaining && bot.thunderState > 0;

    // If night or thunder AND another player is sleeping, sprint to bed immediately
    if ((isNight || isThunder) && isAnyOtherPlayerSleeping()) {
        sprintToBedAndSleep();
    }
}

// Find chest, trapped chest, or barrel within maxDist blocks
function findNearbyChest(maxDist = 8) {
    if (!bot) return null;
    return bot.findBlock({
        matching: block => {
            if (!block || !block.name) return false;
            return block.name === "chest" || block.name === "trapped_chest" || block.name === "barrel";
        },
        maxDistance: maxDist,
    });
}

// Filter items to keep in inventory: Keep all swords, armor pieces, and shields
function isExcludedFromChest(item) {
    if (!item || !item.name) return false;
    const name = item.name.toLowerCase();
    if (name.endsWith("_sword")) return true;
    if (name.endsWith("_helmet") || name === "turtle_helmet") return true;
    if (name.endsWith("_chestplate") || name === "elytra") return true;
    if (name.endsWith("_leggings")) return true;
    if (name.endsWith("_boots")) return true;
    if (name === "shield") return true;
    return false;
}

// Morning Chest Routine: Deposits all inventory loot to nearby chest, keeping only sword and armor
async function clearInventoryToChest(silent = false) {
    if (!bot || !bot.entity || isDepositingChest || bot.isSleeping) return;

    isDepositingChest = true;
    stopMovementLoop();

    try {
        let chestBlock = findNearbyChest(8);
        if (!chestBlock) {
            // Try searching slightly wider (up to 14 blocks around base or bed)
            chestBlock = findNearbyChest(14);
        }

        if (!chestBlock) {
            return;
        }

        // Walk towards chest if not close enough
        const dist = bot.entity.position.distanceTo(chestBlock.position);
        if (dist > 3.2) {
            const chestCenter = chestBlock.position.offset(0.5, 0.5, 0.5);
            const dx = chestCenter.x - bot.entity.position.x;
            const dz = chestCenter.z - bot.entity.position.z;
            const yaw = Math.atan2(-dx, -dz);
            try {
                bot.look(yaw, 0, true);
            } catch (_) {}
            await smartStepForward(700);
            await sleep(200);
            if (!bot || !bot.entity) return;
        }

        let chestWindow = null;
        try {
            chestWindow = await bot.openChest(chestBlock);
        } catch (openErr) {
            return;
        }

        let depositedCount = 0;
        let attempts = 0;
        const maxAttempts = 36;

        while (attempts < maxAttempts) {
            attempts++;
            const itemToDeposit = bot.inventory.items().find(i => !isExcludedFromChest(i));
            if (!itemToDeposit) break; // All remaining items are sword/armor/shield

            try {
                await chestWindow.deposit(itemToDeposit.type, null, itemToDeposit.count);
                depositedCount += itemToDeposit.count;
                await sleep(100);
            } catch (depErr) {
                break; // Chest might be full or slot error
            }
        }

        try {
            chestWindow.close();
        } catch (_) {}
    } catch (err) {
    } finally {
        isDepositingChest = false;
        startMovementLoop();
    }
}

// 3D Vector Math: Detects if a player is looking in RamLaal's direction (Eye Contact)
function isPlayerLookingAtBot(playerEntity) {
    if (!bot || !bot.entity || !playerEntity) return false;
    try {
        const playerEyePos = playerEntity.position.offset(0, playerEntity.height * 0.85, 0);
        const botChestPos = bot.entity.position.offset(0, bot.entity.height * 0.7, 0);
        const toBot = botChestPos.minus(playerEyePos).normalize();

        const pYaw = playerEntity.yaw;
        const pPitch = playerEntity.pitch;

        const lookDir = new Vec3(
            -Math.sin(pYaw) * Math.cos(pPitch),
            -Math.sin(pPitch),
            -Math.cos(pYaw) * Math.cos(pPitch),
        ).normalize();

        const dot = lookDir.dot(toBot);
        return dot > 0.88; // True if facing within ~28 degrees of RamLaal!
    } catch (_) {
        return false;
    }
}

// Track player distances to trigger adorable "Welcome Home" reactions
const playerLastDistance = {};

// Human Body-Language Mirroring: If player crouches or jumps in front of RamLaal, mirror them!
let lastMirrorAction = 0;
function checkPlayerBodyLanguage() {
    if (!bot || !bot.entity || bot.isSleeping) return;
    const now = Date.now();
    if (now - lastMirrorAction < 4000) return; // 4s cooldown

    for (const player of Object.values(bot.players)) {
        if (!player || !player.entity || player.username === bot.username) continue;
        const dist = bot.entity.position.distanceTo(player.entity.position);

        // If player is standing within 4.5 blocks of RamLaal
        if (dist <= 4.5) {
            // Check if player is crouching / sneaking
            const isPlayerSneaking = Boolean(player.entity.metadata && player.entity.metadata[0] & 0x02);
            if (isPlayerSneaking) {
                lastMirrorAction = now;
                lookAtPlayer(player.username);
                friendlyCrouchGreeting();
                return;
            }

            // Check if player is hopping / jumping (velocity Y > 0.2)
            if (player.entity.velocity && player.entity.velocity.y > 0.25) {
                lastMirrorAction = now;
                lookAtPlayer(player.username);
                doJump();
                return;
            }
        }
    }
}

function checkPlayerProximity() {
    if (!bot || !bot.entity || bot.isSleeping || isSprintingToBed) return;
    const now = Date.now();
    if (now - lastProximityCheck < 2500) return; // check every 2.5 seconds
    lastProximityCheck = now;

    let nearestFarPlayer = null;
    let nearestFarDist = 24;

    for (const player of Object.values(bot.players)) {
        if (!player || !player.entity || player.username === bot.username) continue;
        const dist = bot.entity.position.distanceTo(player.entity.position);
        const prevDist = playerLastDistance[player.username] || dist;
        playerLastDistance[player.username] = dist;

        // 1. WATCH PLAYERS FROM FAR (6 to 22 blocks away) & EYE-CONTACT GREETING
        if (dist >= 5.5 && dist <= 22) {
            if (dist < nearestFarDist) {
                nearestFarDist = dist;
                nearestFarPlayer = player;
            }

            // Check if the distant player is looking in RamLaal's direction!
            if (isPlayerLookingAtBot(player.entity)) {
                const lastEyeContact = proximityCooldowns["eye_" + player.username] || 0;
                if (now - lastEyeContact > 25000) {
                    // 25s cooldown per player
                    proximityCooldowns["eye_" + player.username] = now;
                    lookAtPlayer(player.username);
                    waveArm();
                    nodHead();
                    continue;
                }
            }
        }

        // 2. WELCOME HOME REACTION (Player returns from mining/exploring to base)
        if (prevDist > 14 && dist <= 5.5) {
            const lastWelcome = proximityCooldowns["welcome_" + player.username] || 0;
            if (now - lastWelcome > 45000) {
                // 45s cooldown per player
                proximityCooldowns["welcome_" + player.username] = now;
                lookAtPlayer(player.username);
                friendlyCrouchGreeting();
                waveArm();
                continue;
            }
        }

        // 3. CLOSE FRIENDLY GREETING (< 2.2 blocks: crouch & look)
        if (dist < 2.2) {
            const lastSpoken = proximityCooldowns[player.username] || 0;
            if (now - lastSpoken > 30000) {
                // 30s cooldown per player
                proximityCooldowns[player.username] = now;
                lookAtPlayer(player.username);
                friendlyCrouchGreeting();
            }
        }
    }

    // Smoothly glance at the nearest distant player if strolling
    if (nearestFarPlayer && Math.random() < 0.6) {
        lookAtPlayer(nearestFarPlayer.username);
    }
}

// ==========================================
// 🛡️ SMART BASE GUARD & SURVIVAL AI
// ==========================================

const HOSTILE_MOBS = new Set([
    "zombie",
    "skeleton",
    "spider",
    "cave_spider",
    "creeper",
    "drowned",
    "husk",
    "phantom",
    "witch",
    "slime",
    "magma_cube",
    "pillager",
    "vindicator",
    "ravager",
    "evoker",
    "vex",
    "zombie_villager",
    "bogged",
    "breeze",
    "stray",
    "enderman",
    "silverfish",
    "endermite",
    "hoglin",
    "zoglin",
    "piglin_brute",
    "wither_skeleton",
    "blaze",
    "ghast",
]);

const FOOD_NAMES = new Set([
    "bread",
    "cooked_beef",
    "cooked_porkchop",
    "cooked_mutton",
    "cooked_chicken",
    "baked_potato",
    "apple",
    "golden_apple",
    "cookie",
    "cooked_salmon",
    "cooked_cod",
    "carrot",
]);

// Auto-equip best weapon (sword or axe). In Creative mode, auto-conjures a Netherite Sword if needed.
async function equipBestWeapon() {
    if (!bot || !bot.inventory) return;

    const weapon = bot.inventory.items().find(i => i.name.endsWith("_sword") || i.name.endsWith("_axe"));
    if (weapon) {
        try {
            await bot.equip(weapon, "hand");
            return;
        } catch (_) {}
    }

    // If in creative mode and has no weapon, conjure a Netherite Sword in hotbar
    if (bot.game && bot.game.gameMode === "creative" && bot.creative && bot.registry) {
        try {
            const Item = require("prismarine-item")(bot.registry);
            const swordItem = bot.registry.itemsByName["netherite_sword"] || bot.registry.itemsByName["diamond_sword"];
            if (swordItem) {
                await bot.creative.setInventorySlot(36, new Item(swordItem.id, 1));
                const newSword = bot.inventory.items().find(i => i.name.endsWith("_sword"));
                if (newSword) {
                    await bot.equip(newSword, "hand");
                }
            }
        } catch (_) {}
    }
}

// Auto-equip armor pieces and shield if available in inventory
async function autoEquipArmor() {
    if (!bot || !bot.inventory || bot.isSleeping) return;
    const items = bot.inventory.items();

    const helmet = items.find(i => i.name.endsWith("_helmet"));
    const chest = items.find(i => i.name.endsWith("_chestplate"));
    const legs = items.find(i => i.name.endsWith("_leggings"));
    const boots = items.find(i => i.name.endsWith("_boots"));
    const shield = items.find(i => i.name === "shield");

    let equippedSomething = false;
    try {
        if (helmet) {
            await bot.equip(helmet, "head");
            equippedSomething = true;
        }
        if (chest) {
            await bot.equip(chest, "torso");
            equippedSomething = true;
        }
        if (legs) {
            await bot.equip(legs, "legs");
            equippedSomething = true;
        }
        if (boots) {
            await bot.equip(boots, "feet");
            equippedSomething = true;
        }
        if (shield) {
            await bot.equip(shield, "off-hand");
            equippedSomething = true;
        }
    } catch (_) {}

    // Armor equipped silently - no chat spam
}

// Auto-eat food when health is low
async function autoEatFood() {
    if (!bot || !bot.inventory || isEating || bot.isSleeping) return;
    if (bot.health >= 16) return; // Only eat when hurt (under 8 hearts)

    const food = bot.inventory.items().find(i => FOOD_NAMES.has(i.name));
    if (!food) return;

    try {
        isEating = true;
        await bot.equip(food, "hand");
        await bot.consume();
    } catch (_) {
    } finally {
        isEating = false;
        equipBestWeapon();
    }
}

// ⚔️ AGGRESSIVE CREATIVE COMBAT & PERIMETER DEFENSE SYSTEM
async function checkCombatAndMobs() {
    if (!bot || !bot.entity || bot.isSleeping || isSprintingToBed) return;

    const currentPos = bot.entity.position;
    const anchor = baseAnchor || currentPos;

    // 1. Scan for nearest hostile mob within COMBAT_DETECTION_RADIUS (16 blocks of RamLaal)
    let nearestHostile = null;
    let nearestDist = COMBAT_DETECTION_RADIUS;

    for (const entity of Object.values(bot.entities)) {
        if (!entity || entity === bot.entity || !entity.isValid) continue;
        if (HOSTILE_MOBS.has(entity.name)) {
            const distFromBot = currentPos.distanceTo(entity.position);
            const distFromBase = anchor.distanceTo(entity.position);

            // Engage if mob is within 16 blocks of RamLaal AND within MAX_CHASE_DISTANCE (32 blocks) of base anchor
            if (distFromBot < nearestDist && distFromBase <= MAX_CHASE_DISTANCE) {
                nearestDist = distFromBot;
                nearestHostile = entity;
            }
        }
    }

    // 2. COMBAT ENGAGEMENT: Hostile mob detected! Charge aggressively!
    if (nearestHostile) {
        isFightingMobs = true;
        isReturningToBase = false;
        currentCombatTarget = nearestHostile;

        await equipBestWeapon();

        // Aim precisely at the mob's upper body (clamped pitch to prevent server kicks)
        const targetPos = nearestHostile.position.offset(0, nearestHostile.height * 0.75, 0);
        const dx = targetPos.x - currentPos.x;
        const dz = targetPos.z - currentPos.z;
        const yaw = Math.atan2(-dx, -dz);
        const rawPitch = Math.atan2(targetPos.y - (currentPos.y + 1.6), Math.sqrt(dx * dx + dz * dz));
        const pitch = Math.max(-1.5, Math.min(1.5, -rawPitch));

        bot.look(yaw, pitch, true);

        // If within strike reach (<= 3.8 blocks): CRITICAL JUMP ATTACK & RAPID COMBOS!
        if (nearestDist <= 3.8) {
            // In Minecraft, jumping and attacking deals a Critical Hit (150% damage + crit particles)!
            // In Creative mode, jump must be tapped as a pulse rather than held, to prevent floating/flying
            if (bot.entity.onGround) {
                bot.setControlState("jump", true);
                setTimeout(() => {
                    if (bot && bot.entity) bot.setControlState("jump", false);
                }, 150);
            }
            bot.attack(nearestHostile);
            bot.swingArm("right");

            // Keep forward sprint pressed to apply maximum aggression & pressure
            bot.setControlState("forward", true);
            bot.setControlState("sprint", true);
        } else {
            // SPRINT CHARGE TOWARDS MOB AT FULL SPEED!
            bot.setControlState("forward", true);
            bot.setControlState("sprint", true);

            // Auto-jump over 1-block steps during the chase (momentary pulse)
            const obs = checkObstacleAhead();
            if (obs.isStep) {
                bot.setControlState("jump", true);
                setTimeout(() => {
                    if (bot && bot.entity) bot.setControlState("jump", false);
                }, 200);
            } else {
                bot.setControlState("jump", false);
            }
        }
        return;
    }

    // 3. NO HOSTILE MOBS NEARBY:
    if (isFightingMobs) {
        // Just finished combat! Mobs eliminated
        isFightingMobs = false;
        currentCombatTarget = null;
        bot.clearControlStates();
    }

    // 4. RETURN TO BASE ANCHOR (Spawn Location)
    if (baseAnchor) {
        const distFromBase = currentPos.distanceTo(baseAnchor);

        // Hysteresis: start returning when outside BASE_PATROL_RADIUS + 2.0 (9 blocks)
        // Keep returning until safely inside BASE_PATROL_RADIUS - 1.5 (5.5 blocks)
        if (!isReturningToBase && distFromBase > BASE_PATROL_RADIUS + 2.0) {
            isReturningToBase = true;
        }

        if (isReturningToBase) {
            if (distFromBase <= BASE_PATROL_RADIUS - 1.5) {
                // Safely arrived back inside base perimeter!
                isReturningToBase = false;
                bot.clearControlStates();
            } else {
                const dx = baseAnchor.x - currentPos.x;
                const dz = baseAnchor.z - currentPos.z;
                const yawTowardsBase = Math.atan2(-dx, -dz);

                bot.look(yawTowardsBase, 0, true);
                bot.setControlState("forward", true);
                bot.setControlState("sprint", true);

                // Auto-jump over obstacles while heading back home (momentary pulse)
                const obs = checkObstacleAhead();
                if (obs.isStep) {
                    bot.setControlState("jump", true);
                    setTimeout(() => {
                        if (bot && bot.entity) bot.setControlState("jump", false);
                    }, 200);
                } else if (obs.isWall) {
                    // Slight detour if hit a wall directly
                    bot.look(yawTowardsBase + (Math.random() > 0.5 ? 0.7 : -0.7), 0, true);
                    bot.setControlState("jump", true);
                    setTimeout(() => {
                        if (bot && bot.entity) bot.setControlState("jump", false);
                    }, 200);
                } else {
                    bot.setControlState("jump", false);
                }
            }
        }
    }
}

// ==========================================
// 🏃‍♂️ REALISTIC LIVING MOVEMENT & BED SPRINT AI
// ==========================================

// Realistic Human Interaction (Completely silent - chat muted)
async function humanChat(message, lookAtTarget = null, force = false) {
    if (lookAtTarget) lookAtPlayer(lookAtTarget);
    return;
}

// Organic Human Mouse Movement: Smooth S-curve easing with natural micro-jitters
async function smoothLook(targetYaw, targetPitch, steps = 4) {
    if (!bot || !bot.entity || bot.isSleeping) return;
    targetPitch = Math.max(-1.5, Math.min(1.5, Number.isFinite(targetPitch) ? targetPitch : 0));
    const currentYaw = bot.entity.yaw;
    const currentPitch = Math.max(-1.5, Math.min(1.5, Number.isFinite(bot.entity.pitch) ? bot.entity.pitch : 0));
    const yawDiff = targetYaw - currentYaw;
    const pitchDiff = targetPitch - currentPitch;

    for (let i = 1; i <= steps; i++) {
        if (!bot || !bot.entity || bot.isSleeping) return;
        // S-curve easing (smooth ease-in-out)
        const t = i / steps;
        const ease = t * t * (3 - 2 * t);
        // Micro-jitter to simulate human hand / breathing on a mouse
        const jitterYaw = (Math.random() - 0.5) * 0.015;
        const jitterPitch = (Math.random() - 0.5) * 0.012;

        const y = currentYaw + yawDiff * ease + jitterYaw;
        const p = Math.max(-1.5, Math.min(1.5, currentPitch + pitchDiff * ease + jitterPitch));
        try {
            if (bot && bot.entity && typeof bot.look === "function") {
                bot.look(y, p, true);
            }
        } catch (_) {}
        await sleep(35);
    }
}

// Auto-check if front block has a 1-block elevation or wall
function checkObstacleAhead() {
    if (!bot || !bot.entity) return { isStep: false, isWall: false, isDrop: false };
    const yaw = bot.entity.yaw;
    const dx = -Math.sin(yaw) * 0.9;
    const dz = -Math.cos(yaw) * 0.9;

    const feetBlock = bot.blockAt(bot.entity.position.offset(dx, 0, dz));
    const headBlock = bot.blockAt(bot.entity.position.offset(dx, 1, dz));
    const groundBlock = bot.blockAt(bot.entity.position.offset(dx, -1, dz));
    const deepGroundBlock = bot.blockAt(bot.entity.position.offset(dx, -2, dz));

    const isWall = headBlock && headBlock.boundingBox === "block" && feetBlock && feetBlock.boundingBox === "block";
    const isStep = feetBlock && feetBlock.boundingBox === "block" && (!headBlock || headBlock.boundingBox !== "block");
    const isDrop =
        (!groundBlock || groundBlock.boundingBox === "empty") &&
        (!deepGroundBlock || deepGroundBlock.boundingBox === "empty");

    return { isStep, isWall, isDrop };
}

// Smart forward step with auto-jumping over 1-block steps, cliff avoidance & stuck detection
async function smartStepForward(durationMs = 700, sprint = false) {
    if (!bot || !bot.entity || bot.isSleeping) return;

    const obstacle = checkObstacleAhead();
    if (obstacle.isDrop) {
        // Avoid walking off cliffs or deep pits!
        if (!bot || !bot.entity) return;
        try {
            bot.look(bot.entity.yaw + Math.PI * (0.6 + Math.random() * 0.4), 0, true);
        } catch (_) {}
        return;
    }

    const startPos = bot.entity.position.clone();
    bot.setControlState("forward", true);
    if (sprint) bot.setControlState("sprint", true);

    if (obstacle.isStep) {
        bot.setControlState("jump", true);
        setTimeout(() => {
            if (bot) bot.setControlState("jump", false);
        }, 300);
    }

    await sleep(durationMs);
    if (!bot || !bot.entity) return;
    bot.setControlState("forward", false);
    bot.setControlState("sprint", false);
    bot.setControlState("jump", false);

    const movedDist = startPos.distanceTo(bot.entity.position);

    // If stuck against a wall
    if (movedDist < 0.15) {
        // Try hop
        if (!bot || !bot.entity) return;
        bot.setControlState("jump", true);
        bot.setControlState("forward", true);
        await sleep(300);
        if (!bot || !bot.entity) return;
        bot.setControlState("jump", false);
        bot.setControlState("forward", false);

        if (startPos.distanceTo(bot.entity.position) < 0.25) {
            // Step backward and turn away from wall
            bot.setControlState("back", true);
            await sleep(350);
            if (!bot || !bot.entity) return;
            bot.setControlState("back", false);
            const turnAngle = Math.PI * 0.5 + Math.random() * Math.PI * 0.5;
            await smoothLook(bot.entity.yaw + turnAngle, 0, 2);
        }
    }
}

// 🛌 FAST BED SPRINT: Sprints at full speed to bed the exact millisecond night starts
async function sprintToBedAndSleep() {
    if (!bot || !bot.entity || bot.isSleeping || isSprintingToBed) return;

    const bed = bot.findBlock({
        matching: block => {
            if (!bot.isABed(block)) return false;
            try {
                if (typeof bot.parseBedMetadata === "function") {
                    const meta = bot.parseBedMetadata(block);
                    if (meta && meta.occupied) return false;
                }
            } catch (_) {}
            return true;
        },
        maxDistance: 18,
    });

    if (!bed) {
        const now = Date.now();
        lastSleepAttempt = now;
        return;
    }

    isSprintingToBed = true;
    stopMovementLoop();

    let ticks = 0;
    const maxSprintTicks = 45; // ~4.5 seconds max

    if (bedSprintInterval) {
        clearInterval(bedSprintInterval);
        bedSprintInterval = null;
    }

    bedSprintInterval = setInterval(async () => {
        ticks++;
        if (!bot || !bot.entity || bot.isSleeping) {
            if (bedSprintInterval) {
                clearInterval(bedSprintInterval);
                bedSprintInterval = null;
            }
            isSprintingToBed = false;
            return;
        }

        const dist = bot.entity.position.distanceTo(bed.position);

        // If within sleep interaction range (< 3.1 blocks): DIVE INTO BED!
        if (dist <= 3.1) {
            if (bedSprintInterval) {
                clearInterval(bedSprintInterval);
                bedSprintInterval = null;
            }
            bot.clearControlStates();
            isSprintingToBed = false;
            if (!isTryingToSleep && !bot.isSleeping) {
                isTryingToSleep = true;
                lastSleepAttempt = Date.now();
                try {
                    await bot.sleep(bed);
                } catch (err) {
                    if (!bot.isSleeping) startMovementLoop();
                } finally {
                    isTryingToSleep = false;
                }
            }
            return;
        }

        // Still sprinting toward bed: align face, sprint forward, auto-jump steps
        const bedCenter = bed.position.offset(0.5, 0.5, 0.5);
        const dx = bedCenter.x - bot.entity.position.x;
        const dz = bedCenter.z - bot.entity.position.z;
        const yaw = Math.atan2(-dx, -dz);

        try {
            bot.look(yaw, 0, true);
        } catch (_) {}
        bot.setControlState("forward", true);
        bot.setControlState("sprint", true);

        // Auto-jump over 1-block steps on way to bed (momentary pulse)
        const obs = checkObstacleAhead();
        if (obs.isStep) {
            bot.setControlState("jump", true);
            setTimeout(() => {
                if (bot && bot.entity) bot.setControlState("jump", false);
            }, 200);
        } else {
            bot.setControlState("jump", false);
        }

        if (ticks > maxSprintTicks) {
            if (bedSprintInterval) {
                clearInterval(bedSprintInterval);
                bedSprintInterval = null;
            }
            bot.clearControlStates();
            isSprintingToBed = false;
            lastSleepAttempt = Date.now();
            if (!isTryingToSleep && !bot.isSleeping) {
                isTryingToSleep = true;
                try {
                    await bot.sleep(bed);
                } catch (_) {}
                finally {
                    isTryingToSleep = false;
                }
            }
            if (!bot.isSleeping) startMovementLoop();
        }
    }, 100);
}

function startMovementLoop() {
    stopMovementLoop();

    // Set initial base anchor if not set
    if (!baseAnchor && bot && bot.entity) {
        baseAnchor = bot.entity.position.clone();
    }

    // Fast Combat & Self-Defense Loop (Every 250ms for aggressive pursuit & combo crits)
    combatInterval = setInterval(() => {
        try {
            checkCombatAndMobs();
        } catch (_) {}
    }, 250);

    // Natural Base Patrol & Guard AI (Every 4.5 seconds)
    movementInterval = setInterval(async () => {
        // Pause normal patrol when sleeping, sprinting to bed, depositing items, eating, fighting hostiles, or returning to base
        if (
            !bot ||
            !bot.entity ||
            bot.isSleeping ||
            isEating ||
            isFightingMobs ||
            isReturningToBase ||
            isDepositingChest ||
            isSprintingToBed
        )
            return;

        try {
            // 1. Check health and eat if needed
            await autoEatFood();
            if (!bot || !bot.entity || bot.isSleeping) return;

            // 2. Check and equip any gear
            await autoEquipArmor();
            if (!bot || !bot.entity || bot.isSleeping) return;

            // 3. Check player proximity
            checkPlayerProximity();
            if (!bot || !bot.entity || bot.isSleeping) return;

            // 4. Update base anchor if near bed and anchor not set
            const bed = findNearbyBed();
            if (bed && !baseAnchor) {
                baseAnchor = bed.position.clone();
            }

            if (!baseAnchor) {
                baseAnchor = bot.entity.position.clone();
            }

            const distFromBase = bot.entity.position.distanceTo(baseAnchor);

            // If drifted far past patrol radius, gently face towards base center
            if (distFromBase > BASE_PATROL_RADIUS + 2.0) {
                const dx = baseAnchor.x - bot.entity.position.x;
                const dz = baseAnchor.z - bot.entity.position.z;
                const yawTowardsBase = Math.atan2(-dx, -dz);
                try {
                    bot.look(yawTowardsBase, 0, true);
                } catch (_) {}
                await smartStepForward(700);
                return;
            }

            // Human Habit: Switch hotbar slot (fidget with hands/tools)
            if (Math.random() < 0.35 && typeof bot.setQuickBarSlot === "function") {
                const randomSlot = Math.floor(Math.random() * 5); // slots 0 to 4
                try {
                    bot.setQuickBarSlot(randomSlot);
                } catch (_) {}
            }

            // Check player body language (crouch & jump mirroring)
            checkPlayerBodyLanguage();
            if (!bot || !bot.entity || bot.isSleeping) return;

            // 3. REALISTIC LIVING HUMAN WALKING STYLES & PATROL
            const styleRoll = Math.random();

            if (styleRoll < 0.3) {
                // STYLE 1: Casual Stroll with Natural Head Sway
                if (!bot || !bot.entity) return;
                const angleOffset = (Math.random() - 0.5) * Math.PI * 0.7;
                await smoothLook(bot.entity.yaw + angleOffset, (Math.random() - 0.5) * 0.15, 3);
                await smartStepForward(750, false);
            } else if (styleRoll < 0.5) {
                // STYLE 2: Curious Inspector (Inspects ground/flowers, pitches head down 30°, crouches)
                if (!bot || !bot.entity) return;
                const groundAngle = (Math.random() - 0.5) * Math.PI * 0.5;
                await smoothLook(bot.entity.yaw + groundAngle, 0.45, 3); // look down at ground
                await smartStepForward(500, false);
                if (bot) bot.setControlState("sneak", true);
                await sleep(400);
                if (bot) bot.setControlState("sneak", false);
            } else if (styleRoll < 0.65) {
                // STYLE 3: Playful Jog & Bunny-Hop (Quick human sprint burst with hop)
                if (!bot || !bot.entity) return;
                const forwardAngle = (Math.random() - 0.5) * Math.PI * 0.3;
                await smoothLook(bot.entity.yaw + forwardAngle, -0.1, 2);
                if (bot) {
                    bot.setControlState("jump", true);
                    setTimeout(() => {
                        if (bot && bot.entity) bot.setControlState("jump", false);
                    }, 200);
                }
                await smartStepForward(600, true); // sprint forward with jump
            } else if (styleRoll < 0.82) {
                // STYLE 4: Base Lookout (Slowly scans the horizon and sky like a guard)
                if (!bot || !bot.entity) return;
                const targetYaw = bot.entity.yaw + (Math.random() > 0.5 ? 1.0 : -1.0) * (Math.PI * 0.6);
                const skyPitch = (Math.random() - 0.5) * 0.35;
                await smoothLook(targetYaw, skyPitch, 5);
                await sleep(700);
            } else {
                // STYLE 5: Player Watcher (Glances naturally at nearest friend)
                const players = Object.values(bot.players).filter(p => p && p.entity && p.username !== bot.username);
                if (players.length > 0) {
                    const nearestPlayer = players[0];
                    lookAtPlayer(nearestPlayer.username);
                    await sleep(600);
                } else {
                    await sleep(500);
                }
            }
        } catch (_) {}
    }, 4500);
}

function stopMovementLoop() {
    if (movementInterval) {
        clearInterval(movementInterval);
        movementInterval = null;
    }
    if (combatInterval) {
        clearInterval(combatInterval);
        combatInterval = null;
    }
    if (bedSprintInterval) {
        clearInterval(bedSprintInterval);
        bedSprintInterval = null;
    }
    isSprintingToBed = false;
    isFightingMobs = false;
    isReturningToBase = false;
    currentCombatTarget = null;
    if (bot) {
        try {
            bot.clearControlStates();
        } catch (_) {}
    }
}

function scheduleRandomChat() {
    // Disabled: No unprompted random chat spam
    if (randomChatTimeout) {
        clearTimeout(randomChatTimeout);
        randomChatTimeout = null;
    }
}

function cleanupTimers() {
    stopMovementLoop();
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    if (randomChatTimeout) {
        clearTimeout(randomChatTimeout);
        randomChatTimeout = null;
    }
}

function scheduleReconnect() {
    cleanupTimers();
    if (isDestroyed) return;
    reconnectTimeout = setTimeout(() => {
        createBot();
    }, config.reconnectDelay);
}

    function destroy() {
        isDestroyed = true;
        cleanupTimers();
        if (bot && typeof bot.quit === "function") {
            try {
                bot.quit();
            } catch (_) {}
        }
    }

    function getStatus() {
        return {
            target: serverTag,
            online: !!(bot && bot.entity),
            health: bot?.health ?? 20,
            position: bot?.entity?.position ? bot.entity.position.floored() : null,
            username: config.username,
        };
    }

    if (startDelayMs > 0) {
        setTimeout(() => {
            if (!isDestroyed) createBot();
        }, startDelayMs);
    } else {
        createBot();
    }

    return {
        target,
        serverTag,
        getStatus,
        destroy,
        getBot: () => bot,
    };
}

// Start dual bot sessions (staggered by 500ms for smooth sequential startup)
sessions = config.servers.map((target, idx) => createBotSession(target, idx * 500));

// Graceful shutdown handling
process.on("SIGINT", () => {
    console.log("\n[System] Gracefully shutting down...");
    for (const s of sessions) s.destroy();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[System] Termination signal received...");
    for (const s of sessions) s.destroy();
    process.exit(0);
});
