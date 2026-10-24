import './styles.css';
import './ui/weapon-select.css';
import { Game } from './game/Game';
import { WeaponSelect } from './ui/WeaponSelect';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const game = new Game(canvas);
const select = new WeaponSelect();

select.onConfirm((weaponId) => {
  select.hide();
  game.beginWithWeapon(weaponId);
});

select.show();
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    select.dispose();
    game.dispose();
  });
}
