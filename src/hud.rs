use bevy::prelude::*;

use crate::{enemy::Waves, player::Gun, Game, Phase, WAVE_COUNT};

#[derive(Component)]
struct HpFill;
#[derive(Component)]
struct ArmorFill;
#[derive(Component)]
struct HpText;
#[derive(Component)]
struct ArmorText;
#[derive(Component)]
struct Shell(u8);
#[derive(Component)]
struct AmmoText;
#[derive(Component)]
struct WaveText;
#[derive(Component)]
struct TimerText;
#[derive(Component)]
struct Banner;
#[derive(Component)]
struct SubBanner;
#[derive(Component)]
struct Cross;
#[derive(Component)]
struct Vignette;

const PANEL: Color = Color::srgba(0.03, 0.025, 0.03, 0.72);
const EDGE: Color = Color::srgba(0.55, 0.4, 0.2, 0.55);
const BRASS: Color = Color::srgb(0.85, 0.62, 0.25);

fn text(value: &str, size: f32, color: Color) -> (Text, TextFont, TextColor) {
    (
        Text::new(value),
        TextFont {
            font_size: size,
            ..default()
        },
        TextColor(color),
    )
}

fn bar(
    parent: &mut ChildSpawnerCommands,
    label: &str,
    fill: Color,
    marker: impl Component,
    value: impl Component,
) {
    parent
        .spawn(Node {
            flex_direction: FlexDirection::Row,
            align_items: AlignItems::Center,
            column_gap: Val::Px(10.0),
            ..default()
        })
        .with_children(|row| {
            row.spawn((
                text(label, 14.0, Color::srgb(0.8, 0.75, 0.65)),
                Node {
                    width: Val::Px(70.0),
                    ..default()
                },
            ));
            row.spawn((
                Node {
                    width: Val::Px(230.0),
                    height: Val::Px(14.0),
                    border: UiRect::all(Val::Px(1.0)),
                    ..default()
                },
                BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.6)),
                BorderColor(EDGE),
            ))
            .with_children(|b| {
                b.spawn((
                    Node {
                        width: Val::Percent(100.0),
                        height: Val::Percent(100.0),
                        ..default()
                    },
                    BackgroundColor(fill),
                    marker,
                ));
            });
            row.spawn((text("100", 18.0, Color::WHITE), value));
        });
}

fn setup(mut commands: Commands) {
    commands.spawn((
        Node {
            position_type: PositionType::Absolute,
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            ..default()
        },
        BackgroundColor(Color::NONE),
        Vignette,
    ));

    // Crosshair: four short ticks around the centre.
    for (x, y, w, h) in [
        (-14.0, -1.0, 8.0, 2.0),
        (6.0, -1.0, 8.0, 2.0),
        (-1.0, -14.0, 2.0, 8.0),
        (-1.0, 6.0, 2.0, 8.0),
    ] {
        commands.spawn((
            Node {
                position_type: PositionType::Absolute,
                left: Val::Percent(50.0),
                top: Val::Percent(50.0),
                width: Val::Px(w),
                height: Val::Px(h),
                margin: UiRect {
                    left: Val::Px(x),
                    top: Val::Px(y),
                    ..default()
                },
                ..default()
            },
            BackgroundColor(Color::srgba(1.0, 1.0, 1.0, 0.7)),
            Cross,
        ));
    }

    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(24.0),
                bottom: Val::Px(24.0),
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(8.0),
                padding: UiRect::all(Val::Px(12.0)),
                border: UiRect::all(Val::Px(1.0)),
                ..default()
            },
            BackgroundColor(PANEL),
            BorderColor(EDGE),
            BorderRadius::all(Val::Px(4.0)),
        ))
        .with_children(|p| {
            bar(p, "VIDA", Color::srgb(0.72, 0.1, 0.08), HpFill, HpText);
            bar(
                p,
                "ARMADURA",
                Color::srgb(0.45, 0.55, 0.68),
                ArmorFill,
                ArmorText,
            );
        });

    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                right: Val::Px(24.0),
                bottom: Val::Px(24.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::FlexEnd,
                row_gap: Val::Px(6.0),
                padding: UiRect::all(Val::Px(12.0)),
                border: UiRect::all(Val::Px(1.0)),
                ..default()
            },
            BackgroundColor(PANEL),
            BorderColor(EDGE),
            BorderRadius::all(Val::Px(4.0)),
        ))
        .with_children(|p| {
            p.spawn(text(
                "ESCOPETA DE CANO DUPLO",
                13.0,
                Color::srgb(0.8, 0.75, 0.65),
            ));
            p.spawn(Node {
                flex_direction: FlexDirection::Row,
                column_gap: Val::Px(8.0),
                align_items: AlignItems::Center,
                ..default()
            })
            .with_children(|row| {
                row.spawn((text("", 16.0, BRASS), AmmoText));
                for i in 0..2 {
                    row.spawn((
                        Node {
                            width: Val::Px(14.0),
                            height: Val::Px(36.0),
                            border: UiRect::all(Val::Px(1.0)),
                            ..default()
                        },
                        BackgroundColor(Color::srgb(0.7, 0.12, 0.08)),
                        BorderColor(BRASS),
                        BorderRadius::top(Val::Px(3.0)),
                        Shell(i),
                    ));
                }
            });
        });

    commands
        .spawn(Node {
            position_type: PositionType::Absolute,
            top: Val::Px(18.0),
            width: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            align_items: AlignItems::Center,
            ..default()
        })
        .with_children(|p| {
            p.spawn((text("", 22.0, Color::srgb(0.92, 0.85, 0.7)), WaveText));
            p.spawn((text("", 16.0, Color::srgb(0.75, 0.7, 0.62)), TimerText));
        });

    commands
        .spawn(Node {
            position_type: PositionType::Absolute,
            top: Val::Percent(30.0),
            width: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            align_items: AlignItems::Center,
            row_gap: Val::Px(10.0),
            ..default()
        })
        .with_children(|p| {
            p.spawn((
                text("", 54.0, Color::srgb(0.85, 0.2, 0.1)),
                TextLayout::new_with_justify(JustifyText::Center),
                Banner,
            ));
            p.spawn((
                text("", 18.0, Color::srgb(0.85, 0.8, 0.7)),
                TextLayout::new_with_justify(JustifyText::Center),
                SubBanner,
            ));
        });
}

fn update(
    game: Res<Game>,
    gun: Res<Gun>,
    waves: Res<Waves>,
    time: Res<Time<Real>>,
    virt: Res<Time<Virtual>>,
    mut fills: ParamSet<(
        Query<&mut Node, With<HpFill>>,
        Query<&mut Node, With<ArmorFill>>,
    )>,
    mut texts: ParamSet<(
        Query<&mut Text, With<HpText>>,
        Query<&mut Text, With<ArmorText>>,
        Query<&mut Text, With<AmmoText>>,
        Query<&mut Text, With<WaveText>>,
        Query<&mut Text, With<TimerText>>,
        Query<(&mut Text, &mut TextColor), With<Banner>>,
        Query<&mut Text, With<SubBanner>>,
    )>,
    mut colors: ParamSet<(
        Query<(&Shell, &mut BackgroundColor)>,
        Query<&mut BackgroundColor, With<Cross>>,
        Query<&mut BackgroundColor, With<Vignette>>,
    )>,
) {
    if let Ok(mut n) = fills.p0().single_mut() {
        n.width = Val::Percent(game.hp.clamp(0.0, 100.0));
    }
    if let Ok(mut n) = fills.p1().single_mut() {
        n.width = Val::Percent(game.armor.clamp(0.0, 100.0));
    }
    if let Ok(mut t) = texts.p0().single_mut() {
        t.0 = format!("{:.0}", game.hp.ceil());
    }
    if let Ok(mut t) = texts.p1().single_mut() {
        t.0 = format!("{:.0}", game.armor.ceil());
    }
    if let Ok(mut t) = texts.p2().single_mut() {
        t.0 = if gun.reload > 0.0 {
            "RECARREGANDO".into()
        } else {
            String::new()
        };
    }
    if let Ok(mut t) = texts.p3().single_mut() {
        t.0 = if game.wave == 0 {
            "BATTLE HELL".into()
        } else {
            format!(
                "ONDA {} / {}   ·   RESTANTES {}",
                game.wave, WAVE_COUNT, waves.alive
            )
        };
    }
    if let Ok(mut t) = texts.p4().single_mut() {
        let s = game.elapsed as u32;
        t.0 = format!("{:02}:{:02}   ·   ABATES {}", s / 60, s % 60, game.kills);
    }
    let (banner, sub, color) = match game.phase {
        Phase::Intro => (
            "BATTLE HELL".to_string(),
            "Clique para entrar na arena\n\nWASD andar · Shift correr · Mouse mirar · Clique atirar · R recarregar\nP pausar · M som · Esc soltar o mouse".to_string(),
            Color::srgb(0.85, 0.2, 0.1),
        ),
        Phase::Countdown => (
            format!("ONDA {}", game.wave + 1),
            format!("Os mortos despertam em {:.0}", game.phase_timer.ceil()),
            Color::srgb(0.9, 0.55, 0.2),
        ),
        Phase::Fighting if game.banner > 0.0 => (format!("ONDA {}", game.wave), String::new(), Color::srgba(0.9, 0.3, 0.1, game.banner.min(1.0))),
        Phase::Fighting => (String::new(), String::new(), Color::NONE),
        Phase::Victory => (
            "VITÓRIA".to_string(),
            format!("Arena purificada em {:.0}s com {} abates.\nEnter para jogar de novo.", game.elapsed, game.kills),
            Color::srgb(0.95, 0.75, 0.3),
        ),
        Phase::Defeat => (
            "VOCÊ CAIU".to_string(),
            format!("Onda {} · {} abates.\nR ou Enter para tentar de novo.", game.wave, game.kills),
            Color::srgb(0.8, 0.08, 0.05),
        ),
    };
    let paused = virt.is_paused();
    if let Ok((mut t, mut c)) = texts.p5().single_mut() {
        t.0 = if paused { "PAUSA".into() } else { banner };
        c.0 = if paused { Color::WHITE } else { color };
    }
    if let Ok(mut t) = texts.p6().single_mut() {
        t.0 = if paused {
            "P para continuar".into()
        } else {
            sub
        };
    }
    for (shell, mut bg) in &mut colors.p0() {
        let loaded = shell.0 < gun.shells;
        bg.0 = if loaded {
            Color::srgb(0.7, 0.12, 0.08)
        } else {
            Color::srgba(0.1, 0.1, 0.1, 0.6)
        };
    }
    let hit = game.hit_marker > 0.0;
    for mut bg in &mut colors.p1() {
        bg.0 = if hit {
            Color::srgb(1.0, 0.25, 0.15)
        } else {
            Color::srgba(1.0, 1.0, 1.0, 0.7)
        };
    }
    let low = (1.0 - game.hp / 35.0).clamp(0.0, 1.0);
    let pulse = low * (0.18 + 0.1 * (time.elapsed_secs() * 4.0).sin());
    let alpha = (game.hurt * 0.35
        + pulse
        + if game.phase == Phase::Defeat {
            0.35
        } else {
            0.0
        })
    .min(0.6);
    if let Ok(mut bg) = colors.p2().single_mut() {
        bg.0 = Color::srgba(0.45, 0.0, 0.0, alpha);
    }
}

pub struct HudPlugin;

impl Plugin for HudPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup).add_systems(Update, update);
    }
}
