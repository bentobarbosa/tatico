# Prompt para Lovable

Crie um app de lobby e painel para o jogo Tatico 3D.

O jogo principal roda em um servidor Render e expoe uma API publica. Use uma variavel de ambiente chamada `VITE_GAME_API_URL` com a URL base do Render, por exemplo:

```txt
https://SEU-SERVICO.onrender.com
```

Use estes endpoints:

- `GET /api/status`: status do servidor, salas abertas, jogadores online e salas publicas.
- `GET /api/rooms`: lista de salas publicas disponiveis.
- `GET /api/leaderboard`: ranking em tempo real com kills, deaths, wins, losses e KD.
- `GET /api/config`: configuracao do jogo, modos e armas.
- `/`: link para jogar.

Crie estas telas:

- Home com botao "Jogar agora", status do servidor e quantidade de jogadores online.
- Lobby com lista de salas publicas, codigo da sala, estado da rodada e vagas CT/TR.
- Leaderboard com rank, nome, vitorias, kills, deaths, KD e ultima vez online.
- Painel de jogo com cards para armas, modos e informacoes do servidor.

Design:

- Visual de shooter tatico moderno, inspirado em jogos competitivos, sem copiar marcas ou assets.
- Tema escuro, acentos azul para CT, laranja/vermelho para TR e verde/amarelo para acao.
- Interface limpa, rapida e responsiva para desktop e celular.

Regras:

- O app do Lovable nao deve recriar o jogo 3D.
- O botao "Jogar agora" deve abrir `${VITE_GAME_API_URL}/`.
- Consuma a API com `fetch`.
- Mostre estados de carregamento e erro quando o Render estiver dormindo ou acordando.
- Atualize status, salas e leaderboard automaticamente a cada 5 segundos.
