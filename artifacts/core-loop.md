# Core loop contract

O jogador **mira e dispara** a escopeta para **eliminar souls da onda** enquanto **inimigos avançam e atacam corpo-a-corpo**; sucesso dá **score/gold/XP/soul energy e avança ondas**, falha **zera a vida e exige retry**.

| Cláusula | Prova no código |
| --- | --- |
| Verb | `FpsInput` + `PlayerController` fire/reload |
| Objective | HUD `SOULS REMAIN` + wave roster |
| Pressure | `EnemySystem` chase/attack + storm flash |
| Reward | score/gold/xp/multiplier em `Game.ts` |
| Failure | phase `defeat` + banner |
| Restart | reload página (slice); R a expandir |
