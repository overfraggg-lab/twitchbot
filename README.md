# OVERFRAG Twitch Bot

Bot de Twitch para canais de CS2 português. Busca dados ao vivo do site overfrag.pt.

## Comandos

| Comando | Descrição |
|---------|-----------|
| `!mapas` | Mapas do jogo ao vivo ou último resultado |
| `!score` | Score ao vivo do jogo em curso |
| `!match` | Detalhes do jogo atual (equipa vs equipa) |
| `!next` | Próximo jogo agendado |
| `!vrs` | Ranking VRS de uma equipa |
| `!info` | Informação sobre o bot |

## Configuração

Criar ficheiro `.env`:

```env
TWITCH_BOT_USERNAME=overfragbot
TWITCH_OAUTH_TOKEN=oauth:xxxxxxxxxx
TWITCH_CLIENT_ID=xxxxxxxxxx
TWITCH_CLIENT_SECRET=xxxxxxxxxx
SITE_API_URL=https://overfrag.pt
```

O bot busca automaticamente os canais dos streamers registados no site (tabela `streamers`, campo `twitch_name`).
A lista é actualizada a cada 5 minutos.

Obter token OAuth: https://twitchapps.com/tmi/

## Deploy (Pterodactyl)

1. Upload ficheiros
2. Configurar variáveis de ambiente no painel
3. Start command: `node index.js`
4. Node.js 18+

## Arquitectura

- `index.js` — Entry point, liga ao IRC. Auto-join de canais via API do site (GET /backend/streamers).
- `modules/commands.js` — Handlers de cada comando (!score, !mapas, !match, !next, !vrs, !info)
- `modules/api.js` — Fetch helpers para o backend OVERFRAG + streamers
- `modules/config.js` — Configuração centralizada
