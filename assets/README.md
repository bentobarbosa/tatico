# Assets do Tatico 3D

Coloque modelos, texturas e sons nestas pastas e aponte os arquivos em `assets/manifest.json`.

## Modelos

Use arquivos `.glb` ou `.gltf` em `assets/models/`.

IDs que o jogo ja reconhece:

- `weapon_pistol`
- `weapon_smg`
- `weapon_shotgun`
- `weapon_rifle`
- `weapon_sniper`
- `bot_ct`
- `bot_tr`
- `crate`
- `container_blue`
- `container_red`
- `barrel`
- `vehicle_blue`
- `vehicle_red`
- `bomb`

Exemplo:

```json
"weapon_rifle": "assets/models/rifle.glb"
```

## Texturas

Use `.png` ou `.jpg` em `assets/textures/`.

Exemplo:

```json
"asphalt": {
  "url": "assets/textures/asphalt.jpg",
  "material": "asphalt",
  "repeat": [16, 3]
}
```

## Sons

Use `.mp3`, `.wav` ou `.ogg` em `assets/sounds/`.

Exemplo:

```json
"shot_rifle": "assets/sounds/rifle.wav"
```

Se algum arquivo ficar vazio no manifesto, o jogo usa o modelo/textura/som procedural que ja existe.
