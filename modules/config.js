/**
 * OVERFRAG Twitch Bot — Configuration
 */
import 'dotenv/config';

export const config = {
  twitch: {
    username: process.env.TWITCH_BOT_USERNAME || 'overfragbot',
    token: process.env.TWITCH_OAUTH_TOKEN || '',
    channels: (process.env.TWITCH_CHANNELS || '').split(',').map(c => c.trim()).filter(Boolean),
  },
  api: {
    baseUrl: (process.env.SITE_API_URL || 'https://overfrag.pt').replace(/\/+$/, ''),
  },
  // Map channel name → team ID for context-aware commands
  channelTeamMap: parseChannelTeamMap(process.env.CHANNEL_TEAM_MAP || ''),
  prefix: '!',
  cooldown: 5000, // 5s cooldown per command per channel
};

function parseChannelTeamMap(raw) {
  const map = {};
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const [channel, teamId] = pair.split(':');
    if (channel && teamId) map[channel.trim().toLowerCase()] = Number(teamId.trim());
  }
  return map;
}
