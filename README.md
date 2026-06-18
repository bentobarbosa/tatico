# 🔫 Tático 2D

Jogo de tiro tático 2D (visto de cima), estilo CS, feito num único arquivo `index.html`.
Projeto colaborativo: **bentobarbosa** (com Claude) + **zooio14** (com Codex).

🎮 Jogar: https://bentobarbosa.github.io/tatico/

## Como jogar
- 🖥️ PC: `WASD` mover · mouse mirar · clique atirar · `R` recarregar · `B` comprar
- 📱 Celular: analógico esquerdo = andar · analógico direito = mirar/atirar
- Elimine o time TR em cada rodada. Kills dão dinheiro pra comprar armas melhores.

## Como colaborar (importante!)
Os dois mexem no MESMO repositório. Pra não dar conflito:
1. Sempre **dê `git pull`** antes de começar a mexer.
2. Faça sua parte, **`git commit`** e **`git push`**.
3. Combinem quem mexe em quê (ex: um faz armas, outro faz mapa).

```bash
git pull            # pega o que o outro fez
# ... edita o index.html ...
git add -A && git commit -m "o que mudei" && git push
```

## Tudo está em `index.html`
Seções marcadas no `<script>`: `armas`, `mapa (buildMap)`, `IA dos bots`, `update`, `render`, `buy menu`.

## 🗺️ Ideias / TODO (peguem uma cada)
- [ ] 💣 Bomba: TR planta no site A, CT desarma (segurar E) — fim de round por bomba
- [ ] 🌐 Multiplayer online (PlayroomKit ou WebRTC/PeerJS) — fase 2
- [ ] 🔊 Sons de tiro, recarga, passos
- [ ] 🗺️ Mais mapas / mapa maior com câmera que segue o jogador
- [ ] 🎒 Granadas (flash / fumaça)
- [ ] 🤖 IA melhor pros bots (cobertura, mira mais humana)
- [ ] 🏆 Placar de melhor de 16 rounds (MR12) e fim de partida
- [ ] 🎨 Skins / cores de time / nick do jogador
