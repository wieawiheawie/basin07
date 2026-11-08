mod lexer;
mod parser;
mod water;

use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

use parser::{Command, Direction, Glossary, PositionExpr};
use water::{CELL_SIZE, DESK_SIZE, FlowBuffers, GRID_CELLS, GRID_SIZE};

const FIXED_STEP: f32 = 1.0 / 60.0;
const INITIAL_BOTTLE_VOLUME: f32 = 0.14;
const ACTION_IDS: [&str; 6] = [
    "action.carve",
    "action.uncap",
    "action.tip",
    "action.upright",
    "action.look",
    "action.list",
];

#[derive(Clone, Copy, PartialEq)]
enum ObjectKind {
    Bottle,
    Book,
    Pencil,
    Garden,
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
}

struct Person {
    x: f32,
    z: f32,
    heading: f32,
    wetness: f32,
    wander_timer: f32,
    seed: u32,
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
    people: Vec<Person>,
    people_buffer: Vec<f32>,
    glossary: Glossary,
    discovered: Vec<String>,
    queue: VecDeque<String>,
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
                cap_on: true, volume: INITIAL_BOTTLE_VOLUME, tilt: 0.0, target_tilt: 0.0, yaw: 0.0,
            },
            WorldObject {
                name: "bottle_2", kind: ObjectKind::Bottle, x: 8.0, z: 2.2,
                cap_on: true, volume: INITIAL_BOTTLE_VOLUME, tilt: 0.0, target_tilt: 0.0, yaw: 3.0,
            },
            WorldObject {
                name: "book_1", kind: ObjectKind::Book, x: 3.2, z: 2.4,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.2,
            },
            WorldObject {
                name: "book_2", kind: ObjectKind::Book, x: 6.6, z: 7.5,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.45,
            },
            WorldObject {
                name: "book_3", kind: ObjectKind::Book, x: 8.0, z: 6.0,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.8,
            },
            WorldObject {
                name: "pencil_1", kind: ObjectKind::Pencil, x: 1.3, z: 4.3,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.2,
            },
            WorldObject {
                name: "pencil_2", kind: ObjectKind::Pencil, x: 2.2, z: 4.8,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.5,
            },
            WorldObject {
                name: "pencil_3", kind: ObjectKind::Pencil, x: 7.5, z: 4.0,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.9,
            },
            WorldObject {
                name: "pencil_4", kind: ObjectKind::Pencil, x: 8.6, z: 4.8,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: -0.1,
            },
            WorldObject {
                name: "garden", kind: ObjectKind::Garden, x: 5.0, z: 5.0,
                cap_on: false, volume: 0.0, tilt: 0.0, target_tilt: 0.0, yaw: 0.0,
            },
        ];

        let people = vec![
            Person { x: 4.0, z: 4.0, heading: 0.3, wetness: 0.0, wander_timer: 0.2, seed: 11 },
            Person { x: 4.7, z: 4.1, heading: 1.9, wetness: 0.0, wander_timer: 0.5, seed: 23 },
            Person { x: 5.8, z: 4.2, heading: 2.7, wetness: 0.0, wander_timer: 0.8, seed: 37 },
            Person { x: 5.1, z: 5.8, heading: -1.4, wetness: 0.0, wander_timer: 0.1, seed: 47 },
            Person { x: 6.1, z: 5.4, heading: -2.1, wetness: 0.0, wander_timer: 0.6, seed: 59 },
        ];

        let mut simulation = Simulation {
            height: vec![0.0; GRID_CELLS],
            water: vec![0.0; GRID_CELLS],
            flow: FlowBuffers::new(),
            terrain_positions: vec![0.0; GRID_CELLS * 3],
            terrain_normals: vec![0.0; GRID_CELLS * 3],
            water_positions: vec![0.0; GRID_CELLS * 3],
            water_normals: vec![0.0; GRID_CELLS * 3],
            people_buffer: vec![0.0; people.len() * 4],
            objects,
            people,
            glossary: Glossary::default(),
            discovered: vec!["action.list".to_owned(), "action.look".to_owned()],
            queue: VecDeque::with_capacity(12),
            accumulator: 0.0,
            elapsed: 0.0,
            energy: 100.0,
            cooldown: 0.0,
            last_result: "{\"ok\":true,\"message\":\"The desk is ready. Type list to see what lives here.\"}".to_owned(),
            result_sequence: 0,
        };
        simulation.refresh_mesh_buffers();
        simulation.sync_people_buffer();
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
        if self.queue.len() >= 12 || source.trim().is_empty() {
            return false;
        }
        self.queue.push_back(source.to_owned());
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
        self.queue.len()
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
        }

        self.flow.step(&self.height, &mut self.water, dt, true, 0.00016);
        self.update_people(dt);
        self.process_queue();
        self.refresh_mesh_buffers();
        self.sync_people_buffer();
    }

    fn process_queue(&mut self) {
        if self.cooldown > 0.0 || self.queue.is_empty() || self.energy < 12.0 {
            return;
        }

        let source = self.queue.pop_front().unwrap_or_default();
        self.energy -= 12.0;
        self.cooldown = 0.72;

        let parsed = parser::parse(&source, &self.glossary);
        let result = match parsed {
            Ok(command) => self.execute(command),
            Err(error) => Err(error),
        };
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
        self.refresh_mesh_buffers();
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
                };
                Ok(format!(
                    "{}: {}, position ({:.1}, {:.1}).",
                    object.name, state, object.x, object.z
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
            Command::Carve { from, to, depth, width } => {
                let start = self.resolve_position(&from)?;
                let end = self.resolve_position(&to)?;
                self.carve_line(start, end, depth, width);
                self.discover_action("action.carve");
                Ok(format!("A groove now runs from ({:.1}, {:.1}) to ({:.1}, {:.1}).", start.0, start.1, end.0, end.1))
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
        let distance = (dx * dx + dz * dz).sqrt();
        let samples = ((distance / (CELL_SIZE * 0.65)).ceil() as usize).max(1);
        let radius = width * 0.5;

        for sample in 0..=samples {
            let t = sample as f32 / samples as f32;
            let x = start.0 + dx * t;
            let z = start.1 + dz * t;
            let center_x = (x / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as isize;
            let center_z = (z / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as isize;
            let radius_cells = (radius / CELL_SIZE).ceil() as isize;

            for offset_z in -radius_cells..=radius_cells {
                for offset_x in -radius_cells..=radius_cells {
                    let grid_x = center_x + offset_x;
                    let grid_z = center_z + offset_z;
                    if grid_x < 0 || grid_z < 0 || grid_x >= GRID_SIZE as isize || grid_z >= GRID_SIZE as isize {
                        continue;
                    }
                    let world_dx = offset_x as f32 * CELL_SIZE;
                    let world_dz = offset_z as f32 * CELL_SIZE;
                    let radial = (world_dx * world_dx + world_dz * world_dz).sqrt();
                    if radial > radius {
                        continue;
                    }
                    let falloff = 1.0 - (radial / radius.max(CELL_SIZE)).powi(2);
                    let index = grid_z as usize * GRID_SIZE + grid_x as usize;
                    self.height[index] = self.height[index].min(-depth * falloff);
                }
            }
        }
    }

    fn update_people(&mut self, dt: f32) {
        let (people, water, objects) = (&mut self.people, &self.water, &self.objects);
        for person in people.iter_mut() {
            let gx = (person.x / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as usize;
            let gz = (person.z / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as usize;
            let current_water = water[gz.min(GRID_SIZE - 1) * GRID_SIZE + gx.min(GRID_SIZE - 1)];
            if current_water > 0.035 {
                person.wetness = 1.0;
                person.heading += std::f32::consts::PI * 0.72;
                person.wander_timer = 0.0;
            } else {
                person.wetness = (person.wetness - dt * 0.25).max(0.0);
            }

            person.wander_timer -= dt;
            if person.wander_timer <= 0.0 {
                person.seed = person.seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let jitter = (person.seed as f32 / u32::MAX as f32 - 0.5) * 1.2;
                person.heading += jitter;
                person.wander_timer = 0.8 + (person.seed % 100) as f32 / 140.0;
            }

            let mut best_heading = person.heading;
            let mut best_score = f32::INFINITY;
            for turn in [-1.1_f32, -0.55, 0.0, 0.55, 1.1] {
                let heading = person.heading + turn;
                let next_x = (person.x + heading.cos() * 0.24 * dt).clamp(0.2, 9.8);
                let next_z = (person.z + heading.sin() * 0.24 * dt).clamp(0.2, 9.8);
                let nx = (next_x / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as usize;
                let nz = (next_z / DESK_SIZE * (GRID_SIZE as f32 - 1.0)).round() as usize;
                let wet_penalty = water[nz.min(GRID_SIZE - 1) * GRID_SIZE + nx.min(GRID_SIZE - 1)] * 18.0;
                let mut obstacle_penalty = 0.0;
                for object in objects.iter().filter(|object| object.kind != ObjectKind::Pencil) {
                    let ox = next_x - object.x;
                    let oz = next_z - object.z;
                    let distance = (ox * ox + oz * oz).sqrt();
                    let clearance = match object.kind {
                        ObjectKind::Bottle => 0.48,
                        ObjectKind::Book => 0.58,
                        ObjectKind::Garden => 0.76,
                        ObjectKind::Pencil => 0.12,
                    };
                    if distance < clearance {
                        obstacle_penalty += (clearance - distance) * 18.0;
                    }
                }
                let turn_penalty = turn.abs() * 0.08;
                let score = wet_penalty + obstacle_penalty + turn_penalty;
                if score < best_score {
                    best_score = score;
                    best_heading = heading;
                }
            }
            person.heading = best_heading;
            person.x = (person.x + person.heading.cos() * 0.24 * dt).clamp(0.2, 9.8);
            person.z = (person.z + person.heading.sin() * 0.24 * dt).clamp(0.2, 9.8);
        }
    }

    fn sync_people_buffer(&mut self) {
        for (index, person) in self.people.iter().enumerate() {
            let base = index * 4;
            self.people_buffer[base] = person.x;
            self.people_buffer[base + 1] = person.z;
            self.people_buffer[base + 2] = person.heading;
            self.people_buffer[base + 3] = person.wetness;
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

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready_simulation() -> Simulation {
        let mut simulation = Simulation::new();
        for (id, word) in [
            ("action.carve", "carve"),
            ("action.uncap", "uncap"),
            ("action.tip", "tip"),
            ("action.upright", "upright"),
            ("action.look", "look"),
            ("action.list", "list"),
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
