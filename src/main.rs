use bevy::{audio::Volume, input::mouse::AccumulatedMouseMotion, pbr::FogFalloff, prelude::*, window::{CursorGrabMode, PrimaryWindow}};
use bevy::gltf::GltfAssetLabel;
use std::f32::consts::PI;

#[derive(Component)] struct Player;
#[derive(Component)] struct Enemy;
#[derive(Component)] struct Weapon;
#[derive(Component)] struct Torch(f32);
#[derive(Component)] struct Rain;
#[derive(Component)] struct Hud;
#[derive(Component)] struct Flash(f32);
#[derive(Resource)] struct Game { hp: f32, enemy_hp: i32, shots: u32, cooldown: f32, cue: f32, step: f32, yaw: f32, pitch: f32, elapsed: f32, muted: bool }
impl Default for Game { fn default() -> Self { Self { hp:100., enemy_hp:5, shots:0, cooldown:0., cue:8., step:0., yaw:0., pitch:0., elapsed:0., muted:false } } }
#[derive(Resource)] struct Sounds { rain:Handle<AudioSource>, shot:Handle<AudioSource>, step:Handle<AudioSource>, cue:Handle<AudioSource>, explosion:Handle<AudioSource>, pulse:Handle<AudioSource> }

fn main() {
    App::new().add_plugins(DefaultPlugins.set(WindowPlugin { primary_window:Some(Window { title:"Battle Hell — Batalha no Inferno — protótipo 0.1".into(), resolution:(1280.,720.).into(), ..default() }), ..default() }))
        .insert_resource(ClearColor(Color::srgb(0.025,0.035,0.055)))
        .insert_resource(AmbientLight { color:Color::srgb(0.32,0.45,0.65), brightness:90., ..default() })
        .init_resource::<Game>().add_systems(Startup, setup)
        .add_systems(Update, (controls, combat, atmosphere, update_hud).chain()).run();
}
fn block(commands:&mut Commands, meshes:&mut Assets<Mesh>, materials:&mut Assets<StandardMaterial>, size:Vec3, pos:Vec3, color:Color) -> Entity {
    commands.spawn((Mesh3d(meshes.add(Cuboid::new(size.x,size.y,size.z))), MeshMaterial3d(materials.add(StandardMaterial { base_color:color, perceptual_roughness:0.72, ..default() })), Transform::from_translation(pos))).id()
}
fn play(commands:&mut Commands, sound:Handle<AudioSource>, pos:Vec3, volume:f32, speed:f32, spatial:bool) {
    commands.spawn((AudioPlayer::new(sound), PlaybackSettings::DESPAWN.with_volume(Volume::Linear(volume)).with_speed(speed).with_spatial(spatial), Transform::from_translation(pos)));
}
fn setup(mut commands:Commands, mut meshes:ResMut<Assets<Mesh>>, mut materials:ResMut<Assets<StandardMaterial>>, assets:Res<AssetServer>) {
    let sounds=Sounds { rain:assets.load("audio/rain.wav"), shot:assets.load("audio/shot.wav"), step:assets.load("audio/step.wav"), cue:assets.load("audio/cue.wav"), explosion:assets.load("audio/explosion.wav"), pulse:assets.load("audio/pulse.wav") };
    commands.spawn((AudioPlayer::new(sounds.rain.clone()), PlaybackSettings::LOOP.with_volume(Volume::Linear(0.32))));
    commands.insert_resource(sounds);
    block(&mut commands,&mut meshes,&mut materials,Vec3::new(42.,0.3,42.),Vec3::new(0.,-0.2,0.),Color::srgb(0.09,0.12,0.09));
    for i in 0..22 { let x=((i*7)%11) as f32-5.; let z=7.-i as f32*1.1;
        block(&mut commands,&mut meshes,&mut materials,Vec3::new(1.6,0.08,1.1),Vec3::new(x*0.7,0.01,z),Color::srgb(0.22,0.23,0.21)); }
    for i in 0..36 { let a=i as f32*2.399; let r=12.+(i%4) as f32*1.7; let p=Vec3::new(a.cos()*r,2.8,a.sin()*r);
        block(&mut commands,&mut meshes,&mut materials,Vec3::new(0.7,5.6,0.7),p,Color::srgb(0.10,0.075,0.06));
        commands.spawn((Mesh3d(meshes.add(Sphere::new(2.8).mesh().ico(1).unwrap())),MeshMaterial3d(materials.add(Color::srgb(0.065,0.10,0.08))),Transform::from_translation(p+Vec3::Y*3.).with_scale(Vec3::new(1.4,0.6,1.2)))); }
    for x in [-5.,5.] { block(&mut commands,&mut meshes,&mut materials,Vec3::new(1.3,5.,1.3),Vec3::new(x,2.5,-11.),Color::srgb(0.25,0.24,0.20)); }
    block(&mut commands,&mut meshes,&mut materials,Vec3::new(11.3,0.7,1.3),Vec3::new(0.,5.,-11.),Color::srgb(0.25,0.24,0.20));
    for (i,p) in [Vec3::new(-7.,1.8,4.),Vec3::new(7.,1.8,4.),Vec3::new(-5.,1.8,-8.),Vec3::new(5.,1.8,-8.)].into_iter().enumerate() {
        block(&mut commands,&mut meshes,&mut materials,Vec3::new(0.5,1.8,0.5),p-Vec3::Y*0.9,Color::srgb(0.19,0.18,0.17));
        commands.spawn((PointLight { color:Color::srgb(1.,0.39,0.10), intensity:100_000., range:13., shadows_enabled:true, ..default() },Transform::from_translation(p),Torch(i as f32)));
        commands.spawn((Mesh3d(meshes.add(Sphere::new(0.18))),MeshMaterial3d(materials.add(StandardMaterial { emissive:LinearRgba::new(9.,2.,0.15,1.),..default() })),Transform::from_translation(p)));
    }
    commands.spawn((DirectionalLight { illuminance:250.,color:Color::srgb(0.45,0.58,0.85),shadows_enabled:true,..default() },Transform::from_rotation(Quat::from_euler(EulerRot::XYZ,-0.8,-0.5,0.))));
    let camera=commands.spawn((Camera3d::default(),Transform::from_xyz(0.,1.7,9.),Player,SpatialListener::new(0.2),DistanceFog { color:Color::srgb(0.055,0.07,0.085),falloff:FogFalloff::Linear { start:5.,end: 30. },..default() })).id();
    // Optional authored Blender assets: --blender. Procedural fallback stays runnable without Blender.
    if std::env::args().any(|a| a=="--blender") {
        let gun=commands.spawn((SceneRoot(assets.load(GltfAssetLabel::Scene(0).from_asset("models/weapon.glb"))),Transform::from_xyz(0.28,-0.35,-0.65).with_scale(Vec3::splat(0.55)),Weapon)).id();
        commands.entity(camera).add_child(gun);
    } else {
        let gun=commands.spawn((Transform::from_xyz(0.28,-0.35,-0.65),Visibility::default(),Weapon)).id();
        commands.entity(camera).add_child(gun);
        for x in [-0.09,0.09] {
            let barrel=commands.spawn((Mesh3d(meshes.add(Cylinder::new(0.075,0.75))),MeshMaterial3d(materials.add(StandardMaterial { base_color:Color::srgb(0.16,0.18,0.20),metallic:0.85,perceptual_roughness:0.32,..default() })),Transform::from_xyz(x,0.,-0.15).with_rotation(Quat::from_rotation_x(PI/2.)))).id(); commands.entity(gun).add_child(barrel);
            for z in [-0.4,-0.15,0.1] { let band=block(&mut commands,&mut meshes,&mut materials,Vec3::new(0.18,0.17,0.035),Vec3::new(x,0.,z),Color::srgb(0.55,0.36,0.10));commands.entity(gun).add_child(band); }
        }
        let stock=block(&mut commands,&mut meshes,&mut materials,Vec3::new(0.23,0.23,0.45),Vec3::new(0.,-0.13,0.30),Color::srgb(0.23,0.10,0.04));commands.entity(gun).add_child(stock);
    }
    let enemy=commands.spawn((Transform::from_xyz(0.,0.,-8.),Visibility::default(),Enemy)).id();
    if std::env::args().any(|a| a=="--blender") { let model=commands.spawn(SceneRoot(assets.load(GltfAssetLabel::Scene(0).from_asset("models/enemy.glb")))).id();commands.entity(enemy).add_child(model); }
    else {
        for (size,pos) in [(Vec3::new(0.8,1.,0.4),Vec3::new(0.,1.25,0.)),(Vec3::splat(0.38),Vec3::new(0.,2.,0.)),(Vec3::new(0.23,0.8,0.25),Vec3::new(-0.24,0.4,0.)),(Vec3::new(0.23,0.8,0.25),Vec3::new(0.24,0.4,0.))] {let part=block(&mut commands,&mut meshes,&mut materials,size,pos,Color::srgb(0.19,0.22,0.23));commands.entity(enemy).add_child(part);}
    }
    let rain_mesh=meshes.add(Cuboid::new(0.015,0.3,0.015));let rain_mat=materials.add(StandardMaterial { base_color:Color::srgba(0.58,0.69,0.76,0.35),alpha_mode:AlphaMode::Blend,unlit:true,..default() });
    for i in 0..350 {commands.spawn((Mesh3d(rain_mesh.clone()),MeshMaterial3d(rain_mat.clone()),Transform::from_xyz(((i*73)%400) as f32/10.-20.,(i%90) as f32/10.,((i*113)%400) as f32/10.-20.),Rain));}
    commands.spawn((Text::new(""),TextFont {font_size:20.,..default()},Node {position_type:PositionType::Absolute,left:Val::Px(18.),top:Val::Px(16.),..default()},Hud));
    commands.spawn((Text::new("+"),TextFont {font_size:24.,..default()},Node {position_type:PositionType::Absolute,left:Val::Percent(50.),top:Val::Percent(50.),..default()}));
}
fn controls(time:Res<Time>, keys:Res<ButtonInput<KeyCode>>, mouse:Res<ButtonInput<MouseButton>>, motion:Res<AccumulatedMouseMotion>,mut windows:Query<&mut Window,With<PrimaryWindow>>,mut players:Query<&mut Transform,With<Player>>,mut game:ResMut<Game>,mut sinks:Query<&mut AudioSink>,mut spatial_sinks:Query<&mut SpatialAudioSink>) {
    let Ok(mut window)=windows.single_mut() else{return;};
    if mouse.just_pressed(MouseButton::Left) {window.cursor_options.grab_mode=CursorGrabMode::Locked;window.cursor_options.visible=false;}
    if keys.just_pressed(KeyCode::Escape) {window.cursor_options.grab_mode=CursorGrabMode::None;window.cursor_options.visible=true;}
    if keys.just_pressed(KeyCode::KeyM) {game.muted=!game.muted;for mut sink in &mut sinks {if game.muted {sink.pause();} else {sink.play();}}for mut sink in &mut spatial_sinks {if game.muted {sink.pause();} else {sink.play();}}}
    if keys.just_pressed(KeyCode::KeyR) {*game=Game::default();if let Ok(mut p)=players.single_mut(){*p=Transform::from_xyz(0.,1.7,9.);}}
    if window.cursor_options.grab_mode!=CursorGrabMode::Locked || game.hp<=0. || game.enemy_hp<=0 {return;}
    game.yaw-=motion.delta.x*0.002;game.pitch=(game.pitch-motion.delta.y*0.002).clamp(-1.35,1.35);
    if let Ok(mut p)=players.single_mut(){p.rotation=Quat::from_euler(EulerRot::YXZ,game.yaw,game.pitch,0.);let mut d=Vec3::ZERO;
        if keys.pressed(KeyCode::KeyW){d.z-=1.;}if keys.pressed(KeyCode::KeyS){d.z+=1.;}if keys.pressed(KeyCode::KeyA){d.x-=1.;}if keys.pressed(KeyCode::KeyD){d.x+=1.;}
        let movement=Quat::from_rotation_y(game.yaw)*d.normalize_or_zero()*time.delta_secs()*if keys.pressed(KeyCode::ShiftLeft){5.5}else{3.};
        p.translation+=movement;p.translation.x=p.translation.x.clamp(-10.,10.);p.translation.z=p.translation.z.clamp(-10.,11.);
        if movement.length_squared()>0. {game.step+=time.delta_secs();}}
}
fn combat(mut commands:Commands,time:Res<Time>,mouse:Res<ButtonInput<MouseButton>>,windows:Query<&Window,With<PrimaryWindow>>,players:Query<&Transform,(With<Player>,Without<Enemy>)>,mut enemies:Query<&mut Transform,(With<Enemy>,Without<Player>)>,sounds:Res<Sounds>,mut game:ResMut<Game>) {
    let (Ok(p),Ok(mut e),Ok(w))=(players.single(),enemies.single_mut(),windows.single()) else{return;};
    if game.elapsed==0. {e.translation=Vec3::new(0.,0.,-8.);}
    if w.cursor_options.grab_mode!=CursorGrabMode::Locked || game.hp<=0. || game.enemy_hp<=0{return;}
    let dt=time.delta_secs();game.elapsed+=dt;game.cooldown=(game.cooldown-dt).max(0.);game.cue-=dt;
    let diff=p.translation-e.translation;let dist=diff.length();let forward=*p.forward();let facing=forward.dot((e.translation+Vec3::Y*1.3-p.translation).normalize());
    // Stalk faster when unseen; readable footsteps announce the approach.
    let flat=Vec3::new(diff.x,0.,diff.z).normalize_or_zero();let speed=if facing>0.85{0.5}else{1.35};
    e.translation+=flat*dt*speed;e.rotation=Quat::from_rotation_y(flat.x.atan2(flat.z));
    if dist<1.8 {game.hp=(game.hp-22.*dt).max(0.);}
    if game.step>0.48 {game.step=0.;if !game.muted {play(&mut commands,sounds.step.clone(),p.translation,0.25,0.93+(game.shots%4) as f32*0.04,false);}}
    if game.cue<=0. {game.cue=4.5+(game.elapsed*1.618).sin().abs()*6.;if !game.muted {play(&mut commands,sounds.cue.clone(),e.translation+Vec3::Y,0.5,0.85+(game.elapsed.sin()+1.)*0.1,true);if dist<7. {play(&mut commands,sounds.pulse.clone(),p.translation,0.18,1.,false);}}}
    if mouse.just_pressed(MouseButton::Left)&&game.cooldown==0. {
        game.cooldown=0.7;game.shots+=1;if !game.muted {play(&mut commands,sounds.shot.clone(),p.translation,0.4,0.96+(game.shots%3) as f32*0.04,false);}
        commands.spawn((PointLight {intensity:150_000.,range:5.,color:Color::srgb(1.,0.65,0.2),..default()},Transform::from_translation(p.translation+forward),Flash(0.06)));
        let target=e.translation+Vec3::Y*1.3;let ray=target-p.translation;let along=ray.dot(forward);let miss=(ray-forward*along).length();
        if along>0. && along<35. && miss<0.65 {game.enemy_hp-=1;if game.enemy_hp==0 && !game.muted {play(&mut commands,sounds.explosion.clone(),e.translation,0.38,1.,true);}}
    }
}
fn atmosphere(mut commands:Commands,time:Res<Time>,game:Res<Game>,mut rain:Query<&mut Transform,(With<Rain>,Without<Weapon>)>,mut weapons:Query<&mut Transform,(With<Weapon>,Without<Rain>)>,mut torches:Query<(&mut PointLight,&Torch)>,mut flashes:Query<(Entity,&mut Flash)>) {
    for mut t in &mut rain {t.translation.y-=time.delta_secs()*10.;if t.translation.y<0. {t.translation.y=9.;}}
    for (mut light,phase) in &mut torches {light.intensity=90_000.+(time.elapsed_secs()*8.+phase.0).sin()*12_000.;}
    for mut t in &mut weapons {t.translation.y=-0.35+(game.step*12.).sin()*0.012;t.translation.z=-0.65+game.cooldown*0.12;}
    for (id,mut flash) in &mut flashes {flash.0-=time.delta_secs();if flash.0<=0. {commands.entity(id).despawn();}}
}
fn update_hud(game:Res<Game>,mut hud:Query<&mut Text,With<Hud>>) {if let Ok(mut text)=hud.single_mut(){text.0=format!("BATTLE HELL  |  Vida {:.0}  |  Inimigo {}/5  |  Disparos {}\nWASD andar · Mouse mirar · Clique atirar · Shift correr\nEsc liberar mouse · R reiniciar · M áudio\n{}",game.hp,game.enemy_hp.max(0),game.shots,if game.hp<=0.{"Você foi alcançado. R para tentar novamente."}else if game.enemy_hp<=0.{"Arena concluída. R para reiniciar."}else{"Ouça os passos. Observe a floresta."});}}
