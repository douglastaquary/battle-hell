use std::f32::consts::{FRAC_PI_2, TAU};

use bevy::{
    pbr::{CascadeShadowConfigBuilder, NotShadowCaster},
    prelude::*,
    render::mesh::VertexAttributeValues,
};

use crate::{
    audio::{self, Sfx},
    player::Player,
    rng::Rng,
    Game, Gfx,
};

/// Inner radius the player and enemies can walk in (the ruined wall sits at 17.5 m).
pub const ARENA_RADIUS: f32 = 15.6;
pub const GATE_Z: f32 = -17.5;

/// Static circular blockers on the ground plane: (centre, radius).
#[derive(Resource, Default)]
pub struct Obstacles(pub Vec<(Vec2, f32)>);

impl Obstacles {
    /// Pushes a walker of `radius` out of props and keeps it inside the arena.
    pub fn resolve(&self, pos: &mut Vec3, radius: f32) {
        for (c, r) in &self.0 {
            let d = pos.xz() - *c;
            let min = r + radius;
            let len = d.length();
            if len < min && len > 1e-4 {
                let push = d / len * (min - len);
                pos.x += push.x;
                pos.z += push.y;
            }
        }
        let flat = pos.xz();
        let limit = ARENA_RADIUS - radius;
        if flat.length() > limit {
            let f = flat.normalize() * limit;
            pos.x = f.x;
            pos.z = f.y;
        }
    }
}

fn model(assets: &AssetServer, name: &str) -> SceneRoot {
    SceneRoot(assets.load(GltfAssetLabel::Scene(0).from_asset(format!("models/{name}.glb"))))
}

fn prop(commands: &mut Commands, assets: &AssetServer, name: &str, transform: Transform) -> Entity {
    commands.spawn((model(assets, name), transform)).id()
}

/// Gentle mud relief: almost flat where people fight, rolling and higher outside the walls.
pub fn ground_height(x: f32, z: f32) -> f32 {
    let r = (x * x + z * z).sqrt();
    let ripple = (x * 1.7).sin() * (z * 1.3).cos() * 0.025 + (x * 0.37 + z * 0.51).sin() * 0.04;
    let outer = ((r - 16.5) / 8.0).clamp(0.0, 1.0);
    let mounds = ((x * 0.21).sin() + (z * 0.17 + 1.3).cos()) * 0.9 + 0.8;
    ripple + outer * outer * mounds
}

fn ground_mesh() -> Mesh {
    let mut mesh = Plane3d::default()
        .mesh()
        .size(96.0, 96.0)
        .subdivisions(120)
        .build();
    let mut colors = Vec::new();
    if let Some(VertexAttributeValues::Float32x3(positions)) =
        mesh.attribute_mut(Mesh::ATTRIBUTE_POSITION)
    {
        for p in positions.iter_mut() {
            p[1] = ground_height(p[0], p[2]);
            let (x, z) = (p[0], p[2]);
            let n = ((x * 0.9).sin() * (z * 1.1).cos() + (x * 0.23 - z * 0.31).sin()) * 0.5;
            let puddle = ((x * 0.45 + 2.0).sin() * (z * 0.38).cos())
                .max(0.0)
                .powf(3.0);
            let mud = Vec3::new(0.16, 0.13, 0.10) * (0.8 + 0.25 * n);
            let wet = Vec3::new(0.06, 0.065, 0.07);
            let c = mud.lerp(wet, puddle);
            colors.push([c.x, c.y, c.z, 1.0]);
        }
    }
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    mesh.compute_normals();
    mesh
}

#[derive(Component)]
pub struct Torch {
    phase: f32,
    base: f32,
}
#[derive(Component)]
struct Flame {
    phase: f32,
    base: Vec3,
}
#[derive(Component)]
struct Ember {
    origin: Vec3,
    vel: Vec3,
    life: f32,
}
#[derive(Component)]
struct Rain {
    speed: f32,
}
#[derive(Component)]
pub struct Moon;

/// Shared meshes/materials for short-lived effects (bone chips, mud, sparks, souls).
#[derive(Resource)]
pub struct FxAssets {
    pub chip: Handle<Mesh>,
    pub orb: Handle<Mesh>,
    pub bone: Handle<StandardMaterial>,
    pub mud: Handle<StandardMaterial>,
    pub dirt: Handle<StandardMaterial>,
    pub spark: Handle<StandardMaterial>,
    pub soul: Handle<StandardMaterial>,
    pub flash: Handle<StandardMaterial>,
}

#[derive(Clone, Copy)]
pub enum Burst {
    Bone,
    Mud,
    Dirt,
    Spark,
    Soul,
}

#[derive(Component)]
pub struct Particle {
    vel: Vec3,
    life: f32,
    gravity: f32,
    spin: Vec3,
}

pub fn spawn_burst(
    commands: &mut Commands,
    fx: &FxAssets,
    rng: &mut Rng,
    kind: Burst,
    pos: Vec3,
    dir: Vec3,
    count: usize,
) {
    let (mat, mesh, size, speed, gravity, life) = match kind {
        Burst::Bone => (&fx.bone, &fx.chip, 0.035, 3.5, 9.8, 1.2),
        Burst::Mud => (&fx.mud, &fx.chip, 0.03, 2.5, 9.8, 0.7),
        Burst::Dirt => (&fx.dirt, &fx.chip, 0.05, 2.0, 9.8, 1.0),
        Burst::Spark => (&fx.spark, &fx.orb, 0.02, 4.0, 2.0, 0.35),
        Burst::Soul => (&fx.soul, &fx.orb, 0.05, 1.2, -1.5, 1.4),
    };
    for _ in 0..count {
        let v = rng.cone(dir.normalize_or(Vec3::Y), 1.1) * speed * rng.range(0.4, 1.0);
        let s = size * rng.range(0.6, 1.4);
        commands.spawn((
            Mesh3d(mesh.clone()),
            MeshMaterial3d(mat.clone()),
            Transform::from_translation(pos).with_scale(Vec3::new(s, s * rng.range(0.5, 1.5), s)),
            NotShadowCaster,
            Particle {
                vel: v,
                life: life * rng.range(0.6, 1.0),
                gravity,
                spin: Vec3::new(rng.range(-12., 12.), rng.range(-12., 12.), 0.0),
            },
        ));
    }
}

#[derive(Resource)]
struct Storm {
    next: f32,
    flash: f32,
    thunder: Option<f32>,
}

fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    sfx: Res<Sfx>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut obstacles: ResMut<Obstacles>,
    gfx: Res<Gfx>,
) {
    let mut rng = Rng::seeded(1337);
    let glow = if gfx.additive {
        AlphaMode::Add
    } else {
        AlphaMode::Blend
    };

    commands.spawn((
        Mesh3d(meshes.add(ground_mesh())),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::WHITE,
            perceptual_roughness: 0.42,
            reflectance: 0.55,
            ..default()
        })),
    ));
    // Standing water catches the fire light.
    let puddle = materials.add(StandardMaterial {
        base_color: Color::srgb(0.02, 0.025, 0.03),
        perceptual_roughness: 0.04,
        reflectance: 0.9,
        ..default()
    });
    let disc = meshes.add(Circle::new(1.0));
    for _ in 0..16 {
        let a = rng.range(0.0, TAU);
        let r = rng.range(2.0, 14.0);
        let (x, z) = (a.cos() * r, a.sin() * r);
        commands.spawn((
            Mesh3d(disc.clone()),
            MeshMaterial3d(puddle.clone()),
            Transform::from_xyz(x, ground_height(x, z) + 0.012, z)
                .with_rotation(Quat::from_rotation_x(-FRAC_PI_2))
                .with_scale(Vec3::new(rng.range(0.5, 1.6), rng.range(0.4, 1.0), 1.0)),
            NotShadowCaster,
        ));
    }

    prop(
        &mut commands,
        &assets,
        "gate",
        Transform::from_xyz(0.0, 0.0, GATE_Z),
    );
    obstacles.0.push((Vec2::new(-3.1, GATE_Z + 0.6), 0.9));
    obstacles.0.push((Vec2::new(3.1, GATE_Z + 0.6), 0.9));

    // Broken ring wall; the gap behind the gate is where the dead walk in.
    let ring = 17.5;
    let mut theta = -FRAC_PI_2 + 0.42;
    while theta < -FRAC_PI_2 + TAU - 0.42 {
        if rng.chance(0.82) {
            let p = Vec3::new(theta.cos() * ring, 0.0, theta.sin() * ring);
            let t = Transform::from_translation(p)
                .with_rotation(Quat::from_rotation_y(
                    -theta - FRAC_PI_2 + rng.range(-0.08, 0.08),
                ))
                .with_scale(Vec3::new(1.0, rng.range(0.75, 1.15), 1.0));
            prop(&mut commands, &assets, "wall", t);
        }
        theta += 5.6 / ring;
    }

    for i in 0..30 {
        let a = rng.range(0.0, TAU);
        let r = rng.range(19.5, 34.0);
        let (x, z) = (a.cos() * r, a.sin() * r);
        let name = if i % 2 == 0 { "tree_a" } else { "tree_b" };
        let t = Transform::from_xyz(x, ground_height(x, z) - 0.2, z)
            .with_rotation(Quat::from_rotation_y(rng.range(0.0, TAU)))
            .with_scale(Vec3::splat(rng.range(0.8, 1.35)));
        prop(&mut commands, &assets, name, t);
    }

    let mut placed = 0;
    while placed < 16 {
        let a = rng.range(0.0, TAU);
        let r = rng.range(10.5, 15.0);
        let (x, z) = (a.cos() * r, a.sin() * r);
        if x.abs() < 3.5 && z < -8.0 || (z > 5.0 && x.abs() < 3.0) {
            continue;
        }
        let name = if placed % 3 == 0 {
            "grave_b"
        } else {
            "grave_a"
        };
        let t = Transform::from_xyz(x, ground_height(x, z) - 0.05, z).with_rotation(
            Quat::from_rotation_y(-a + FRAC_PI_2 + rng.range(-0.3, 0.3))
                * Quat::from_rotation_z(rng.range(-0.12, 0.12))
                * Quat::from_rotation_x(rng.range(-0.1, 0.1)),
        );
        prop(&mut commands, &assets, name, t);
        obstacles.0.push((Vec2::new(x, z), 0.45));
        placed += 1;
    }

    let gallows = Transform::from_xyz(-12.0, 0.0, -5.0).with_rotation(Quat::from_rotation_y(0.9));
    prop(&mut commands, &assets, "gallows", gallows);
    obstacles.0.push((Vec2::new(-12.0, -5.0), 0.35));
    let arm_end = gallows.transform_point(Vec3::new(1.8, 0.0, 0.0));
    obstacles.0.push((arm_end.xz(), 0.25));

    for _ in 0..12 {
        let a = rng.range(0.0, TAU);
        let r = rng.range(12.5, 18.0);
        let (x, z) = (a.cos() * r, a.sin() * r);
        if x.abs() < 3.5 && z < -12.0 {
            continue;
        }
        let s = rng.range(0.5, 1.4);
        let t = Transform::from_xyz(x, ground_height(x, z) - 0.1, z)
            .with_rotation(Quat::from_rotation_y(rng.range(0.0, TAU)))
            .with_scale(Vec3::splat(s));
        prop(&mut commands, &assets, "rock", t);
        obstacles.0.push((Vec2::new(x, z), 0.9 * s));
    }

    for (cx, cz) in [(-6.5, -13.0), (8.0, -11.5), (13.0, 4.0), (-13.5, 6.5)] {
        for k in 0..4 {
            let off = Vec2::from_angle(k as f32 * 1.7) * 0.45 * (k as f32).min(1.0);
            let t = Transform::from_xyz(cx + off.x, 0.0, cz + off.y)
                .with_rotation(
                    Quat::from_rotation_y(k as f32 * 2.1)
                        * Quat::from_rotation_z((k as f32 - 1.5) * 0.18),
                )
                .with_scale(Vec3::splat(1.6 - k as f32 * 0.25));
            prop(&mut commands, &assets, "crystal", t);
        }
        obstacles.0.push((Vec2::new(cx, cz), 0.7));
        commands.spawn((
            PointLight {
                color: Color::srgb(0.25, 1.0, 0.45),
                intensity: 9_000.0,
                range: 6.0,
                ..default()
            },
            Transform::from_xyz(cx, 0.6, cz),
        ));
    }

    let flame_mesh = meshes.add(Sphere::new(1.0).mesh().ico(2).unwrap());
    let flame_core = materials.add(StandardMaterial {
        base_color: Color::srgba(1.0, 0.75, 0.3, 0.9),
        emissive: LinearRgba::new(18.0, 6.0, 1.0, 1.0),
        alpha_mode: glow,
        unlit: true,
        ..default()
    });
    let flame_outer = materials.add(StandardMaterial {
        base_color: Color::srgba(1.0, 0.35, 0.08, 0.55),
        emissive: LinearRgba::new(8.0, 1.6, 0.2, 1.0),
        alpha_mode: glow,
        unlit: true,
        ..default()
    });
    let ember_mesh = meshes.add(Sphere::new(1.0).mesh().ico(0).unwrap());
    let ember_mat = materials.add(StandardMaterial {
        base_color: Color::srgb(1.0, 0.5, 0.1),
        emissive: LinearRgba::new(30.0, 8.0, 1.0, 1.0),
        unlit: true,
        ..default()
    });
    let braziers = [
        (Vec2::new(-4.4, GATE_Z + 2.6), true),
        (Vec2::new(4.4, GATE_Z + 2.6), true),
        (Vec2::new(-10.5, -2.0), false),
        (Vec2::new(10.5, -2.0), false),
        (Vec2::new(-7.5, 9.0), false),
        (Vec2::new(7.5, 9.0), false),
    ];
    for (i, (p, shadows)) in braziers.into_iter().enumerate() {
        let base = Vec3::new(p.x, 0.0, p.y);
        prop(
            &mut commands,
            &assets,
            "brazier",
            Transform::from_translation(base),
        );
        obstacles.0.push((p, 0.5));
        let fire = base + Vec3::Y * 1.18;
        commands.spawn((
            PointLight {
                color: Color::srgb(1.0, 0.45, 0.14),
                intensity: 140_000.0,
                range: 18.0,
                radius: 0.15,
                shadows_enabled: shadows && gfx.point_shadows,
                ..default()
            },
            Transform::from_translation(fire + Vec3::Y * 0.35),
            Torch {
                phase: i as f32 * 1.7,
                base: 140_000.0,
            },
        ));
        for (k, (mat, scale)) in [
            (&flame_outer, Vec3::new(0.22, 0.45, 0.22)),
            (&flame_core, Vec3::new(0.13, 0.3, 0.13)),
        ]
        .into_iter()
        .enumerate()
        {
            commands.spawn((
                Mesh3d(flame_mesh.clone()),
                MeshMaterial3d(mat.clone()),
                Transform::from_translation(fire + Vec3::Y * (0.18 + k as f32 * 0.02))
                    .with_scale(scale),
                NotShadowCaster,
                Flame {
                    phase: i as f32 * 2.3 + k as f32,
                    base: scale,
                },
            ));
        }
        for _ in 0..18 {
            commands.spawn((
                Mesh3d(ember_mesh.clone()),
                MeshMaterial3d(ember_mat.clone()),
                Transform::from_translation(fire).with_scale(Vec3::splat(0.012)),
                NotShadowCaster,
                Ember {
                    origin: fire,
                    vel: Vec3::ZERO,
                    life: rng.range(0.0, 2.0),
                },
            ));
        }
        commands.spawn((
            AudioPlayer::new(sfx.fire.clone()),
            PlaybackSettings::LOOP
                .with_volume(bevy::audio::Volume::Linear(0.55))
                .with_spatial(true),
            Transform::from_translation(fire),
        ));
    }

    commands.spawn((
        DirectionalLight {
            illuminance: 350.0,
            color: Color::srgb(0.5, 0.6, 0.85),
            shadows_enabled: gfx.shadows,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::YXZ, 0.6, -0.9, 0.0)),
        CascadeShadowConfigBuilder {
            num_cascades: 2,
            maximum_distance: 40.0,
            ..default()
        }
        .build(),
        Moon,
    ));

    let streak = meshes.add(Cuboid::new(0.01, 0.5, 0.01));
    let rain_mat = materials.add(StandardMaterial {
        base_color: Color::srgba(0.62, 0.7, 0.8, 0.22),
        alpha_mode: AlphaMode::Blend,
        unlit: true,
        ..default()
    });
    for _ in 0..900 {
        commands.spawn((
            Mesh3d(streak.clone()),
            MeshMaterial3d(rain_mat.clone()),
            Transform::from_xyz(
                rng.range(-14., 14.),
                rng.range(0.0, 12.0),
                rng.range(-14., 14.),
            )
            .with_rotation(Quat::from_rotation_z(0.12)),
            NotShadowCaster,
            Rain {
                speed: rng.range(11.0, 15.0),
            },
        ));
    }

    let chip = meshes.add(Cuboid::new(1.0, 1.0, 1.0));
    let orb = meshes.add(Sphere::new(1.0).mesh().ico(0).unwrap());
    let fx = FxAssets {
        chip,
        orb,
        bone: materials.add(StandardMaterial {
            base_color: Color::srgb(0.78, 0.72, 0.6),
            perceptual_roughness: 0.8,
            ..default()
        }),
        mud: materials.add(StandardMaterial {
            base_color: Color::srgb(0.08, 0.06, 0.045),
            perceptual_roughness: 0.3,
            ..default()
        }),
        dirt: materials.add(StandardMaterial {
            base_color: Color::srgb(0.18, 0.14, 0.1),
            perceptual_roughness: 0.9,
            ..default()
        }),
        spark: materials.add(StandardMaterial {
            emissive: LinearRgba::new(25.0, 9.0, 1.5, 1.0),
            unlit: true,
            ..default()
        }),
        soul: materials.add(StandardMaterial {
            base_color: Color::srgba(0.3, 1.0, 0.5, 0.8),
            emissive: LinearRgba::new(2.0, 12.0, 4.0, 1.0),
            alpha_mode: glow,
            unlit: true,
            ..default()
        }),
        flash: materials.add(StandardMaterial {
            base_color: Color::srgba(1.0, 0.8, 0.4, 0.9),
            emissive: LinearRgba::new(40.0, 18.0, 4.0, 1.0),
            alpha_mode: glow,
            unlit: true,
            ..default()
        }),
    };
    commands.insert_resource(fx);
    commands.insert_resource(Storm {
        next: 6.0,
        flash: 0.0,
        thunder: None,
    });
}

fn fire(
    time: Res<Time>,
    mut rng: ResMut<Rng>,
    mut torches: Query<(&mut PointLight, &Torch)>,
    mut flames: Query<(&mut Transform, &Flame), Without<Ember>>,
    mut embers: Query<(&mut Transform, &mut Ember), Without<Flame>>,
) {
    let t = time.elapsed_secs();
    let dt = time.delta_secs();
    for (mut light, torch) in &mut torches {
        let n = (t * 9.0 + torch.phase).sin() * 0.5
            + (t * 23.0 + torch.phase * 3.0).sin() * 0.3
            + (t * 3.1).sin() * 0.2;
        light.intensity = torch.base * (0.86 + 0.12 * n);
    }
    for (mut tr, flame) in &mut flames {
        let n = (t * 11.0 + flame.phase).sin() * 0.5 + (t * 17.0 + flame.phase * 2.0).sin() * 0.5;
        tr.scale = flame.base * Vec3::new(1.0 - 0.08 * n, 1.0 + 0.22 * n, 1.0 - 0.08 * n);
    }
    for (mut tr, mut e) in &mut embers {
        e.life -= dt;
        if e.life <= 0.0 {
            e.life = rng.range(1.2, 2.6);
            e.vel = Vec3::new(
                rng.range(-0.3, 0.3),
                rng.range(1.0, 2.2),
                rng.range(-0.3, 0.3),
            );
            tr.translation =
                e.origin + Vec3::new(rng.range(-0.15, 0.15), 0.1, rng.range(-0.15, 0.15));
        }
        e.vel.x += (t * 3.0 + tr.translation.y * 4.0).sin() * dt * 0.8;
        tr.translation += e.vel * dt;
        tr.scale = Vec3::splat(0.014 * (e.life / 2.0).clamp(0.2, 1.0));
    }
}

fn rain(
    time: Res<Time>,
    mut rng: ResMut<Rng>,
    players: Query<&Transform, (With<Player>, Without<Rain>)>,
    mut drops: Query<(&mut Transform, &Rain)>,
) {
    let Ok(player) = players.single() else {
        return;
    };
    let center = player.translation;
    let dt = time.delta_secs();
    for (mut t, r) in &mut drops {
        t.translation += Vec3::new(-0.12, -1.0, 0.0) * r.speed * dt;
        let rel = t.translation - center;
        if t.translation.y < ground_height(t.translation.x, t.translation.z)
            || rel.x.abs() > 15.0
            || rel.z.abs() > 15.0
        {
            t.translation = center + Vec3::new(rng.range(-14., 14.), 0.0, rng.range(-14., 14.));
            t.translation.y = rng.range(8.0, 12.0);
        }
    }
}

fn storm(
    mut commands: Commands,
    time: Res<Time>,
    game: Res<Game>,
    sfx: Res<Sfx>,
    mut rng: ResMut<Rng>,
    mut storm: ResMut<Storm>,
    mut ambient: ResMut<AmbientLight>,
    mut moon: Query<&mut DirectionalLight, With<Moon>>,
) {
    let dt = time.delta_secs();
    storm.next -= dt;
    if storm.next <= 0.0 {
        storm.next = rng.range(14.0, 32.0);
        storm.flash = 0.6;
        storm.thunder = Some(rng.range(0.4, 2.6));
    }
    if let Some(delay) = storm.thunder.as_mut() {
        *delay -= dt;
        if *delay <= 0.0 {
            storm.thunder = None;
            let s = audio::pick(&sfx.thunder, &mut rng);
            audio::play_2d(&mut commands, &game, s, 0.9, rng.range(0.9, 1.05));
        }
    }
    storm.flash = (storm.flash - dt).max(0.0);
    // Two quick strobes, like the reference storm footage.
    let f = storm.flash;
    let strobe = if (0.45..0.6).contains(&f) || (0.25..0.35).contains(&f) {
        1.0
    } else {
        f * 0.4
    };
    if let Ok(mut light) = moon.single_mut() {
        light.illuminance = 350.0 + strobe * 9_000.0;
    }
    ambient.brightness = 55.0 + strobe * 500.0;
}

fn particles(
    mut commands: Commands,
    time: Res<Time>,
    mut q: Query<(Entity, &mut Transform, &mut Particle)>,
) {
    let dt = time.delta_secs();
    for (e, mut t, mut p) in &mut q {
        p.life -= dt;
        if p.life <= 0.0 {
            commands.entity(e).despawn();
            continue;
        }
        p.vel.y -= p.gravity * dt;
        t.translation += p.vel * dt;
        let ground = ground_height(t.translation.x, t.translation.z) + 0.01;
        if t.translation.y < ground {
            t.translation.y = ground;
            p.vel *= Vec3::new(0.4, -0.25, 0.4);
            p.spin *= 0.3;
        }
        t.rotate(Quat::from_euler(
            EulerRot::XYZ,
            p.spin.x * dt,
            p.spin.y * dt,
            0.0,
        ));
    }
}

/// Blender 2.91 cannot export emission strength, so glow factors arrive capped at 1.0.
/// Boost them once so eyes, embers and crystals feed the bloom pass.
fn boost_emissive(
    mut events: EventReader<AssetEvent<StandardMaterial>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let ids: Vec<_> = events
        .read()
        .filter_map(|e| match e {
            AssetEvent::Added { id } => Some(*id),
            _ => None,
        })
        .collect();
    for id in ids {
        if let Some(m) = materials.get_mut(id) {
            let e = m.emissive;
            let peak = e.red.max(e.green).max(e.blue);
            if peak > 0.0 && peak <= 1.0 {
                m.emissive = LinearRgba::new(e.red * 14.0, e.green * 14.0, e.blue * 14.0, 1.0);
            }
        }
    }
}

pub struct WorldPlugin;

impl Plugin for WorldPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Obstacles>()
            .add_systems(Startup, setup)
            .add_systems(Update, (fire, rain, storm, particles, boost_emissive));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walkers_are_pushed_out_of_props_and_kept_in_the_arena() {
        let obstacles = Obstacles(vec![(Vec2::ZERO, 1.0)]);
        let mut p = Vec3::new(0.5, 0.0, 0.0);
        obstacles.resolve(&mut p, 0.35);
        assert!((p.xz().length() - 1.35).abs() < 1e-4);
        let mut far = Vec3::new(40.0, 1.7, 0.0);
        obstacles.resolve(&mut far, 0.35);
        assert!((far.x - (ARENA_RADIUS - 0.35)).abs() < 1e-4);
        assert_eq!(far.y, 1.7);
    }

    #[test]
    fn fighting_ground_is_nearly_flat_and_rises_outside() {
        for i in 0..200 {
            let a = i as f32 * 0.37;
            let r = (i % 15) as f32;
            assert!(ground_height(a.cos() * r, a.sin() * r).abs() < 0.08);
        }
        assert!(ground_height(0.0, 30.0) > 0.3 || ground_height(30.0, 0.0) > 0.3);
    }
}
