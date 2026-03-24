/**
 * OVERFRAG Twitch Bot — API helpers
 */
import { config } from './config.js';

const BASE = config.api.baseUrl;
const TIMEOUT = 10000;

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** Get upcoming + live matches */
export async function getUpcomingMatches() {
  const data = await apiFetch('/backend/jogos/proximos');
  return data.items || [];
}

/** Get recent results */
export async function getResults(limit = 5) {
  const data = await apiFetch(`/backend/resultados?limit=${limit}`);
  return data.items || [];
}

/** Get matches for a specific team */
export async function getTeamMatches(teamId) {
  const data = await apiFetch(`/backend/jogos/equipa/${teamId}`);
  return data.items || [];
}

/** Get team by slug or ID */
export async function getTeam(slugOrId) {
  // Try by ID first
  if (!isNaN(Number(slugOrId))) {
    const data = await apiFetch(`/backend/equipas/id/${slugOrId}`);
    return data;
  }
  const data = await apiFetch(`/backend/equipas/${slugOrId}`);
  return data;
}

/** Get full ranking */
export async function getRanking() {
  const data = await apiFetch('/backend/equipas/ranking');
  return data.items || [];
}

/** Get all registered streamers */
export async function getStreamers() {
  const data = await apiFetch('/backend/streamers');
  return data.items || [];
}

// ============================================
// TWITCH BOT CONFIG API
// ============================================

/** Get all bot channel configs (with commands + timers) */
export async function getTwitchBotChannels() {
  const data = await apiFetch('/backend/twitchbot/channels');
  return data.items || [];
}

/** Report mod status change to the site */
export async function reportModStatus(twitchName, isMod) {
  const res = await fetch(`${BASE}/backend/twitchbot/mod-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ twitch_name: twitchName, is_mod: isMod ? 1 : 0 }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  return res.json();
}

/** Increment custom command use count */
export async function incrementCommandUse(commandId) {
  await fetch(`${BASE}/backend/twitchbot/commands/${commandId}/use`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT),
  });
}
