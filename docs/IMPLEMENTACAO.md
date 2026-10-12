# Implementação e direção

## Decisões aceitas

Usuário: Douglas Taquary. Solicitação: arena 3D de fantasia sombria com Rust + Blender, arma detalhada, inimigos realistas no estilo low poly das referências, iluminação atmosférica e som imersivo de chuva, tiros, passos e criaturas.
Plataforma inicial: desktop. iOS é etapa futura.
Referência: https://x.com/dimillian/status/2107161600335507611 e vídeos de "Dark Veil — The Blackwood" (ondas 1–5, chuva forte, braseiros, esqueletos, escopeta dupla) fornecidos pelo usuário.
2026-10-08: o usuário trocou zumbis por esqueletos e outros mortos-vivos da imagem de elenco; os personagens são originais no mesmo estilo, mais voltados ao realismo (pedido posterior), sem copiar os ativos de referência.

## Referências visuais

As capturas não acompanham o repositório público (`.gitignore`). Cópias privadas: `docs/references/reference-scene.jpeg` (arena com portal, braseiros, cristais, HUD) e `docs/references/reference-enemies.jpeg` (elenco low poly de esqueletos, cavaleiro, ghoul, caveira com chifres).
Usar como direção de composição; não reproduzir identidade, interface ou ativos do jogo original.

## Mapa do código

- `src/main.rs`: `App`, plugins, `Game` (vida, armadura, onda, fase `Intro/Countdown/Fighting/Victory/Defeat`, abates, mudo), `Game::damage` (armadura absorve 60% até acabar), `Gfx` (chaves `BH_GFX`), entrada global (P, M, Enter/R) e evento `Restart`.
- `src/world.rs`: arena (chão de lama com relevo e cores de vértice, poças, portal, muro em anel com brechas, árvores, lápides, forca, pedras, cristais), `Obstacles` (colisão circular + raio da arena), braseiros (luz que oscila, chamas aditivas, brasas), chuva que acompanha o jogador, tempestade (relâmpago duplo + trovão atrasado), partículas (`spawn_burst`: osso, lama, terra, faísca, alma) e reforço de emissivo dos GLB.
- `src/player.rs`: câmera HDR com bloom, tonemapping e neblina; movimento com aceleração, balanço de cabeça, passos; escopeta (`Gun`: 2 cartuchos, 9 chumbos em cone de 0,065 rad, queda de dano após 6 m, recarga 1,55 s, recarga automática); viewmodel com recuo, balanço e mergulho de recarga; clarão do cano; evento `EnemyHit`.
- `src/enemy.rs`: `Kind` e atributos, carregamento das cenas e grafos de animação (`AnimationGraph::from_clips` com clipes 0–4), ligação do `AnimationPlayer` por observer `SceneInstanceReady`, ondas (`wave_roster`), pontos de surgimento (portão, chão, caveira no alto), IA (`Rising → Chase → Attack/Hit → Dead`), separação entre inimigos, golpe no meio do ataque, dano recebido (cabeça ×1,8, armadura de placas, atordoamento por limiar), sons por corpo, drop de cristal, afundar e remover cadáver.
- `src/audio.rs`: `Sfx` (todos os WAV), `play_2d`, `play_at`, `play_on` (som filho do inimigo), loops de ambiente e diretor de tensão.
- `src/hud.rs`: barras de vida/armadura, cartuchos, onda/restantes, tempo/abates, mira com marcador de acerto, faixas de fase, vinheta de dano e de vida baixa.
- `src/bench.rs`: `--bench [s] --shot caminho` para validação automática.
- `examples/gpu_probe.rs`: cena mínima para checar se a GPU compila os shaders do Bevy.
- `tools/build_blender_assets.py`: kit de cenário, arma e elenco (ver abaixo).
- `tools/generate_audio.py`: síntese de todos os WAV.

## Elenco

| Arquivo | Papel no jogo | Vida | Velocidade | Dano |
|---|---|---|---|---|
| `skeleton` | base, clava com cravos | 60 | 1,7 | 10 |
| `skeleton_reaper` | rápido, ziguezague | 45 | 2,7 | 8 |
| `skeleton_knight` | placas, recebe 70% do dano | 150 | 1,35 | 18 |
| `skeleton_warlord` | chefe da onda 5, escala 1,3 | 460 | 1,55 | 28 |
| `ghoul` | carne seca, avanço irregular | 95 | 2,1 | 14 |
| `skull_horned` | flutua, investe; malha estática | 55 | 3,0 | 12 |

Ondas: 1) 5 esqueletos; 2) 4 esqueletos + 3 ceifadores; 3) 3 esqueletos + 2 ceifadores + 3 ghouls + 1 caveira; 4) 3 ceifadores + 2 cavaleiros + 2 ghouls + 2 caveiras; 5) 3 esqueletos + 2 cavaleiros + 2 caveiras + senhor da guerra. Máximo de 8 vivos ao mesmo tempo; entre ondas, 6 s de respiro e +25 de armadura.

## Arte e exportação

Uma unidade = um metro. Blender Z para cima → glTF/Bevy Y para cima. Personagens olham para −Y no Blender (+Z no glTF); a arma aponta para +Y no Blender (−Z, frente da câmera).
Personagens: armadura de 15 ossos (`RIG`), skinning rígido (cada peça 100% num osso), cores de vértice com variação por face, oclusão ambiente assada por raio e sujeira junto ao chão; animações como trilhas NLA a 24 fps exportadas em ordem alfabética.
O Blender 2.91 não exporta intensidade de emissão; `world::boost_emissive` multiplica por 14 os emissivos ≤ 1 vindos dos GLB.

## Suspense sonoro

1. Base: chuva estéreo contínua, vento que recua quando a tensão sobe, fogo espacial em cada braseiro, trovões espaçados com relâmpago.
2. Pistas: passos secos de osso (mais graves no cavaleiro/chefe), passos pesados do ghoul, chocalhar de ossos ao surgir, gemidos com variante distante pré-filtrada além de 11 m.
3. Aproximação: drone sobe de volume e afinação conforme o inimigo mais próximo; batimento entra com vida abaixo de 40.
4. Confronto: escopeta com 4 variações e cauda, estilhaço de osso, faíscas em armadura, desmoronamento na morte.
5. Alívio: stinger de fim de onda e contagem antes da próxima.

Atenuação: rodio usa inverso do quadrado; `SpatialScale` 0,22 deixa ~4 m em volume cheio. Mudo usa `mute()` dos sinks e novos sons nascem mudos.
Registrar origem e licença de cada arquivo em `docs/AUDIO_ASSETS.csv`.

## Desempenho e limites

Meta: 60 FPS a 1280×720 no equipamento-alvo — ainda não medida (ver `docs/VALIDACAO.md`). Carga atual: ~900 gotas, ~110 brasas, até 8 inimigos esqueléticos (8,5k–10,9k triângulos cada, sem frustum culling por causa da animação de morte), 13 luzes pontuais (2 com sombra), luz direcional com 2 cascatas. `BH_GFX` permite reduzir sombras, neblina, HDR/bloom e MSAA.

## Marcos

- M0: compilação validada, Cargo.lock gerado — feito. Execução visual pendente (GPU incompatível na máquina de desenvolvimento).
- M1: arte da arma, arena e elenco — feito no Blender; revisão dentro do jogo pendente.
- M2: áudio completo e diretor de tensão — implementado; mixagem com fones pendente.
- M3: inimigos animados, ondas, colisão simples — implementado; sessão jogada pendente.
- M4: medição no aparelho-alvo, depois iOS/toque.
