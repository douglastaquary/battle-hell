# Battle Hell — Batalha no Inferno — arena 3D de suspense

Protótipo de código Rust + Bevy 0.16.1, com exemplos de geração Blender 4.2 LTS.
Nome provisório; projeto original inspirado no clima visual das referências.

## Estado real da entrega

- Código inicial: arena procedural, arma dupla, um inimigo que persegue, mira, disparos, vida, vitória/derrota e reinício.
- Iluminação: luar, quatro luzes quentes oscilantes, neblina por distância, chuva visual e flash de disparo.
- Áudio: seis WAV sintetizados originais incluídos, para avaliar ritmo e integração. **Não são gravações reais nem áudio final.**
- Blender: script para gerar exemplos editáveis de arma, inimigo e ruína; geração dos GLB não executada neste ambiente.
- Rust/Blender indisponíveis no ambiente de criação: **compilação, execução 3D, desempenho e exportação ainda não validados**.
- As capturas de referência fornecidas pelo usuário foram omitidas desta publicação pública. A direção visual está descrita em `docs/IMPLEMENTACAO.md`; as capturas permanecem no pacote original.
- Sem animação de esqueleto, colisão com objetos, oclusão acústica, reverberação de ambiente, explosões visuais ou suporte iOS nesta versão.
- Não há garantia de rodar em qualquer hardware: usar GPU com drivers compatíveis e validar cada plataforma.

## Preparar outro computador

Instalar Rust usando https://rustup.rs/ e Python 3.10+. Para gerar modelos, instalar Blender 4.2 LTS.
Windows: instalar ferramentas C++ do Visual Studio. macOS: instalar Xcode Command Line Tools.
Ubuntu/Debian: `sudo apt install build-essential pkg-config libasound2-dev libudev-dev libx11-dev libxrandr-dev libxi-dev libxcursor-dev libxinerama-dev libwayland-dev libxkbcommon-dev`.

Na raiz deste projeto:

```sh
python3 tools/generate_audio.py
cargo check
cargo fmt
cargo clippy --all-targets
cargo run --release
```

No Windows, substituir `python3` por `python` se necessário.
A primeira compilação baixa as dependências e pode demorar. Após gerar `Cargo.lock`, versioná-lo para fixar dependências transitivas.

Controles: clicar para capturar o mouse; WASD para andar; mouse para mirar; clique esquerdo dispara; Shift corre; Esc libera mouse e pausa combate; R reinicia; M silencia sons futuros e pausa os sons em andamento.
Objetivo: acertar cinco disparos no inimigo sem ser alcançado. O inimigo avança mais rápido quando fora da mira. A mira e os sons devem revelar ameaça, sem depender somente de sustos.

## Gerar exemplos no Blender

```sh
blender --background --python tools/build_blender_assets.py
cargo run --release -- --blender
```

O script cria `weapon`, `enemy` e `ruin`, em `.blend` e `.glb`, dentro de `assets/models`.
A opção `--blender` substitui arma e inimigo procedurais pelos GLB. A ruína exportada é um exemplo para futura integração.
Os modelos são blocagens iniciais, sem o detalhamento artístico das capturas.

## Continuar com Codex

A skill acompanha o repositório em `.agents/skills/build-rust-suspense-game`.
Se o cliente não detectar skills de projeto, copiar essa pasta para `~/.codex/skills/`.
Invocar: `$build-rust-suspense-game`.
Ler também `AGENTS.md` e `docs/IMPLEMENTACAO.md`.

## Clonar do GitHub

```sh
git clone https://github.com/douglastaquary/battle-hell.git
cd battle-hell
```

Depois, executar os comandos de preparação e de Blender acima. CI valida Python e executa `cargo check` em Linux; esse teste não substitui uma sessão visual com áudio.
As imagens de referência ficam fora do Git público; para revisão artística, consultar o pacote original fornecido pelo usuário.

## Próximas entregas

1. Compilar e corrigir qualquer incompatibilidade identificada; gerar e versionar Cargo.lock.
2. Validar controles, reinício, cinco acertos, derrota e pausa com mouse liberado.
3. Substituir blocagens por arte original com texturas PBR; testar os GLB.
4. Trocar WAV sintéticos por gravações licenciadas; implementar variações, distância, oclusão e mixagem com limite de volume.
5. Medir FPS e tempo de quadro no equipamento-alvo; só então ampliar a arena e planejar iOS.
