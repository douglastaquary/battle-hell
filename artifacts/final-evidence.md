# Evidence — pass-pickups-1

## Ran

- Soul crystal pickups, weapon polish, enemy AnimationMixer, bloom tune
- `inspect … pass-pickups-1` + `check_evidence.py`
- `playwright test tests/visual.spec.ts` → 2 passed
- `npx tauri info` → environment OK

## Observed

- Capture shows soul crystals on path, hit glow on skeleton, chunkier FPS gun, gate/banners
- Scorecard: all categories ≥ 2 (avg 2.0)

## Artifacts

- [desktop](pass-pickups-1/desktop-active-play.png)
- [mobile](pass-pickups-1/mobile-active-play.png)
- [scorecard](visual-scorecard.md)
