/**
 * OVERFRAG Twitch Bot — Entry point
 * 
 * Connects to Twitch IRC via tmi.js.
 * Auto-fetches streamer channels from the OVERFRAG site API.
 * Periodically refreshes the channel list to join/part as needed.
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
  channels: [], // Will be populated from site API
});

// Track currently joined channels
const joinedChannels = new Set();

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
      if (!joinedChannels.has(name)) {
        try {
          await client.join(name);
          joinedChannels.add(name);
          console.log(`📺 Joined #${name}`);
        } catch (e) {
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
          console.log(`📤 Left #${name} (removido do site)`);
        } catch (e) {
          // Ignore part errors
        }
      }
    }

    console.log(`📺 Canais ativos: ${joinedChannels.size} (${[...joinedChannels].join(', ')})`);
  } catch (err) {
    console.error('❌ Erro ao buscar streamers:', err.message);
  }
}

// ============================================
// COMMAND REGISTRY
// ============================================
const COMMANDS = {
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
// MESSAGE HANDLER
// ============================================
client.on('message', async (channel, tags, message, self) => {
  if (self) return;
  if (!message.startsWith(config.prefix)) return;

  const parts = message.slice(config.prefix.length).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = COMMANDS[cmd];
  if (!handler) return;

  // Cooldown check
  const key = `${channel}:${cmd}`;
  const now = Date.now();
  const lastUsed = cooldowns.get(key) || 0;
  if (now - lastUsed < config.cooldown) return;
  cooldowns.set(key, now);

  try {
    const response = await handler(channel, args);
    if (response) {
      await client.say(channel, response);
    }
  } catch (err) {
    console.error(`[${cmd}] Erro:`, err.message);
    await client.say(channel, '❌ Erro ao processar comando. Tenta novamente.').catch(() => {});
  }
});

// ============================================
// CONNECT + CHANNEL REFRESH LOOP
// ============================================
client.on('connected', async (addr, port) => {
  console.log(`✅ OVERFRAG Twitch Bot conectado a ${addr}:${port}`);
  console.log(`🔗 API: ${config.api.baseUrl}`);

  // Initial channel join
  await refreshChannels();

  // Refresh channels periodically
  setInterval(refreshChannels, config.refreshInterval);
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
  console.error('❌ Falha ao conectar:', err.message || err);
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
  client.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  client.disconnect();
  process.exit(0);
});
