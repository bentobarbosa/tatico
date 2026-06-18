# Tatico 3D

Jogo de tiro tatico 3D feito em JavaScript com Three.js.
Projeto colaborativo: **bentobarbosa** com Claude + **zooio14** com Codex.

Jogar: https://bentobarbosa.github.io/tatico/

## Como jogar

- WASD: mover
- Mouse: mirar
- Clique esquerdo: atirar
- R: recarregar
- B: comprar, durante a fase de compra
- Shift: andar devagar

## O que tem agora

- Engine 3D em JavaScript com Three.js `0.160.0`
- Mapa 3D estilo arena tática, com corredores, cobertura, caixas, paredes e bombsite A
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
- Multiplayer online
- Sons de tiro, passos e recarga
- Mais mapas
- Granadas flash/smoke
- IA com cobertura
- Skins e nicks
