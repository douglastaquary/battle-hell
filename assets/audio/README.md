# Áudio do jogo

59 WAV originais sintetizados por `tools/generate_audio.py` (biblioteca padrão do Python, sementes fixas). Regenerar na raiz do projeto com `python3 tools/generate_audio.py` (~75 s num Intel i7; um filtro opcional gera só nomes que contenham o texto, ex.: `python3 tools/generate_audio.py bone_`).

Grupos: arma e corpo do jogador, vozes de mortos-vivos por formantes (perto/longe), ossos (chocalhar, passo seco, estilhaço, desmoronar, lamento da caveira) e mundo (chuva, vento, drone de tensão, fogo, trovão, stingers). Origem, uso e direitos de cada arquivo em `docs/AUDIO_ASSETS.csv`.

São sínteses procedurais calibradas pelos vídeos de referência, não gravações de campo.
