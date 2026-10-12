use std::{collections::HashMap, f32::consts::PI, time::Duration};

use bevy::{prelude::*, render::view::NoFrustumCulling, scene::SceneInstanceReady};

use crate::{
    audio::{self, Sfx},
    player::{EnemyHit, Player},
    rng::Rng,
    world::{self, Burst, FxAssets, Obstacles, GATE_Z},
    Game, Phase, Restart, WAVE_COUNT,
};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Kind {
    Skeleton,
    Reaper,
    Knight,
    Warlord,
    Ghoul,
    Skull,
}

pub struct Stats {
    pub hp: f32,
    pub speed: f32,
    pub damage: f32,
    pub reach: f32,
    pub scale: f32,
    pub voice_pitch: f32,
    /// Multiplier applied to incoming damage (plate armour < 1).
    pub toughness: f32,
    /// Damage needed in one shot to interrupt the creature.
    pub stagger: f32,
}

impl Kind {
    const ALL: [Kind; 6] = [
        Kind::Skeleton,
        Kind::Reaper,
        Kind::Knight,
        Kind::Warlord,
        Kind::Ghoul,
        Kind::Skull,
    ];

    fn file(self) -> &'static str {
        match self {
            Kind::Skeleton => "models/skeleton.glb",
            Kind::Reaper => "models/skeleton_reaper.glb",
            Kind::Knight => "models/skeleton_knight.glb",
            Kind::Warlord => "models/skeleton_warlord.glb",
            Kind::Ghoul => "models/ghoul.glb",
            Kind::Skull => "models/skull_horned.glb",
        }
    }

    pub fn stats(self) -> Stats {
        let s = |hp, speed, damage, reach, scale, voice_pitch, toughness, stagger| Stats {
            hp,
            speed,
            damage,
            reach,
            scale,
            voice_pitch,
            toughness,
            stagger,
        };
        match self {
            Kind::Skeleton => s(60.0, 1.7, 10.0, 1.55, 1.0, 1.0, 1.0, 10.0),
            Kind::Reaper => s(45.0, 2.7, 8.0, 1.5, 0.97, 1.18, 1.0, 8.0),
            Kind::Knight => s(150.0, 1.35, 18.0, 1.7, 1.05, 0.85, 0.7, 45.0),
            Kind::Warlord => s(460.0, 1.55, 28.0, 2.1, 1.3, 0.68, 0.75, 90.0),
            Kind::Ghoul => s(95.0, 2.1, 14.0, 1.6, 1.0, 0.92, 1.0, 25.0),
            Kind::Skull => s(55.0, 3.0, 12.0, 1.4, 0.75, 1.0, 1.0, 1000.0),
        }
    }

    fn bony(self) -> bool {
        !matches!(self, Kind::Ghoul)
    }

    fn animated(self) -> bool {
        !matches!(self, Kind::Skull)
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum State {
    Rising,
    Chase,
    Attack,
    Hit,
    Dead,
}

/// Clip order matches the alphabetical NLA export from Blender.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Clip {
    Attack = 0,
    Death = 1,
    Hit = 2,
    Idle = 3,
    Walk = 4,
}

#[derive(Component)]
pub struct Enemy {
    pub kind: Kind,
    pub hp: f32,
    pub state: State,
    timer: f32,
    voice: f32,
    stride: f32,
    seed: f32,
    struck: bool,
    anim: Option<Entity>,
    playing: Option<Clip>,
    restart_clip: bool,
}

impl Enemy {
    pub fn alive(&self) -> bool {
        self.state != State::Dead
    }

    /// Ray test against a capsule body plus a head sphere. Returns (distance, headshot).
    pub fn hit_test(&self, t: &Transform, origin: Vec3, dir: Vec3) -> Option<(f32, bool)> {
        if !self.alive() || self.state == State::Rising && t.translation.y < -1.0 {
            return None;
        }
        let s = self.kind.stats().scale;
        let p = t.translation;
        if self.kind == Kind::Skull {
            return ray_sphere(origin, dir, p + Vec3::Y * 0.25 * s, 0.55 * s).map(|d| (d, true));
        }
        let head = ray_sphere(origin, dir, p + Vec3::Y * 1.74 * s, 0.17 * s);
        let body = ray_capsule(
            origin,
            dir,
            p + Vec3::Y * 0.3 * s,
            p + Vec3::Y * 1.5 * s,
            0.3 * s,
        );
        match (head, body) {
            (Some(h), Some(b)) if h <= b + 0.1 => Some((h, true)),
            (Some(h), None) => Some((h, true)),
            (_, Some(b)) => Some((b, false)),
            _ => None,
        }
    }
}

fn ray_sphere(o: Vec3, d: Vec3, c: Vec3, r: f32) -> Option<f32> {
    let oc = o - c;
    let b = oc.dot(d);
    let disc = b * b - (oc.length_squared() - r * r);
    if disc < 0.0 {
        return None;
    }
    let t = -b - disc.sqrt();
    (t > 0.0).then_some(t)
}

fn ray_capsule(o: Vec3, d: Vec3, a: Vec3, b: Vec3, r: f32) -> Option<f32> {
    let u = b - a;
    let w = o - a;
    let (bu, cu, dw, eu) = (d.dot(u), u.dot(u), d.dot(w), u.dot(w));
    let denom = cu - bu * bu;
    let s = if denom > 1e-6 {
        ((eu - bu * dw) / denom).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let t = s * bu - dw;
    if t < 0.0 {
        return None;
    }
    let closest = o + d * t - (a + u * s);
    (closest.length() < r).then_some(t)
}

#[derive(Resource)]
struct EnemyAssets {
    scenes: HashMap<Kind, Handle<Scene>>,
    graphs: HashMap<Kind, Handle<AnimationGraph>>,
    nodes: Vec<AnimationNodeIndex>,
    pickup: Handle<Scene>,
}

#[derive(Resource, Default)]
pub struct Waves {
    queue: Vec<Kind>,
    spawn_timer: f32,
    pub alive: usize,
}

fn wave_roster(wave: usize) -> Vec<Kind> {
    use Kind::*;
    let plan: &[(Kind, usize)] = match wave {
        1 => &[(Skeleton, 5)],
        2 => &[(Skeleton, 4), (Reaper, 3)],
        3 => &[(Skeleton, 3), (Reaper, 2), (Ghoul, 3), (Skull, 1)],
        4 => &[(Reaper, 3), (Knight, 2), (Ghoul, 2), (Skull, 2)],
        _ => &[(Skeleton, 3), (Knight, 2), (Skull, 2), (Warlord, 1)],
    };
    let mut roster = Vec::new();
    for (kind, n) in plan {
        roster.extend(std::iter::repeat_n(*kind, *n));
    }
    // Spawned from the back of the queue: the elite arrives last.
    roster.reverse();
    roster
}

fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let mut scenes = HashMap::new();
    let mut graph_handles = HashMap::new();
    let mut nodes = Vec::new();
    for kind in Kind::ALL {
        scenes.insert(
            kind,
            assets.load(GltfAssetLabel::Scene(0).from_asset(kind.file())),
        );
        if kind.animated() {
            let clips =
                (0..5).map(|i| assets.load(GltfAssetLabel::Animation(i).from_asset(kind.file())));
            let (graph, indices) = AnimationGraph::from_clips(clips);
            nodes = indices;
            graph_handles.insert(kind, graphs.add(graph));
        }
    }
    commands.insert_resource(EnemyAssets {
        scenes,
        graphs: graph_handles,
        nodes,
        pickup: assets.load(GltfAssetLabel::Scene(0).from_asset("models/crystal.glb")),
    });
}

fn spawn_enemy(
    commands: &mut Commands,
    assets: &EnemyAssets,
    rng: &mut Rng,
    kind: Kind,
    pos: Vec3,
    rising: bool,
) -> Entity {
    let stats = kind.stats();
    let start = if rising {
        pos - Vec3::Y * 1.9 * stats.scale
    } else {
        pos
    };
    let root = commands
        .spawn((
            Transform::from_translation(start)
                .with_rotation(Quat::from_rotation_y(rng.range(0.0, 2.0 * PI))),
            Visibility::default(),
            Enemy {
                kind,
                hp: stats.hp,
                state: if rising { State::Rising } else { State::Chase },
                timer: 0.0,
                voice: rng.range(1.0, 4.0),
                stride: 0.0,
                seed: rng.range(0.0, 100.0),
                struck: false,
                anim: None,
                playing: None,
                restart_clip: false,
            },
        ))
        .id();
    let graph = assets.graphs.get(&kind).cloned();
    let model = commands
        .spawn((
            SceneRoot(assets.scenes[&kind].clone()),
            Transform::from_scale(Vec3::splat(stats.scale)),
        ))
        .observe(
            move |trigger: Trigger<SceneInstanceReady>,
                  mut commands: Commands,
                  children: Query<&Children>,
                  players: Query<(), With<AnimationPlayer>>,
                  meshes: Query<(), With<Mesh3d>>,
                  mut enemies: Query<&mut Enemy>| {
                for e in children.iter_descendants(trigger.target()) {
                    // Skinned bounds do not follow the death fall; never cull these few meshes.
                    if meshes.contains(e) {
                        commands.entity(e).insert(NoFrustumCulling);
                    }
                    if let Some(graph) = graph.clone().filter(|_| players.contains(e)) {
                        commands
                            .entity(e)
                            .insert((AnimationGraphHandle(graph), AnimationTransitions::new()));
                        if let Ok(mut enemy) = enemies.get_mut(root) {
                            enemy.anim = Some(e);
                        }
                    }
                }
            },
        )
        .id();
    commands.entity(root).add_child(model);
    root
}

fn spawn_point(rng: &mut Rng, player: Vec3, kind: Kind) -> (Vec3, bool) {
    if kind == Kind::Skull {
        let x = rng.range(-6.0, 6.0);
        return (Vec3::new(x, 3.5, GATE_Z + 3.0), false);
    }
    if kind == Kind::Warlord || rng.chance(0.35) {
        return (Vec3::new(rng.range(-1.5, 1.5), 0.0, GATE_Z + 1.5), false);
    }
    for _ in 0..20 {
        let a = rng.range(0.0, 2.0 * PI);
        let r = rng.range(8.0, 14.0);
        let p = Vec3::new(a.cos() * r, 0.0, a.sin() * r);
        if p.xz().distance(player.xz()) > 7.0 {
            return (p, true);
        }
    }
    (Vec3::new(0.0, 0.0, GATE_Z + 1.5), false)
}

fn waves(
    mut commands: Commands,
    time: Res<Time>,
    mut game: ResMut<Game>,
    mut waves: ResMut<Waves>,
    mut rng: ResMut<Rng>,
    assets: Res<EnemyAssets>,
    sfx: Res<Sfx>,
    fx: Res<FxAssets>,
    players: Query<&Transform, With<Player>>,
    enemies: Query<&Enemy>,
) {
    let dt = time.delta_secs();
    if dt == 0.0 {
        return;
    }
    waves.alive = enemies.iter().filter(|e| e.alive()).count();
    game.hurt = (game.hurt - dt * 1.6).max(0.0);
    game.hit_marker = (game.hit_marker - dt).max(0.0);
    game.banner = (game.banner - dt).max(0.0);
    let player = players.single().map(|t| t.translation).unwrap_or_default();
    match game.phase {
        Phase::Countdown => {
            game.phase_timer -= dt;
            if game.phase_timer <= 0.0 {
                game.wave += 1;
                game.phase = Phase::Fighting;
                game.banner = 3.0;
                waves.queue = wave_roster(game.wave);
                waves.spawn_timer = 0.5;
                audio::play_2d(&mut commands, &game, sfx.wave_start.clone(), 0.8, 1.0);
            }
        }
        Phase::Fighting => {
            game.elapsed += dt;
            waves.spawn_timer -= dt;
            if waves.spawn_timer <= 0.0 && waves.alive < 8 {
                if let Some(kind) = waves.queue.pop() {
                    let (pos, rising) = spawn_point(&mut rng, player, kind);
                    let id = spawn_enemy(&mut commands, &assets, &mut rng, kind, pos, rising);
                    if rising {
                        world::spawn_burst(
                            &mut commands,
                            &fx,
                            &mut rng,
                            Burst::Dirt,
                            pos + Vec3::Y * 0.05,
                            Vec3::Y,
                            14,
                        );
                        let s = audio::pick(&sfx.bone_rattle, &mut rng);
                        audio::play_on(
                            &mut commands,
                            &game,
                            id,
                            Vec3::Y,
                            s,
                            1.1,
                            rng.range(0.85, 1.0),
                        );
                    }
                    waves.spawn_timer = rng.range(1.2, 2.4);
                }
            }
            if waves.queue.is_empty() && waves.alive == 0 {
                audio::play_2d(&mut commands, &game, sfx.wave_clear.clone(), 0.8, 1.0);
                if game.wave >= WAVE_COUNT {
                    game.phase = Phase::Victory;
                } else {
                    game.phase = Phase::Countdown;
                    game.phase_timer = 6.0;
                    game.armor = (game.armor + 25.0).min(100.0);
                }
            }
        }
        _ => {}
    }
}

fn behaviour(
    mut commands: Commands,
    time: Res<Time>,
    mut game: ResMut<Game>,
    mut rng: ResMut<Rng>,
    sfx: Res<Sfx>,
    obstacles: Res<Obstacles>,
    players: Query<&Transform, (With<Player>, Without<Enemy>)>,
    mut enemies: Query<(Entity, &mut Transform, &mut Enemy)>,
) {
    let dt = time.delta_secs();
    if dt == 0.0 {
        return;
    }
    let Ok(player) = players.single() else {
        return;
    };
    let target = player.translation;
    let positions: Vec<(Entity, Vec2, bool)> = enemies
        .iter()
        .map(|(e, t, en)| (e, t.translation.xz(), en.alive() && en.kind != Kind::Skull))
        .collect();
    let now = time.elapsed_secs();
    for (entity, mut t, mut e) in &mut enemies {
        let stats = e.kind.stats();
        e.timer += dt;
        let to = Vec2::new(target.x - t.translation.x, target.z - t.translation.z);
        let dist = to.length();
        let dir = to.normalize_or_zero();
        let face = Quat::from_rotation_y(dir.x.atan2(dir.y));
        let head = Vec3::Y * 1.6 * stats.scale;
        let fighting = game.phase == Phase::Fighting;

        if e.alive() && fighting {
            e.voice -= dt;
            if e.voice <= 0.0 {
                e.voice = rng.range(3.0, 7.5);
                let pitch = stats.voice_pitch * rng.range(0.92, 1.08);
                if e.kind == Kind::Skull {
                    audio::play_on(
                        &mut commands,
                        &game,
                        entity,
                        Vec3::ZERO,
                        sfx.skull_wail.clone(),
                        1.2,
                        pitch,
                    );
                } else {
                    let set = if dist > 11.0 {
                        &sfx.groan_far
                    } else {
                        &sfx.groan
                    };
                    let s = audio::pick(set, &mut rng);
                    audio::play_on(&mut commands, &game, entity, head, s, 1.3, pitch);
                    if e.kind.bony() && rng.chance(0.5) {
                        let s = audio::pick(&sfx.bone_rattle, &mut rng);
                        audio::play_on(
                            &mut commands,
                            &game,
                            entity,
                            head * 0.7,
                            s,
                            0.7,
                            rng.range(0.9, 1.1),
                        );
                    }
                }
            }
        }

        match e.state {
            State::Rising => {
                let k = (e.timer / 1.6).min(1.0);
                t.translation.y = -1.9 * stats.scale * (1.0 - k).powi(2);
                t.rotation = t.rotation.slerp(face, dt * 2.0);
                if k >= 1.0 {
                    e.state = State::Chase;
                    e.timer = 0.0;
                }
            }
            State::Chase => {
                if !fighting {
                    continue;
                }
                let mut speed = stats.speed;
                let mut lateral = Vec2::ZERO;
                match e.kind {
                    Kind::Reaper => {
                        lateral = Vec2::new(-dir.y, dir.x) * (now * 2.2 + e.seed).sin() * 0.9
                    }
                    Kind::Ghoul => speed *= 0.75 + 0.45 * (now * 3.0 + e.seed).sin().abs(),
                    _ => {}
                }
                let step = (dir + lateral).normalize_or_zero() * speed * dt;
                if dist > stats.reach * 0.85 {
                    t.translation.x += step.x;
                    t.translation.z += step.y;
                    e.stride += step.length();
                }
                t.rotation = t.rotation.slerp(face, (dt * 6.0).min(1.0));
                if e.kind == Kind::Skull {
                    let hover = 1.5 + (now * 2.0 + e.seed).sin() * 0.25;
                    t.translation.y += (hover - t.translation.y) * (dt * 2.0).min(1.0);
                } else {
                    t.translation.y = world::ground_height(t.translation.x, t.translation.z);
                    let stride_len = 0.75 * stats.scale;
                    if e.stride > stride_len {
                        e.stride -= stride_len;
                        let (set, vol) = if e.kind.bony() {
                            (&sfx.bone_step, 0.75)
                        } else {
                            (&sfx.ghoul_step, 0.9)
                        };
                        let heavy = matches!(e.kind, Kind::Knight | Kind::Warlord);
                        let s = audio::pick(set, &mut rng);
                        let pitch = if heavy { 0.78 } else { 1.0 } * rng.range(0.92, 1.08);
                        audio::play_on(
                            &mut commands,
                            &game,
                            entity,
                            Vec3::ZERO,
                            s,
                            if heavy { vol * 1.4 } else { vol },
                            pitch,
                        );
                    }
                }
                if dist < stats.reach {
                    e.state = State::Attack;
                    e.timer = 0.0;
                    e.struck = false;
                    let set = if e.kind.bony() {
                        &sfx.snarl
                    } else {
                        &sfx.attack
                    };
                    let s = audio::pick(set, &mut rng);
                    audio::play_on(
                        &mut commands,
                        &game,
                        entity,
                        head,
                        s,
                        1.2,
                        stats.voice_pitch * rng.range(0.95, 1.05),
                    );
                }
            }
            State::Attack => {
                t.rotation = t.rotation.slerp(face, (dt * 8.0).min(1.0));
                if e.kind == Kind::Skull {
                    let lunge = (e.timer * PI / 0.9).sin().max(0.0);
                    t.translation.y += ((target.y - 0.2) - t.translation.y) * lunge * dt * 4.0;
                }
                if !e.struck && e.timer > 0.45 {
                    e.struck = true;
                    if dist < stats.reach + 0.6 && game.playing() {
                        game.damage(stats.damage);
                        let s = audio::pick(&sfx.player_hurt, &mut rng);
                        audio::play_2d(&mut commands, &game, s, 0.8, rng.range(0.95, 1.05));
                        let s = audio::pick(&sfx.flesh_hit, &mut rng);
                        audio::play_2d(&mut commands, &game, s, 0.6, 1.0);
                    }
                }
                if e.timer > 1.0 {
                    e.state = State::Chase;
                    e.timer = 0.0;
                }
            }
            State::Hit => {
                if e.timer > 0.45 {
                    e.state = State::Chase;
                    e.timer = 0.0;
                }
            }
            State::Dead => {
                if e.kind == Kind::Skull {
                    let ground = world::ground_height(t.translation.x, t.translation.z) + 0.25;
                    t.translation.y = (t.translation.y - dt * (2.0 + e.timer * 9.0)).max(ground);
                    t.rotate_local_x(dt * 3.0);
                    if e.timer > 4.0 {
                        commands.entity(entity).despawn();
                    }
                } else {
                    if e.timer > 8.0 {
                        t.translation.y -= dt * 0.35;
                    }
                    if e.timer > 11.0 {
                        commands.entity(entity).despawn();
                    }
                }
            }
        }

        if e.alive() && e.state != State::Rising {
            let mut p = t.translation;
            if e.kind != Kind::Skull {
                for (other, q, solid) in &positions {
                    if *other == entity || !solid {
                        continue;
                    }
                    let d = p.xz() - *q;
                    let min = 0.7 * stats.scale;
                    let len = d.length();
                    if len < min && len > 1e-4 {
                        let push = d / len * (min - len) * 0.5;
                        p.x += push.x;
                        p.z += push.y;
                    }
                }
                obstacles.resolve(&mut p, 0.3 * stats.scale);
            }
            t.translation = p;
        }
    }
}

fn take_hits(
    mut commands: Commands,
    mut events: EventReader<EnemyHit>,
    mut game: ResMut<Game>,
    mut rng: ResMut<Rng>,
    sfx: Res<Sfx>,
    fx: Res<FxAssets>,
    assets: Res<EnemyAssets>,
    mut enemies: Query<(&mut Transform, &mut Enemy)>,
) {
    for hit in events.read() {
        let Ok((mut t, mut e)) = enemies.get_mut(hit.entity) else {
            continue;
        };
        if !e.alive() {
            continue;
        }
        let stats = e.kind.stats();
        let damage = hit.damage * stats.toughness;
        e.hp -= damage;
        game.hit_marker = if hit.head { 0.3 } else { 0.15 };
        let burst = if e.kind.bony() {
            Burst::Bone
        } else {
            Burst::Mud
        };
        let n = (damage / 8.0).clamp(3.0, 14.0) as usize + if hit.head { 8 } else { 0 };
        world::spawn_burst(
            &mut commands,
            &fx,
            &mut rng,
            burst,
            hit.point,
            -hit.dir + Vec3::Y * 0.5,
            n,
        );
        if matches!(e.kind, Kind::Knight | Kind::Warlord) {
            world::spawn_burst(
                &mut commands,
                &fx,
                &mut rng,
                Burst::Spark,
                hit.point,
                -hit.dir,
                5,
            );
        }
        let push = Vec3::new(hit.dir.x, 0.0, hit.dir.z).normalize_or_zero()
            * (damage / stats.hp.max(60.0)).min(0.6);
        t.translation += push;
        let at = hit.point - t.translation;
        if e.hp <= 0.0 {
            e.state = State::Dead;
            e.timer = 0.0;
            game.kills += 1;
            match e.kind {
                Kind::Ghoul => {
                    let s = audio::pick(&sfx.death, &mut rng);
                    audio::play_at(
                        &mut commands,
                        &game,
                        s,
                        hit.point,
                        1.4,
                        rng.range(0.95, 1.05),
                    );
                }
                Kind::Skull => {
                    audio::play_at(&mut commands, &game, sfx.burst.clone(), hit.point, 1.2, 1.3);
                    let s = audio::pick(&sfx.bone_hit, &mut rng);
                    audio::play_at(&mut commands, &game, s, hit.point, 1.2, 0.8);
                    world::spawn_burst(
                        &mut commands,
                        &fx,
                        &mut rng,
                        Burst::Bone,
                        hit.point,
                        Vec3::Y,
                        24,
                    );
                    world::spawn_burst(
                        &mut commands,
                        &fx,
                        &mut rng,
                        Burst::Spark,
                        hit.point,
                        Vec3::Y,
                        12,
                    );
                }
                _ => {
                    let s = audio::pick(&sfx.bone_collapse, &mut rng);
                    let pitch = stats.voice_pitch.sqrt() * rng.range(0.95, 1.05);
                    audio::play_at(&mut commands, &game, s, t.translation + Vec3::Y, 1.5, pitch);
                }
            }
            let chance = if e.kind == Kind::Warlord { 1.0 } else { 0.28 };
            if rng.chance(chance) {
                let pos = Vec3::new(t.translation.x, 0.0, t.translation.z);
                commands.spawn((
                    SceneRoot(assets.pickup.clone()),
                    Transform::from_translation(pos).with_scale(Vec3::splat(1.3)),
                    Pickup {
                        life: 20.0,
                        heal: if e.kind == Kind::Warlord { 50.0 } else { 15.0 },
                    },
                ));
            }
        } else {
            let set = if e.kind.bony() {
                &sfx.bone_hit
            } else {
                &sfx.flesh_hit
            };
            let s = audio::pick(set, &mut rng);
            audio::play_at(
                &mut commands,
                &game,
                s,
                t.translation + at,
                1.3,
                rng.range(0.92, 1.08),
            );
            if !e.kind.bony() || rng.chance(0.3) {
                let s = audio::pick(&sfx.hurt, &mut rng);
                let head = Vec3::Y * 1.6 * stats.scale;
                audio::play_at(
                    &mut commands,
                    &game,
                    s,
                    t.translation + head,
                    1.1,
                    stats.voice_pitch,
                );
            }
            if damage >= stats.stagger && e.state != State::Rising {
                e.state = State::Hit;
                e.timer = 0.0;
                e.restart_clip = true;
            }
        }
    }
}

fn animate(
    mut enemies: Query<&mut Enemy>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
    assets: Res<EnemyAssets>,
) {
    for mut e in &mut enemies {
        let Some(anim) = e.anim else {
            continue;
        };
        let clip = match e.state {
            State::Rising => Clip::Idle,
            State::Chase if e.kind.stats().speed > 0.0 => Clip::Walk,
            State::Chase => Clip::Idle,
            State::Attack => Clip::Attack,
            State::Hit => Clip::Hit,
            State::Dead => Clip::Death,
        };
        if e.playing == Some(clip) && !e.restart_clip {
            continue;
        }
        let Ok((mut player, mut transitions)) = players.get_mut(anim) else {
            continue;
        };
        let fade = Duration::from_millis(if clip == Clip::Death { 120 } else { 200 });
        let active = transitions.play(&mut player, assets.nodes[clip as usize], fade);
        match clip {
            Clip::Walk => {
                let stats = e.kind.stats();
                active.repeat().set_speed(stats.speed / (1.1 * stats.scale));
            }
            Clip::Idle => {
                active.repeat();
            }
            _ => {}
        }
        e.playing = Some(clip);
        e.restart_clip = false;
    }
}

#[derive(Component)]
pub struct Pickup {
    life: f32,
    heal: f32,
}

fn pickups(
    mut commands: Commands,
    time: Res<Time>,
    mut game: ResMut<Game>,
    mut rng: ResMut<Rng>,
    sfx: Res<Sfx>,
    fx: Res<FxAssets>,
    players: Query<&Transform, (With<Player>, Without<Pickup>)>,
    mut items: Query<(Entity, &mut Transform, &mut Pickup)>,
) {
    let Ok(player) = players.single() else {
        return;
    };
    let dt = time.delta_secs();
    for (entity, mut t, mut p) in &mut items {
        p.life -= dt;
        t.rotate_y(dt * 1.2);
        t.translation.y = 0.15 + (time.elapsed_secs() * 2.5).sin() * 0.08;
        if p.life <= 0.0 {
            commands.entity(entity).despawn();
        } else if t.translation.xz().distance(player.translation.xz()) < 1.2 && game.playing() {
            game.hp = (game.hp + p.heal).min(100.0);
            game.armor = (game.armor + p.heal * 0.6).min(100.0);
            audio::play_2d(&mut commands, &game, sfx.pickup.clone(), 0.7, 1.0);
            world::spawn_burst(
                &mut commands,
                &fx,
                &mut rng,
                Burst::Soul,
                t.translation + Vec3::Y * 0.3,
                Vec3::Y,
                16,
            );
            commands.entity(entity).despawn();
        }
    }
}

fn reset(
    mut commands: Commands,
    mut events: EventReader<Restart>,
    mut waves: ResMut<Waves>,
    enemies: Query<Entity, With<Enemy>>,
    items: Query<Entity, With<Pickup>>,
) {
    if events.read().count() == 0 {
        return;
    }
    for e in enemies.iter().chain(items.iter()) {
        commands.entity(e).despawn();
    }
    *waves = Waves::default();
}

pub struct EnemyPlugin;

impl Plugin for EnemyPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Waves>()
            .add_systems(Startup, setup)
            .add_systems(
                Update,
                (waves, behaviour, take_hits, animate, pickups, reset).chain(),
            );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn enemy(kind: Kind) -> Enemy {
        Enemy {
            kind,
            hp: kind.stats().hp,
            state: State::Chase,
            timer: 0.0,
            voice: 0.0,
            stride: 0.0,
            seed: 0.0,
            struck: false,
            anim: None,
            playing: None,
            restart_clip: false,
        }
    }

    #[test]
    fn ray_hits_sphere_front_surface() {
        let d = ray_sphere(Vec3::ZERO, Vec3::NEG_Z, Vec3::new(0.0, 0.0, -10.0), 1.0).unwrap();
        assert!((d - 9.0).abs() < 1e-4);
        assert!(ray_sphere(Vec3::ZERO, Vec3::Z, Vec3::new(0.0, 0.0, -10.0), 1.0).is_none());
    }

    #[test]
    fn ray_capsule_respects_radius_and_direction() {
        let (a, b) = (Vec3::new(0.0, 0.3, -5.0), Vec3::new(0.0, 1.5, -5.0));
        let o = Vec3::new(0.0, 1.0, 0.0);
        assert!(ray_capsule(o, Vec3::NEG_Z, a, b, 0.3).is_some());
        assert!(ray_capsule(o + Vec3::X * 0.5, Vec3::NEG_Z, a, b, 0.3).is_none());
        assert!(
            ray_capsule(o, Vec3::Z, a, b, 0.3).is_none(),
            "behind the shooter"
        );
    }

    #[test]
    fn head_and_body_shots_are_told_apart() {
        let e = enemy(Kind::Skeleton);
        let t = Transform::from_xyz(0.0, 0.0, -6.0);
        let head = e
            .hit_test(&t, Vec3::new(0.0, 1.74, 0.0), Vec3::NEG_Z)
            .unwrap();
        let body = e
            .hit_test(&t, Vec3::new(0.0, 1.0, 0.0), Vec3::NEG_Z)
            .unwrap();
        assert!(head.1 && !body.1);
        assert!(e.hit_test(&t, Vec3::new(0.0, 1.0, 0.0), Vec3::X).is_none());
    }

    #[test]
    fn dead_or_buried_enemies_cannot_be_hit() {
        let mut e = enemy(Kind::Knight);
        let t = Transform::from_xyz(0.0, 0.0, -6.0);
        e.state = State::Dead;
        assert!(e
            .hit_test(&t, Vec3::new(0.0, 1.0, 0.0), Vec3::NEG_Z)
            .is_none());
        e.state = State::Rising;
        let buried = Transform::from_xyz(0.0, -1.5, -6.0);
        assert!(e
            .hit_test(&buried, Vec3::new(0.0, 1.0, 0.0), Vec3::NEG_Z)
            .is_none());
    }

    #[test]
    fn waves_escalate_and_end_with_the_warlord() {
        let sizes: Vec<usize> = (1..=WAVE_COUNT).map(|w| wave_roster(w).len()).collect();
        assert_eq!(sizes, vec![5, 7, 9, 9, 8]);
        assert!(!wave_roster(1).contains(&Kind::Skull));
        let last = wave_roster(WAVE_COUNT);
        assert_eq!(
            last.first(),
            Some(&Kind::Warlord),
            "popped last from the queue"
        );
        assert_eq!(last.iter().filter(|k| **k == Kind::Warlord).count(), 1);
    }

    #[test]
    fn clip_indices_follow_alphabetical_export() {
        let names = ["Attack", "Death", "Hit", "Idle", "Walk"];
        let mut sorted = names;
        sorted.sort();
        assert_eq!(names, sorted);
        assert_eq!(Clip::Walk as usize, 4);
    }
}
