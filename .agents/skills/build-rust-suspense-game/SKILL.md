---
name: build-rust-suspense-game
description: Criar e continuar o projeto Battle Hell — Batalha no Inferno, uma arena 3D de suspense com Rust, Bevy, Blender e áudio espacial. Usar ao implementar cenários, armas, inimigos, sons realistas, otimização, preparação para GitHub ou continuidade em outro computador usando as referências anexadas.
---

# Arena Rust de suspense

1. Localizar o projeto do usuário. Ler README, AGENTS.md e `docs/IMPLEMENTACAO.md` quando existentes. Para um projeto novo, usar os arquivos na raiz deste repositório como base; não sobrescrever trabalho existente.
2. Ler [direção e contrato](references/implementation.md), [validação](references/validation.md) e inspecionar as duas imagens em `assets/visual-references/` antes de decisões de arte quando disponíveis. Na publicação pública, as capturas foram omitidas: usar a descrição e solicitar as referências ao proprietário antes de comparações visuais. Imagens são referências, não modelos nem licença para copiar ativos do jogo original.
3. Manter Rust + Bevy 0.16.1 e Blender 4.2 LTS enquanto não houver mudança explícita. Verificar docs oficiais da versão fixada. Nunca misturar APIs de outra versão por conveniência.
4. Detectar Rust, Python, Blender e SO. Executar `python3 tools/generate_audio.py`, `cargo check`, `cargo fmt` e `cargo clippy --all-targets`. Gerar e versionar Cargo.lock. Se uma ferramenta estiver indisponível, entregar código e declarar o teste pendente; não declarar o jogo validado.
5. Executar `cargo run --release`; validar mouse, movimento, cinco acertos, derrota, reinício e pausa. Registrar hardware e tempo de quadro em `docs/VALIDACAO.md`. Para modelos, executar Blender em background pelo script e testar `--blender`.
6. Implementar uma melhoria concreta por incremento. Separar geometria, material, iluminação, animação e áudio na revisão visual. Não prometer acabamento das capturas antes de comparar imagens do runtime.
7. Para áudio, substituir placeholders por gravações com origem/licença registradas; manter pistas localizadas no inimigo, variação de eventos e alternância entre tensão e alívio. Diferenciar áudio estéreo espacial, HRTF, oclusão e reverberação; não afirmar recursos ausentes.
8. Para GitHub, preparar arquivos, checks e referências dentro do mesmo repositório; usar destino informado pelo usuário. Não publicar capturas em repositório público por padrão. Se faltar destino, terminar os arquivos e pedir a URL. Nunca declarar upload concluído sem push confirmado.
9. Manter esta skill e seus recursos no Git; sincronizar alterações da skill no repositório de skills. Ao incluir a skill no repositório do jogo, colocar em `.agents/skills/build-rust-suspense-game` e excluir o template interno duplicado.
10. Atualizar o estado real, próximos passos e comandos reproduzíveis no repositório. Explicar o que foi criado, o que foi executado e o que falta.
