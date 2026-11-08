use basin07_core::game::BasinGamePlugin;
use bevy::prelude::*;

fn run_game() {
    App::new()
        .insert_resource(ClearColor(Color::srgb(0.035, 0.065, 0.082)))
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "BASIN 07 — Geothermal Lithium Works".into(),
                canvas: Some("#basin-canvas".into()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: false,
                ..default()
            }),
            ..default()
        }))
        .add_plugins(BasinGamePlugin)
        .run();
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    run_game();
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn main() {
    run_game();
}
