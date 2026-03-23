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
TWITCH_CHANNELS=channel1,channel2
SITE_API_URL=https://overfrag.pt
# Opcional: associar canal a equipa
CHANNEL_TEAM_MAP=channel1:1,channel2:5
```

Obter token OAuth: https://twitchapps.com/tmi/

## Deploy (Pterodactyl)

1. Upload ficheiros
2. Configurar variáveis de ambiente no painel
3. Start command: `node index.js`
4. Node.js 18+

## Arquitectura

- `index.js` — Entry point, liga ao IRC e regista comandos
- `modules/commands.js` — Handlers de cada comando
- `modules/api.js` — Fetch helpers para o backend OVERFRAG
- `modules/config.js` — Configuração centralizada
