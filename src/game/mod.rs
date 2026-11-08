mod controls;
mod persistence;
mod render;
mod ui;

use crate::sim::{
    catalog::{LineKind, MachineKind, ReagentId},
    plant::PlantSim,
};
use bevy::prelude::*;
use controls::{handle_input, update_camera};
use persistence::{load_plant, save_plant};
use render::{setup_scene, sync_connections, sync_machines, sync_scene_materials};
use ui::{setup_hud, update_hud};

const SIM_TICK_SECONDS: f64 = 0.5;
const SIM_TICK_MINUTES: f64 = 0.5;
const MAX_CATCH_UP_TICKS: usize = 2;

#[derive(Resource)]
pub struct GameSession {
    pub plant: PlantSim,
    pub mode: GameMode,
    pub selected_kind: MachineKind,
    pub selected_machine: Option<u32>,
    pub selected_line: LineKind,
    pub pending_connection: Option<u32>,
    pub selected_reagent: ReagentId,
    pub seed: u64,
    pub status_message: String,
}

impl GameSession {
    fn new(seed: u64) -> Self {
        Self {
            plant: PlantSim::new(seed),
            mode: GameMode::Title,
            selected_kind: MachineKind::WellPump,
            selected_machine: None,
            selected_line: LineKind::RawBrine,
            pending_connection: None,
            selected_reagent: ReagentId::HydrochloricAcid,
            seed,
            status_message: "Press SPACE to open the lease and begin.".into(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GameMode {
    Title,
    Playing,
    Paused,
    Report,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum GraphicsMode {
    Low,
    Standard,
}

impl GraphicsMode {
    pub(crate) const fn label(self) -> &'static str {
        match self {
            Self::Low => "LOW",
            Self::Standard => "STANDARD",
        }
    }
}

#[derive(Resource)]
pub(crate) struct GraphicsSettings {
    pub(crate) mode: GraphicsMode,
}

impl Default for GraphicsSettings {
    fn default() -> Self {
        // Prefer the browser-friendly preset on modest devices.
        Self {
            mode: GraphicsMode::Low,
        }
    }
}

#[derive(Resource, Default)]
pub(crate) struct SimulationClock {
    accumulator_seconds: f64,
}

#[derive(Resource)]
pub(crate) struct CameraRig {
    pub target: Vec3,
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
}

impl Default for CameraRig {
    fn default() -> Self {
        Self {
            target: Vec3::ZERO,
            yaw: 0.78,
            pitch: 0.72,
            distance: 31.0,
        }
    }
}

pub struct BasinGamePlugin;

impl Plugin for BasinGamePlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(GameSession::new(7_071))
            .init_resource::<CameraRig>()
            .init_resource::<GraphicsSettings>()
            .init_resource::<SimulationClock>()
            .add_systems(Startup, (setup_scene, setup_hud))
            .add_systems(
                Update,
                (
                    handle_input,
                    update_camera,
                    advance_simulation,
                    sync_scene_materials,
                    sync_machines,
                    sync_connections,
                    update_hud,
                )
                    .chain(),
            );
    }
}

fn advance_simulation(
    time: Res<Time>,
    mut clock: ResMut<SimulationClock>,
    mut session: ResMut<GameSession>,
) {
    if session.mode != GameMode::Playing || session.plant.paused {
        return;
    }

    // Two fixed simulation ticks per second. Rendering stays independent.
    clock.accumulator_seconds += time.delta_secs_f64();
    let mut ticks = 0;
    while clock.accumulator_seconds >= SIM_TICK_SECONDS && ticks < MAX_CATCH_UP_TICKS {
        session.plant.step(SIM_TICK_MINUTES);
        clock.accumulator_seconds -= SIM_TICK_SECONDS;
        ticks += 1;
    }

    // Drop excess backlog after a suspended tab instead of running a large catch-up burst.
    if ticks == MAX_CATCH_UP_TICKS {
        clock.accumulator_seconds = clock.accumulator_seconds.min(SIM_TICK_SECONDS);
    }

    if ticks > 0 && session.plant.cash <= 0.0 && session.plant.total_products_t() <= 0.0001 {
        session.mode = GameMode::Report;
        session.plant.paused = true;
        session.status_message = "The site is insolvent. Review the plant, then restart.".into();
    }
}

pub(crate) fn kind_from_digit(key: KeyCode) -> Option<MachineKind> {
    match key {
        KeyCode::Digit1 => Some(MachineKind::WellPump),
        KeyCode::Digit2 => Some(MachineKind::Pretreatment),
        KeyCode::Digit3 => Some(MachineKind::AdsorptionBed),
        KeyCode::Digit4 => Some(MachineKind::ReagentTank),
        KeyCode::Digit5 => Some(MachineKind::ProductTank),
        KeyCode::Digit6 => Some(MachineKind::Carbonator),
        KeyCode::Digit7 => Some(MachineKind::LithiumHydroxideConverter),
        KeyCode::Digit8 => Some(MachineKind::ChlorAlkaliCell),
        KeyCode::Digit9 => Some(MachineKind::AcidSynthesizer),
        KeyCode::Digit0 => Some(MachineKind::ReinjectionPump),
        KeyCode::F1 => Some(MachineKind::PresetController),
        KeyCode::F2 => Some(MachineKind::CodeController),
        _ => None,
    }
}

pub(crate) fn save(session: &GameSession) -> Result<(), String> {
    save_plant(&session.plant)
}

pub(crate) fn load(session: &mut GameSession) -> Result<(), String> {
    let plant = load_plant()?;
    session.seed = plant.seed;
    session.plant = plant;
    Ok(())
}
