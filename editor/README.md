# Battle Hell Editor (macOS)

Shell **Tauri 2** que embute o Map Editor web (`web/editor.html`).

## Requisitos

- macOS
- Rust (`rustup`) + Xcode CLT
- Node 20+

## Dev

```sh
# terminal 1 — runtime web
cd ../web && npm install && npm run dev

# terminal 2 — janela nativa
cd ../editor
npm install
source "$HOME/.cargo/env"
npm run tauri dev
```

A janela abre `http://127.0.0.1:5188/editor.html`.

## Build .app

```sh
cd ../web && VITE_BASE=/ npm run build
cd ../editor && npm run tauri build
```

Artefato em `src-tauri/target/release/bundle/macos/`.

## Escopo v1

- Abrir / salvar `maps/*.json`
- Painel weather/fog/lighting
- Lista de props + add in front of camera
- Play / walk preview na viewport
- Pause effects

Edição gráfica de emitters VFX fica para o próximo marco.
