# Tatico 3D

Jogo de tiro tatico 3D feito em JavaScript com Three.js.
Projeto colaborativo: **bentobarbosa** com Claude + **zooio14** com Codex.

Jogar: https://bentobarbosa.github.io/tatico/

## Como jogar

- WASD: mover
- Mouse: mirar
- Clique esquerdo do mouse ou touchpad: atirar
- R: recarregar
- B: comprar, durante a fase de compra
- Shift: andar devagar

## O que tem agora

- Engine 3D em JavaScript com Three.js `0.160.0`
- Mapa 3D maior estilo arena tática, com corredores, cobertura, caixas, contêineres, barris, paredes e bombsite A
- Movimento corrigido para andar exatamente na direção da câmera
- Gráficos com tone mapping, sombras melhores, luz de preenchimento e mais detalhes no mapa
- Personagens TR com corpo 3D: tronco em `CapsuleGeometry`, cabeça, capacete, visor, colete, braços, mãos, pernas, botas e arma
- Modelo em primeira pessoa com braços e arma visível
- Sistema de rodadas CT vs TR
- Bots com IA simples: procuram o jogador, usam linha de visão, avançam, recuam e atiram
- Armas compráveis: pistola, SMG, escopeta, fuzil e sniper
- HUD com vida, arma, munição, dinheiro, placar e radar
- Tiros com raycast, spread, dano, tracers e partículas de impacto

## Arquivos

- `index.html`: estrutura da página e telas
- `style.css`: HUD, menus e visual da interface
- `game.js`: motor do jogo, mapa, armas, bots, física, tiros e renderização 3D

## Rodar localmente

```bash
cd /Users/guilhermetrecenti/Documents/Codex/2026-06-15/voce-tem-acesso-ao-meu-repositorio/work/tatico
python3 -m http.server 8080
```

Depois abra:

```text
http://localhost:8080
```

Tambem pode rodar do mesmo jeito que vai rodar no servidor:

```bash
cd /Users/guilhermetrecenti/Documents/Codex/2026-06-15/voce-tem-acesso-ao-meu-repositorio/work/tatico
npm start
```

## Colocar no servidor gratuito

O projeto ja tem `server.js`, `package.json` e `render.yaml`, entao ele esta pronto para subir no Render como servidor Node.

No Render:

1. Clique em **New +**
2. Escolha **Blueprint** ou **Web Service**
3. Conecte o repositorio `bentobarbosa/tatico`
4. Use o plano **Free**
5. Confirme o deploy

Se escolher **Web Service** manualmente:

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

## Como colaborar

Antes de mexer:

```bash
git pull
```

Depois de mexer:

```bash
git add -A
git commit -m "descreva a mudanca"
git push
```

## Ideias para a próxima fase

- Bomba com plantar/desarmar
- Multiplayer online 4v4 com servidor autoritativo em Node.js/WebSocket
- Sons de tiro, passos e recarga
- Mais mapas
- Granadas flash/smoke
- IA com cobertura
- Skins e nicks

## Multiplayer 4v4

Dá para fazer, mas precisa de uma parte além do GitHub Pages: um servidor em tempo real.
O caminho recomendado é manter o site no GitHub Pages e criar um servidor Node.js com WebSocket/Socket.IO para salas 4v4, times CT/TR, posições, tiros, dano, round e placar.

Para funcionar bem, o servidor deve ser autoritativo: ele decide acertos, vida, dinheiro e fim de rodada. Assim fica mais justo e evita trapaça simples.
