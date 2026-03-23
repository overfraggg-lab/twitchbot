/**
 * OVERFRAG Twitch Bot — Command handlers
 */
import { config } from './config.js';
import * as api from './api.js';

// ============================================
// HELPERS
// ============================================
function getTeamIdForChannel(channel) {
  const ch = channel.replace('#', '').toLowerCase();
  return config.channelTeamMap[ch] || null;
}

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

// ============================================
// COMMANDS
// ============================================

/** !score — Live score */
export async function score(channel, args) {
  const teamId = getTeamIdForChannel(channel);
  
  let matches;
  if (teamId) {
    matches = await api.getTeamMatches(teamId);
  } else {
    matches = await api.getUpcomingMatches();
  }

  const live = matches.find(m => m.estado === 'ao_vivo' || m.estado === 'em_curso');
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

/** !mapas — Maps of current/last match */
export async function mapas(channel, args) {
  const teamId = getTeamIdForChannel(channel);
  
  let matches;
  if (teamId) {
    matches = await api.getTeamMatches(teamId);
  } else {
    matches = await api.getUpcomingMatches();
  }

  // Find live or most recent finished
  const live = matches.find(m => m.estado === 'ao_vivo' || m.estado === 'em_curso');
  const target = live || matches.find(m => m.estado === 'terminado');
  
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

/** !match — Current match details */
export async function match(channel, args) {
  const teamId = getTeamIdForChannel(channel);
  
  let matches;
  if (teamId) {
    matches = await api.getTeamMatches(teamId);
  } else {
    matches = await api.getUpcomingMatches();
  }

  const live = matches.find(m => m.estado === 'ao_vivo' || m.estado === 'em_curso');
  const upcoming = matches.find(m => m.estado === 'agendado');
  const target = live || upcoming;

  if (!target) return '❌ Nenhum jogo em curso ou agendado.';

  const t1 = target.equipa1_sigla || target.equipa1_nome || '?';
  const t2 = target.equipa2_sigla || target.equipa2_nome || '?';

  if (live) {
    return `🔴 ${formatScore(live)} | ${live.torneio_nome || ''} ${live.formato ? `(${live.formato})` : ''}`.trim();
  }

  return `📅 ${t1} vs ${t2} — ${formatTime(target)} | ${target.torneio_nome || ''} ${target.formato ? `(${target.formato})` : ''}`.trim();
}

/** !next — Next scheduled match */
export async function next(channel, args) {
  const teamId = getTeamIdForChannel(channel);
  
  let matches;
  if (teamId) {
    matches = await api.getTeamMatches(teamId);
  } else {
    matches = await api.getUpcomingMatches();
  }

  const upcoming = matches.find(m => m.estado === 'agendado');
  if (!upcoming) return '❌ Nenhum jogo agendado de momento.';

  const t1 = upcoming.equipa1_sigla || upcoming.equipa1_nome || '?';
  const t2 = upcoming.equipa2_sigla || upcoming.equipa2_nome || '?';
  return `📅 Próximo: ${t1} vs ${t2} — ${formatTime(upcoming)} | ${upcoming.torneio_nome || ''}`.trim();
}

/** !vrs [equipa] — VRS ranking of a team */
export async function vrs(channel, args) {
  const search = args.join(' ').trim();
  
  if (!search) {
    // Show channel team VRS or top 5
    const teamId = getTeamIdForChannel(channel);
    if (teamId) {
      try {
        const team = await api.getTeam(String(teamId));
        if (team.vrs_rank) {
          return `🏆 ${team.nome} — VRS #${team.vrs_rank} (${team.vrs_points || 0} pts)`;
        }
        return `ℹ️ ${team.nome} não tem ranking VRS.`;
      } catch { /* fall through */ }
    }
    
    // Show top 5 from ranking
    const ranking = await api.getRanking();
    const withVrs = ranking.filter(t => t.vrs_rank).sort((a, b) => a.vrs_rank - b.vrs_rank).slice(0, 5);
    if (withVrs.length === 0) return 'ℹ️ Nenhuma equipa com ranking VRS.';
    const lines = withVrs.map(t => `#${t.vrs_rank} ${t.sigla || t.nome}`);
    return `🏆 Top VRS: ${lines.join(' | ')}`;
  }

  // Search by name
  const ranking = await api.getRanking();
  const found = ranking.find(t => 
    (t.nome || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.sigla || '').toLowerCase() === search.toLowerCase()
  );
  
  if (!found) return `❌ Equipa "${search}" não encontrada.`;
  if (!found.vrs_rank) return `ℹ️ ${found.nome} não tem ranking VRS.`;
  return `🏆 ${found.nome} — VRS #${found.vrs_rank} (${found.vrs_points || 0} pts) | Ranking PT #${found.posicao_atual || '?'}`;
}

/** !info — Bot info */
export async function info() {
  return 'ℹ️ OVERFRAG Bot — CS2 português ao vivo! Comandos: !score !mapas !match !next !vrs | overfrag.pt';
}
