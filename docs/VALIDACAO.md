# Validação

## 2026-10-24 — trilha web Three.js (alternativa Iris Pro)

Equipamento: mesmo MacBook Pro Iris Pro / macOS 12.7.6. Node v22.6.0. Vite fixado em **5.4.19** (Vite 8/rolldown falhou: binding darwin-x64 ausente).

### Executado

| Comando | Resultado |
|---|---|
| Branch `feat/web-threejs-engine` | Criada a partir de `main`. |
| `cd web && npm install && npx tsc --noEmit` | OK após ajustes de tipos/hooks. |
| `VITE_BASE=/battle-hell/ npm run build` | OK; `dist/` com `index.html`, `editor.html`, 17× `.glb`, WAV, `maps/`. Sem `.blend` no dist. |
| `npm run dev` + curl | `200` em `/`, `/editor.html`, `/models/skeleton.glb`, `/models/brazier.glb`. |
| Probe credenciais Tripo/Gemini/ElevenLabs | MISSING — arte via GLB local + procedural. |

### Executado depois (mesmo dia — áudio + evidência + Tauri check)

| Comando | Resultado |
|---|---|
| Web Audio (`AudioSystem`) | Unlock no gesto; loops rain/wind/fire/drone; SFX shotgun/hit/death/thunder/waves; M muta. |
| `npx playwright test tests/visual.spec.ts` | **2 passed** (desktop + mobile landscape). |
| `inspect-threejs-canvas.mjs --manifest … --seed 42` | PASS desktop+mobile `pass-web-audio-2`; GPU hardware; budget OK. |
| `check_evidence.py` | Evidence check passed. |
| `cd editor && npm i && npx tauri icon …` | Ícones icns/ico gerados. |
| `cargo check` em `editor/src-tauri` | **Finished** (~5m47s, baixou crates Tauri 2). |

Scorecard preliminar: média ~**1.5** (não premium). Detalhes em `artifacts/visual-scorecard.md` e `artifacts/final-evidence.md`.

### 2026-10-24 (noite) — passe visual objetivo Abbey Clearing

| Comando | Resultado |
|---|---|
| PostPipeline (bloom) + MaterialKit + AbbeyDressing + VFX dual-layer | Integrado. |
| `inspect … pass-goal-1` | PASS desktop/mobile; entropy **5.28**, contrast **117**, edges **0.17**, dominant **0.23**, budget OK. |
| `playwright test tests/visual.spec.ts` | **2 passed**. |
| Scorecard | média ~**1.95** (rewards ainda 1.5). Captura: portão+banners, hex path, esqueleto com hit, arma FPS. |

Alvo obrigatório: `artifacts/visual-goal/` (jpg gitignored; ver README).

### Ainda pendente

- Pickups/rewards para fechar scorecard premium.
- `tauri dev` / `.app` smoke.
- Animações GLB Idle/Walk/Attack.
- Deploy Pages real.

## 2026-10-08/09 — elenco de mortos-vivos, áudio e jogo em módulos

Equipamento: MacBook Pro com Intel Core i7-4770HQ 2,2 GHz (4 núcleos), 16 GB, GPU integrada Intel Iris Pro (Metal), macOS 12.7.6 (21H1320).
Ferramentas: Rust 1.99.0 (rustup), Bevy =0.16.1 (wgpu 24.0.5 / wgpu-hal 24.0.4), Python 3 do sistema, **Blender 2.91.2** (o projeto fixa 4.2 LTS; o script detecta as diferenças de API, mas a exportação no 4.2 **não foi testada**).

### Executado e aprovado

| Comando | Resultado |
|---|---|
| `Blender -b --factory-startup --python tools/build_blender_assets.py -- <nome>` (um processo por ativo) | 17 GLB + `.blend` exportados: kit de cenário, arma, `skeleton`, `skeleton_reaper`, `skeleton_knight`, `skeleton_warlord`, `ghoul`, `skull_horned`. Cada exportação imprime um traceback inofensivo do callback de UI do exportador glTF 2.91. Lote com vários personagens no mesmo processo travou; usar um por processo. |
| Inspeção do JSON dos GLB (script Python) | Personagens com 1 skin e 5 animações em ordem alfabética `Attack, Death, Hit, Idle, Walk`; 8,5k–10,9k triângulos por personagem; materiais e cores de vértice presentes. |
| Renders Workbench (`.scratch/roster.py`) | Folhas de pose Idle/Walk/Attack/Death conferidas visualmente antes da integração. |
| `python3 tools/generate_audio.py` | 59 WAV em 75 s; picos ≤ 0,95, sem clipping; loops estéreo de chuva/vento/drone. |
| `cargo check` | Sem erros nem avisos do projeto. |
| `cargo fmt --check` | OK. |
| `cargo clippy --all-targets` | Sem avisos (lints `too_many_arguments`/`type_complexity` liberadas no crate por serem padrão de sistemas Bevy). |
| `cargo test --release` | 14 testes OK: raio × esfera/cápsula, distinção cabeça/corpo, inimigo morto ou enterrado não leva tiro, progressão das 5 ondas com o senhor da guerra por último, ordem dos clipes, armadura absorvendo dano, derrota única, invulnerabilidade, colisão com props e limite da arena, chão plano na área de luta, dispersão do cone da escopeta, chaves `BH_GFX`. |
| `cargo build --release` | OK (primeiro build 30 min nesta máquina; incrementais 30–45 s). |

### Executado e reprovado nesta máquina: renderização

`battle-hell --bench 40` abre a janela e cria o dispositivo Metal (`AdapterInfo { name: "Intel Iris Pro Graphics", backend: Metal }`), mas o compilador de shaders do driver aborta:

```
Shader translation error ... new_render_pipeline_state: "Compiler encountered an internal error"
In Device::create_render_pipeline, label = 'pbr_opaque_mesh_pipeline'
```

Diagnóstico feito:

- Variando `BH_GFX` (`noshadow`, `nopointshadow`, `nofog`, `cheapfog`, `nohdr`, `nomsaa`, `pcf`, `nobindless`, `nogpupre`, `noadd` e combinações): sempre falha algum pipeline PBR (opaco, alpha blend ou aditivo); a ordem varia porque os pipelines compilam em paralelo.
- `examples/gpu_probe.rs` (um cubo, uma luz, nada do jogo) falha igual: no compute `mesh preprocessing (GPU frustum culling)` e, com `--nogpupre`, no `pbr_opaque_mesh_pipeline`, mesmo `--unlit` e sem luz.
- `WGPU_SETTINGS_PRIO=compatibility|webgl2`: esbarra em limites (`max_storage_buffers_per_shader_stage` 8 < 9; storage textures 0).
- Patch local temporário do `wgpu-hal` (em `.scratch`, já removido do `Cargo.toml`) desligando `preserveInvariance`, *vertex pulling* e forçando MSL 2.1/2.2/2.3: continua falhando.

- Bevy 0.20.0 (wgpu 30.0.1, mais recente em 2026-10-09), projeto mínimo isolado em `.scratch/probe20` com o mesmo cubo: falha antes, na criação do dispositivo, ao compilar o compute interno de validação indireta do wgpu (`indirect-validation error ... Compiler encountered an internal error` → `RequestDeviceError ... Device(Lost)`). Atualizar o Bevy não resolve; o projeto permanece no 0.16.1 e não foi criada branch de migração.

Conclusão: o compilador Metal do driver desta Iris Pro no macOS 12 falha até em shaders pequenos gerados pelo wgpu; nem Bevy 0.16.1 nem 0.20.0 renderizam aqui. Não é defeito do código do jogo. **Execução visual, captura de tela, áudio em tempo real e tempo de quadro do jogo ainda não foram validados.** Repetir em máquina com GPU suportada (Mac Apple Silicon, ou Windows/Linux com GPU dedicada/integrada recente):

```sh
cargo run --release --example gpu_probe          # deve terminar com "gpu_probe: PBR pipelines compiled"
cargo run --release -- --bench 40 --shot target/bench.png
```

O bench inicia as ondas sozinho, varre a câmera, atira a cada 2,2 s, salva a captura em 60% do tempo e imprime média, p95, p99 e pior tempo de quadro. Registrar aqui o resultado e a captura.

### Pendências de validação

- Sessão jogada com fones: mixagem, atenuação espacial (`SpatialScale` 0,22), diretor de tensão, mudo (M) e pausa (P).
- Conferir orientação/escala da arma em primeira pessoa (`VIEWMODEL_POS`) e dos personagens no jogo; reforço de emissivo (×14) nos olhos e brasas.
- Desempenho: 900 gotas de chuva, 6 braseiros com 18 brasas, 2 luzes pontuais com sombra, 11 luzes pontuais no total.
- Exportação pelo Blender 4.2 LTS.

## 2026-10-06 — estado anterior

Executado: geração dos seis WAV por Python; análise de sintaxe dos dois scripts Python.
Não executado na época: cargo, runtime Bevy, Blender e FPS (ferramentas ausentes). Referências JPEG omitidas da publicação pública.
