use std::{collections::HashMap, f32::consts::PI};

use bevy::{
    core_pipeline::{bloom::Bloom, tonemapping::Tonemapping},
    input::mouse::AccumulatedMouseMotion,
    pbr::{FogFalloff, NotShadowCaster, ShadowFilteringMethod},
    prelude::*,
    window::{CursorGrabMode, PrimaryWindow},
};

use crate::{
    audio::{self, Sfx},
    enemy::Enemy,
    rng::Rng,
    world::{self, Burst, FxAssets, Obstacles},
    Game, Gfx, Phase, Restart,
};

pub const EYE: f32 = 1.68;
pub const START: Vec3 = Vec3::new(0.0, EYE, 9.0);
pub const RELOAD_TIME: f32 = 1.55;
const PELLETS: usize = 9;
const VIEWMODEL_POS: Vec3 = Vec3::new(0.15, -0.2, -0.24);

#[derive(Component)]
pub struct Player;
#[derive(Component)]
struct ViewModel;
#[derive(Component)]
struct MuzzleLight;
#[derive(Component)]
struct MuzzleMesh;

/// Double-barrel shotgun: two shells, break-open reload.
#[derive(Resource)]
pub struct Gun {
    pub shells: u8,
    pub cooldown: f32,
    pub reload: f32,
    auto_reload: f32,
    recoil: f32,
    flash: f32,
    /// Synthetic trigger pull used by the benchmark driver.
    pub trigger: bool,
}

impl Default for Gun {
    fn default() -> Self {
        Self {
            shells: 2,
            cooldown: 0.0,
            reload: 0.0,
            auto_reload: 0.0,
            recoil: 0.0,
            flash: 0.0,
            trigger: false,
        }
    }
}

#[derive(Resource, Default)]
pub struct Look {
    pub yaw: f32,
    pub pitch: f32,
    /// Bench mode drives the camera without a grabbed cursor.
    pub forced: bool,
    lock_click: bool,
    vel: Vec3,
    stride: f32,
    sway: Vec2,
    roll: f32,
}

/// Damage dealt by one shot to one enemy (pellets are already summed).
#[derive(Event)]
pub struct EnemyHit {
    pub entity: Entity,
    pub damage: f32,
    pub head: bool,
    pub dir: Vec3,
    pub point: Vec3,
}

fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    fx: Res<FxAssets>,
    gfx: Res<Gfx>,
) {
    let camera = commands
        .spawn((
            Camera3d::default(),
            Camera {
                hdr: gfx.hdr,
                ..default()
            },
            Tonemapping::TonyMcMapface,
            Projection::from(PerspectiveProjection {
                fov: 72f32.to_radians(),
                near: 0.02,
                ..default()
            }),
            Transform::from_translation(START),
            Player,
            SpatialListener::new(0.22),
        ))
        .id();
    if gfx.bloom {
        commands.entity(camera).insert(Bloom::NATURAL);
    }
    if gfx.fog {
        let fog = if gfx.cheap_fog {
            DistanceFog {
                color: Color::srgb(0.045, 0.05, 0.065),
                directional_light_color: Color::NONE,
                falloff: FogFalloff::Linear {
                    start: 4.0,
                    end: 45.0,
                },
                ..default()
            }
        } else {
            DistanceFog {
                color: Color::srgb(0.045, 0.05, 0.065),
                directional_light_color: Color::srgba(0.3, 0.35, 0.5, 0.3),
                directional_light_exponent: 16.0,
                falloff: FogFalloff::Exponential { density: 0.05 },
            }
        };
        commands.entity(camera).insert(fog);
    }
    if !gfx.msaa {
        commands.entity(camera).insert(Msaa::Off);
    }
    if gfx.pcf {
        commands
            .entity(camera)
            .insert(ShadowFilteringMethod::Hardware2x2);
    }
    let pivot = commands
        .spawn((
            Transform::from_translation(VIEWMODEL_POS),
            Visibility::default(),
            ViewModel,
        ))
        .id();
    commands.entity(camera).add_child(pivot);
    let gun = commands
        .spawn(SceneRoot(assets.load(
            GltfAssetLabel::Scene(0).from_asset("models/weapon.glb"),
        )))
        .id();
    let light = commands
        .spawn((
            PointLight {
                color: Color::srgb(1.0, 0.7, 0.35),
                intensity: 0.0,
                range: 9.0,
                ..default()
            },
            Transform::from_xyz(0.0, 0.05, -0.75),
            MuzzleLight,
        ))
        .id();
    let flash = commands
        .spawn((
            Mesh3d(meshes.add(Sphere::new(1.0).mesh().ico(1).unwrap())),
            MeshMaterial3d(fx.flash.clone()),
            Transform::from_xyz(0.0, 0.02, -0.7).with_scale(Vec3::splat(0.06)),
            Visibility::Hidden,
            NotShadowCaster,
            MuzzleMesh,
        ))
        .id();
    commands.entity(pivot).add_children(&[gun, light, flash]);
}

fn movement(
    mut commands: Commands,
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mouse: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    mut windows: Query<&mut Window, With<PrimaryWindow>>,
    mut game: ResMut<Game>,
    mut look: ResMut<Look>,
    obstacles: Res<Obstacles>,
    sfx: Res<Sfx>,
    mut rng: ResMut<Rng>,
    mut players: Query<&mut Transform, With<Player>>,
) {
    let Ok(mut window) = windows.single_mut() else {
        return;
    };
    let Ok(mut t) = players.single_mut() else {
        return;
    };
    let dt = time.delta_secs();
    let locked = window.cursor_options.grab_mode == CursorGrabMode::Locked;
    if !locked && mouse.just_pressed(MouseButton::Left) {
        window.cursor_options.grab_mode = CursorGrabMode::Locked;
        window.cursor_options.visible = false;
        look.lock_click = true;
        if game.phase == Phase::Intro {
            game.phase = Phase::Countdown;
            game.phase_timer = 3.0;
        }
    }
    let active = (locked || look.forced)
        && !matches!(game.phase, Phase::Defeat | Phase::Victory)
        && dt > 0.0;
    let mut wish = Vec3::ZERO;
    if active {
        if locked {
            look.yaw -= motion.delta.x * 0.0022;
            look.pitch = (look.pitch - motion.delta.y * 0.0022).clamp(-1.4, 1.4);
            look.sway = look.sway.lerp(motion.delta * 0.02, (dt * 10.0).min(1.0));
        }
        if keys.pressed(KeyCode::KeyW) {
            wish.z -= 1.0;
        }
        if keys.pressed(KeyCode::KeyS) {
            wish.z += 1.0;
        }
        if keys.pressed(KeyCode::KeyA) {
            wish.x -= 1.0;
        }
        if keys.pressed(KeyCode::KeyD) {
            wish.x += 1.0;
        }
    }
    let sprint = keys.pressed(KeyCode::ShiftLeft) && wish.z < 0.0;
    let speed = if sprint { 5.4 } else { 3.2 };
    let target = Quat::from_rotation_y(look.yaw) * wish.normalize_or_zero() * speed;
    look.vel = look.vel.lerp(target, (dt * 9.0).min(1.0));
    let mut pos = t.translation + look.vel * dt;
    obstacles.resolve(&mut pos, 0.35);
    let moved = Vec2::new(pos.x - t.translation.x, pos.z - t.translation.z).length();
    let step_len = if sprint { 1.05 } else { 0.8 };
    let before = (look.stride / step_len).floor();
    look.stride += moved;
    if (look.stride / step_len).floor() > before && moved > 0.0 {
        let s = audio::pick(&sfx.step_mud, &mut rng);
        let v = if sprint { 0.5 } else { 0.32 };
        audio::play_2d(&mut commands, &game, s, v, rng.range(0.92, 1.08));
    }
    let bob =
        (look.stride / step_len * PI).sin().abs() * 0.035 * (look.vel.length() / 3.2).min(1.3);
    pos.y = EYE + world::ground_height(pos.x, pos.z) - bob;
    t.translation = pos;
    let strafe = -look.vel.dot(Quat::from_rotation_y(look.yaw) * Vec3::X) * 0.006;
    look.roll += (strafe - look.roll) * (dt * 6.0).min(1.0);
    let shake = game.hurt * game.hurt * 0.03;
    let n = time.elapsed_secs() * 40.0;
    t.rotation = Quat::from_euler(
        EulerRot::YXZ,
        look.yaw + n.sin() * shake,
        look.pitch + (n * 1.3).cos() * shake,
        look.roll + (n * 0.7).sin() * shake,
    );
}

fn falloff(distance: f32) -> f32 {
    if distance < 6.0 {
        1.0
    } else {
        (1.0 - (distance - 6.0) / 20.0).max(0.25)
    }
}

fn shoot(
    mut commands: Commands,
    time: Res<Time>,
    mouse: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    windows: Query<&Window, With<PrimaryWindow>>,
    game: Res<Game>,
    mut gun: ResMut<Gun>,
    mut look: ResMut<Look>,
    sfx: Res<Sfx>,
    fx: Res<FxAssets>,
    mut rng: ResMut<Rng>,
    players: Query<&Transform, With<Player>>,
    enemies: Query<(Entity, &Enemy, &Transform)>,
    mut hits: EventWriter<EnemyHit>,
) {
    let dt = time.delta_secs();
    gun.cooldown -= dt;
    if gun.reload > 0.0 {
        gun.reload -= dt;
        if gun.reload <= 0.0 {
            gun.shells = 2;
        }
    }
    if gun.auto_reload > 0.0 {
        gun.auto_reload -= dt;
        if gun.auto_reload <= 0.0 && gun.shells == 0 && gun.reload <= 0.0 {
            gun.reload = RELOAD_TIME;
            audio::play_2d(&mut commands, &game, sfx.reload.clone(), 0.75, 1.0);
        }
    }
    let locked = windows
        .single()
        .map(|w| w.cursor_options.grab_mode == CursorGrabMode::Locked)
        .unwrap_or(false);
    let skip = look.lock_click;
    look.lock_click = false;
    let trigger = std::mem::take(&mut gun.trigger) || mouse.just_pressed(MouseButton::Left);
    if !game.playing() || !(locked || look.forced) || skip || dt == 0.0 {
        return;
    }
    if keys.just_pressed(KeyCode::KeyR) && gun.shells < 2 && gun.reload <= 0.0 {
        gun.reload = RELOAD_TIME;
        audio::play_2d(&mut commands, &game, sfx.reload.clone(), 0.75, 1.0);
        return;
    }
    if !trigger || gun.cooldown > 0.0 || gun.reload > 0.0 {
        return;
    }
    if gun.shells == 0 {
        audio::play_2d(&mut commands, &game, sfx.dry_fire.clone(), 0.6, 1.0);
        gun.cooldown = 0.25;
        gun.auto_reload = 0.05;
        return;
    }
    let Ok(cam) = players.single() else {
        return;
    };
    gun.shells -= 1;
    gun.cooldown = 0.3;
    gun.recoil = 1.0;
    gun.flash = 0.06;
    if gun.shells == 0 {
        gun.auto_reload = 0.45;
    }
    let s = audio::pick(&sfx.shotgun, &mut rng);
    audio::play_2d(&mut commands, &game, s, 0.95, rng.range(0.96, 1.04));

    let origin = cam.translation;
    let forward = cam.forward().as_vec3();
    let mut dealt: HashMap<Entity, (f32, bool, Vec3)> = HashMap::new();
    for _ in 0..PELLETS {
        let dir = rng.cone(forward, 0.065);
        let mut nearest: Option<(f32, Entity, bool)> = None;
        for (entity, enemy, t) in &enemies {
            if let Some((dist, head)) = enemy.hit_test(t, origin, dir) {
                if nearest.is_none_or(|n| dist < n.0) {
                    nearest = Some((dist, entity, head));
                }
            }
        }
        if let Some((dist, entity, head)) = nearest {
            let damage = 13.0 * falloff(dist) * if head { 1.8 } else { 1.0 };
            let entry = dealt
                .entry(entity)
                .or_insert((0.0, false, origin + dir * dist));
            entry.0 += damage;
            entry.1 |= head;
        } else if dir.y < -0.01 {
            let d = -(origin.y) / dir.y;
            if d < 30.0 {
                let p = origin + dir * d;
                world::spawn_burst(&mut commands, &fx, &mut rng, Burst::Mud, p, Vec3::Y, 3);
            }
        }
    }
    for (entity, (damage, head, point)) in dealt {
        hits.write(EnemyHit {
            entity,
            damage,
            head,
            dir: forward,
            point,
        });
    }
}

fn viewmodel(
    time: Res<Time>,
    mut gun: ResMut<Gun>,
    look: Res<Look>,
    mut rng: ResMut<Rng>,
    mut vm: Query<&mut Transform, (With<ViewModel>, Without<MuzzleMesh>)>,
    mut lights: Query<&mut PointLight, With<MuzzleLight>>,
    mut flashes: Query<(&mut Visibility, &mut Transform), (With<MuzzleMesh>, Without<ViewModel>)>,
) {
    let dt = time.delta_secs();
    gun.recoil = (gun.recoil - dt * 4.5).max(0.0);
    gun.flash -= dt;
    let r = gun.recoil * gun.recoil;
    let dip = if gun.reload > 0.0 {
        (PI * (1.0 - gun.reload / RELOAD_TIME)).sin()
    } else {
        0.0
    };
    let speed = look.vel.length();
    let walk = (look.stride * 1.2 * PI).sin() * 0.006 * (speed / 3.2).min(1.5);
    let breathe = (time.elapsed_secs() * 1.6).sin() * 0.003;
    if let Ok(mut t) = vm.single_mut() {
        t.translation = VIEWMODEL_POS
            + Vec3::new(
                -look.sway.x * 0.004 + walk,
                breathe - look.sway.y * -0.003 - dip * 0.13 + walk.abs(),
                r * 0.09,
            );
        t.rotation = Quat::from_euler(
            EulerRot::XYZ,
            r * 0.25 - dip * 0.75 + look.sway.y * 0.004,
            look.sway.x * 0.006,
            dip * 0.45 - look.sway.x * 0.004,
        );
    }
    let on = gun.flash > 0.0;
    if let Ok(mut light) = lights.single_mut() {
        light.intensity = if on { 320_000.0 } else { 0.0 };
    }
    if let Ok((mut vis, mut t)) = flashes.single_mut() {
        *vis = if on {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
        if on {
            let s = rng.range(0.05, 0.09);
            t.scale = Vec3::new(s, s, s * 1.8);
            t.rotation = Quat::from_rotation_z(rng.range(0.0, PI));
        }
    }
}

fn reset(
    mut events: EventReader<Restart>,
    mut gun: ResMut<Gun>,
    mut look: ResMut<Look>,
    mut players: Query<&mut Transform, With<Player>>,
) {
    if events.read().count() == 0 {
        return;
    }
    *gun = Gun::default();
    let forced = look.forced;
    *look = Look {
        forced,
        ..default()
    };
    if let Ok(mut t) = players.single_mut() {
        *t = Transform::from_translation(START);
    }
}

pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Gun>()
            .init_resource::<Look>()
            .add_event::<EnemyHit>()
            // PostStartup: needs FxAssets inserted by the world setup.
            .add_systems(PostStartup, setup)
            .add_systems(Update, (movement, shoot, viewmodel, reset).chain());
    }
}
