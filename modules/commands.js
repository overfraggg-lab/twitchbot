/**
 * OVERFRAG Twitch Bot — Command handlers
 * Commands filter matches by the streamer's claimed games (streamer_user_id).
 */
import * as api from './api.js';

// ============================================
// HELPERS
// ============================================
function formatScore(m) {
  const t1 = m.equipa1_sigla || m.equipa1_nome || '?';
  const t2 = m.equipa2_sigla || m.equipa2_nome || '?';
  return `${t1} ${m.resultado_equipa1 ?? 0} - ${m.resultado_equipa2 ?? 0} ${t2}`;
}

function formatTime(m) {
  const date = m.data_jogo || '';
  const time = m.hora_jogo || 'TBD';
  if (!date) return time;
  const d = new Date(date);
  const day = d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  return `${day} às ${time}`;
}

/** Filter matches to only those claimed by this streamer */
function filterByStreamer(matches, userId) {
  if (!userId) return matches;
  return matches.filter(m => m.streamer_user_id && Number(m.streamer_user_id) === Number(userId));
}

// ============================================
// COMMANDS
// ============================================

/** !score — Live score (claimed games only) */
export async function score(channel, args, ctx = {}) {
  const matches = await api.getUpcomingMatches();
  const filtered = filterByStreamer(matches, ctx.streamerUserId);

  const live = filtered.find(m => m.estado === 'ao_vivo' || m.estado === 'em_curso');
  if (!live) return '❌ Nenhum jogo ao vivo de momento.';

  let msg = `🔴 AO VIVO: ${formatScore(live)}`;
  if (live.live_data?.mapa_atual) {
    msg += ` | Mapa: ${live.live_data.mapa_atual}`;
    if (live.live_data.round_score) {
      msg += ` (${live.live_data.round_score.team1}-${live.live_data.round_score.team2})`;
    }
  }
  if (live.torneio_nome) msg += ` | ${live.torneio_nome}`;
  return msg;
}

/** !mapas — Maps of current/last match (claimed games only) */
export async function mapas(channel, args, ctx = {}) {
  const matches = await api.getUpcomingMatches();
  const filtered = filterByStreamer(matches, ctx.streamerUserId);

  // Find live or most recent finished
  const live = filtered.find(m => m.estado === 'ao_vivo' || m.estado === 'em_curso');
  const target = live || filtered.find(m => m.estado === 'terminado');
  
  if (!target) return '❌ Sem jogos para mostrar mapas.';

  const t1 = target.equipa1_sigla || target.equipa1_nome || '?';
  const t2 = target.equipa2_sigla || target.equipa2_nome || '?';
  
  if (!target.live_data?.finished_maps && !target.live_data?.mapa_atual) {
    return `🗺️ ${t1} vs ${t2} — Mapas ainda não disponíveis.`;
  }

  let parts = [`🗺️ ${t1} vs ${t2}`];
  
  if (target.live_data?.finished_maps) {
    for (const map of target.live_data.finished_maps) {
      parts.push(`${map.name}: ${map.score1}-${map.score2}`);
    }
  }
  
  if (target.live_data?.mapa_atual) {
    let current = `▶ ${target.live_data.mapa_atual}`;
    if (target.live_data.round_score) {
      current += ` (${target.live_data.round_score.team1}-${target.live_data.round_score.team2})`;
    }
    parts.push(current);
  }

  return parts.join(' | ');
}

/** !match — Current match details (claimed games only) */
export async function match(channel, args, ctx = {}) {
  const matches = await api.getUpcomingMatches();
  const filtered = filterByStreamer(matches, ctx.streamerUserId);

  const live = filtered.find(m => m.estado === 'ao_vivo' || m.estado === 'em_curso');
  const upcoming = filtered.find(m => m.estado === 'agendado');
  const target = live || upcoming;

  if (!target) return '❌ Nenhum jogo em curso ou agendado.';

  const t1 = target.equipa1_sigla || target.equipa1_nome || '?';
  const t2 = target.equipa2_sigla || target.equipa2_nome || '?';

  if (live) {
    return `🔴 ${formatScore(live)} | ${live.torneio_nome || ''} ${live.formato ? `(${live.formato})` : ''}`.trim();
  }

  return `📅 ${t1} vs ${t2} — ${formatTime(target)} | ${target.torneio_nome || ''} ${target.formato ? `(${target.formato})` : ''}`.trim();
}

/** !next — Next scheduled match (claimed games only) */
export async function next(channel, args, ctx = {}) {
  const matches = await api.getUpcomingMatches();
  const filtered = filterByStreamer(matches, ctx.streamerUserId);

  const upcoming = filtered.find(m => m.estado === 'agendado');
  if (!upcoming) return '❌ Nenhum jogo agendado de momento.';

  const t1 = upcoming.equipa1_sigla || upcoming.equipa1_nome || '?';
  const t2 = upcoming.equipa2_sigla || upcoming.equipa2_nome || '?';
  return `📅 Próximo: ${t1} vs ${t2} — ${formatTime(upcoming)} | ${upcoming.torneio_nome || ''}`.trim();
}

/** !vrs [equipa] — Valve Regional Standings ranking */
export async function vrs(channel, args, ctx = {}) {
  const search = args.join(' ').trim();
  
  if (!search) {
    // Show top 5 from VRS ranking
    const ranking = await api.getRanking();
    const withVrs = ranking.filter(t => t.vrs_rank != null).sort((a, b) => a.vrs_rank - b.vrs_rank).slice(0, 5);
    if (withVrs.length === 0) return 'ℹ️ Nenhuma equipa com ranking VRS.';
    const lines = withVrs.map(t => `#${t.vrs_rank} ${t.sigla || t.nome} (${t.vrs_points || 0} pts)`);
    return `🏆 Top VRS: ${lines.join(' | ')}`;
  }

  // Search by name
  const ranking = await api.getRanking();
  const found = ranking.find(t => 
    (t.nome || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.sigla || '').toLowerCase() === search.toLowerCase()
  );
  
  if (!found) return `❌ Equipa "${search}" não encontrada.`;
  if (found.vrs_rank == null) return `ℹ️ ${found.nome} não tem ranking VRS.`;
  return `🏆 ${found.nome} — VRS #${found.vrs_rank} (${found.vrs_points || 0} pts) | Ranking PT #${found.posicao_atual || '?'}`;
}

/** !info — Bot info */
export async function info() {
  return 'ℹ️ OVERFRAG Bot — CS2 português ao vivo! Comandos: ?score ?mapas ?match ?next ?vrs ?uptime ?title ?game | overfrag.pt';
}

/** !uptime — Stream uptime */
export async function uptime(channel, args, ctx = {}) {
  const channelName = channel.replace(/^#/, '').toLowerCase();
  try {
    const data = await api.getStreamInfo(channelName);
    if (!data || !data.started_at) return `❌ ${channelName} não está em directo.`;
    const start = new Date(data.started_at);
    const diff = Date.now() - start.getTime();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `⏱️ ${channelName} está em directo há ${hours}h ${mins}m`;
  } catch {
    return `❌ Não foi possível obter o uptime.`;
  }
}

/** !title [novo título] — Show or change stream title */
export async function title(channel, args, ctx = {}) {
  const channelName = channel.replace(/^#/, '').toLowerCase();
  const newTitle = args.join(' ').trim();

  if (!newTitle) {
    // Just show current title
    try {
      const data = await api.getStreamInfo(channelName);
      return `📺 Título: ${data?.title || '(sem título)'}`;
    } catch {
      return `❌ Não foi possível obter o título.`;
    }
  }

  // Change title — requires broadcaster/mod
  try {
    const result = await api.setChannelInfo(channelName, { title: newTitle });
    if (result?.success) return `✅ Título alterado para: ${newTitle}`;
    return `❌ ${result?.error || 'Não foi possível alterar o título.'}`;
  } catch {
    return `❌ Não foi possível alterar o título.`;
  }
}

/** !game [novo jogo] — Show or change stream game/category */
export async function game(channel, args, ctx = {}) {
  const channelName = channel.replace(/^#/, '').toLowerCase();
  const newGame = args.join(' ').trim();

  if (!newGame) {
    try {
      const data = await api.getStreamInfo(channelName);
      return `🎮 Jogo: ${data?.game_name || '(sem jogo)'}`;
    } catch {
      return `❌ Não foi possível obter o jogo.`;
    }
  }

  try {
    const result = await api.setChannelInfo(channelName, { game: newGame });
    if (result?.success) return `✅ Jogo alterado para: ${newGame}`;
    return `❌ ${result?.error || 'Não foi possível alterar o jogo.'}`;
  } catch {
    return `❌ Não foi possível alterar o jogo.`;
  }
}

/** !viewers — Current viewer count */
export async function viewers(channel, args, ctx = {}) {
  const channelName = channel.replace(/^#/, '').toLowerCase();
  try {
    const data = await api.getStreamInfo(channelName);
    if (!data || !data.viewer_count) return `❌ ${channelName} não está em directo.`;
    return `👀 ${data.viewer_count} viewers a assistir ${channelName}`;
  } catch {
    return `❌ Não foi possível obter os viewers.`;
  }
}

/** !socials — Social links */
export async function socials() {
  return '🔗 Twitter: x.com/overfrag_pt | Discord: discord.gg/overfrag | Site: overfrag.pt';
}
