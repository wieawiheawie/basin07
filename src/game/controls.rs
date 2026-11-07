use super::{CameraRig, GameMode, GameSession, kind_from_digit};
use crate::sim::catalog::{Endpoint, LineKind, MachineKind, ReagentId, ServicePort};
use crate::sim::network::GridPos;
use bevy::prelude::*;
use bevy::window::PrimaryWindow;

pub fn handle_input(
    keyboard: Res<ButtonInput<KeyCode>>,
    mouse: Res<ButtonInput<MouseButton>>,
    windows: Query<&Window, With<PrimaryWindow>>,
    cameras: Query<(&Camera, &GlobalTransform), With<MainCamera>>,
    mut session: ResMut<GameSession>,
) {
    if keyboard.just_pressed(KeyCode::Escape) {
        match session.mode {
            GameMode::Title => {}
            GameMode::Playing => {
                session.mode = GameMode::Paused;
                session.plant.paused = true;
            }
            GameMode::Paused => {
                session.mode = GameMode::Playing;
                session.plant.paused = false;
            }
            GameMode::Report => session.mode = GameMode::Paused,
        }
    }
    if keyboard.just_pressed(KeyCode::Space) {
        match session.mode {
            GameMode::Title | GameMode::Report => {
                session.mode = GameMode::Playing;
                session.plant.paused = false;
                session.status_message =
                    "Lease opened. Place a well pump and connect it to the wellhead and grid."
                        .into();
            }
            GameMode::Playing => {
                session.mode = GameMode::Paused;
                session.plant.paused = true;
            }
            GameMode::Paused => {
                session.mode = GameMode::Playing;
                session.plant.paused = false;
            }
        }
    }
    if keyboard.just_pressed(KeyCode::KeyR) {
        session.seed = session.seed.wrapping_add(1).max(1);
        *session = GameSession::new(session.seed);
        return;
    }
    if let Some(kind) = [
        KeyCode::Digit1,
        KeyCode::Digit2,
        KeyCode::Digit3,
        KeyCode::Digit4,
        KeyCode::Digit5,
        KeyCode::Digit6,
        KeyCode::Digit7,
        KeyCode::Digit8,
        KeyCode::Digit9,
        KeyCode::Digit0,
        KeyCode::F1,
        KeyCode::F2,
    ]
    .into_iter()
    .find(|key| keyboard.just_pressed(*key))
    .and_then(kind_from_digit)
    {
        session.selected_kind = kind;
        session.pending_connection = None;
        session.status_message = format!(
            "Build selected: {} (${:.0}). Click an empty tile.",
            kind.name(),
            kind.cost()
        );
    }
    if keyboard.just_pressed(KeyCode::F3) {
        session.selected_line = next_line(session.selected_line);
        session.pending_connection = None;
        session.status_message = format!(
            "Connection type: {}. Shift-click source then destination.",
            session.selected_line.name()
        );
    }
    if keyboard.just_pressed(KeyCode::F11) {
        session.selected_reagent = next_reagent(session.selected_reagent);
    }
    if keyboard.just_pressed(KeyCode::F12) {
        let selected = session.selected_machine;
        if let Some(id) = selected {
            match session.plant.buy_reagent(id, session.selected_reagent, 0.5) {
                Ok(()) => {
                    session.status_message = format!(
                        "Ordered 0.5 t {}",
                        crate::sim::catalog::REAGENTS[session.selected_reagent.index()].name
                    )
                }
                Err(err) => session.status_message = err,
            }
        } else {
            session.status_message = "Select a reagent tank before ordering.".into();
        }
    }
    if keyboard.just_pressed(KeyCode::KeyG) {
        connect_service(&mut session, ServicePort::Grid);
    }
    if keyboard.just_pressed(KeyCode::KeyY) {
        connect_service(&mut session, ServicePort::Wellhead);
    }
    if keyboard.just_pressed(KeyCode::KeyJ) {
        connect_service(&mut session, ServicePort::Reinjection);
    }
    if keyboard.just_pressed(KeyCode::KeyU) {
        connect_service(&mut session, ServicePort::Supplier);
    }
    if keyboard.just_pressed(KeyCode::KeyM) {
        connect_service(&mut session, ServicePort::Market);
    }
    if keyboard.just_pressed(KeyCode::Enter) {
        if let Some(id) = session.selected_machine {
            match session.plant.sell_product_tank(id) {
                Ok(gross) => session.status_message = format!("Dispatch completed: ${gross:.0}"),
                Err(err) => session.status_message = err,
            }
        } else {
            session.status_message = "Select a product tank to dispatch inventory.".into();
        }
    }
    if keyboard.just_pressed(KeyCode::F5) {
        session.status_message = match super::save(&session) {
            Ok(()) => "Factory saved.".into(),
            Err(e) => e,
        };
    }
    if keyboard.just_pressed(KeyCode::F9) {
        session.status_message = match super::load(&mut session) {
            Ok(()) => "Factory loaded.".into(),
            Err(e) => e,
        };
        session.selected_machine = None;
        session.pending_connection = None;
    }
    if keyboard.just_pressed(KeyCode::F7) {
        if let Some(id) = session.selected_machine {
            if session.plant.machine(id).map(|m| m.kind) == Some(MachineKind::CodeController) {
                let source = read_editor_source();
                session.status_message = match session.plant.compile_controller(id, &source) {
                    Ok(()) => "Rhai controller compiled and armed.".into(),
                    Err(e) => e,
                };
            } else {
                session.status_message = "Select a Code Controller before compiling.".into();
            }
        }
    }
    if keyboard.just_pressed(KeyCode::KeyF) {
        session.selected_line = LineKind::Power;
    }
    if keyboard.just_pressed(KeyCode::KeyK) {
        session.status_message = match session.plant.repair_leaking_lines() {
            Ok(0) => "No leaking lines need repair.".into(),
            Ok(count) => format!("Repaired {count} leaking line(s)."),
            Err(error) => error,
        };
    }

    if session.mode != GameMode::Playing || !mouse.just_pressed(MouseButton::Left) {
        return;
    }
    let Ok(window) = windows.single() else {
        return;
    };
    let Some(cursor) = window.cursor_position() else {
        return;
    };
    let Ok((camera, transform)) = cameras.single() else {
        return;
    };
    let Ok(ray) = camera.viewport_to_world(transform, cursor) else {
        return;
    };
    if ray.direction.y.abs() < 0.0001 {
        return;
    }
    let distance = -ray.origin.y / ray.direction.y;
    if distance < 0.0 {
        return;
    }
    let hit = ray.origin + *ray.direction * distance;
    let tile = world_to_tile(hit);
    if tile.x < 0 || tile.z < 0 || tile.x >= 18 || tile.z >= 14 {
        return;
    }

    if let Some(id) = session.plant.machine_at(tile) {
        session.selected_machine = Some(id);
        if keyboard.pressed(KeyCode::ShiftLeft) || keyboard.pressed(KeyCode::ShiftRight) {
            if let Some(from) = session.pending_connection.take() {
                match session.plant.connect(
                    Endpoint::Machine(from),
                    Endpoint::Machine(id),
                    session.selected_line,
                ) {
                    Ok(()) => {
                        session.status_message = format!(
                            "{} connected: #{from} → #{id}",
                            session.selected_line.name()
                        )
                    }
                    Err(error) => session.status_message = format!("Connection refused: {error:?}"),
                }
            } else {
                session.pending_connection = Some(id);
                session.status_message =
                    format!("Connection source set to #{id}. Shift-click destination.");
            }
        } else {
            session.status_message = format!(
                "Selected #{} · {}",
                id,
                session
                    .plant
                    .machine(id)
                    .map(|m| m.kind.name())
                    .unwrap_or("unknown")
            );
        }
    } else if keyboard.pressed(KeyCode::ShiftLeft) || keyboard.pressed(KeyCode::ShiftRight) {
        session.status_message = "Shift-click a machine to select a connection endpoint.".into();
    } else {
        match session.plant.place_machine(session.selected_kind, tile) {
            Ok(id) => {
                session.selected_machine = Some(id);
                session.status_message = format!("Placed {} #{id}", session.selected_kind.name());
            }
            Err(error) => session.status_message = error,
        }
    }
}

#[derive(Component)]
pub struct MainCamera;

fn connect_service(session: &mut GameSession, service: ServicePort) {
    let Some(id) = session.selected_machine else {
        session.status_message = "Select a machine first.".into();
        return;
    };
    let machine_kind = session.plant.machine(id).map(|m| m.kind);
    let (from, to, line) = match service {
        ServicePort::Grid => (
            Endpoint::Service(service),
            Endpoint::Machine(id),
            LineKind::Power,
        ),
        ServicePort::Wellhead => (
            Endpoint::Service(service),
            Endpoint::Machine(id),
            LineKind::RawBrine,
        ),
        ServicePort::Supplier => (
            Endpoint::Service(service),
            Endpoint::Machine(id),
            LineKind::ReagentSupply,
        ),
        ServicePort::Reinjection => (
            Endpoint::Machine(id),
            Endpoint::Service(service),
            LineKind::Reinjection,
        ),
        ServicePort::Market => (
            Endpoint::Machine(id),
            Endpoint::Service(service),
            LineKind::Product,
        ),
    };
    let valid_target = match service {
        ServicePort::Grid => machine_kind.is_some(),
        ServicePort::Wellhead => machine_kind == Some(MachineKind::WellPump),
        ServicePort::Supplier => machine_kind == Some(MachineKind::ReagentTank),
        ServicePort::Reinjection => machine_kind == Some(MachineKind::ReinjectionPump),
        ServicePort::Market => machine_kind == Some(MachineKind::ProductTank),
    };
    if !valid_target {
        session.status_message = "Selected machine is not compatible with this service.".into();
        return;
    }
    session.status_message = match session.plant.connect(from, to, line) {
        Ok(()) => format!("Connected {} to #{id}", line.name()),
        Err(error) => format!("Connection refused: {error:?}"),
    };
}

fn world_to_tile(point: Vec3) -> GridPos {
    let x = ((point.x + 13.5) / 1.5).floor() as i16;
    let z = ((point.z + 10.5) / 1.5).floor() as i16;
    GridPos::new(x, z)
}

fn next_line(line: LineKind) -> LineKind {
    const LINES: [LineKind; 17] = [
        LineKind::RawBrine,
        LineKind::CleanBrine,
        LineKind::SpentBrine,
        LineKind::Acid,
        LineKind::Caustic,
        LineKind::WashWater,
        LineKind::SodaAsh,
        LineKind::HydratedLime,
        LineKind::LithiumLiquor,
        LineKind::Salt,
        LineKind::Hydrogen,
        LineKind::Chlorine,
        LineKind::Steam,
        LineKind::Solid,
        LineKind::Product,
        LineKind::LogicSensor,
        LineKind::LogicActuator,
    ];
    let index = LINES.iter().position(|x| *x == line).unwrap_or(0);
    LINES[(index + 1) % LINES.len()]
}

fn next_reagent(reagent: ReagentId) -> ReagentId {
    match reagent {
        ReagentId::HydrochloricAcid => ReagentId::SodiumHydroxide,
        ReagentId::SodiumHydroxide => ReagentId::SodaAsh,
        ReagentId::SodaAsh => ReagentId::HydratedLime,
        ReagentId::HydratedLime => ReagentId::Water,
        ReagentId::Water => ReagentId::HydrochloricAcid,
    }
}

#[cfg(target_arch = "wasm32")]
fn read_editor_source() -> String {
    use wasm_bindgen::JsCast;
    web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.get_element_by_id("controller-code"))
        .and_then(|e| e.dyn_into::<web_sys::HtmlTextAreaElement>().ok())
        .map(|e| e.value())
        .unwrap_or_else(|| crate::sim::controller::starter_script().to_owned())
}
#[cfg(not(target_arch = "wasm32"))]
fn read_editor_source() -> String {
    std::fs::read_to_string("controller.rhai")
        .unwrap_or_else(|_| crate::sim::controller::starter_script().to_owned())
}

pub fn update_camera(
    time: Res<Time>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut rig: ResMut<CameraRig>,
    mut camera: Query<&mut Transform, With<MainCamera>>,
) {
    let dt = time.delta_secs();
    let move_speed = 12.0 * dt;
    let forward = Vec3::new(rig.yaw.sin(), 0.0, rig.yaw.cos());
    let right = Vec3::new(forward.z, 0.0, -forward.x);
    if keyboard.pressed(KeyCode::ArrowUp) || keyboard.pressed(KeyCode::KeyW) {
        rig.target += forward * move_speed;
    }
    if keyboard.pressed(KeyCode::ArrowDown) || keyboard.pressed(KeyCode::KeyS) {
        rig.target -= forward * move_speed;
    }
    if keyboard.pressed(KeyCode::ArrowLeft) || keyboard.pressed(KeyCode::KeyA) {
        rig.target -= right * move_speed;
    }
    if keyboard.pressed(KeyCode::ArrowRight) || keyboard.pressed(KeyCode::KeyD) {
        rig.target += right * move_speed;
    }
    if keyboard.pressed(KeyCode::KeyQ) {
        rig.yaw += dt * 0.8;
    }
    if keyboard.pressed(KeyCode::KeyE) {
        rig.yaw -= dt * 0.8;
    }
    if keyboard.just_pressed(KeyCode::Minus) {
        rig.distance = (rig.distance + 3.0).min(55.0);
    }
    if keyboard.just_pressed(KeyCode::Equal) {
        rig.distance = (rig.distance - 3.0).max(14.0);
    }
    if let Ok(mut transform) = camera.single_mut() {
        let horizontal = rig.pitch.cos() * rig.distance;
        transform.translation = rig.target
            + Vec3::new(
                rig.yaw.sin() * horizontal,
                rig.pitch.sin() * rig.distance,
                rig.yaw.cos() * horizontal,
            );
        transform.look_at(rig.target, Vec3::Y);
    }
}
