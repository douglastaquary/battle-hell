# Battle Hell — Batalha no Inferno — arena 3D de suspense

Jogo de arena em primeira pessoa feito com Rust + Bevy 0.16.1, com arte gerada por script no Blender e áudio sintetizado por script em Python.
Nome provisório; projeto original inspirado no clima visual das referências (chuva, fogo, ruínas góticas, mortos-vivos low poly).

## Estado real da entrega

- **Jogo**: 5 ondas de mortos-vivos que surgem do chão ou entram pelo portão; escopeta de cano duplo (2 cartuchos, 9 chumbos, recarga), tiro na cabeça, armadura, cristais de alma que curam, vitória/derrota, pausa, mudo e reinício.
- **Inimigos** (GLB com rig e 5 animações: Idle, Walk, Attack, Hit, Death): esqueleto com clava, esqueleto ceifador (rápido, ziguezague), cavaleiro de placas (resistente), senhor da guerra com chifres (chefe da onda 5), ghoul de carne seca e caveira com chifres flutuante (controlada por código).
- **Cenário**: portal gótico, muro em ruínas, árvores mortas, lápides, forca, pedras, cristais verdes, seis braseiros com chamas e brasas, chão de lama com poças, chuva, relâmpagos.
- **Áudio**: 59 WAV originais sintetizados (escopeta, recarga, passos na lama, vozes por formantes perto/longe, ossos chocalhando/estilhaçando/desmoronando, chuva, vento, fogo, trovão, drone de tensão, batimento). Vozes e passos ficam presos ao corpo de cada inimigo com áudio espacial estéreo; um diretor de tensão ajusta drone, vento e batimento pela distância dos inimigos e pela vida.
- **Validado**: `cargo check`, `fmt`, `clippy` sem avisos, 14 testes unitários, build release, exportação Blender 2.91.2. Detalhes em `docs/VALIDACAO.md`.
- **Não validado**: execução visual. No Mac de desenvolvimento (Intel Iris Pro, macOS 12) o compilador de shaders Metal do driver aborta em qualquer cena 3D do Bevy 0.16, inclusive um cubo isolado (`examples/gpu_probe.rs`). Captura de tela, mixagem em tempo real e tempo de quadro precisam ser medidos em outra máquina.
- Áudio espacial é panorâmico estéreo com atenuação por distância (rodio); não há HRTF, oclusão nem reverberação por sala. Os sons são sínteses, não gravações de campo.
- Sem suporte iOS/toque nesta versão.

## Preparar outro computador

Instalar Rust usando https://rustup.rs/ e Python 3.10+. Para regenerar modelos, Blender 4.2 LTS (testado de fato só no 2.91.2).
Windows: ferramentas C++ do Visual Studio. macOS: Xcode Command Line Tools.
Ubuntu/Debian: `sudo apt install build-essential pkg-config libasound2-dev libudev-dev libx11-dev libxrandr-dev libxi-dev libxcursor-dev libxinerama-dev libwayland-dev libxkbcommon-dev`.

Na raiz do projeto:

```sh
python3 tools/generate_audio.py          # opcional: os WAV já estão versionados
cargo check
cargo fmt
cargo clippy --all-targets
cargo test
cargo run --release --example gpu_probe  # confirma que a GPU compila os shaders do Bevy
cargo run --release
```

A primeira compilação release baixa e compila o Bevy e pode levar de 5 a 30 minutos.

### Controles

Clique para entrar na arena (captura o mouse). WASD anda, Shift corre, mouse mira, clique atira, R recarrega, P pausa, M liga/desliga o som, Esc solta o mouse. Após vitória ou derrota, R ou Enter reinicia.

### Bench e opções gráficas

`cargo run --release -- --bench 40 --shot target/bench.png` roda sozinho por 40 s (ondas, câmera, tiros), salva uma captura e imprime média/p95/p99 do tempo de quadro.
`BH_GFX` desliga recursos em GPUs fracas, separados por vírgula: `noshadow`, `nopointshadow`, `nofog`, `cheapfog`, `nohdr`, `nobloom`, `nomsaa`, `pcf`, `nobindless`, `nogpupre`, `noadd`. Exemplo: `BH_GFX=nopointshadow,nomsaa cargo run --release`.

## Regenerar os modelos no Blender

Um ativo por processo (vários personagens no mesmo processo travaram no 2.91):

```sh
for a in weapon gate brazier tree_a tree_b graves gallows rock crystal wall \
         skeleton skeleton_reaper skeleton_knight skeleton_warlord ghoul skull_horned; do
  blender -b --factory-startup --python tools/build_blender_assets.py -- $a
done
```

Saída em `assets/models` (`.blend` editável + `.glb` de runtime). Sem argumento depois de `--`, o script gera tudo em sequência.
Os personagens são originais no estilo low poly das referências, não cópias.

## Continuar com Codex/Cursor

A skill acompanha o repositório em `.agents/skills/build-rust-suspense-game`.
Se o cliente não detectar skills de projeto, copiar essa pasta para `~/.codex/skills/`.
Ler também `AGENTS.md`, `docs/IMPLEMENTACAO.md` e `docs/VALIDACAO.md`.

## Clonar do GitHub

```sh
git clone https://github.com/douglastaquary/battle-hell.git
cd battle-hell
```

O CI valida os scripts Python, gera o áudio e roda `fmt`, `clippy -D warnings` e `cargo test` em Linux; isso não substitui uma sessão visual com áudio.
As imagens de referência ficam fora do Git público.

## Próximas entregas

1. Rodar `gpu_probe` e `--bench` numa GPU suportada; registrar captura e tempos de quadro em `docs/VALIDACAO.md`.
2. Sessão jogada: ajustar escala/posição da arma, mixagem espacial, dificuldade das ondas.
3. Conferir a exportação no Blender 4.2 LTS.
4. Gravações licenciadas para substituir ou reforçar as sínteses; oclusão e reverberação se o backend permitir.
5. Medir no equipamento-alvo antes de ampliar a arena ou planejar iOS.
