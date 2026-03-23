/**
 * OVERFRAG Twitch Bot — Configuration
 */
import 'dotenv/config';

export const config = {
  twitch: {
    username: process.env.TWITCH_BOT_USERNAME || 'overfragbot',
    token: process.env.TWITCH_OAUTH_TOKEN || '',
    clientId: process.env.TWITCH_CLIENT_ID || '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  },
  api: {
    baseUrl: (process.env.SITE_API_URL || 'https://overfrag.pt').replace(/\/+$/, ''),
  },
  prefix: '!',
  cooldown: 5000, // 5s cooldown per command per channel
  refreshInterval: 5 * 60 * 1000, // Refresh streamer list every 5 minutes
};
