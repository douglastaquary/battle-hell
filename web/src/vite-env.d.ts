/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  phase?: string;
  enemies?: number;
  player: {
    position: { x: number; y: number; z: number };
    health?: number;
    speed?: number;
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
}

interface ThreeGameTestHooks {
  seed(value: number): void | Promise<void>;
  setState(name: string): { state: string } | Promise<{ state: string }>;
  setPausedForScreenshot(paused: boolean): void | Promise<void>;
  setReducedMotion?(enabled: boolean): void | Promise<void>;
  hideDebugUi?(hidden: boolean): void | Promise<void>;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
