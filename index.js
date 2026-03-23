/**
 * OVERFRAG Twitch Bot — Entry point
 * 
 * Connects to Twitch IRC via tmi.js, registers commands,
 * and polls OVERFRAG API for CS2 match data.
 */
import tmi from 'tmi.js';
import { config } from './modules/config.js';
import * as commands from './modules/commands.js';

// ============================================
// VALIDATION
// ============================================
if (!config.twitch.token) {
  console.error('❌ TWITCH_OAUTH_TOKEN não definido! Criar .env com o token.');
  process.exit(1);
}

if (config.twitch.channels.length === 0) {
  console.error('❌ TWITCH_CHANNELS não definido! Adicionar canais no .env.');
  process.exit(1);
}

// ============================================
// TMI CLIENT
// ============================================
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: config.twitch.username,
    password: config.twitch.token,
  },
  channels: config.twitch.channels,
});

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
// CONNECT
// ============================================
client.on('connected', (addr, port) => {
  console.log(`✅ OVERFRAG Twitch Bot conectado a ${addr}:${port}`);
  console.log(`📺 Canais: ${config.twitch.channels.join(', ')}`);
  console.log(`🔗 API: ${config.api.baseUrl}`);
  if (Object.keys(config.channelTeamMap).length > 0) {
    console.log(`🗺️ Channel→Team map: ${JSON.stringify(config.channelTeamMap)}`);
  }
});

client.on('disconnected', (reason) => {
  console.log(`❌ Desconectado: ${reason}`);
});

client.connect().catch(err => {
  console.error('❌ Falha ao conectar:', err.message);
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
