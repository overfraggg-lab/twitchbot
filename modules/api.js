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
