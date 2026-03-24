/**
 * OVERFRAG Twitch Bot — Entry point
 * 
 * Connects to Twitch IRC via tmi.js.
 * Auto-fetches streamer channels from the OVERFRAG site API.
 * Only responds to commands in channels where the bot has MOD status.
 * Supports custom commands and timers from the dashboard.
 */
import tmi from 'tmi.js';
import { config } from './modules/config.js';
import * as commands from './modules/commands.js';
import * as api from './modules/api.js';

// ============================================
// VALIDATION
// ============================================
if (!config.twitch.token) {
  console.error('❌ TWITCH_OAUTH_TOKEN não definido! Criar .env com o token.');
  process.exit(1);
}
if (!config.twitch.clientId) {
  console.warn('⚠️ TWITCH_CLIENT_ID não definido — a conexão pode falhar com Twitch IRC moderno.');
}

console.log(`🔧 Config: username=${config.twitch.username}, clientId=${config.twitch.clientId ? config.twitch.clientId.slice(0, 6) + '...' : '(vazio)'}, token=${config.twitch.token ? config.twitch.token.slice(0, 12) + '...' : '(vazio)'}`);

// ============================================
// TMI CLIENT — starts with no channels; joins dynamically
// ============================================
const client = new tmi.Client({
  options: {
    debug: false,
    clientId: config.twitch.clientId || undefined,
  },
  connection: {
    reconnect: true,
    secure: true,
  },
  identity: {
    username: config.twitch.username,
    password: config.twitch.token,
  },
  channels: [],
});

// Track state
const joinedChannels = new Set();
const failedChannels = new Set();
const modChannels = new Set();         // Channels where bot is mod
const channelConfigs = new Map();      // channel -> config from API
const customCommands = new Map();      // channel -> Map(cmd -> response)
const timerIntervals = new Map();      // channel -> [intervalIds]
const chatLineCount = new Map();       // channel -> count since last timer

// ============================================
// BUILT-IN COMMAND REGISTRY
// ============================================
const BUILTIN_COMMANDS = {
  score: commands.score,
  mapas: commands.mapas,
  match: commands.match,
  next: commands.next,
  vrs: commands.vrs,
  info: commands.info,
};

// Cooldown tracking: `${channel}:${command}` -> timestamp
const cooldowns = new Map();

// ============================================
// FETCH CHANNEL CONFIGS FROM SITE API
// ============================================
async function refreshConfigs() {
  try {
    const data = await api.getTwitchBotChannels();
    const channels = data || [];
    
    for (const ch of channels) {
      const name = (ch.twitch_name || '').toLowerCase();
      if (!name) continue;
      channelConfigs.set(name, ch);

      // Load custom commands
      if (ch.custom_commands) {
        const cmdMap = new Map();
        for (const c of ch.custom_commands) {
          if (c.enabled) cmdMap.set(c.command.toLowerCase(), c);
        }
        customCommands.set(name, cmdMap);
      }

      // Setup timers
      setupTimers(name, ch.timers || []);
    }

    console.log(`⚙️ Configs carregadas: ${channels.length} canais`);
  } catch (err) {
    console.error('⚠️ Erro ao buscar configs do bot:', err?.message || err);
  }
}

// ============================================
// FETCH STREAMERS FROM SITE + JOIN CHANNELS
// ============================================
async function refreshChannels() {
  try {
    const streamers = await api.getStreamers();
    const twitchNames = streamers
      .map(s => (s.twitch_name || '').toLowerCase().trim())
      .filter(Boolean);

    if (twitchNames.length === 0) {
      console.log('⚠️ Nenhum streamer com twitch_name encontrado no site.');
      return;
    }

    // Join new channels
    for (const name of twitchNames) {
      if (!joinedChannels.has(name) && !failedChannels.has(name)) {
        try {
          await client.join(name);
          joinedChannels.add(name);
          console.log(`📺 Joined #${name}`);
        } catch (e) {
          failedChannels.add(name);
          console.error(`❌ Falha ao entrar em #${name}:`, e?.message || e);
        }
      }
    }

    // Part channels that are no longer in the site
    const siteSet = new Set(twitchNames);
    for (const name of joinedChannels) {
      if (!siteSet.has(name)) {
        try {
          await client.part(name);
          joinedChannels.delete(name);
          modChannels.delete(name);
          console.log(`📤 Left #${name} (removido do site)`);
        } catch (e) {
          // Ignore part errors
        }
      }
    }

    console.log(`📺 Canais ativos: ${joinedChannels.size} | Mod em: ${modChannels.size}`);
  } catch (err) {
    console.error('❌ Erro ao buscar streamers:', err?.message || err);
  }
}

// ============================================
// TIMER SYSTEM
// ============================================
function setupTimers(channel, timers) {
  // Clear existing timers for this channel
  const existing = timerIntervals.get(channel) || [];
  for (const iv of existing) clearInterval(iv);
  timerIntervals.set(channel, []);

  if (!timers || timers.length === 0) return;

  const intervals = [];
  for (const timer of timers) {
    if (!timer.enabled) continue;
    const ms = (timer.interval_minutes || 15) * 60 * 1000;
    const minLines = timer.min_chat_lines || 5;

    const iv = setInterval(async () => {
      // Only send if we're mod and channel has enough activity
      if (!modChannels.has(channel)) return;
      const lines = chatLineCount.get(channel) || 0;
      if (lines < minLines) return;

      try {
        await client.say(`#${channel}`, timer.message);
        chatLineCount.set(channel, 0); // Reset counter
      } catch { /* silent */ }
    }, ms);

    intervals.push(iv);
  }
  timerIntervals.set(channel, intervals);
}

// ============================================
// MOD STATUS DETECTION
// ============================================
function updateModStatus(channel, isMod) {
  const name = channel.replace(/^#/, '').toLowerCase();
  const wasMod = modChannels.has(name);
  
  if (isMod && !wasMod) {
    modChannels.add(name);
    console.log(`🔑 Mod ganho em #${name}`);
    // Notify API
    api.reportModStatus(name, true).catch(() => {});
  } else if (!isMod && wasMod) {
    modChannels.delete(name);
    console.log(`🔒 Mod perdido em #${name}`);
    api.reportModStatus(name, false).catch(() => {});
  }
}

// ============================================
// MESSAGE HANDLER
// ============================================
client.on('message', async (channel, tags, message, self) => {
  const channelName = channel.replace(/^#/, '').toLowerCase();
  
  // Count chat lines for timer system
  chatLineCount.set(channelName, (chatLineCount.get(channelName) || 0) + 1);

  if (self) return;

  // Detect if bot is mod from userstate (on own messages) — handled in 'notice' event
  // For incoming messages, just process commands

  // Must be mod to respond
  if (!modChannels.has(channelName)) return;

  // Get channel config
  const chConfig = channelConfigs.get(channelName);
  const prefix = chConfig?.prefix || config.prefix;
  
  if (!message.startsWith(prefix)) return;

  const parts = message.slice(prefix.length).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Check user level for custom commands
  const userLevel = getUserLevel(tags);

  // Try custom command first
  const chCustom = customCommands.get(channelName);
  if (chCustom?.has(cmd)) {
    const customCmd = chCustom.get(cmd);
    if (!meetsCooldown(`${channelName}:custom:${cmd}`, (customCmd.cooldown_seconds || 10) * 1000)) return;
    if (!meetsLevel(userLevel, customCmd.user_level || 'everyone')) return;
    
    const response = processVars(customCmd.response, { channel: channelName, user: tags['display-name'] || tags.username });
    if (response) await client.say(channel, response).catch(() => {});
    // Increment use count
    api.incrementCommandUse(customCmd.id).catch(() => {});
    return;
  }

  // Built-in commands
  const handler = BUILTIN_COMMANDS[cmd];
  if (!handler) return;

  // Check if module is enabled
  if (chConfig?.modules) {
    try {
      const modules = typeof chConfig.modules === 'string' ? JSON.parse(chConfig.modules) : chConfig.modules;
      if (modules[cmd] === false) return;
    } catch { /* allow if parse fails */ }
  }

  if (!meetsCooldown(`${channelName}:${cmd}`, (chConfig?.cooldown_seconds || 5) * 1000)) return;

  try {
    const response = await handler(channel, args);
    if (response) await client.say(channel, response);
  } catch (err) {
    console.error(`[${cmd}] Erro:`, err?.message || err);
  }
});

// ============================================
// HELPERS
// ============================================
function meetsCooldown(key, ms) {
  const now = Date.now();
  const last = cooldowns.get(key) || 0;
  if (now - last < ms) return false;
  cooldowns.set(key, now);
  return true;
}

function getUserLevel(tags) {
  if (tags.badges?.broadcaster === '1') return 'broadcaster';
  if (tags.mod) return 'moderator';
  if (tags.badges?.vip === '1') return 'vip';
  if (tags.subscriber) return 'subscriber';
  return 'everyone';
}

const LEVEL_HIERARCHY = ['everyone', 'subscriber', 'vip', 'moderator', 'broadcaster'];
function meetsLevel(userLevel, requiredLevel) {
  return LEVEL_HIERARCHY.indexOf(userLevel) >= LEVEL_HIERARCHY.indexOf(requiredLevel);
}

function processVars(text, ctx) {
  return text
    .replace(/\{channel\}/g, ctx.channel || '')
    .replace(/\{user\}/g, ctx.user || '')
    .replace(/\{time\}/g, new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{date\}/g, new Date().toLocaleDateString('pt-PT'));
}

// ============================================
// MOD EVENTS
// ============================================

// When bot's own messages carry userstate we can detect mod
client.on('userstate', (channel, state) => {
  const isMod = state.mod || state.badges?.broadcaster === '1';
  updateModStatus(channel, isMod);
});

// Also check on ROOMSTATE (when joining)
client.on('roomstate', async (channel) => {
  // After joining a channel, check our mod list
  const channelName = channel.replace(/^#/, '').toLowerCase();
  try {
    const mods = await client.mods(channelName);
    const botName = config.twitch.username.toLowerCase();
    const isMod = mods.map(m => m.toLowerCase()).includes(botName);
    updateModStatus(channel, isMod);
  } catch {
    // mods() can fail if not mod — that itself means we're not mod
  }
});

// ============================================
// CONNECT + REFRESH LOOPS
// ============================================
client.on('connected', async (addr, port) => {
  console.log(`✅ OVERFRAG Twitch Bot conectado a ${addr}:${port}`);
  console.log(`🔗 API: ${config.api.baseUrl}`);

  // Load configs + join channels
  await refreshConfigs();
  await refreshChannels();

  // Refresh periodically
  setInterval(refreshChannels, config.refreshInterval);
  setInterval(refreshConfigs, 2 * 60 * 1000); // Configs every 2 min
});

client.on('disconnected', (reason) => {
  console.log(`❌ Desconectado: ${reason}`);
  if (reason?.includes('Login authentication failed')) {
    console.error('🔑 O token OAuth é inválido ou expirou. Gera um novo token em:');
    console.error(`   https://id.twitch.tv/oauth2/authorize?client_id=${config.twitch.clientId}&redirect_uri=https://overfrag.pt/&response_type=token&scope=chat:read+chat:edit`);
    console.error('   Depois copia o access_token do URL e coloca em TWITCH_OAUTH_TOKEN (com ou sem prefixo oauth:)');
  }
});

client.connect().catch(err => {
  console.error('❌ Falha ao conectar:', err?.message || err);
  if (String(err).includes('Login authentication failed')) {
    console.error('🔑 Token inválido/expirado. Gera um novo:');
    console.error(`   https://id.twitch.tv/oauth2/authorize?client_id=${config.twitch.clientId}&redirect_uri=https://overfrag.pt/&response_type=token&scope=chat:read+chat:edit`);
  }
  process.exit(1);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', () => {
  console.log('Desligando...');
  for (const ivs of timerIntervals.values()) ivs.forEach(iv => clearInterval(iv));
  client.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  for (const ivs of timerIntervals.values()) ivs.forEach(iv => clearInterval(iv));
  client.disconnect();
  process.exit(0);
});
