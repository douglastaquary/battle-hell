# Implementação e direção

## Decisões aceitas

Usuário: Douglas Taquary. Solicitação: criar pequena arena 3D de fantasia sombria com Rust + Blender, arma detalhada, um inimigo, iluminação atmosférica e som de chuva, tiros e explosões realistas. Produzir suspense durante a exploração e continuidade reproduzível no GitHub.
Plataforma inicial assumida: desktop, ainda sem equipamento-alvo confirmado. iOS é etapa futura.
Referência: https://x.com/dimillian/status/2107161600335507611
Texto fornecido: port de Dark Veil para iOS e toque alterou cerca de 200 linhas de uma base Rust existente. Não interpretar como criação do jogo inteiro em 200 linhas. Motor do original não confirmado.

## Referências visuais

As capturas não acompanham o repositório público. Os caminhos abaixo descrevem os arquivos do pacote original, disponíveis separadamente ao proprietário. Solicitar esse pacote antes de uma comparação visual.

`references/reference-rain.jpeg`: chuva forte, arena escura, luz de fogo, arma na parte inferior, inimigos emergindo da atmosfera.
`references/reference-arena.jpeg`: geometria angular, floresta, portal em ruínas, pedras no chão, arma dupla com metal e detalhes dourados.
Usar essas imagens como direção de composição. Não reproduzir a identidade, interface ou ativos do jogo original.

## Mapa do código

`src/main.rs`:
- `setup`: arena, câmera, arma, inimigo, chuva, iluminação, sons e HUD.
- `controls`: teclado, mouse, captura, reinício e silêncio.
- `combat`: perseguição, dano por aproximação, disparo por raio simplificado e sons de ameaça.
- `atmosphere`: chuva, oscilação de luzes, recuo visual e flash.
- `update_hud`: vida e resultado.
- `play`: efeitos descartáveis com opção espacial.
`tools/generate_audio.py`: sintetizar WAV de teste com sementes fixas.
`tools/build_blender_assets.py`: construir e exportar exemplos; conferir orientação, escala e material dentro do jogo.

## Arte e exportação

Manter uma unidade igual a um metro. Blender usa Z para cima; glTF/Bevy usam Y. Aplicar escala no Blender; verificar frente da arma na importação. Separar arte editável `.blend` e ativo de runtime `.glb`.
Exportar materiais PBR com cor, metallic, roughness, normal e AO quando suportados. Materiais procedurais complexos precisam ser convertidos/bakeados em mapas compatíveis. Não assumir fidelidade idêntica entre render Blender e runtime.
Criar metal gasto com bordas iluminadas, madeira escura, pedra úmida e variação de rugosidade. Próximo incremento: arma com silhueta reconhecível, alças, gatilho, boca de cano realmente aberta e texturas originais. Inimigo precisa rig e animações de idle, andar, ataque, impacto e morte.

## Suspense sonoro

Objetivo: alternar antecipação, ameaça, ação e alívio; tornar o jogo envolvente. Não prometer que o jogador ficará "viciado".
1. Camada base: chuva contínua sem emenda, exterior versus abrigo.
2. Pistas: passos do inimigo em posição real; pequenos ruídos próximos com intervalos variados e reproduzíveis.
3. Aproximação: aumentar presença de passos e detalhes, sem aumentar volume geral sem controle.
4. Confronto: preservar inteligibilidade do disparo, impacto, recarga e dano.
5. Alívio: reduzir tensão após a vitória; evitar suspense máximo constante.

Nesta base, existe chuva constante, passo do jogador e cue espacial no inimigo; o diretor de áudio completo ainda é backlog. Sons síntéticos representam eventos, não o realismo final.
Separar ambiente, efeitos, pistas e UI em buses quando o backend escolhido permitir. Planejar presets de fones/alto-falantes, controle de volume, alcance dinâmico reduzido e pausa. Áudio espacial básico não equivale a HRTF binaural.
Não iniciar sons novos no modo silencioso. O toggle M pausa AudioSink e SpatialAudioSink em andamento; validar ambos no runtime.
Registrar origem e licença de cada gravação em `docs/AUDIO_ASSETS.csv`. Obter chuva real com superfícies diferentes, três a cinco disparos por arma e camadas de explosão. Validar clipping, volume e repetição com fones.

## Desempenho e limites

Meta provisória: 60 FPS a 1280x720 no equipamento desktop escolhido; é objetivo, não resultado medido. Registrar CPU/GPU/RAM/SO, versão driver, FPS mediano, p95 de tempo de quadro, resolução e número de entidades. A chuva atual cria 350 entidades e precisa avaliação. Reduzir sombras, chuva e distância de visão em preset móvel. Não afirmar suporte iOS antes de compilar e testar em aparelho real com assinatura Apple.

## Marcos

M0: compilação e execução validadas, Cargo.lock versionado.
M1: arte da arma e arena revisada lado a lado com a referência.
M2: áudio gravado, suspense com pistas reais e pausas; testes de acessibilidade.
M3: inimigo animado, colisões e cobertura.
M4: medição no aparelho-alvo e depois port para iOS/toque.
