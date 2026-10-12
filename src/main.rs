// Bevy systems take their dependencies as parameters.
#![allow(clippy::too_many_arguments, clippy::type_complexity)]

mod audio;
mod bench;
mod enemy;
mod hud;
mod player;
mod rng;
mod world;

use bevy::{
    audio::{AudioPlugin, SpatialScale},
    pbr::PbrPlugin,
    prelude::*,
    render::{
        settings::{WgpuFeatures, WgpuSettings},
        RenderPlugin,
    },
    window::{CursorGrabMode, PrimaryWindow},
};

pub const WAVE_COUNT: usize = 5;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    /// Waiting for the player to click into the arena.
    Intro,
    /// Short countdown before a wave starts.
    Countdown,
    Fighting,
    Victory,
    Defeat,
}

#[derive(Resource)]
pub struct Game {
    pub hp: f32,
    pub armor: f32,
    pub wave: usize,
    pub phase: Phase,
    pub phase_timer: f32,
    pub elapsed: f32,
    pub kills: u32,
    pub muted: bool,
    pub hurt: f32,
    pub hit_marker: f32,
    pub banner: f32,
    /// Bench runs keep the player alive so captures are comparable.
    pub invulnerable: bool,
}

impl Default for Game {
    fn default() -> Self {
        Self {
            hp: 100.0,
            armor: 50.0,
            wave: 0,
            phase: Phase::Intro,
            phase_timer: 0.0,
            elapsed: 0.0,
            kills: 0,
            muted: false,
            hurt: 0.0,
            hit_marker: 0.0,
            banner: 0.0,
            invulnerable: false,
        }
    }
}

impl Game {
    pub fn playing(&self) -> bool {
        matches!(self.phase, Phase::Countdown | Phase::Fighting)
    }

    /// Armour soaks most of a blow until it is worn through. Returns true if this hit was fatal.
    pub fn damage(&mut self, amount: f32) -> bool {
        if self.invulnerable || !self.playing() {
            return false;
        }
        let absorbed = (amount * 0.6).min(self.armor);
        self.armor -= absorbed;
        self.hp = (self.hp - (amount - absorbed)).max(0.0);
        self.hurt = 1.0;
        if self.hp <= 0.0 {
            self.phase = Phase::Defeat;
            self.phase_timer = 0.0;
            return true;
        }
        false
    }
}

/// Graphics switches for weak or buggy GPUs. `BH_GFX` is a comma list of
/// `noshadow,nopointshadow,nofog,nohdr,nobloom,nomsaa,pcf,nobindless,nogpupre,noadd,cheapfog`.
#[derive(Resource, Clone)]
pub struct Gfx {
    pub shadows: bool,
    pub point_shadows: bool,
    pub fog: bool,
    pub hdr: bool,
    pub bloom: bool,
    pub msaa: bool,
    pub pcf: bool,
    pub bindless: bool,
    pub gpu_preprocess: bool,
    pub additive: bool,
    pub cheap_fog: bool,
}

impl Gfx {
    fn from_env() -> Self {
        Self::from_flags(&std::env::var("BH_GFX").unwrap_or_default())
    }

    fn from_flags(flags: &str) -> Self {
        let off = |name: &str| flags.split(',').any(|f| f.trim() == name);
        Self {
            shadows: !off("noshadow"),
            point_shadows: !off("noshadow") && !off("nopointshadow"),
            fog: !off("nofog"),
            hdr: !off("nohdr"),
            bloom: !off("nohdr") && !off("nobloom"),
            msaa: !off("nomsaa"),
            pcf: off("pcf"),
            bindless: !off("nobindless"),
            gpu_preprocess: !off("nogpupre"),
            additive: !off("noadd"),
            cheap_fog: off("cheapfog"),
        }
    }
}

/// Fired to restart the arena from scratch.
#[derive(Event)]
pub struct Restart;

fn main() {
    let bench = bench::BenchConfig::from_args();
    let gfx = Gfx::from_env();
    let mut disabled = WgpuFeatures::empty();
    if !gfx.bindless {
        disabled |= WgpuFeatures::TEXTURE_BINDING_ARRAY | WgpuFeatures::BUFFER_BINDING_ARRAY;
    }
    let mut app = App::new();
    app.add_plugins(
        DefaultPlugins
            .set(WindowPlugin {
                primary_window: Some(Window {
                    title: "Battle Hell — Batalha no Inferno".into(),
                    resolution: (1280.0_f32, 720.0_f32).into(),
                    ..default()
                }),
                ..default()
            })
            .set(AudioPlugin {
                // rodio attenuates by inverse square; this maps ~4 m to full volume.
                default_spatial_scale: SpatialScale::new(0.22),
                ..default()
            })
            .set(RenderPlugin {
                render_creation: WgpuSettings {
                    disabled_features: Some(disabled),
                    ..default()
                }
                .into(),
                ..default()
            })
            .set(PbrPlugin {
                use_gpu_instance_buffer_builder: gfx.gpu_preprocess,
                ..default()
            }),
    )
    .insert_resource(ClearColor(Color::srgb(0.02, 0.025, 0.035)))
    .insert_resource(AmbientLight {
        color: Color::srgb(0.38, 0.45, 0.62),
        brightness: 55.0,
        ..default()
    })
    .insert_resource(gfx)
    .init_resource::<Game>()
    .init_resource::<rng::Rng>()
    .add_event::<Restart>()
    .add_plugins((
        audio::AudioDirectorPlugin,
        world::WorldPlugin,
        player::PlayerPlugin,
        enemy::EnemyPlugin,
        hud::HudPlugin,
    ))
    .add_systems(Update, (meta_input, restart).chain());
    if let Some(cfg) = bench {
        app.insert_resource(cfg).add_plugins(bench::BenchPlugin);
    }
    app.run();
}

fn meta_input(
    keys: Res<ButtonInput<KeyCode>>,
    mut game: ResMut<Game>,
    mut time: ResMut<Time<Virtual>>,
    mut windows: Query<&mut Window, With<PrimaryWindow>>,
    mut sinks: Query<&mut AudioSink>,
    mut spatial: Query<&mut SpatialAudioSink>,
    mut restart: EventWriter<Restart>,
) {
    if keys.just_pressed(KeyCode::Escape) {
        if let Ok(mut window) = windows.single_mut() {
            window.cursor_options.grab_mode = CursorGrabMode::None;
            window.cursor_options.visible = true;
        }
    }
    if keys.just_pressed(KeyCode::KeyP) {
        if time.is_paused() {
            time.unpause();
        } else {
            time.pause();
        }
        for sink in &sinks {
            if time.is_paused() {
                sink.pause()
            } else {
                sink.play()
            }
        }
        for sink in &spatial {
            if time.is_paused() {
                sink.pause()
            } else {
                sink.play()
            }
        }
    }
    if keys.just_pressed(KeyCode::KeyM) {
        game.muted = !game.muted;
        for mut sink in &mut sinks {
            if game.muted {
                sink.mute()
            } else {
                sink.unmute()
            }
        }
        for mut sink in &mut spatial {
            if game.muted {
                sink.mute()
            } else {
                sink.unmute()
            }
        }
    }
    let over = matches!(game.phase, Phase::Victory | Phase::Defeat);
    if keys.just_pressed(KeyCode::Enter) || (over && keys.just_pressed(KeyCode::KeyR)) {
        restart.write(Restart);
    }
}

fn restart(mut events: EventReader<Restart>, mut game: ResMut<Game>) {
    if events.read().count() == 0 {
        return;
    }
    let muted = game.muted;
    let invulnerable = game.invulnerable;
    *game = Game {
        muted,
        invulnerable,
        phase: Phase::Countdown,
        phase_timer: 3.0,
        ..default()
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fighting() -> Game {
        Game {
            phase: Phase::Fighting,
            ..default()
        }
    }

    #[test]
    fn armour_soaks_most_of_a_blow_until_worn() {
        let mut g = fighting();
        g.damage(20.0);
        assert_eq!(g.armor, 38.0);
        assert_eq!(g.hp, 92.0);
        g.armor = 2.0;
        g.damage(20.0);
        assert_eq!(g.armor, 0.0);
        assert_eq!(g.hp, 74.0);
    }

    #[test]
    fn lethal_damage_ends_the_run_once() {
        let mut g = fighting();
        g.armor = 0.0;
        assert!(g.damage(150.0));
        assert_eq!(g.phase, Phase::Defeat);
        assert_eq!(g.hp, 0.0);
        assert!(!g.damage(10.0), "no damage after defeat");
    }

    #[test]
    fn invulnerable_and_idle_phases_take_no_damage() {
        let mut g = fighting();
        g.invulnerable = true;
        g.damage(50.0);
        assert_eq!(g.hp, 100.0);
        let mut g = Game::default();
        g.damage(50.0);
        assert_eq!(g.hp, 100.0);
    }

    #[test]
    fn graphics_flags_parse() {
        let all = Gfx::from_flags("");
        assert!(
            all.shadows
                && all.point_shadows
                && all.fog
                && all.hdr
                && all.bloom
                && all.msaa
                && all.additive
        );
        assert!(!all.pcf && !all.cheap_fog);
        let low = Gfx::from_flags("noshadow, nohdr,cheapfog");
        assert!(
            !low.shadows
                && !low.point_shadows
                && !low.hdr
                && !low.bloom
                && low.cheap_fog
                && low.fog
        );
    }
}
