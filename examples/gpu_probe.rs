//! Minimal PBR scene to check whether this GPU/driver can compile Bevy's standard shaders.
//! `cargo run --release --example gpu_probe` — exits after three seconds.

use bevy::{pbr::PbrPlugin, prelude::*};

fn main() {
    let gpu_preprocess = !std::env::args().any(|a| a == "--nogpupre");
    App::new()
        .add_plugins(DefaultPlugins.set(PbrPlugin {
            use_gpu_instance_buffer_builder: gpu_preprocess,
            ..default()
        }))
        .add_systems(Startup, setup)
        .add_systems(Update, quit)
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let unlit = std::env::args().any(|a| a == "--unlit");
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(1.0, 1.0, 1.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.8, 0.3, 0.2),
            unlit,
            ..default()
        })),
    ));
    if !std::env::args().any(|a| a == "--nolight") {
        commands.spawn((PointLight::default(), Transform::from_xyz(2.0, 3.0, 2.0)));
    }
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(2.0, 2.0, 3.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

fn quit(time: Res<Time>, mut exit: EventWriter<AppExit>) {
    if time.elapsed_secs() > 3.0 {
        info!("gpu_probe: PBR pipelines compiled and rendered for 3 s");
        exit.write(AppExit::Success);
    }
}
