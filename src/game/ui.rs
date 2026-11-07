use super::{GameMode, GameSession};
use crate::sim::catalog::{PRODUCTS, ProductId};
use bevy::prelude::*;

#[derive(Component)]
struct HudText;
#[derive(Component)]
struct OverlayText;
#[derive(Component)]
struct OverlayPanel;

pub fn setup_hud(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(14),
                top: px(14),
                width: px(385),
                padding: UiRect::all(px(13)),
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                ..default()
            },
            BackgroundColor(Color::srgba(0.025, 0.055, 0.07, 0.9)),
        ))
        .with_children(|parent| {
            parent.spawn((
                Text::new("BASIN 07  /  FIELD OPERATIONS"),
                TextFont {
                    font_size: FontSize::Px(19.0),
                    ..default()
                },
                TextColor(Color::srgb(0.82, 0.9, 0.88)),
            ));
            parent.spawn((
                Text::new(""),
                HudText,
                TextFont {
                    font_size: FontSize::Px(13.5),
                    ..default()
                },
                TextColor(Color::srgb(0.75, 0.83, 0.82)),
            ));
        });
    commands.spawn((
        Node {
            position_type:PositionType::Absolute, right:px(14), top:px(14), width:px(310),
            padding:UiRect::all(px(12)), flex_direction:FlexDirection::Column,
            row_gap:px(4), ..default()
        },
        BackgroundColor(Color::srgba(0.025,0.055,0.07,0.82)),
    )).with_children(|parent| {
        parent.spawn((Text::new("BUILD / CONNECT"),TextFont{font_size:FontSize::Px(15.0),..default()},TextColor(Color::srgb(0.85,0.74,0.4))));
        parent.spawn((Text::new("1-0 place machines · F1 PLC · F2 code\nClick tile to build / select\nF3 cycles pipe · Shift-click source → target\nG grid · Y wellhead · U supplier\nJ reinjection · M dispatch · Enter sell\nF11 reagent · F12 order 0.5 t\nF7 compile Rhai · F5 save · F9 load\nWASD / arrows move · Q/E rotate · +/- zoom\nSPACE run/pause · ESC pause · R restart"),TextFont{font_size:FontSize::Px(12.0),..default()},TextColor(Color::srgb(0.68,0.77,0.76))));
    });
    commands.spawn((
        Node {
            position_type:PositionType::Absolute, left:percent(25), right:percent(25), top:percent(35),
            padding:UiRect::all(px(24)), flex_direction:FlexDirection::Column,
            align_items:AlignItems::Center, row_gap:px(10), ..default()
        },
        BackgroundColor(Color::srgba(0.015,0.035,0.045,0.94)),
        OverlayPanel,
    )).with_children(|parent| {
        parent.spawn((Text::new("BASIN 07"),OverlayText,TextFont{font_size:FontSize::Px(40.0),..default()},TextColor(Color::srgb(0.9,0.83,0.6))));
        parent.spawn((Text::new("GEOTHERMAL LITHIUM WORKS\n\nBuild a brine-to-product plant. Every service requires a physical connection.\n\nPress SPACE to open the lease."),TextFont{font_size:FontSize::Px(16.0),..default()},TextColor(Color::srgb(0.78,0.85,0.83)),TextLayout::justify(Justify::Center)));
    });
}

pub fn update_hud(
    session: Res<GameSession>,
    mut hud: Query<&mut Text, With<HudText>>,
    mut overlay: Query<&mut Visibility, With<OverlayPanel>>,
    mut overlay_text: Query<&mut Text, With<OverlayText>>,
) {
    let selected = session
        .selected_machine
        .and_then(|id| {
            session.plant.machine(id).map(|m| {
                format!(
                    "#{} {} · power {} · wear {:.0}%",
                    id,
                    m.kind.name(),
                    if m.powered { "ON" } else { "OFF" },
                    m.wear * 100.0
                )
            })
        })
        .unwrap_or_else(|| "No machine selected".into());
    let alarm = session
        .selected_machine
        .and_then(|id| session.plant.machine(id).and_then(|m| m.alarm.clone()))
        .unwrap_or_else(|| "No active alarm on selected machine".into());
    let product = session
        .plant
        .machines
        .iter()
        .map(|m| m.inventory_t.iter().sum::<f64>())
        .sum::<f64>();
    let view = format!(
        "CASH  ${:.0}\nSHIFT  {:05.1} min   SEED {}\nLiCl SPOT  ${:.0}/t\nCONTRACT  {} · {:.3}/{:.3} t · {:.0} min\nGRID  {:.1}/310 kW   PRODUCTS  {:.3} t\n\nSELECTED\n{}\n\nDIAGNOSTIC\n{}\n\n{}",
        session.plant.cash,
        session.plant.time_minutes,
        session.seed,
        session.plant.market.price_for(ProductId::LiClEluate),
        PRODUCTS[session.plant.market.contract_product.index()].name,
        session.plant.delivered_contract_t,
        session.plant.market.contract_target_t,
        session.plant.market.contract_time_left_minutes,
        session.plant.grid_load_kw,
        product,
        selected,
        alarm,
        session.status_message
    );
    for mut text in &mut hud {
        text.0 = view.clone();
    }
    let is_overlay = matches!(
        session.mode,
        GameMode::Title | GameMode::Paused | GameMode::Report
    );
    for mut visibility in &mut overlay {
        *visibility = if is_overlay {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    for mut text in &mut overlay_text {
        text.0 = match session.mode {
            GameMode::Title => "BASIN 07".into(),
            GameMode::Paused => "PAUSED".into(),
            GameMode::Report => "SHIFT ENDED".into(),
            GameMode::Playing => "".into(),
        };
    }
}
