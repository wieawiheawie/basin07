mod lexer;
mod parser;
mod water;

use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

use parser::{Command, Condition, Direction, Glossary, PipeStep, PositionExpr, Statement};
use water::{CELL_SIZE, DESK_SIZE, FlowBuffers, GRID_CELLS, GRID_SIZE};

const FIXED_STEP: f32 = 1.0 / 60.0;
const OBJECT_MATRIX_STRIDE: usize = 16;
const INITIAL_BOTTLE_VOLUME: f32 = 0.14;
const INITIAL_BARREL_VOLUME: f32 = 0.75;
const ACTION_IDS: [&str; 12] = [
    "action.carve",
    "action.uncap",
    "action.tap",
    "action.tip",
    "action.upright",
    "action.look",
    "action.paint",
    "action.roll_east",
    "action.shift_down",
    "action.help",
    "action.list",
    "action.set_colour",
];

#[derive(Clone, Copy, PartialEq)]
enum ObjectKind {
    Bottle,
    Book,
    Pencil,
    Garden,
    Table,
    Stool,
    Tankard,
    Mug,
    BreadBasket,
    CheeseWheel,
    Barrel,
    Crate,
    Sack,
    Candle,
    Lantern,
    PlankFloor,
}

struct WorldObject {
    name: &'static str,
    kind: ObjectKind,
    x: f32,
    z: f32,
    cap_on: bool,
    volume: f32,
    tilt: f32,
    target_tilt: f32,
    yaw: f32,
    colour_index: u8,
}

struct Person {
    x: f32,
    z: f32,
    heading: f32,
    wetness: f32,
    wander_timer: f32,
    seed: u32,
    target_x: f32,
    target_z: f32,
    seat_target: bool,
    at_tavern: bool,
    seated: bool,
}

#[derive(Clone, Copy)]
struct RigidBody {
    vx: f32,
    vz: f32,
    mass: f32,
    friction: f32,
    restitution: f32,
}

impl RigidBody {
    fn for_object(kind: ObjectKind) -> Self {
        if kind == ObjectKind::Pencil {
            Self { vx: 0.0, vz: 0.0, mass: 0.008, friction: 0.72, restitution: 0.48 }
        } else {
            Self { vx: 0.0, vz: 0.0, mass: f32::INFINITY, friction: 1.0, restitution: 0.0 }
        }
    }
}

#[derive(Clone)]
struct WhenListener {
    condition: Condition,
    commands: Vec<Command>,
    was_true: bool,
}

#[wasm_bindgen]
pub struct Simulation {
    height: Vec<f32>,
    water: Vec<f32>,
    flow: FlowBuffers,
    terrain_positions: Vec<f32>,
    terrain_normals: Vec<f32>,
    water_positions: Vec<f32>,
    water_normals: Vec<f32>,
    objects: Vec<WorldObject>,
    object_transforms: Vec<f32>,
    object_colours: Vec<u8>,
    bodies: Vec<RigidBody>,
    people: Vec<Person>,
    people_buffer: Vec<f32>,
    glossary: Glossary,
    discovered: Vec<String>,
    queue: VecDeque<String>,
    action_queue: VecDeque<Command>,
    aliases: Vec<(String, String)>,
    listeners: Vec<WhenListener>,
    accumulator: f32,
    elapsed: f32,
    energy: f32,
    cooldown: f32,
    last_result: String,
    result_sequence: u32,
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Simulation {
        let objects = vec![
            WorldObject {
                name: "bottle_1", kind: ObjectKind::Bottle, x: 2.0, z: 7.3,
                cap_on: true, volume: INITIAL_BOTTLE_VOLUME, tilt: 0.0, target_tilt: 0.0, yaw: 0.0, colour_index: 0,
            },
            WorldObject {
                name: "bottle_2", kind: ObjectKind::Bottle, x: 8.0, z: 2.2,
                cap_on: true, volume: INITIAL_BOTTLE_VOLUME, tilt: 0.0, target_tilt: 0.0, yaw: 3.0, colour_index: 0,
            },
            WorldObject {
                name: "book_1", kind: ObjectKind::Book, x: 3.2, z: 2.4,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.2, colour_index: 0,
            },
            WorldObject {
                name: "book_2", kind: ObjectKind::Book, x: 3.0, z: 7.5,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.45, colour_index: 0,
            },
            WorldObject {
                name: "book_3", kind: ObjectKind::Book, x: 8.9, z: 5.9,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.8, colour_index: 0,
            },
            WorldObject {
                name: "pencil_1", kind: ObjectKind::Pencil, x: 1.3, z: 4.3,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.2, colour_index: 0,
            },
            WorldObject {
                name: "pencil_2", kind: ObjectKind::Pencil, x: 2.2, z: 4.8,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.5, colour_index: 0,
            },
            WorldObject {
                name: "pencil_3", kind: ObjectKind::Pencil, x: 7.5, z: 4.0,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.9, colour_index: 0,
            },
            WorldObject {
                name: "pencil_4", kind: ObjectKind::Pencil, x: 8.6, z: 4.8,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.1, colour_index: 0,
            },
            WorldObject {
                name: "garden", kind: ObjectKind::Garden, x: 5.0, z: 5.0,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.0, colour_index: 0,
            },
            WorldObject { name: "plank_floor_1", kind: ObjectKind::PlankFloor, x: 7.6, z: 7.7, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.0 , colour_index: 0 },
            WorldObject { name: "table_1", kind: ObjectKind::Table, x: 7.6, z: 7.7, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.0 , colour_index: 0 },
            WorldObject { name: "stool_1", kind: ObjectKind::Stool, x: 7.6, z: 6.95, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.0, colour_index: 0 },
            WorldObject { name: "stool_2", kind: ObjectKind::Stool, x: 6.65, z: 7.7, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: std::f32::consts::FRAC_PI_2, colour_index: 0 },
            WorldObject { name: "stool_3", kind: ObjectKind::Stool, x: 8.55, z: 7.7, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: std::f32::consts::FRAC_PI_2, colour_index: 0 },
            WorldObject { name: "tankard_1", kind: ObjectKind::Tankard, x: 7.3, z: 7.58, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.3, colour_index: 0 },
            WorldObject { name: "tankard_2", kind: ObjectKind::Tankard, x: 7.85, z: 7.58, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.4, colour_index: 0 },
            WorldObject { name: "mug_1", kind: ObjectKind::Mug, x: 7.60, z: 7.80, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.15 , colour_index: 0 },
            WorldObject { name: "bread_basket_1", kind: ObjectKind::BreadBasket, x: 7.2, z: 7.82, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.2, colour_index: 0 },
            WorldObject { name: "cheese_wheel_1", kind: ObjectKind::CheeseWheel, x: 8.0, z: 7.82, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.0, colour_index: 0 },
            WorldObject { name: "candle_1", kind: ObjectKind::Candle, x: 7.6, z: 7.58, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.0, colour_index: 0 },
            WorldObject { name: "lantern_1", kind: ObjectKind::Lantern, x: 8.65, z: 6.75, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.25, colour_index: 0 },
            WorldObject { name: "barrel_1", kind: ObjectKind::Barrel, x: 5.55, z: 6.25, cap_on: true, volume: INITIAL_BARREL_VOLUME, tilt: 0.0, target_tilt: 0.0, yaw: 0.0 , colour_index: 0 },
            WorldObject { name: "crate_1", kind: ObjectKind::Crate, x: 6.15, z: 5.45, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.2 , colour_index: 0 },
            WorldObject { name: "sack_1", kind: ObjectKind::Sack, x: 5.75, z: 5.95, cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.3 , colour_index: 0 },
        ];

        let people = vec![
            Person { x: 4.0, z: 4.0, heading: 0.3, wetness: 0.0, wander_timer: 0.2, seed: 11, target_x: 7.6, target_z: 6.95, seat_target: true, at_tavern: false, seated: false },
            Person { x: 4.7, z: 4.1, heading: 1.9, wetness: 0.0, wander_timer: 0.5, seed: 23, target_x: 6.65, target_z: 7.7, seat_target: true, at_tavern: false, seated: false },
            Person { x: 5.8, z: 4.2, heading: 2.7, wetness: 0.0, wander_timer: 0.8, seed: 37, target_x: 8.55, target_z: 7.7, seat_target: true, at_tavern: false, seated: false },
            Person { x: 5.1, z: 5.8, heading: -1.4, wetness: 0.0, wander_timer: 0.1, seed: 47, target_x: 6.45, target_z: 8.75, seat_target: false, at_tavern: false, seated: false },
            Person { x: 6.1, z: 5.4, heading: -2.1, wetness: 0.0, wander_timer: 0.6, seed: 59, target_x: 8.9, target_z: 8.45, seat_target: false, at_tavern: false, seated: false },
        ];

        let object_transforms = vec![0.0; objects.len() * OBJECT_MATRIX_STRIDE];
        let object_colours = vec![0; objects.len()];
        let bodies = objects.iter().map(|object| RigidBody::for_object(object.kind)).collect();

        let mut simulation = Simulation {
            height: vec![0.0; GRID_CELLS],
            water: vec![0.0; GRID_CELLS],
            flow: FlowBuffers::new(),
            terrain_positions: vec![0.0; GRID_CELLS * 3],
            terrain_normals: vec![0.0; GRID_CELLS * 3],
            water_positions: vec![0.0; GRID_CELLS * 3],
            water_normals: vec![0.0; GRID_CELLS * 3],
            people_buffer: vec![0.0; people.len() * 5],
            objects,
            object_transforms,
            object_colours,
            bodies,
            people,
            glossary: Glossary::default(),
            discovered: vec!["action.list".to_owned(), "action.look".to_owned()],
            queue: VecDeque::with_capacity(12),
            action_queue: VecDeque::with_capacity(32),
            aliases: Vec::with_capacity(8),
            listeners: Vec::with_capacity(4),
            accumulator: 0.0,
            elapsed: 0.0,
            energy: 100.0,
            cooldown: 0.0,
            last_result: "{\"ok\":true,\"message\":\"The desk is ready. Type list to see what lives here.\"}".to_owned(),
            result_sequence: 0,
        };
        simulation.refresh_mesh_buffers();
        simulation.sync_people_buffer();
        simulation.sync_object_transforms();
        simulation
    }

    #[wasm_bindgen(js_name = setKeyword)]
    pub fn set_keyword(&mut self, action_id: &str, display_word: &str) {
        self.glossary.set(action_id, display_word);
    }

    #[wasm_bindgen(js_name = discoverAction)]
    pub fn discover_action(&mut self, action_id: &str) {
        if ACTION_IDS.contains(&action_id) && !self.discovered.iter().any(|known| known == action_id) {
            self.discovered.push(action_id.to_owned());
        }
    }

    #[wasm_bindgen(js_name = isDiscovered)]
    pub fn is_discovered(&self, action_id: &str) -> bool {
        self.discovered.iter().any(|known| known == action_id)
    }

    #[wasm_bindgen(js_name = enqueueCommand)]
    pub fn enqueue_command(&mut self, source: &str) -> bool {
        if self.queue.len() + self.action_queue.len() >= 12 || source.trim().is_empty() {
            return false;
        }
        self.queue.push_back(source.to_owned());
        true
    }

    #[wasm_bindgen(js_name = moveObject)]
    pub fn move_object(&mut self, index: usize, x: f32, z: f32) -> bool {
        if !x.is_finite() || !z.is_finite() || index >= self.objects.len() {
            return false;
        }
        {
            let object = &mut self.objects[index];
            object.x = x.clamp(0.08, 9.92);
            object.z = z.clamp(0.08, 9.92);
        }
        if let Some(body) = self.bodies.get_mut(index) {
            body.vx = 0.0;
            body.vz = 0.0;
        }
        true
    }

    #[wasm_bindgen(js_name = uncapObject)]
    pub fn uncap_object(&mut self, index: usize) -> bool {
        let Some(object) = self.objects.get_mut(index) else {
            return false;
        };
        if object.kind != ObjectKind::Bottle || !object.cap_on {
            return false;
        }
        object.cap_on = false;
        self.discover_action("action.uncap");
        true
    }

    #[wasm_bindgen(js_name = carveStroke)]
    pub fn carve_stroke(&mut self, from_x: f32, from_z: f32, to_x: f32, to_z: f32) -> bool {
        if ![from_x, from_z, to_x, to_z].into_iter().all(f32::is_finite)
            || !(0.0..=10.0).contains(&from_x)
            || !(0.0..=10.0).contains(&from_z)
            || !(0.0..=10.0).contains(&to_x)
            || !(0.0..=10.0).contains(&to_z)
        {
            return false;
        }
        let dx = to_x - from_x;
        let dz = to_z - from_z;
        if dx * dx + dz * dz < 0.0004 || self.energy < 0.001 {
            return false;
        }
        self.energy -= 0.001;
        self.carve_line((from_x, from_z), (to_x, to_z), 0.0045, 0.14);
        self.discover_action("action.carve");
        true
    }


    pub fn tick(&mut self, frame_seconds: f32) {
        self.accumulator += frame_seconds.clamp(0.0, 0.20);
        let mut steps = 0;
        while self.accumulator >= FIXED_STEP && steps < 8 {
            self.fixed_step(FIXED_STEP);
            self.accumulator -= FIXED_STEP;
            steps += 1;
        }
        if steps == 8 {
            self.accumulator = self.accumulator.min(FIXED_STEP);
        }
    }

    #[wasm_bindgen(js_name = energy)]
    pub fn energy(&self) -> f32 {
        self.energy
    }

    #[wasm_bindgen(js_name = queueLength)]
    pub fn queue_length(&self) -> usize {
        self.queue.len() + self.action_queue.len()
    }

    #[wasm_bindgen(js_name = resultSequence)]
    pub fn result_sequence(&self) -> u32 {
        self.result_sequence
    }

    #[wasm_bindgen(js_name = lastResult)]
    pub fn last_result(&self) -> String {
        self.last_result.clone()
    }

    #[wasm_bindgen(js_name = gridSize)]
    pub fn grid_size(&self) -> usize {
        GRID_SIZE
    }

    #[wasm_bindgen(js_name = heightPtr)]
    pub fn height_ptr(&self) -> u32 {
        self.height.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = waterPtr)]
    pub fn water_ptr(&self) -> u32 {
        self.water.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = terrainPositionsPtr)]
    pub fn terrain_positions_ptr(&self) -> u32 {
        self.terrain_positions.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = terrainNormalsPtr)]
    pub fn terrain_normals_ptr(&self) -> u32 {
        self.terrain_normals.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = waterPositionsPtr)]
    pub fn water_positions_ptr(&self) -> u32 {
        self.water_positions.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = waterNormalsPtr)]
    pub fn water_normals_ptr(&self) -> u32 {
        self.water_normals.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = peoplePtr)]
    pub fn people_ptr(&self) -> u32 {
        self.people_buffer.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = objectTransformsPtr)]
    pub fn object_transforms_ptr(&self) -> u32 {
        self.object_transforms.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = objectColoursPtr)]
    pub fn object_colours_ptr(&self) -> u32 {
        self.object_colours.as_ptr() as usize as u32
    }

    #[wasm_bindgen(js_name = peopleCount)]
    pub fn people_count(&self) -> usize {
        self.people.len()
    }

    #[wasm_bindgen(js_name = objectCount)]
    pub fn object_count(&self) -> usize {
        self.objects.len()
    }

    #[wasm_bindgen(js_name = objectName)]
    pub fn object_name(&self, index: usize) -> String {
        self.objects.get(index).map(|object| object.name).unwrap_or("").to_owned()
    }

    #[wasm_bindgen(js_name = objectKind)]
    pub fn object_kind(&self, index: usize) -> String {
        self.objects
            .get(index)
            .map(|object| match object.kind {
                ObjectKind::Bottle => "bottle",
                ObjectKind::Book => "book",
                ObjectKind::Pencil => "pencil",
                ObjectKind::Garden => "garden",
                ObjectKind::Table => "table",
                ObjectKind::Stool => "stool",
                ObjectKind::Tankard => "tankard",
                ObjectKind::Mug => "mug",
                ObjectKind::BreadBasket => "bread_basket",
                ObjectKind::CheeseWheel => "cheese_wheel",
                ObjectKind::Barrel => "barrel",
                ObjectKind::Crate => "crate",
                ObjectKind::Sack => "sack",
                ObjectKind::Candle => "candle",
                ObjectKind::Lantern => "lantern",
                ObjectKind::PlankFloor => "plank_floor",
            })
            .unwrap_or("")
            .to_owned()
    }

    #[wasm_bindgen(js_name = objectX)]
    pub fn object_x(&self, index: usize) -> f32 {
        self.objects.get(index).map(|object| object.x).unwrap_or(0.0)
    }

    #[wasm_bindgen(js_name = objectZ)]
    pub fn object_z(&self, index: usize) -> f32 {
        self.objects.get(index).map(|object| object.z).unwrap_or(0.0)
    }

    #[wasm_bindgen(js_name = objectCapOn)]
    pub fn object_cap_on(&self, index: usize) -> bool {
        self.objects.get(index).is_some_and(|object| object.cap_on)
    }

    #[wasm_bindgen(js_name = objectTilt)]
    pub fn object_tilt(&self, index: usize) -> f32 {
        self.objects.get(index).map(|object| object.tilt).unwrap_or(0.0)
    }

    #[wasm_bindgen(js_name = objectYaw)]
    pub fn object_yaw(&self, index: usize) -> f32 {
        self.objects.get(index).map(|object| object.yaw).unwrap_or(0.0)
    }

    #[wasm_bindgen(js_name = objectVolume)]
    pub fn object_volume(&self, index: usize) -> f32 {
        self.objects.get(index).map(|object| object.volume).unwrap_or(0.0)
    }

    #[wasm_bindgen(js_name = objectColour)]
    pub fn object_colour(&self, index: usize) -> u8 {
        self.objects.get(index).map(|object| object.colour_index).unwrap_or(0)
    }

    #[wasm_bindgen(js_name = objectVelocityX)]
    pub fn object_velocity_x(&self, index: usize) -> f32 {
        self.bodies.get(index).map(|body| body.vx).unwrap_or(0.0)
    }

    #[wasm_bindgen(js_name = objectVelocityZ)]
    pub fn object_velocity_z(&self, index: usize) -> f32 {
        self.bodies.get(index).map(|body| body.vz).unwrap_or(0.0)
    }

    #[wasm_bindgen(js_name = waterVolume)]
    pub fn water_volume(&self) -> f32 {
        water::total_volume(&self.water)
    }

}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = wasmMemory)]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

impl Default for Simulation {
    fn default() -> Self {
        Self::new()
    }
}

impl Simulation {
    fn fixed_step(&mut self, dt: f32) {
        self.elapsed += dt;
        self.energy = (self.energy + dt * 1.4).min(100.0);
        self.cooldown = (self.cooldown - dt).max(0.0);

        {
            let (objects, water) = (&mut self.objects, &mut self.water);
            for object in objects.iter_mut().filter(|object| object.kind == ObjectKind::Bottle) {
                let difference = object.target_tilt - object.tilt;
                object.tilt += difference.clamp(-dt * 0.65, dt * 0.65);

                if !object.cap_on && object.tilt > 0.20 && object.volume > 0.0 {
                    let tilt_ratio = (object.tilt / std::f32::consts::FRAC_PI_2).clamp(0.0, 1.0);
                    let amount = (0.045 * tilt_ratio * tilt_ratio * dt).min(object.volume);
                    object.volume = (object.volume - amount).max(0.0);
                    let pour_x = object.x + object.yaw.cos() * 0.58;
                    let pour_z = object.z + object.yaw.sin() * 0.58;
                    add_water_volume(water, pour_x, pour_z, amount);
                }
            }
            for object in objects.iter_mut().filter(|object| object.kind == ObjectKind::Barrel && !object.cap_on) {
                if object.volume > 0.0 {
                    let amount = (0.05 * dt).min(object.volume);
                    object.volume = (object.volume - amount).max(0.0);
                    add_water_volume(water, object.x, object.z, amount);
                }
            }
        }

        self.flow.step(&self.height, &mut self.water, dt, true, 0.00016);
        self.update_rigid_bodies(dt);
        self.update_listeners();
        self.update_people(dt);
        self.process_queue();
        self.refresh_mesh_buffers();
        self.sync_people_buffer();
        self.sync_object_transforms();
    }

    fn process_queue(&mut self) {
        if self.cooldown > 0.0 {
            return;
        }

        if let Some(command) = self.action_queue.pop_front() {
            let result = self.execute(command);
            self.publish_result(result);
            self.cooldown = 0.72;
            self.refresh_mesh_buffers();
            return;
        }

        let Some(source) = self.queue.pop_front() else {
            return;
        };
        let program = match parser::parse_program(&source, &self.glossary) {
            Ok(program) => program,
            Err(error) => {
                self.publish_result(Err(error));
                return;
            }
        };
        let previous_aliases = self.aliases.clone();
        let previous_listener_count = self.listeners.len();
        let mut commands = Vec::new();
        if let Err(error) = self.compile_statements(&program, &mut commands) {
            self.aliases = previous_aliases;
            self.listeners.truncate(previous_listener_count);
            self.publish_result(Err(error));
            return;
        }

        let cost: f32 = commands.iter().map(command_energy_cost).sum();
        if cost > self.energy {
            self.aliases = previous_aliases;
            self.listeners.truncate(previous_listener_count);
            self.publish_result(Err(format!(
                "This script needs {:.0} energy, but only {:.0} is available. Nothing was queued.",
                cost, self.energy
            )));
            return;
        }

        // The complete program is paid for before its first action is executed.
        self.energy -= cost;
        self.action_queue.extend(commands);
        if self.action_queue.is_empty() {
            self.publish_result(Ok("The script was registered. Persistent listeners are watching the world.".to_owned()));
        }
    }

    fn publish_result(&mut self, result: Result<String, String>) {
        let (ok, message) = match result {
            Ok(message) => (true, message),
            Err(message) => (false, message),
        };
        self.last_result = format!(
            "{{\"ok\":{},\"message\":\"{}\"}}",
            ok,
            escape_json(&message)
        );
        self.result_sequence = self.result_sequence.wrapping_add(1);
    }

    fn execute(&mut self, command: Command) -> Result<String, String> {
        match command {
            Command::List => {
                self.discover_action("action.list");
                Ok(format!(
                    "Here is everything on the desk: {}.",
                    self.objects.iter().map(|object| object.name).collect::<Vec<_>>().join(", ")
                ))
            }
            Command::Look(name) => {
                self.discover_action("action.look");
                let object = self.objects.iter().find(|object| object.name == name)
                    .ok_or_else(|| format!("I can't find '{name}'. Try list to see the names on your desk."))?;
                let state = match object.kind {
                    ObjectKind::Bottle => format!(
                        "{}, {}, {:.0}% full",
                        if object.cap_on { "cap on" } else { "uncapped" },
                        if object.tilt > 0.15 { "tipped" } else { "upright" },
                        (object.volume / INITIAL_BOTTLE_VOLUME * 100.0).clamp(0.0, 100.0)
                    ),
                    ObjectKind::Book => "closed book".to_owned(),
                    ObjectKind::Pencil => "wooden pencil".to_owned(),
                    ObjectKind::Garden => "soil and small sprouts".to_owned(),
                    ObjectKind::Table => "wooden tavern table".to_owned(),
                    ObjectKind::Stool => "tavern stool".to_owned(),
                    ObjectKind::Tankard => "empty tankard".to_owned(),
                    ObjectKind::Mug => "empty mug".to_owned(),
                    ObjectKind::BreadBasket => "bread basket".to_owned(),
                    ObjectKind::CheeseWheel => "cheese wheel".to_owned(),
                    ObjectKind::Barrel => format!(
                        "rain barrel, tap {}, {:.0}% full",
                        if object.cap_on { "closed" } else { "open" },
                        (object.volume / INITIAL_BARREL_VOLUME * 100.0).clamp(0.0, 100.0)
                    ),
                    ObjectKind::Crate => "wooden storage crate".to_owned(),
                    ObjectKind::Sack => "cloth storage sack".to_owned(),
                    ObjectKind::Candle => "lit candle".to_owned(),
                    ObjectKind::Lantern => "warm lantern".to_owned(),
                    ObjectKind::PlankFloor => "plank-floor tavern platform".to_owned(),
                };
                Ok(format!(
                    "{}: {}, position ({:.1}, {:.1}).",
                    object.name, state, object.x, object.z
                ))
            }
            Command::Help => {
                self.discover_action("action.help");
                let commands = self.discovered.iter()
                    .filter(|id| id.starts_with("action."))
                    .map(|id| self.glossary.word_for(id))
                    .collect::<Vec<_>>()
                    .join(", ");
                Ok(format!(
                    "Commands discovered so far: {commands}. Scripts also support ';', repeat N {{ ... }}, if/when garden.moisture < 20% {{ ... }}, let name = value, and object -> roll_east -> paint red."
                ))
            }
            Command::Uncap(name) => {
                let object_name = {
                    let object = self.objects.iter_mut().find(|object| object.name == name)
                        .ok_or_else(|| format!("I can't find '{name}'. Try list to see the names on your desk."))?;
                    if object.kind != ObjectKind::Bottle {
                        let uncap_word = self.glossary.word_for("action.uncap");
                        return Err(format!(
                            "{} doesn't have a cap. Try {} bottle_1 or {} bottle_2.",
                            object.name, uncap_word, uncap_word
                        ));
                    }
                    if !object.cap_on {
                        return Ok(format!("{} is already uncapped.", object.name));
                    }
                    object.cap_on = false;
                    object.name
                };
                self.discover_action("action.uncap");
                Ok(format!("The cap comes free from {object_name} and rests beside it."))
            }
            Command::Tap(name) => {
                let object_name = {
                    let object = self.objects.iter_mut().find(|object| object.name == name)
                        .ok_or_else(|| format!("I can't find '{name}'. Try list to see the names on your desk."))?;
                    if object.kind != ObjectKind::Barrel {
                        return Err(format!("{} is not a rain barrel. Try tap barrel_1.", object.name));
                    }
                    if !object.cap_on {
                        return Ok(format!("{} is already tapped and flowing.", object.name));
                    }
                    if object.volume <= 0.0001 {
                        return Err(format!("{} is empty and has no water left to release.", object.name));
                    }
                    object.cap_on = false;
                    object.name
                };
                self.discover_action("action.tap");
                Ok(format!("The tap on {object_name} opens. Water begins to flow onto the desk."))
            }
            Command::Tip { object: name, toward } => {
                let target = if let Some(toward) = toward {
                    Some(self.resolve_position(&toward)?)
                } else {
                    None
                };
                let uncap_word = self.glossary.word_for("action.uncap").to_owned();
                let object_name = {
                    let object = self.objects.iter_mut().find(|object| object.name == name)
                        .ok_or_else(|| format!("I can't find '{name}'. Try list to see the names on your desk."))?;
                    if object.kind != ObjectKind::Bottle {
                        return Err(format!("{} is not a bottle, so it cannot pour.", object.name));
                    }
                    if object.cap_on {
                        return Err(format!(
                            "{} still has its cap on. Try: {} {}.",
                            object.name, uncap_word, object.name
                        ));
                    }
                    if object.volume <= 0.0001 {
                        return Err(format!("{} is empty. It has no water left to pour.", object.name));
                    }
                    if let Some((x, z)) = target {
                        object.yaw = (z - object.z).atan2(x - object.x);
                    }
                    object.target_tilt = std::f32::consts::FRAC_PI_2;
                    object.name
                };
                self.discover_action("action.tip");
                Ok(format!("{object_name} begins to tip. Water will follow the desk's slope."))
            }
            Command::Upright(name) => {
                let object_name = {
                    let object = self.objects.iter_mut().find(|object| object.name == name)
                        .ok_or_else(|| format!("I can't find '{name}'. Try list to see the names on your desk."))?;
                    if object.kind != ObjectKind::Bottle {
                        return Err(format!("{} is not a bottle.", object.name));
                    }
                    object.target_tilt = 0.0;
                    object.name
                };
                self.discover_action("action.upright");
                Ok(format!("{object_name} is being brought upright."))
            }
            Command::Paint { object: name, colour } => {
                let index = self.objects.iter().position(|object| object.name == name)
                    .ok_or_else(|| format!("I can't find '{name}'. Try list to see the names on your desk."))?;
                if self.objects[index].kind == ObjectKind::Garden {
                    return Err("The garden itself cannot be painted; choose a movable desk object.".to_owned());
                }
                self.objects[index].colour_index = colour;
                self.discover_action("action.paint");
                Ok(format!("{name} is now painted {}.", colour_name(colour)))
            }
            Command::RollEast(name) => {
                let index = self.objects.iter().position(|object| object.name == name)
                    .ok_or_else(|| format!("I can't find '{name}'. Try list to see the names on your desk."))?;
                if self.objects[index].kind != ObjectKind::Pencil {
                    return Err(format!("{name} is not a rollable pencil."));
                }
                self.bodies[index].vx += 1.8;
                self.discover_action("action.roll_east");
                Ok(format!("{name} rolls east."))
            }
            Command::ShiftDown => {
                let mut shifted = 0;
                for object in &mut self.objects {
                    if object.kind == ObjectKind::Pencil {
                        object.z = (object.z + 0.12).clamp(0.12, 9.88);
                        shifted += 1;
                    }
                }
                self.discover_action("action.shift_down");
                Ok(format!("The loose pencils shift down the desk ({shifted} moved)."))
            }
            Command::Carve { from, to, depth, width } => {
                let start = self.resolve_position(&from)?;
                let end = self.resolve_position(&to)?;
                self.carve_line(start, end, depth, width);
                self.discover_action("action.carve");
                Ok(format!("A groove now runs from ({:.1}, {:.1}) to ({:.1}, {:.1}).", start.0, start.1, end.0, end.1))
            }
        }
    }

    fn compile_statements(&mut self, statements: &[Statement], output: &mut Vec<Command>) -> Result<(), String> {
        for statement in statements {
            match statement {
                Statement::RawCommand(source) => {
                    let expanded = self.expand_aliases(source);
                    output.push(parser::parse(&expanded, &self.glossary)?);
                }
                Statement::Pipe { object, steps } => {
                    for step in steps {
                        output.push(match step {
                            PipeStep::RollEast => Command::RollEast(object.clone()),
                            PipeStep::Paint(colour) => Command::Paint { object: object.clone(), colour: *colour },
                        });
                    }
                }
                Statement::Repeat { count, body } => {
                    for _ in 0..*count {
                        self.compile_statements(body, output)?;
                    }
                }
                Statement::If { condition, body } => {
                    // Immediate conditions are evaluated exactly once during compilation.
                    if self.condition_met(condition) {
                        self.compile_statements(body, output)?;
                    }
                }
                Statement::When { condition, body } => {
                    let mut commands = Vec::new();
                    self.compile_statements(body, &mut commands)?;
                    if !commands.is_empty() {
                        self.listeners.push(WhenListener {
                            condition: condition.clone(),
                            commands,
                            was_true: false,
                        });
                    }
                }
                Statement::Let { name, value } => {
                    if let Some((_, existing)) = self.aliases.iter_mut().find(|(key, _)| key == name) {
                        *existing = value.clone();
                    } else {
                        self.aliases.push((name.clone(), value.clone()));
                    }
                }
            }
            if output.len() > 64 {
                return Err("This script expands to more than 64 queued actions. Split it into smaller scripts.".to_owned());
            }
        }
        Ok(())
    }

    fn expand_aliases(&self, source: &str) -> String {
        let bytes = source.as_bytes();
        let mut output = String::with_capacity(source.len());
        let mut cursor = 0;
        while cursor < bytes.len() {
            if bytes[cursor].is_ascii_alphanumeric() || bytes[cursor] == b'_' {
                let start = cursor;
                cursor += 1;
                while cursor < bytes.len() && (bytes[cursor].is_ascii_alphanumeric() || bytes[cursor] == b'_') {
                    cursor += 1;
                }
                let word = &source[start..cursor];
                if let Some((_, value)) = self.aliases.iter().rev().find(|(name, _)| name == word) {
                    output.push_str(value);
                } else {
                    output.push_str(word);
                }
            } else {
                let character = source[cursor..].chars().next().unwrap_or(' ');
                output.push(character);
                cursor += character.len_utf8();
            }
        }
        output
    }

    fn condition_met(&self, condition: &Condition) -> bool {
        match condition {
            Condition::GardenMoistureBelow(threshold) => {
                let Some(garden) = self.objects.iter().find(|object| object.kind == ObjectKind::Garden) else {
                    return false;
                };
                let gx = (garden.x / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as isize;
                let gz = (garden.z / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as isize;
                let mut total = 0.0;
                let mut count = 0.0;
                for dz in -4..=4 {
                    for dx in -4..=4 {
                        let x = gx + dx;
                        let z = gz + dz;
                        if x >= 0 && z >= 0 && x < GRID_SIZE as isize && z < GRID_SIZE as isize {
                            total += self.water[z as usize * GRID_SIZE + x as usize];
                            count += 1.0;
                        }
                    }
                }
                let moisture = if count > 0.0 {
                    (total / count / 0.12 * 100.0).clamp(0.0, 100.0)
                } else {
                    0.0
                };
                moisture < *threshold
            }
        }
    }

    fn update_listeners(&mut self) {
        let mut triggered = Vec::new();
        for index in 0..self.listeners.len() {
            let condition = self.listeners[index].condition.clone();
            let met = self.condition_met(&condition);
            let was_true = self.listeners[index].was_true;
            self.listeners[index].was_true = met;
            if met && !was_true {
                triggered.extend(self.listeners[index].commands.iter().cloned());
            }
        }
        for command in triggered {
            let result = self.execute(command);
            self.publish_result(result);
        }
    }

    fn update_rigid_bodies(&mut self, dt: f32) {
        for index in 0..self.objects.len() {
            if self.objects[index].kind != ObjectKind::Pencil {
                continue;
            }

            let x = (self.objects[index].x / DESK_SIZE * (GRID_SIZE as f32 - 1.0))
                .round().clamp(1.0, (GRID_SIZE - 2) as f32) as usize;
            let z = (self.objects[index].z / DESK_SIZE * (GRID_SIZE as f32 - 1.0))
                .round().clamp(1.0, (GRID_SIZE - 2) as f32) as usize;
            let cell = z * GRID_SIZE + x;
            let slope_x = (self.height[cell + 1] - self.height[cell - 1]) / (2.0 * CELL_SIZE);
            let slope_z = (self.height[cell + GRID_SIZE] - self.height[cell - GRID_SIZE]) / (2.0 * CELL_SIZE);
            let (water_vx, water_vz) = self.flow.velocity_at(x, z);

            let body = &mut self.bodies[index];
            body.vx += (-slope_x * 0.55 + water_vx * 1.35) * dt;
            body.vz += (-slope_z * 0.55 + water_vz * 1.35) * dt;
            let damping = (1.0 - body.friction * dt).clamp(0.0, 1.0);
            body.vx *= damping;
            body.vz *= damping;

            let speed = (body.vx * body.vx + body.vz * body.vz).sqrt();
            if speed > 3.5 {
                let scale = 3.5 / speed;
                body.vx *= scale;
                body.vz *= scale;
            }

            self.objects[index].x += body.vx * dt;
            self.objects[index].z += body.vz * dt;
            if self.objects[index].x < 0.12 {
                self.objects[index].x = 0.12;
                body.vx = body.vx.abs() * body.restitution;
            } else if self.objects[index].x > 9.88 {
                self.objects[index].x = 9.88;
                body.vx = -body.vx.abs() * body.restitution;
            }
            if self.objects[index].z < 0.12 {
                self.objects[index].z = 0.12;
                body.vz = body.vz.abs() * body.restitution;
            } else if self.objects[index].z > 9.88 {
                self.objects[index].z = 9.88;
                body.vz = -body.vz.abs() * body.restitution;
            }
            if body.vx.abs() + body.vz.abs() > 0.025 {
                self.objects[index].yaw = body.vz.atan2(body.vx);
            }
        }

        // The four small pencil bodies only need a compact circle-collision pass.
        for a in 0..self.objects.len() {
            if self.objects[a].kind != ObjectKind::Pencil { continue; }
            for b in (a + 1)..self.objects.len() {
                if self.objects[b].kind != ObjectKind::Pencil { continue; }
                let dx = self.objects[b].x - self.objects[a].x;
                let dz = self.objects[b].z - self.objects[a].z;
                let distance_sq = dx * dx + dz * dz;
                let min_distance = 0.19;
                if distance_sq >= min_distance * min_distance { continue; }
                let distance = distance_sq.sqrt().max(0.0001);
                let nx = dx / distance;
                let nz = dz / distance;
                let relative = (self.bodies[b].vx - self.bodies[a].vx) * nx
                    + (self.bodies[b].vz - self.bodies[a].vz) * nz;
                let inverse_a = 1.0 / self.bodies[a].mass;
                let inverse_b = 1.0 / self.bodies[b].mass;
                if relative < 0.0 {
                    let restitution = self.bodies[a].restitution.min(self.bodies[b].restitution);
                    let impulse = -(1.0 + restitution) * relative / (inverse_a + inverse_b);
                    self.bodies[a].vx -= impulse * inverse_a * nx;
                    self.bodies[a].vz -= impulse * inverse_a * nz;
                    self.bodies[b].vx += impulse * inverse_b * nx;
                    self.bodies[b].vz += impulse * inverse_b * nz;
                }
                let overlap = min_distance - distance;
                self.objects[a].x -= nx * overlap * 0.5;
                self.objects[a].z -= nz * overlap * 0.5;
                self.objects[b].x += nx * overlap * 0.5;
                self.objects[b].z += nz * overlap * 0.5;
            }
        }
    }

    fn resolve_position(&self, position: &PositionExpr) -> Result<(f32, f32), String> {
        match position {
            PositionExpr::Coordinate(x, z) => Ok((*x, *z)),
            PositionExpr::Object(name) => self.objects.iter()
                .find(|object| object.name == name)
                .map(|object| (object.x, object.z))
                .ok_or_else(|| format!("I can't find '{name}'. Try list to see the names on your desk.")),
            PositionExpr::Direction(direction) => {
                let vector = match direction {
                    Direction::North => (0.0, -1.0),
                    Direction::East => (1.0, 0.0),
                    Direction::South => (0.0, 1.0),
                    Direction::West => (-1.0, 0.0),
                };
                Ok((5.0 + vector.0 * 5.0, 5.0 + vector.1 * 5.0))
            }
        }
    }

    fn carve_line(&mut self, start: (f32, f32), end: (f32, f32), depth: f32, width: f32) {
        let dx = end.0 - start.0;
        let dz = end.1 - start.1;
        let length_sq = dx * dx + dz * dz;
        let radius = (width * 0.5).max(CELL_SIZE * 0.5);
        let reach = radius * 1.15;
        let sigma = (radius * 0.48).max(CELL_SIZE * 0.35);
        let min_x = ((start.0.min(end.0) - reach) / DESK_SIZE * (GRID_SIZE as f32 - 1.0))
            .floor().clamp(0.0, (GRID_SIZE - 1) as f32) as usize;
        let max_x = ((start.0.max(end.0) + reach) / DESK_SIZE * (GRID_SIZE as f32 - 1.0))
            .ceil().clamp(0.0, (GRID_SIZE - 1) as f32) as usize;
        let min_z = ((start.1.min(end.1) - reach) / DESK_SIZE * (GRID_SIZE as f32 - 1.0))
            .floor().clamp(0.0, (GRID_SIZE - 1) as f32) as usize;
        let max_z = ((start.1.max(end.1) + reach) / DESK_SIZE * (GRID_SIZE as f32 - 1.0))
            .ceil().clamp(0.0, (GRID_SIZE - 1) as f32) as usize;
        let sigma_sq_twice = 2.0 * sigma * sigma;

        // Evaluate one nearest point per grid vertex. This avoids overlapping brush stamps
        // along the stroke and gives the cut a continuous Gaussian cross-section.
        for grid_z in min_z..=max_z {
            let world_z = grid_z as f32 * CELL_SIZE;
            for grid_x in min_x..=max_x {
                let world_x = grid_x as f32 * CELL_SIZE;
                let t = if length_sq > 0.000001 {
                    (((world_x - start.0) * dx + (world_z - start.1) * dz) / length_sq).clamp(0.0, 1.0)
                } else {
                    0.0
                };
                let nearest_x = start.0 + dx * t;
                let nearest_z = start.1 + dz * t;
                let distance_sq = (world_x - nearest_x).powi(2) + (world_z - nearest_z).powi(2);
                if distance_sq > reach * reach {
                    continue;
                }
                let gaussian = (-distance_sq / sigma_sq_twice).exp();
                let index = grid_z * GRID_SIZE + grid_x;
                self.height[index] = (self.height[index] - depth * gaussian).max(-1.2);
            }
        }
    }

    fn update_people(&mut self, dt: f32) {
        let (people, water) = (&mut self.people, &self.water);
        for person in people.iter_mut() {
            let gx = (person.x / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as usize;
            let gz = (person.z / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as usize;
            let current_water = water[gz.min(GRID_SIZE - 1) * GRID_SIZE + gx.min(GRID_SIZE - 1)];
            if current_water > 0.035 {
                person.wetness = 1.0;
                person.heading += std::f32::consts::PI * 0.72;
            } else {
                person.wetness = (person.wetness - dt * 0.25).max(0.0);
            }

            if !person.at_tavern {
                let dx = person.target_x - person.x;
                let dz = person.target_z - person.z;
                let distance = (dx * dx + dz * dz).sqrt();
                if distance <= 0.12 {
                    person.x = person.target_x;
                    person.z = person.target_z;
                    person.at_tavern = true;
                    person.seated = person.seat_target;
                    continue;
                }
                person.heading = dz.atan2(dx);
                let travel = (0.42 * dt).min(distance);
                person.x += person.heading.cos() * travel;
                person.z += person.heading.sin() * travel;
                continue;
            }

            if person.seated {
                continue;
            }

            person.wander_timer -= dt;
            if person.wander_timer <= 0.0 {
                person.seed = person.seed.wrapping_mul(1664525).wrapping_add(1013904223);
                person.heading += (person.seed as f32 / u32::MAX as f32 - 0.5) * 0.7;
                person.wander_timer = 1.5 + (person.seed % 100) as f32 / 90.0;
            }
        }
    }

    fn sync_object_transforms(&mut self) {
        for (index, object) in self.objects.iter().enumerate() {
            self.object_colours[index] = object.colour_index;
            let offset = index * OBJECT_MATRIX_STRIDE;
            let (sin_yaw, cos_yaw) = object.yaw.sin_cos();
            let (sin_tilt, cos_tilt) = object.tilt.sin_cos();
            let y = if object.kind == ObjectKind::Pencil {
                let grid_x = (object.x / DESK_SIZE * (GRID_SIZE as f32 - 1.0))
                    .round().clamp(0.0, (GRID_SIZE - 1) as f32) as usize;
                let grid_z = (object.z / DESK_SIZE * (GRID_SIZE as f32 - 1.0))
                    .round().clamp(0.0, (GRID_SIZE - 1) as f32) as usize;
                0.36 + self.height[grid_z * GRID_SIZE + grid_x]
            } else {
                0.36
            };

            // Column-major Y-yaw × Z-tilt transform, ready for THREE.Matrix4.fromArray.
            self.object_transforms[offset] = cos_yaw * cos_tilt;
            self.object_transforms[offset + 1] = sin_tilt;
            self.object_transforms[offset + 2] = -sin_yaw * cos_tilt;
            self.object_transforms[offset + 3] = 0.0;
            self.object_transforms[offset + 4] = -cos_yaw * sin_tilt;
            self.object_transforms[offset + 5] = cos_tilt;
            self.object_transforms[offset + 6] = sin_yaw * sin_tilt;
            self.object_transforms[offset + 7] = 0.0;
            self.object_transforms[offset + 8] = sin_yaw;
            self.object_transforms[offset + 9] = 0.0;
            self.object_transforms[offset + 10] = cos_yaw;
            self.object_transforms[offset + 11] = 0.0;
            self.object_transforms[offset + 12] = object.x - 5.0;
            self.object_transforms[offset + 13] = y;
            self.object_transforms[offset + 14] = object.z - 5.0;
            self.object_transforms[offset + 15] = 1.0;
        }
    }

    fn sync_people_buffer(&mut self) {
        for (index, person) in self.people.iter().enumerate() {
            let base = index * 4;
            self.people_buffer[base] = person.x;
            self.people_buffer[base + 1] = person.z;
            self.people_buffer[base + 2] = person.heading;
            self.people_buffer[base + 3] = person.wetness;
            self.people_buffer[base + 4] = if person.seated { 1.0 } else { 0.0 };
        }
    }

    fn refresh_mesh_buffers(&mut self) {
        for z in 0..GRID_SIZE {
            for x in 0..GRID_SIZE {
                let index = z * GRID_SIZE + x;
                let base = index * 3;
                let world_x = -DESK_SIZE * 0.5 + x as f32 * CELL_SIZE;
                let world_z = -DESK_SIZE * 0.5 + z as f32 * CELL_SIZE;
                let left = self.height[z * GRID_SIZE + x.saturating_sub(1)];
                let right = self.height[z * GRID_SIZE + (x + 1).min(GRID_SIZE - 1)];
                let north = self.height[z.saturating_sub(1) * GRID_SIZE + x];
                let south = self.height[(z + 1).min(GRID_SIZE - 1) * GRID_SIZE + x];
                let nx = -(right - left) / (2.0 * CELL_SIZE);
                let nz = -(south - north) / (2.0 * CELL_SIZE);
                let length = (nx * nx + 1.0 + nz * nz).sqrt();

                self.terrain_positions[base] = world_x;
                self.terrain_positions[base + 1] = 0.431 + self.height[index];
                self.terrain_positions[base + 2] = world_z;
                self.terrain_normals[base] = nx / length;
                self.terrain_normals[base + 1] = 1.0 / length;
                self.terrain_normals[base + 2] = nz / length;

                let wet = self.water[index] > 0.0015;
                self.water_positions[base] = world_x;
                self.water_positions[base + 1] = if wet {
                    0.443 + self.height[index] + self.water[index]
                        + (self.elapsed * 1.35 + x as f32 * 0.11 + z as f32 * 0.09).sin() * 0.006
                } else {
                    0.20 + self.height[index]
                };
                self.water_positions[base + 2] = world_z;
                self.water_normals[base] = 0.0;
                self.water_normals[base + 1] = 1.0;
                self.water_normals[base + 2] = 0.0;
            }
        }
    }
}

fn add_water_volume(water: &mut [f32], x: f32, z: f32, volume: f32) {
    if volume <= 0.0 {
        return;
    }
    let center_x = (x / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as isize;
    let center_z = (z / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as isize;
    let radius = 4_isize;
    let mut weights = 0.0;
    for dz in -radius..=radius {
        for dx in -radius..=radius {
            if dx * dx + dz * dz <= radius * radius {
                weights += (-(dx * dx + dz * dz) as f32 / 5.0).exp();
            }
        }
    }
    let cell_area = CELL_SIZE * CELL_SIZE;
    for dz in -radius..=radius {
        for dx in -radius..=radius {
            if dx * dx + dz * dz > radius * radius {
                continue;
            }
            let gx = center_x + dx;
            let gz = center_z + dz;
            if gx < 0 || gz < 0 || gx >= GRID_SIZE as isize || gz >= GRID_SIZE as isize {
                continue;
            }
            let weight = (-(dx * dx + dz * dz) as f32 / 5.0).exp();
            let index = gz as usize * GRID_SIZE + gx as usize;
            water[index] += volume * weight / (weights * cell_area);
        }
    }
}

fn command_energy_cost(command: &Command) -> f32 {
    match command {
        Command::ShiftDown => 1.0,
        _ => 12.0,
    }
}

fn colour_name(index: u8) -> &'static str {
    match index {
        1 => "red",
        2 => "blue",
        3 => "green",
        4 => "yellow",
        5 => "brown",
        6 => "purple",
        7 => "white",
        8 => "black",
        _ => "original",
    }
}

fn escape_json(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len() + 8);
    for character in value.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            character if character.is_control() => escaped.push(' '),
            character => escaped.push(character),
        }
    }
    escaped
}


#[cfg(test)]
mod tests {
    use super::*;

    fn ready_simulation() -> Simulation {
        let mut simulation = Simulation::new();
        for (id, word) in [
            ("action.carve", "carve"),
            ("action.uncap", "uncap"),
            ("action.tap", "tap"),
            ("action.help", "help"),
            ("action.tip", "tip"),
            ("action.upright", "upright"),
            ("action.look", "look"),
            ("action.list", "list"),
            ("action.paint", "paint"),
            ("action.set_colour", "set"),
            ("action.roll_east", "roll_east"),
            ("action.shift_down", "shift_down"),
            ("syntax.colour", "colour"),
            ("syntax.from", "from"),
            ("syntax.to", "to"),
            ("syntax.toward", "toward"),
            ("option.depth", "depth"),
            ("option.width", "width"),
            ("direction.north", "north"),
            ("direction.east", "east"),
            ("direction.south", "south"),
            ("direction.west", "west"),
        ] {
            simulation.set_keyword(id, word);
        }
        simulation
    }

    #[test]
    fn direct_manipulation_moves_objects_and_stops_pencil_velocity() {
        let mut simulation = ready_simulation();
        simulation.bodies[5].vx = 1.4;
        simulation.bodies[5].vz = -0.6;
        assert!(simulation.move_object(5, 4.2, 6.3));
        assert!((simulation.objects[5].x - 4.2).abs() < 0.0001);
        assert!((simulation.objects[5].z - 6.3).abs() < 0.0001);
        assert_eq!(simulation.bodies[5].vx, 0.0);
        assert_eq!(simulation.bodies[5].vz, 0.0);
        assert!(!simulation.move_object(999, 2.0, 2.0));
        assert!(!simulation.move_object(0, f32::NAN, 2.0));
    }

    #[test]
    fn direct_uncap_only_opens_a_capped_bottle() {
        let mut simulation = ready_simulation();
        assert!(simulation.uncap_object(0));
        assert!(!simulation.objects[0].cap_on);
        assert!(!simulation.uncap_object(0));
        assert!(!simulation.uncap_object(5));
    }

    #[test]
    fn carved_terrain_refreshes_wasm_normal_buffer() {
        let mut simulation = ready_simulation();
        let sample = (64 * GRID_SIZE + 65) * 3;
        let original_x_normal = simulation.terrain_normals[sample];
        simulation.carve_line((5.0, 5.0), (5.0, 5.0), 0.2, 0.8);
        simulation.refresh_mesh_buffers();
        assert_ne!(simulation.terrain_normals[sample], original_x_normal);
        assert!(simulation.terrain_normals[sample].abs() > 0.01);
    }

    #[test]
    fn gaussian_carve_has_a_smooth_cross_section_and_updates_neighbour_cells() {
        let mut simulation = ready_simulation();
        simulation.carve_line((5.0, 5.0), (5.0, 5.0), 0.2, 0.8);
        let center = 64 * GRID_SIZE + 64;
        let near = center + 1;
        let shoulder = center + 3;
        let center_depth = simulation.height[center];
        let near_depth = simulation.height[near];
        let shoulder_depth = simulation.height[shoulder];
        assert!(center_depth < near_depth);
        assert!(near_depth < shoulder_depth);
        assert!(shoulder_depth < 0.0);
        assert!(simulation.height[center + 8] > shoulder_depth);
    }

    #[test]
    fn direct_carve_strokes_cut_grooves_and_cost_attention() {
        let mut simulation = ready_simulation();
        let before = simulation.energy;
        assert!(simulation.carve_stroke(2.0, 2.0, 3.0, 2.0));
        assert!(simulation.energy < before);
        assert!(simulation.height.iter().any(|height| *height < -0.001));
        assert!(!simulation.carve_stroke(f32::NAN, 2.0, 3.0, 2.0));
    }

    #[test]
    fn tavern_benches_are_spaced_around_the_table() {
        let simulation = ready_simulation();
        let table = simulation.objects.iter().find(|object| object.name == "table_1").unwrap();
        for name in ["stool_1", "stool_2", "stool_3"] {
            let stool = simulation.objects.iter().find(|object| object.name == name).unwrap();
            let dx = stool.x - table.x;
            let dz = stool.z - table.z;
            assert!((dx * dx + dz * dz).sqrt() >= 0.7, "{name} overlaps the table footprint");
        }
        let stool_two = simulation.objects.iter().find(|object| object.name == "stool_2").unwrap();
        let stool_three = simulation.objects.iter().find(|object| object.name == "stool_3").unwrap();
        assert!((stool_two.yaw - std::f32::consts::FRAC_PI_2).abs() < 0.001);
        assert!((stool_three.yaw - std::f32::consts::FRAC_PI_2).abs() < 0.001);
    }

    #[test]
    fn interpreter_lists_and_inspects_objects() {
        let mut simulation = ready_simulation();
        simulation.enqueue_command("list");
        for _ in 0..50 {
            simulation.tick(1.0 / 60.0);
        }
        assert!(simulation.last_result.contains("bottle_1"));
        assert!(simulation.is_discovered("action.list"));

        simulation.enqueue_command("look bottle_1");
        for _ in 0..50 {
            simulation.tick(1.0 / 60.0);
        }
        assert!(simulation.last_result.contains("cap on"));
    }

    #[test]
    fn barrel_tap_transfers_water_without_creating_volume() {
        let mut simulation = ready_simulation();
        let barrel_index = simulation.objects.iter().position(|object| object.kind == ObjectKind::Barrel).unwrap();
        let source_before = simulation.objects[barrel_index].volume;
        let grid_before = water::total_volume(&simulation.water);

        simulation.execute(Command::Tap("barrel_1".to_owned())).unwrap();
        simulation.fixed_step(FIXED_STEP);

        let source_after = simulation.objects[barrel_index].volume;
        let grid_after = water::total_volume(&simulation.water);
        assert!(grid_after > grid_before);
        assert!(((source_before + grid_before) - (source_after + grid_after)).abs() < 0.00001);
    }

    #[test]
    fn help_lists_discovered_commands() {
        let mut simulation = ready_simulation();
        simulation.discover_action("action.tap");
        let message = simulation.execute(Command::Help).unwrap();
        assert!(message.contains("help"));
        assert!(message.contains("tap"));
        assert!(message.contains("list"));
    }

    #[test]
    fn interpreter_gives_a_helpful_cap_error() {
        let mut simulation = ready_simulation();
        simulation.enqueue_command("tip bottle_1");
        for _ in 0..50 {
            simulation.tick(1.0 / 60.0);
        }
        assert!(simulation.last_result.contains("still has its cap on"));
        assert!(simulation.last_result.contains("uncap bottle_1"));
    }

    #[test]
    fn uncap_tip_and_upright_update_bottle_state() {
        let mut simulation = ready_simulation();
        simulation.enqueue_command("uncap bottle_1");
        for _ in 0..50 {
            simulation.tick(1.0 / 60.0);
        }
        assert!(!simulation.objects[0].cap_on);

        simulation.enqueue_command("tip bottle_1");
        for _ in 0..180 {
            simulation.tick(1.0 / 60.0);
        }
        assert!(simulation.objects[0].tilt > 0.9);
        assert!(simulation.objects[0].volume < INITIAL_BOTTLE_VOLUME);

        simulation.enqueue_command("upright bottle_1");
        for _ in 0..180 {
            simulation.tick(1.0 / 60.0);
        }
        assert!(simulation.objects[0].tilt < 0.05);
    }

    #[test]
    fn carving_lowers_terrain_cells() {
        let mut simulation = ready_simulation();
        simulation.enqueue_command("carve from (2,3) to (8,3) depth 0.2 width 0.5");
        for _ in 0..50 {
            simulation.tick(1.0 / 60.0);
        }
        let center = 38 * GRID_SIZE + 64;
        assert!(simulation.height[center] < -0.1);
    }

    #[test]
    fn chained_commands_are_charged_upfront_and_run_in_order() {
        let mut simulation = ready_simulation();
        let energy_before = simulation.energy;
        simulation.enqueue_command("uncap bottle_1 ; paint pencil_1 red");
        simulation.fixed_step(FIXED_STEP);
        assert_eq!(simulation.action_queue.len(), 2);
        assert!(simulation.energy <= energy_before - 24.0 + 0.001);
        simulation.cooldown = 0.0;
        simulation.process_queue();
        assert!(!simulation.objects[0].cap_on);
        assert_eq!(simulation.objects[5].colour_index, 0);
        simulation.cooldown = 0.0;
        simulation.process_queue();
        assert_eq!(simulation.objects[5].colour_index, 1);
    }

    #[test]
    fn repeat_and_let_expand_before_command_parsing() {
        let mut simulation = ready_simulation();
        simulation.enqueue_command("let trench = (1,2) to (7,2) ; repeat 2 { carve from trench depth 0.1 }");
        simulation.fixed_step(FIXED_STEP);
        assert_eq!(simulation.action_queue.len(), 2);
    }

    #[test]
    fn if_runs_once_and_when_registers_a_persistent_listener() {
        let mut simulation = ready_simulation();
        simulation.enqueue_command("if garden.moisture < 20% { paint pencil_1 red } ; when garden.moisture < 30% { paint pencil_2 blue }");
        simulation.fixed_step(FIXED_STEP);
        assert_eq!(simulation.action_queue.len(), 1);
        assert_eq!(simulation.listeners.len(), 1);
        simulation.cooldown = 0.0;
        simulation.process_queue();
        assert_eq!(simulation.objects[5].colour_index, 1);
        simulation.update_listeners();
        assert_eq!(simulation.objects[6].colour_index, 2);
    }

    #[test]
    fn pipes_roll_and_paint_the_selected_pencil() {
        let mut simulation = ready_simulation();
        simulation.enqueue_command("pencil_1 -> roll_east -> paint red");
        simulation.fixed_step(FIXED_STEP);
        assert_eq!(simulation.action_queue.len(), 2);
        simulation.cooldown = 0.0;
        simulation.process_queue();
        assert!(simulation.bodies[5].vx > 0.0);
        simulation.cooldown = 0.0;
        simulation.process_queue();
        assert_eq!(simulation.objects[5].colour_index, 1);
    }

    #[test]
    fn pencil_bodies_collide_and_resolve_overlap() {
        let mut simulation = ready_simulation();
        simulation.objects[5].x = 4.0;
        simulation.objects[5].z = 5.0;
        simulation.objects[6].x = 4.15;
        simulation.objects[6].z = 5.0;
        simulation.bodies[5].vx = 1.0;
        simulation.bodies[6].vx = -0.5;
        simulation.update_rigid_bodies(FIXED_STEP);
        assert!(simulation.objects[5].x < simulation.objects[6].x);
        assert!((simulation.bodies[5].vx + simulation.bodies[6].vx).abs() < 2.0);
    }

    #[test]
    fn groove_channels_more_water_than_the_surrounding_surface() {
        let mut height = vec![0.0; GRID_CELLS];
        for x in 12..112 {
            for dz in -2_isize..=2 {
                let index = (64_isize + dz) as usize * GRID_SIZE + x;
                height[index] = -0.075 * (1.0 - (dz.abs() as f32 / 3.0).powi(2));
            }
        }
        let mut depth = vec![0.0; GRID_CELLS];
        let mut flow = FlowBuffers::new();
        depth[64 * GRID_SIZE + 12] = 0.20;
        for _ in 0..480 {
            flow.step(&height, &mut depth, 1.0 / 60.0, false, 0.0);
        }
        let in_groove: f32 = (0..GRID_SIZE)
            .flat_map(|z| (0..GRID_SIZE).map(move |x| (x, z)))
            .filter(|(_, z)| z.abs_diff(64) <= 2)
            .map(|(x, z)| depth[z * GRID_SIZE + x])
            .sum();
        let outside: f32 = depth.iter().sum::<f32>() - in_groove;
        assert!(in_groove > outside, "groove={in_groove}, outside={outside}");
    }
}
