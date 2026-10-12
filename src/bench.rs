//! `--bench [seconds] [--shot path]`: hands-off run used for validation. It starts the
//! waves, sweeps the camera, fires periodically, saves a screenshot and prints frame times.

use bevy::{
    diagnostic::{DiagnosticsStore, FrameTimeDiagnosticsPlugin},
    prelude::*,
    render::view::screenshot::{save_to_disk, Screenshot},
};

use crate::{
    player::{Gun, Look},
    Game, Phase,
};

#[derive(Resource, Clone)]
pub struct BenchConfig {
    seconds: f32,
    shot: String,
    elapsed: f32,
    captured: bool,
    next_fire: f32,
    samples: Vec<f32>,
}

impl BenchConfig {
    pub fn from_args() -> Option<Self> {
        let args: Vec<String> = std::env::args().collect();
        let at = args.iter().position(|a| a == "--bench")?;
        let seconds = args
            .get(at + 1)
            .and_then(|s| s.parse().ok())
            .unwrap_or(30.0);
        let shot = args
            .iter()
            .position(|a| a == "--shot")
            .and_then(|i| args.get(i + 1).cloned())
            .unwrap_or_else(|| "target/bench.png".into());
        Some(Self {
            seconds,
            shot,
            elapsed: 0.0,
            captured: false,
            next_fire: 6.0,
            samples: Vec::new(),
        })
    }
}

fn drive(
    mut commands: Commands,
    time: Res<Time<Real>>,
    mut cfg: ResMut<BenchConfig>,
    mut game: ResMut<Game>,
    mut look: ResMut<Look>,
    mut gun: ResMut<Gun>,
    diagnostics: Res<DiagnosticsStore>,
    mut exit: EventWriter<AppExit>,
) {
    let dt = time.delta_secs();
    cfg.elapsed += dt;
    look.forced = true;
    game.invulnerable = true;
    if game.phase == Phase::Intro {
        game.phase = Phase::Countdown;
        game.phase_timer = 0.5;
    }
    let t = cfg.elapsed;
    // Face the gate, then sweep slowly across the arena.
    look.yaw = (t * 0.25).sin() * 0.9;
    look.pitch = -0.06 + (t * 0.4).sin() * 0.04;
    if t > cfg.next_fire {
        cfg.next_fire += 2.2;
        gun.trigger = true;
    }
    if t > 3.0 {
        if let Some(ms) = diagnostics
            .get(&FrameTimeDiagnosticsPlugin::FRAME_TIME)
            .and_then(|d| d.value())
        {
            cfg.samples.push(ms as f32);
        }
    }
    if !cfg.captured && t > cfg.seconds * 0.6 {
        cfg.captured = true;
        commands
            .spawn(Screenshot::primary_window())
            .observe(save_to_disk(cfg.shot.clone()));
        info!("bench: screenshot -> {}", cfg.shot);
    }
    if t > cfg.seconds {
        let mut s = cfg.samples.clone();
        s.sort_by(|a, b| a.total_cmp(b));
        if !s.is_empty() {
            let avg = s.iter().sum::<f32>() / s.len() as f32;
            let p95 = s[(s.len() as f32 * 0.95) as usize - 1];
            let p99 = s[((s.len() as f32 * 0.99) as usize).saturating_sub(1)];
            info!(
                "bench: {} frames, avg {:.2} ms ({:.1} fps), p95 {:.2} ms, p99 {:.2} ms, worst {:.2} ms, wave {}, kills {}",
                s.len(),
                avg,
                1000.0 / avg,
                p95,
                p99,
                s[s.len() - 1],
                game.wave,
                game.kills
            );
        }
        exit.write(AppExit::Success);
    }
}

pub struct BenchPlugin;

impl Plugin for BenchPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(FrameTimeDiagnosticsPlugin::default())
            .add_systems(Update, drive);
    }
}
