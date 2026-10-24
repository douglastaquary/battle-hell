# Battle Hell Engine (web)

## Camadas

| Camada | Pasta | Papel |
| --- | --- | --- |
| Game | `web/src/game` | FPS, ondas, combate, input touch |
| UI | `web/src/ui` | HUD gótico |
| Scene | `web/src/engine/scene` | `map.json`, WorldBuilder, GLB kit |
| Render | `web/src/engine/render` | Atmosphere (céu/lua/fog/moonlight) |
| VFX | `web/src/engine/vfx` | Diretor + partículas 3D + sprites 2D |
| Editor | `web/src/engine/editor` | UI Dark Veil-like + fly/walk |

## VFX híbrido

1. **ParticleSystem3D** — pontos aditivos para faíscas/estilhaços densos.
2. **ProceduralSpriteEngine** — instanced billboards com atlas canvas (fire, ember, smoke, soul, spark, bone, muzzle).
3. **VfxDirector** — eventos (`muzzle`, `hit`, `death`, `soul`, `burn`, `lightning`) e emissores de braseiro contínuos.

## Mapa

`BattleHellMap` em `MapFormat.ts`. Arquivos em `web/maps/`. O editor salva download JSON e abre via file picker (v1); Tauri ganhará diálogo nativo em seguida.

## URLs locais

- Jogo: http://127.0.0.1:5188/
- Editor: http://127.0.0.1:5188/editor.html
