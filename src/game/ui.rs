use super::{GameMode, GameSession, GraphicsSettings};
use crate::sim::catalog::{PRODUCTS, ProductId};
use bevy::prelude::*;
use std::fmt::Write as _;

#[derive(Component)]
pub(crate) struct HudText;

#[derive(Component)]
pub(crate) struct OverlayText;

#[derive(Component)]
pub(crate) struct OverlayPanel;

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

    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                right: px(14),
                top: px(14),
                width: px(310),
                padding: UiRect::all(px(12)),
                flex_direction: FlexDirection::Column,
                row_gap: px(4),
                ..default()
            },
            BackgroundColor(Color::srgba(0.025, 0.055, 0.07, 0.82)),
        ))
        .with_children(|parent| {
            parent.spawn((
                Text::new("BUILD / CONNECT"),
                TextFont {
                    font_size: FontSize::Px(15.0),
                    ..default()
                },
                TextColor(Color::srgb(0.85, 0.74, 0.4)),
            ));
            parent.spawn((
                Text::new(
                    "1-0 place machines · F1 PLC · F2 code\n                     Click tile to build / select\n                     F3 cycles pipe · Shift-click source → target\n                     G grid · Y wellhead · U supplier\n                     J reinjection · M dispatch · Enter sell\n                     F10 Low/Standard graphics · F11 reagent · F12 order\n                     F7 compile Rhai · F5 save · F9 load\n                     WASD / arrows move · Q/E rotate · +/- zoom\n                     SPACE run/pause · ESC pause · R restart",
                ),
                TextFont {
                    font_size: FontSize::Px(12.0),
                    ..default()
                },
                TextColor(Color::srgb(0.68, 0.77, 0.76)),
            ));
        });

    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: percent(25),
                right: percent(25),
                top: percent(35),
                padding: UiRect::all(px(24)),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                row_gap: px(10),
                ..default()
            },
            BackgroundColor(Color::srgba(0.015, 0.035, 0.045, 0.94)),
            OverlayPanel,
        ))
        .with_children(|parent| {
            parent.spawn((
                Text::new("BASIN 07"),
                OverlayText,
                TextFont {
                    font_size: FontSize::Px(40.0),
                    ..default()
                },
                TextColor(Color::srgb(0.9, 0.83, 0.6)),
            ));
            parent.spawn((
                Text::new(
                    "GEOTHERMAL LITHIUM WORKS\n\n                     Build a brine-to-product plant. Every service requires a physical connection.\n\n                     Press SPACE to open the lease.",
                ),
                TextFont {
                    font_size: FontSize::Px(16.0),
                    ..default()
                },
                TextColor(Color::srgb(0.78, 0.85, 0.83)),
                TextLayout::justify(Justify::Center),
            ));
        });
}

pub fn update_hud(
    session: Res<GameSession>,
    graphics: Res<GraphicsSettings>,
    mut hud: Query<&mut Text, With<HudText>>,
    mut overlay: Query<&mut Visibility, With<OverlayPanel>>,
    mut overlay_text: Query<&mut Text, With<OverlayText>>,
) {
    // UI text changes on input or simulation ticks (2 Hz), not every render frame.
    if !session.is_changed() && !graphics.is_changed() {
        return;
    }

    let selected_id = session.selected_machine;
    let selected = selected_id.and_then(|id| session.plant.machine(id));
    let mut product_t = 0.0;
    for machine in &session.plant.machines {
        for amount in &machine.inventory_t {
            product_t += *amount;
        }
    }

    if let Ok(mut hud_text) = hud.single_mut() {
        let output = &mut hud_text.0;
        output.clear();
        let _ = write!(
            output,
            "CASH  ${:.0}\nSHIFT  {:05.1} min   SEED {}\nLiCl SPOT  ${:.0}/t\nCONTRACT  {} · {:.3}/{:.3} t · {:.0} min\nGRID  {:.1}/310 kW   PRODUCTS  {:.3} t\nGRAPHICS  {}\n",
            session.plant.cash,
            session.plant.time_minutes,
            session.seed,
            session.plant.market.price_for(ProductId::LiClEluate),
            PRODUCTS[session.plant.market.contract_product.index()].name,
            session.plant.delivered_contract_t,
            session.plant.market.contract_target_t,
            session.plant.market.contract_time_left_minutes,
            session.plant.grid_load_kw,
            product_t,
            graphics.mode.label(),
        );

        if let (Some(id), Some(machine)) = (selected_id, selected) {
            let _ = write!(
                output,
                "\nSELECTED\n#{} {} · power {} · wear {:.0}%\n\nDIAGNOSTIC\n{}",
                id,
                machine.kind.name(),
                if machine.powered { "ON" } else { "OFF" },
                machine.wear * 100.0,
                machine.alarm.as_deref().unwrap_or("No active alarm on selected machine"),
            );
        } else {
            output.push_str("\nSELECTED\nNo machine selected\n\nDIAGNOSTIC\nNo active alarm");
        }
        output.push_str("\n\n");
        output.push_str(&session.status_message);
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
    let overlay_title = match session.mode {
        GameMode::Title => "BASIN 07",
        GameMode::Paused => "PAUSED",
        GameMode::Report => "SHIFT ENDED",
        GameMode::Playing => "",
    };
    for mut text in &mut overlay_text {
        if text.0 != overlay_title {
            text.0.clear();
            text.0.push_str(overlay_title);
        }
    }
}
