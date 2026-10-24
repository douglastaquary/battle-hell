/** Formato de cena Battle Hell Engine (inspirado no fluxo Dark Veil map.json). */

export type Vec3 = [number, number, number];

export type MapProp = {
  id: string;
  kind: string;
  position: Vec3;
  rotationY?: number;
  scale?: number | Vec3;
};

export type WeatherSettings = {
  style: string;
  zenithColor: string;
  moonSize: number;
  moonBrightness: number;
  stars: number;
  cloudCoverage: number;
  cloudSpeed: number;
  moonlightIntensity: number;
  ambientIntensity: number;
  azimuthDeg: number;
  elevationDeg: number;
  lightScattering: number;
  fogColor: string;
  fogDensity: number;
  fogStart: number;
  fogHeightFalloff: number;
};

export type BattleHellMap = {
  version: 1;
  id: string;
  name: string;
  seed: number;
  arenaRadius: number;
  playerStart: Vec3;
  weather: WeatherSettings;
  props: MapProp[];
};

export const DEFAULT_WEATHER: WeatherSettings = {
  style: 'Moonlit forest',
  zenithColor: '#24344c',
  moonSize: 1.2,
  moonBrightness: 7.5,
  stars: 0.32,
  cloudCoverage: 0.45,
  cloudSpeed: 0.08,
  moonlightIntensity: 1.05,
  ambientIntensity: 0.32,
  azimuthDeg: -30,
  elevationDeg: 34,
  lightScattering: 0.022,
  fogColor: '#8a96a4',
  fogDensity: 0.014,
  fogStart: 10,
  fogHeightFalloff: 0.12,
};

export function createAbbeyClearingMap(seed = 413287): BattleHellMap {
  const props: MapProp[] = [
    { id: 'gate-1', kind: 'gate', position: [0, 0, -18], scale: 1.1 },
    { id: 'abbey-1', kind: 'abbey', position: [0, 0, -23.5], scale: 1.05 },
    { id: 'wall-l', kind: 'wall', position: [-8, 0, -16], rotationY: 0.2 },
    { id: 'wall-r', kind: 'wall', position: [8, 0, -16], rotationY: -0.2 },
  ];

  const brazierSpots: Vec3[] = [
    [-6, 0, -4],
    [6, 0, -4],
    [-5, 0, 4],
    [5, 0, 4],
    [-9, 0, -10],
    [9, 0, -10],
  ];
  brazierSpots.forEach((p, i) => {
    props.push({ id: `brazier-${i}`, kind: 'brazier', position: p });
  });

  const trees: Vec3[] = [
    [-12, 0, -8],
    [-14, 0, 2],
    [12, 0, -6],
    [13, 0, 3],
    [-10, 0, 10],
    [10, 0, 11],
  ];
  trees.forEach((p, i) => {
    props.push({
      id: `tree-${i}`,
      kind: i % 2 === 0 ? 'tree_a' : 'tree_b',
      position: p,
      scale: 0.9 + (i % 3) * 0.15,
      rotationY: i * 0.7,
    });
  });

  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 7 + (i % 3) * 1.4;
    props.push({
      id: `grave-${i}`,
      kind: i % 2 === 0 ? 'grave_a' : 'grave_b',
      position: [Math.cos(a) * r, 0, Math.sin(a) * r - 2],
      rotationY: a + Math.PI / 2,
      scale: 0.85,
    });
  }

  const mushrooms: Vec3[] = [
    [-3.2, 0, -4.5],
    [2.6, 0, -7.2],
    [-5.8, 0, 1.2],
    [4.0, 0, 0.5],
    [-1.5, 0, -11.5],
    [5.2, 0, -13],
  ];
  mushrooms.forEach((p, i) => {
    props.push({
      id: `mushroom-${i}`,
      kind: 'mushroom',
      position: p,
      scale: 0.85 + (i % 3) * 0.15,
      rotationY: i * 0.9,
    });
  });

  props.push(
    { id: 'gallows-1', kind: 'gallows', position: [-11, 0, -2], rotationY: 0.4 },
    { id: 'rock-1', kind: 'rock', position: [3, 0, 7], scale: 1.2 },
    { id: 'rock-2', kind: 'rock', position: [-4, 0, 8], scale: 0.9 },
    { id: 'rock-3', kind: 'rock', position: [-7, 0, -8], scale: 1.1 },
    { id: 'crystal-1', kind: 'crystal', position: [2.2, 0, -1.5], scale: 0.7 },
    { id: 'crystal-2', kind: 'crystal', position: [-2.8, 0, -6], scale: 0.55 },
  );

  return {
    version: 1,
    id: 'abbey-clearing',
    name: 'Abbey Clearing',
    seed,
    arenaRadius: 16,
    playerStart: [0, 1.6, 6],
    weather: { ...DEFAULT_WEATHER },
    props,
  };
}
