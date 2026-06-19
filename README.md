# Tatico 3D

Jogo de tiro tatico 3D feito em JavaScript com Three.js.
Projeto colaborativo: **bentobarbosa** com Claude + **zooio14** com Codex.

Jogar: https://bentobarbosa.github.io/tatico/

## Como jogar

- WASD: mover
- Mouse: mirar
- Clique esquerdo do mouse ou touchpad: atirar
- Espaço: pular e subir em caixas/muretas baixas
- R: recarregar
- B: comprar, durante a fase de compra
- C: abrir opcoes de mira e ambiente
- N: alternar entre dia e noite
- Shift: andar devagar
- Celular/iPad: joystick esquerdo move, arrastar na tela mira, botao Atirar dispara

## O que tem agora

- Engine 3D em JavaScript com Three.js `0.160.0`
- Tela inicial nova com nome do jogador, escolha de manual de comandos e dois modos: treino offline ou multiplayer
- Mapa 3D maior estilo arena tática, com corredores, cobertura, caixas, contêineres, barris, paredes e bombsite A
- Movimento corrigido para andar exatamente na direção da câmera, com mira por pointer lock e fallback por arrasto do mouse
- Gráficos com tone mapping, sombras melhores, luz de preenchimento e mais detalhes no mapa
- Mais elementos no mapa: casas, oficinas, mercados, veículos, muretas e coberturas extras com colisão
- Pulo com gravidade e plataformas escaláveis em caixas, carros e muretas
- Mira central em X com feedback de tiro e acerto
- Miras estilo CS2 com opcoes verde, amarela e ciano, salvando a escolha do jogador
- Ambiente com modo dia e modo noite
- Personagens TR com corpo 3D: tronco em `CapsuleGeometry`, cabeça, capacete, visor, colete, braços, mãos, pernas, botas e arma
- Modelo em primeira pessoa com braços e arma visível
- Sistema de rodadas CT vs TR
- Multiplayer online 4x4 com WebSocket, salas públicas/privadas, código de sala, times CT/TR, limite de 8 jogadores, placar, vida, tiros, dano e reset de rodada
- Lista de salas públicas na tela inicial e aquecimento jogavel enquanto espera outro jogador
- Modo online por eliminação: morreu, espera o round acabar; vitória/derrota pagam dinheiro diferente para compra de armas
- Controles touch para celular/iPad: joystick de movimento, mirar arrastando na tela, atirar, recarregar, comprar e andar devagar
- Bots com IA simples: procuram o jogador, usam linha de visão, avançam, recuam e atiram
- Armas compráveis: pistola, SMG, escopeta, fuzil e sniper
- HUD com vida, arma, munição, dinheiro, placar e radar
- Tiros com raycast, spread, dano, tracers e partículas de impacto

## Arquivos

- `index.html`: estrutura da página e telas
- `style.css`: HUD, menus e visual da interface
- `game.js`: motor do jogo, mapa, armas, bots, física, tiros e renderização 3D

## Rodar localmente

Para testar o modo offline, qualquer servidor local funciona:

```bash
cd /Users/guilhermetrecenti/Documents/Codex/2026-06-15/voce-tem-acesso-ao-meu-repositorio/work/tatico
python3 -m http.server 8080
```

Depois abra:

```text
http://localhost:8080
```

Para testar o multiplayer 4x4, rode com Node:

```bash
cd /Users/guilhermetrecenti/Documents/Codex/2026-06-15/voce-tem-acesso-ao-meu-repositorio/work/tatico
npm start
```

Depois abra:

```text
http://localhost:8080
```

O modo online precisa do servidor Node ou do Render, porque ele usa WebSocket.

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
- Sons de tiro, passos e recarga
- Mais mapas
- Granadas flash/smoke
- IA com cobertura
- Skins e nicks

## Multiplayer 4v4

O multiplayer ja esta implementado no servidor Node do projeto. Ele usa WebSocket em `/multiplayer`, divide automaticamente os jogadores em CT e TR e limita a sala em 4 jogadores por time.

Existem tres jeitos de entrar:

- **Entrar em sala publica**: procura uma sala publica com vaga ou cria uma automaticamente
- **Criar sala**: cria uma sala nova e mostra o codigo dela no painel online
- **Entrar por codigo**: entra direto em uma sala especifica, inclusive privada
- **Lista de salas publicas**: mostra salas abertas, quantidade de jogadores e permite entrar com um clique

O servidor decide tiros, dano, vida, mortes, placar e reset de rodada. A movimentacao fica rapida no cliente e e sincronizada para os outros jogadores.

Quando uma sala ainda nao tem jogadores nos dois times, ela fica em aquecimento. Nesse modo da para andar, mirar, testar tiros e chamar outra pessoa pelo codigo da sala; quando os dois times existem, o servidor abre a fase de compra e depois o combate real.
