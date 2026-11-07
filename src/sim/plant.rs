use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};

use super::catalog::{
    Endpoint, LineKind, MachineKind, PRODUCT_COUNT, PRODUCTS, ProductId, REAGENT_COUNT, REAGENTS,
    ReagentId, ServicePort,
};
use super::controller::{ControlOutputs, PresetController, ScriptController};
use super::economy::{DeterministicRng, MarketState};
use super::network::{
    Connection, GridPos, LinkError, compatible, flow_capacity_t_per_hour, new_connection,
};

pub const PLOT_WIDTH: i16 = 18;
pub const PLOT_HEIGHT: i16 = 14;
const GRID_POWER_KW: f32 = 310.0;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReservoirState {
    pub lithium_kg_m3: f64,
    pub magnesium_chloride_kg_m3: f64,
    pub silica_kg_m3: f64,
    pub brine_temperature_c: f32,
    pub pressure_bar: f32,
    pub pressure_decline: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MachineState {
    pub id: u32,
    pub kind: MachineKind,
    pub pos: GridPos,
    pub rotation: u8,
    pub inventory_t: [f64; PRODUCT_COUNT],
    pub reagents_t: [f64; REAGENT_COUNT],
    pub raw_brine_m3: f64,
    pub clean_brine_m3: f64,
    pub spent_brine_m3: f64,
    pub bed_loading_t: f64,
    pub bed_capacity_t: f64,
    pub wash_done: bool,
    pub steam_kwh: f64,
    pub pressure_bar: f32,
    pub temperature_c: f32,
    pub wear: f32,
    pub powered: bool,
    pub active: bool,
    pub breakthrough: f64,
    pub alarm: Option<String>,
}

impl MachineState {
    fn new(id: u32, kind: MachineKind, pos: GridPos) -> Self {
        Self {
            id,
            kind,
            pos,
            rotation: 0,
            inventory_t: [0.0; PRODUCT_COUNT],
            reagents_t: [0.0; REAGENT_COUNT],
            raw_brine_m3: 0.0,
            clean_brine_m3: 0.0,
            spent_brine_m3: 0.0,
            bed_loading_t: 0.0,
            bed_capacity_t: if kind == MachineKind::AdsorptionBed {
                0.045
            } else {
                0.0
            },
            wash_done: false,
            steam_kwh: 0.0,
            pressure_bar: 0.0,
            temperature_c: 22.0,
            wear: 0.0,
            powered: false,
            active: false,
            breakthrough: 0.0,
            alarm: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlantEvent {
    pub time_minutes: f64,
    pub severity: EventSeverity,
    pub message: String,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum EventSeverity {
    Info,
    Warning,
    Critical,
    Success,
}

#[derive(Serialize, Deserialize)]
pub struct PlantSim {
    pub seed: u64,
    rng: DeterministicRng,
    pub cash: f64,
    pub time_minutes: f64,
    pub machines: Vec<MachineState>,
    pub connections: Vec<Connection>,
    pub reservoir: ReservoirState,
    pub market: MarketState,
    pub events: VecDeque<PlantEvent>,
    pub delivered_contract_t: f64,
    pub contract_paid: bool,
    pub total_liquid_processed_m3: f64,
    pub total_reinjected_m3: f64,
    pub grid_load_kw: f32,
    pub paused: bool,
    #[serde(skip, default)]
    script_controllers: BTreeMap<u32, ScriptController>,
    controller_sources: BTreeMap<u32, String>,
}

impl PlantSim {
    pub fn new(seed: u64) -> Self {
        let mut rng = DeterministicRng::new(seed);
        let reservoir = ReservoirState {
            lithium_kg_m3: rng.range(0.28, 0.48),
            magnesium_chloride_kg_m3: rng.range(0.32, 0.78),
            silica_kg_m3: rng.range(0.05, 0.24),
            brine_temperature_c: rng.range(125.0, 178.0) as f32,
            pressure_bar: rng.range(5.2, 8.8) as f32,
            pressure_decline: 0.0,
        };
        Self {
            seed,
            rng,
            cash: 50_000.0,
            time_minutes: 0.0,
            machines: Vec::with_capacity(64),
            connections: Vec::with_capacity(128),
            reservoir,
            market: MarketState::new(seed ^ 0x7512),
            events: VecDeque::with_capacity(48),
            delivered_contract_t: 0.0,
            contract_paid: false,
            total_liquid_processed_m3: 0.0,
            total_reinjected_m3: 0.0,
            grid_load_kw: 0.0,
            paused: true,
            script_controllers: BTreeMap::new(),
            controller_sources: BTreeMap::new(),
        }
    }

    pub fn push_event(&mut self, severity: EventSeverity, message: impl Into<String>) {
        if self.events.len() >= 48 {
            self.events.pop_front();
        }
        self.events.push_back(PlantEvent {
            time_minutes: self.time_minutes,
            severity,
            message: message.into(),
        });
    }

    pub fn machine(&self, id: u32) -> Option<&MachineState> {
        self.machines.iter().find(|m| m.id == id)
    }
    pub fn machine_mut(&mut self, id: u32) -> Option<&mut MachineState> {
        self.machines.iter_mut().find(|m| m.id == id)
    }
    pub fn machine_at(&self, pos: GridPos) -> Option<u32> {
        self.machines.iter().find(|m| m.pos == pos).map(|m| m.id)
    }

    pub fn place_machine(&mut self, kind: MachineKind, pos: GridPos) -> Result<u32, String> {
        if pos.x < 0 || pos.z < 0 || pos.x >= PLOT_WIDTH || pos.z >= PLOT_HEIGHT {
            return Err("Outside lease boundary".into());
        }
        if self.machine_at(pos).is_some() {
            return Err("Plot tile is occupied".into());
        }
        let cost = kind.cost();
        if self.cash < cost {
            return Err(format!("Need ${cost:.0}; available ${:.0}", self.cash));
        }
        self.cash -= cost;
        let id = self.machines.last().map(|m| m.id + 1).unwrap_or(1);
        self.machines.push(MachineState::new(id, kind, pos));
        self.push_event(
            EventSeverity::Info,
            format!("Purchased {} #{id} for ${cost:.0}", kind.name()),
        );
        Ok(id)
    }

    pub fn rotate_machine(&mut self, id: u32) -> Result<(), String> {
        let m = self
            .machine_mut(id)
            .ok_or_else(|| "Unknown machine".to_string())?;
        m.rotation = (m.rotation + 1) % 4;
        Ok(())
    }

    pub fn connect(
        &mut self,
        from: Endpoint,
        to: Endpoint,
        line: LineKind,
    ) -> Result<(), LinkError> {
        if from == to {
            return Err(LinkError::SameEndpoint);
        }
        if self
            .connections
            .iter()
            .any(|c| c.from == from && c.to == to && c.line == line)
        {
            return Err(LinkError::Duplicate);
        }
        let kinds: Vec<(u32, MachineKind)> = self.machines.iter().map(|m| (m.id, m.kind)).collect();
        if let Endpoint::Machine(id) = from {
            if !kinds.iter().any(|(x, _)| *x == id) {
                return Err(LinkError::UnknownMachine(id));
            }
        }
        if let Endpoint::Machine(id) = to {
            if !kinds.iter().any(|(x, _)| *x == id) {
                return Err(LinkError::UnknownMachine(id));
            }
        }
        if !compatible(from, to, line, &kinds) {
            return Err(LinkError::Incompatible { from, to, line });
        }
        let positions: Vec<(u32, MachineKind, GridPos)> = self
            .machines
            .iter()
            .map(|m| (m.id, m.kind, m.pos))
            .collect();
        let a = super::network::endpoint_position(from, &positions).unwrap_or(GridPos::new(0, 0));
        let b = super::network::endpoint_position(to, &positions).unwrap_or(GridPos::new(0, 0));
        let length_m = a.manhattan(b) as f32 * 2.0 + 2.0;
        let is_cable = matches!(
            line,
            LineKind::Power | LineKind::LogicSensor | LineKind::LogicActuator
        );
        let cost = length_m as f64 * if is_cable { 34.0 } else { 78.0 };
        if self.cash < cost {
            return Err(LinkError::Incompatible { from, to, line });
        }
        self.cash -= cost;
        let diameter = if is_cable {
            0
        } else if matches!(line, LineKind::Hydrogen | LineKind::Chlorine) {
            40
        } else {
            250
        };
        self.connections
            .push(new_connection(from, to, line, length_m, diameter));
        self.push_event(
            EventSeverity::Info,
            format!("Connected {} line ({length_m:.0} m)", line.name()),
        );
        Ok(())
    }

    pub fn buy_reagent(
        &mut self,
        tank_id: u32,
        reagent: ReagentId,
        tonnes: f64,
    ) -> Result<(), String> {
        if tonnes <= 0.0 || !tonnes.is_finite() {
            return Err("Enter a positive finite quantity".into());
        }
        let tank = self
            .machine(tank_id)
            .ok_or_else(|| "Unknown tank".to_string())?;
        if tank.kind != MachineKind::ReagentTank {
            return Err("Reagents can only be delivered to a reagent tank".into());
        }
        if !self.connections.iter().any(|c| {
            c.from == Endpoint::Service(ServicePort::Supplier)
                && c.to == Endpoint::Machine(tank_id)
                && c.line == LineKind::ReagentSupply
        }) {
            return Err("Connect the supplier line to this tank before ordering".into());
        }
        let price = REAGENTS[reagent.index()].unit_price * tonnes;
        if self.cash < price {
            return Err(format!("Shipment costs ${price:.0}; insufficient cash"));
        }
        self.cash -= price;
        self.machine_mut(tank_id).expect("tank checked").reagents_t[reagent.index()] += tonnes;
        self.push_event(
            EventSeverity::Info,
            format!("Received {tonnes:.2} t {}", REAGENTS[reagent.index()].name),
        );
        Ok(())
    }

    pub fn compile_controller(&mut self, controller_id: u32, source: &str) -> Result<(), String> {
        let kind = self
            .machine(controller_id)
            .ok_or_else(|| "Unknown controller".to_string())?
            .kind;
        if kind != MachineKind::CodeController {
            return Err("Select a Code Controller".into());
        }
        let compiled = ScriptController::compile(source)?;
        self.script_controllers.insert(controller_id, compiled);
        self.controller_sources
            .insert(controller_id, source.to_owned());
        self.push_event(
            EventSeverity::Success,
            format!("Controller #{controller_id} compiled successfully"),
        );
        Ok(())
    }

    fn has_link(&self, from: Endpoint, to: Endpoint, line: LineKind) -> bool {
        self.connections
            .iter()
            .any(|c| c.from == from && c.to == to && c.line == line)
    }

    fn is_powered(&self, id: u32) -> bool {
        self.has_link(
            Endpoint::Service(ServicePort::Grid),
            Endpoint::Machine(id),
            LineKind::Power,
        )
    }

    fn transfer_one(&mut self, c: &Connection) {
        let (Endpoint::Machine(from_id), Endpoint::Machine(to_id)) = (c.from, c.to) else {
            return;
        };
        let Some(fi) = self.machines.iter().position(|m| m.id == from_id) else {
            return;
        };
        let Some(ti) = self.machines.iter().position(|m| m.id == to_id) else {
            return;
        };
        if fi == ti {
            return;
        }
        let flow =
            flow_capacity_t_per_hour(c.diameter_mm.max(10), 3.0, c.length_m, c.fouling) as f64;
        let total_capacity = (flow * 0.25 / 60.0).max(0.0);
        let leak_t = total_capacity * (c.leak_fraction as f64).clamp(0.0, 0.95);
        let max_t = total_capacity - leak_t;
        if fi < ti {
            let (left, right) = self.machines.split_at_mut(ti);
            drain_leaked_buffer(&mut left[fi], c.line, leak_t);
            transfer_buffers(&mut left[fi], &mut right[0], c.line, max_t);
        } else {
            let (left, right) = self.machines.split_at_mut(fi);
            drain_leaked_buffer(&mut right[0], c.line, leak_t);
            transfer_buffers(&mut right[0], &mut left[ti], c.line, max_t);
        }
    }

    fn transfer_all(&mut self) {
        // Clone one small, Copy-like edge at a time to avoid a fresh Vec allocation
        // on every fixed simulation tick.
        for index in 0..self.connections.len() {
            let link = self.connections[index].clone();
            self.transfer_one(&link);
        }
    }

    fn control_for_machine(
        &mut self,
        machine_id: u32,
        sensors: &BTreeMap<String, f64>,
        breakthrough: f64,
        tank_level: f64,
        loading: f64,
    ) -> ControlOutputs {
        let controller = self.connections.iter().find_map(|c| {
            if c.from == Endpoint::Machine(machine_id) && c.line == LineKind::LogicSensor {
                if let Endpoint::Machine(id) = c.to {
                    return Some(id);
                }
            }
            None
        });
        let Some(controller_id) = controller else {
            return ControlOutputs::default();
        };
        if !self.has_link(
            Endpoint::Machine(controller_id),
            Endpoint::Machine(machine_id),
            LineKind::LogicActuator,
        ) {
            return ControlOutputs::default();
        }
        let Some(controller_state) = self.machine(controller_id) else {
            return ControlOutputs::default();
        };
        if !controller_state.powered {
            return ControlOutputs::default();
        }
        match controller_state.kind {
            MachineKind::PresetController => {
                PresetController.tick(breakthrough, tank_level, loading)
            }
            MachineKind::CodeController => {
                let Some(vm) = self.script_controllers.get_mut(&controller_id) else {
                    return ControlOutputs::default();
                };
                vm.run(sensors).unwrap_or_default()
            }
            _ => ControlOutputs::default(),
        }
    }

    pub fn step(&mut self, minutes: f64) {
        if self.paused {
            return;
        }
        let dt = minutes.clamp(0.0, 1.0);
        let previous_market_hour = (self.time_minutes / 60.0).floor() as u64;
        self.time_minutes += dt;
        let current_market_hour = (self.time_minutes / 60.0).floor() as u64;
        if current_market_hour > previous_market_hour {
            self.market.step(&mut self.rng);
            self.market.contract_time_left_minutes -= 60.0;
            if self.contract_paid || self.market.contract_time_left_minutes <= 0.0 {
                self.market.refresh_contract(&mut self.rng);
                self.delivered_contract_t = 0.0;
                self.contract_paid = false;
                let product = PRODUCTS[self.market.contract_product.index()].name;
                self.push_event(
                    EventSeverity::Info,
                    format!(
                        "New contract: {:.3} t {product} within {:.0} min",
                        self.market.contract_target_t, self.market.contract_time_left_minutes
                    ),
                );
            }
        }

        self.grid_load_kw = 0.0;
        let mut power_left = GRID_POWER_KW;
        for i in 0..self.machines.len() {
            let connected = self.is_powered(self.machines[i].id);
            let draw = self.machines[i].kind.power_kw();
            self.machines[i].powered = connected && power_left >= draw;
            if self.machines[i].powered {
                power_left -= draw;
                self.grid_load_kw += draw;
            }
            self.machines[i].alarm = if !connected {
                Some("NO POWER CABLE".into())
            } else if !self.machines[i].powered {
                Some("GRID OVERLOAD / BROWNOUT".into())
            } else {
                None
            };
        }

        // Service wellhead generates raw brine only when a physical line and powered pump exist.
        for i in 0..self.machines.len() {
            let id = self.machines[i].id;
            if self.machines[i].kind != MachineKind::WellPump
                || !self.machines[i].powered
                || !self.has_link(
                    Endpoint::Service(ServicePort::Wellhead),
                    Endpoint::Machine(id),
                    LineKind::RawBrine,
                )
            {
                continue;
            }
            let tank_level = self
                .machines
                .iter()
                .find(|m| m.kind == MachineKind::ReagentTank)
                .map(|m| (m.reagents_t[ReagentId::Water.index()] / 2.0).clamp(0.0, 1.0))
                .unwrap_or(0.0);
            let sensors = BTreeMap::from([
                (
                    "well_pump.pressure".to_owned(),
                    self.reservoir.pressure_bar as f64,
                ),
                ("well_pump.wear".to_owned(), self.machines[i].wear as f64),
                ("feed_tank.level".to_owned(), tank_level),
            ]);
            let output = self.control_for_machine(id, &sensors, 0.0, tank_level, 0.0);
            let setpoint = output.value("well_pump", 1.0).clamp(0.0, 1.0);
            if setpoint > 0.2 {
                self.machines[i].raw_brine_m3 =
                    (self.machines[i].raw_brine_m3 + 4.0 * dt * setpoint).min(500.0);
            }
        }
        self.transfer_all();

        for i in 0..self.machines.len() {
            if !self.machines[i].powered {
                continue;
            }
            match self.machines[i].kind {
                MachineKind::Pretreatment => self.process_pretreatment(i, dt),
                MachineKind::AdsorptionBed => self.process_adsorption(i, dt),
                MachineKind::Carbonator => self.process_carbonator(i, dt),
                MachineKind::LithiumHydroxideConverter => self.process_lioh(i, dt),
                MachineKind::ChlorAlkaliCell => self.process_chloralkali(i, dt),
                MachineKind::AcidSynthesizer => self.process_acid_synthesis(i, dt),
                MachineKind::ReinjectionPump => self.process_reinjection(i, dt),
                _ => {}
            }
        }
        self.transfer_all();
        self.update_line_fouling(dt);
    }

    fn process_pretreatment(&mut self, i: usize, dt: f64) {
        let flow = self.machines[i].raw_brine_m3.min(4.0 * dt);
        if flow <= 0.0 {
            self.machines[i].active = false;
            return;
        }
        let base_need_t = flow * self.reservoir.magnesium_chloride_kg_m3 * 0.84 / 1_000.0;
        let base = self.machines[i].reagents_t[ReagentId::SodiumHydroxide.index()];
        if base < base_need_t {
            self.machines[i].alarm = Some("CAUSTIC STARVED: Mg REMOVAL OFF".into());
            self.machines[i].active = false;
            return;
        }
        self.machines[i].reagents_t[ReagentId::SodiumHydroxide.index()] -= base_need_t;
        self.machines[i].raw_brine_m3 -= flow;
        self.machines[i].clean_brine_m3 += flow * 0.92;
        let mgcl2_t = flow * self.reservoir.magnesium_chloride_kg_m3 / 1_000.0;
        let mg_oh_t = mgcl2_t * (58.319 / 95.211);
        let nacl_t = mgcl2_t * (2.0 * 58.44 / 95.211);
        self.machines[i].inventory_t[ProductId::MagnesiumHydroxide.index()] += mg_oh_t;
        self.machines[i].inventory_t[ProductId::SodiumChloride.index()] += nacl_t;
        self.total_liquid_processed_m3 += flow;
        self.machines[i].pressure_bar =
            (self.reservoir.pressure_bar - self.machines[i].wear * 2.2).max(0.2);
        self.machines[i].temperature_c = self.reservoir.brine_temperature_c;
        self.machines[i].wear += (0.0006 + self.reservoir.silica_kg_m3 as f32 * 0.001) * dt as f32;
        self.machines[i].active = true;
    }

    fn process_adsorption(&mut self, i: usize, dt: f64) {
        let id = self.machines[i].id;
        let tank_level = self
            .machines
            .iter()
            .find(|m| m.kind == MachineKind::ReagentTank)
            .map(|m| (m.reagents_t[ReagentId::Water.index()] / 2.0).clamp(0.0, 1.0))
            .unwrap_or(0.0);
        let bed_loading = if self.machines[i].bed_capacity_t > 0.0 {
            self.machines[i].bed_loading_t / self.machines[i].bed_capacity_t
        } else {
            0.0
        };
        let breakthrough = self.machines[i].breakthrough;
        let sensors = BTreeMap::from([
            ("bed.breakthrough".to_owned(), breakthrough),
            ("bed.loading".to_owned(), bed_loading),
            ("feed_tank.level".to_owned(), tank_level),
        ]);
        let outputs = self.control_for_machine(id, &sensors, breakthrough, tank_level, bed_loading);
        let feed_open = outputs.value("feed_valve", 0.0) > 0.2;
        let wash_open = outputs.value("wash_valve", 0.0) > 0.2;
        let elute_open = outputs.value("elution_valve", 0.0) > 0.2;
        if feed_open && self.machines[i].clean_brine_m3 > 0.0 {
            let flow = self.machines[i]
                .clean_brine_m3
                .min(4.0 * dt * outputs.value("feed_valve", 0.0).clamp(0.0, 1.0));
            let competitor_penalty =
                (self.reservoir.magnesium_chloride_kg_m3 / 4.0).clamp(0.0, 0.35);
            let silica_penalty = (self.reservoir.silica_kg_m3 * 0.6).clamp(0.0, 0.25);
            // Count recovered lithium as LiCl-equivalent product mass (M(LiCl)/M(Li)).
            const LICL_PER_LI_MASS: f64 = 42.39 / 6.94;
            let captured_t = flow
                * self.reservoir.lithium_kg_m3
                * LICL_PER_LI_MASS
                * (1.0 - competitor_penalty - silica_penalty)
                / 1_000.0;
            let available =
                (self.machines[i].bed_capacity_t - self.machines[i].bed_loading_t).max(0.0);
            let captured = captured_t.min(available);
            self.machines[i].bed_loading_t += captured;
            self.machines[i].wash_done = false;
            self.machines[i].clean_brine_m3 -= flow;
            self.machines[i].spent_brine_m3 += flow;
            self.machines[i].breakthrough = if captured_t > 0.0 {
                (captured_t - captured) / captured_t
            } else {
                0.0
            };
            self.machines[i].active = true;
            if self.machines[i].breakthrough > 0.12 {
                self.machines[i].alarm = Some("LITHIUM BREAKTHROUGH: BED CAPACITY EXCEEDED".into());
            }
        }
        if wash_open && self.machines[i].bed_loading_t > 0.0 && !self.machines[i].wash_done {
            let water_need = self.machines[i].bed_loading_t * 0.06;
            let water = self.machines[i].reagents_t[ReagentId::Water.index()];
            if water >= water_need {
                self.machines[i].reagents_t[ReagentId::Water.index()] -= water_need;
                self.machines[i].wash_done = true;
                self.push_event(
                    EventSeverity::Info,
                    format!("Adsorption bed #{} wash complete", id),
                );
            } else {
                self.machines[i].alarm = Some("WASH WATER STARVED".into());
            }
        }
        if elute_open && self.machines[i].bed_loading_t > 0.0 {
            if !self.machines[i].wash_done {
                self.machines[i].alarm = Some("ELUTION INTERLOCK: WASH STAGE INCOMPLETE".into());
                return;
            }
            let acid_efficiency = outputs.value("elution_valve", 0.0).clamp(0.0, 1.0);
            // Recovered HCl-synthesis heat preheats the elution cycle. The energy
            // coefficient is a game-scale balance parameter, not plant design data.
            let heat_need_kwh = self.machines[i].bed_loading_t * 35.0;
            let available_heat = self.machines[i].steam_kwh.max(0.0);
            let heat_fraction = if heat_need_kwh > 0.0 {
                (available_heat / heat_need_kwh).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let acid_need = self.machines[i].bed_loading_t
                * (0.045 + (0.85 - acid_efficiency).max(0.0) * 0.025)
                * (1.0 - heat_fraction * 0.08);
            let water_need = self.machines[i].bed_loading_t * 0.18;
            let acid = self.machines[i].reagents_t[ReagentId::HydrochloricAcid.index()];
            let water = self.machines[i].reagents_t[ReagentId::Water.index()];
            if acid >= acid_need && water >= water_need {
                let recovered = self.machines[i].bed_loading_t
                    * (0.90 + acid_efficiency * 0.02 + heat_fraction * 0.015).min(0.95);
                self.machines[i].reagents_t[ReagentId::HydrochloricAcid.index()] -= acid_need;
                self.machines[i].reagents_t[ReagentId::Water.index()] -= water_need;
                self.machines[i].steam_kwh =
                    (self.machines[i].steam_kwh - heat_need_kwh * heat_fraction).max(0.0);
                if heat_fraction > 0.0 {
                    self.push_event(
                        EventSeverity::Info,
                        format!(
                            "Adsorption bed #{id} recovered {:.0}% elution heat",
                            heat_fraction * 100.0
                        ),
                    );
                }
                self.machines[i].inventory_t[ProductId::LiClEluate.index()] += recovered;
                self.machines[i].bed_loading_t = 0.0;
                self.machines[i].wash_done = false;
                self.machines[i].breakthrough = 0.0;
                self.machines[i].active = true;
                self.push_event(
                    EventSeverity::Success,
                    format!(
                        "Adsorption bed #{id} eluted {:.3} t LiCl concentrate",
                        recovered
                    ),
                );
            } else {
                self.machines[i].alarm = Some("ELUTION BLOCKED: CHECK HCl / WASH WATER".into());
            }
        }
        if !feed_open && !elute_open {
            self.machines[i].active = false;
        }
    }

    fn process_carbonator(&mut self, i: usize, dt: f64) {
        let li = self.machines[i].inventory_t[ProductId::LiClEluate.index()];
        let soda = self.machines[i].reagents_t[ReagentId::SodaAsh.index()];
        if li <= 0.001 || soda <= 0.0 {
            self.machines[i].active = false;
            return;
        }
        // 2 LiCl + Na2CO3 -> Li2CO3 + 2 NaCl; mass ratios from molar masses.
        let li_used = li.min(soda / (105.988 / 84.78));
        let soda_used = li_used * (105.988 / 84.78);
        let li2co3 = li_used * (73.888 / 84.78);
        let nacl = li_used * (116.88 / 84.78);
        self.machines[i].inventory_t[ProductId::LiClEluate.index()] -= li_used;
        self.machines[i].reagents_t[ReagentId::SodaAsh.index()] -= soda_used;
        self.machines[i].inventory_t[ProductId::LithiumCarbonate.index()] += li2co3;
        self.machines[i].inventory_t[ProductId::SodiumChloride.index()] += nacl;
        self.machines[i].temperature_c = 72.0;
        self.machines[i].active = li_used > 0.0;
        let _ = dt;
    }

    fn process_lioh(&mut self, i: usize, _dt: f64) {
        let lithium = self.machines[i].inventory_t[ProductId::LithiumCarbonate.index()];
        let lime = self.machines[i].reagents_t[ReagentId::HydratedLime.index()];
        let water = self.machines[i].reagents_t[ReagentId::Water.index()];
        if lithium <= 0.001 || lime <= 0.0 || water <= 0.0 {
            self.machines[i].active = false;
            return;
        }
        let lime_per_t = 74.092 / 73.888;
        let water_per_t = 36.03 / 73.888;
        let lithium_used = lithium.min((lime / lime_per_t).min(water / water_per_t));
        let lime_used = lithium_used * lime_per_t;
        let water_used = lithium_used * water_per_t;
        self.machines[i].inventory_t[ProductId::LithiumCarbonate.index()] -= lithium_used;
        self.machines[i].reagents_t[ReagentId::HydratedLime.index()] -= lime_used;
        self.machines[i].reagents_t[ReagentId::Water.index()] -= water_used;
        self.machines[i].inventory_t[ProductId::LithiumHydroxideMonohydrate.index()] +=
            lithium_used * (83.924 / 73.888);
        self.machines[i].inventory_t[ProductId::CalciumCarbonate.index()] +=
            lithium_used * (100.086 / 73.888);
        self.machines[i].temperature_c = 92.0;
        self.machines[i].active = lithium_used > 0.0;
        if self.machines[i].temperature_c > 90.0 {
            self.machines[i].wear += 0.0004;
        }
    }

    fn process_chloralkali(&mut self, i: usize, _dt: f64) {
        let salt = self.machines[i].inventory_t[ProductId::SodiumChloride.index()];
        let water = self.machines[i].reagents_t[ReagentId::Water.index()];
        if salt <= 0.001 || water <= 0.0 {
            self.machines[i].active = false;
            return;
        }
        let water_per_salt = 36.03 / 116.88;
        let salt_used = salt.min(water / water_per_salt);
        let water_used = salt_used * water_per_salt;
        self.machines[i].inventory_t[ProductId::SodiumChloride.index()] -= salt_used;
        self.machines[i].reagents_t[ReagentId::Water.index()] -= water_used;
        self.machines[i].inventory_t[ProductId::SodiumHydroxide.index()] +=
            salt_used * (79.994 / 116.88);
        self.machines[i].inventory_t[ProductId::ChlorineGas.index()] +=
            salt_used * (70.90 / 116.88);
        self.machines[i].inventory_t[ProductId::HydrogenGas.index()] +=
            salt_used * (2.016 / 116.88);
        self.machines[i].temperature_c = 78.0;
        self.machines[i].active = salt_used > 0.0;
        if self.machines[i].inventory_t[ProductId::ChlorineGas.index()] > 0.05
            && !self.has_output(ProductId::ChlorineGas, MachineKind::ProductTank, i)
        {
            self.machines[i].alarm =
                Some("CHLORINE ACCUMULATING: CONNECT GAS HOLDER / SCRUBBER".into());
        }
    }

    fn process_acid_synthesis(&mut self, i: usize, _dt: f64) {
        let h2 = self.machines[i].inventory_t[ProductId::HydrogenGas.index()];
        let cl2 = self.machines[i].inventory_t[ProductId::ChlorineGas.index()];
        if h2 <= 0.000_1 || cl2 <= 0.001 {
            self.machines[i].active = false;
            return;
        }
        let h2_per_cl2 = 2.016 / 70.90;
        let cl2_used = cl2.min(h2 / h2_per_cl2);
        let h2_used = cl2_used * h2_per_cl2;
        let hcl_out = h2_used + cl2_used;
        self.machines[i].inventory_t[ProductId::HydrogenGas.index()] -= h2_used;
        self.machines[i].inventory_t[ProductId::ChlorineGas.index()] -= cl2_used;
        self.machines[i].inventory_t[ProductId::HydrochloricAcid.index()] += hcl_out;
        self.machines[i].steam_kwh += hcl_out * 700.0;
        self.machines[i].temperature_c = 180.0;
        self.machines[i].active = true;
        if self.machines[i].temperature_c > 150.0 {
            self.machines[i].wear += 0.0003;
        }
    }

    fn process_reinjection(&mut self, i: usize, dt: f64) {
        if !self.has_link(
            Endpoint::Machine(self.machines[i].id),
            Endpoint::Service(ServicePort::Reinjection),
            LineKind::Reinjection,
        ) {
            self.machines[i].alarm = Some("NO REINJECTION CONNECTION: RESERVOIR DEPLETION".into());
            self.reservoir.pressure_decline += 0.002 * dt as f32;
            return;
        }
        let flow = self.machines[i].spent_brine_m3.min(4.0 * dt);
        self.machines[i].spent_brine_m3 -= flow;
        self.total_reinjected_m3 += flow;
        self.reservoir.pressure_decline =
            (self.reservoir.pressure_decline - flow as f32 * 0.000_01).max(0.0);
        self.machines[i].active = flow > 0.0;
    }

    fn has_output(
        &self,
        product: ProductId,
        target_kind: MachineKind,
        source_index: usize,
    ) -> bool {
        let source_id = self.machines[source_index].id;
        self.connections.iter().any(|c| {
            if c.from != Endpoint::Machine(source_id) {
                return false;
            }
            if let Endpoint::Machine(target) = c.to {
                self.machine(target)
                    .map(|m| m.kind == target_kind)
                    .unwrap_or(false)
                    && match product {
                        ProductId::SodiumChloride => {
                            c.line == LineKind::Salt || c.line == LineKind::Product
                        }
                        ProductId::HydrogenGas => {
                            c.line == LineKind::Hydrogen || c.line == LineKind::Product
                        }
                        ProductId::ChlorineGas => {
                            c.line == LineKind::Chlorine || c.line == LineKind::Product
                        }
                        _ => c.line == LineKind::Product,
                    }
            } else {
                false
            }
        })
    }

    fn update_line_fouling(&mut self, dt: f64) {
        let silica = self.reservoir.silica_kg_m3 as f32;
        let mut new_leaks = 0_u32;
        for index in 0..self.connections.len() {
            let connection = &mut self.connections[index];
            let brine_line = matches!(
                connection.line,
                LineKind::RawBrine | LineKind::CleanBrine | LineKind::SpentBrine
            );
            if brine_line {
                connection.fouling = (connection.fouling + silica * 0.000_02 * dt as f32).min(0.8);
            }
            if connection.leak_fraction <= 0.0 {
                let corrosive = matches!(
                    connection.line,
                    LineKind::Acid | LineKind::Caustic | LineKind::Chlorine | LineKind::Hydrogen
                );
                let fouled_stress = if brine_line {
                    (connection.fouling - 0.35).max(0.0) * 0.012
                } else {
                    0.0
                };
                let corrosion_stress = if corrosive { 0.0015 } else { 0.0 };
                let probability =
                    (f64::from(fouled_stress + corrosion_stress) * dt).clamp(0.0, 0.02);
                if self.rng.unit() < probability {
                    connection.leak_fraction = 0.08;
                    new_leaks += 1;
                }
            }
        }
        if new_leaks > 0 {
            self.push_event(EventSeverity::Critical, format!("{new_leaks} network leak(s) detected. Select a machine and press K to repair all leaking lines."));
        }
    }

    pub fn repair_leaking_lines(&mut self) -> Result<usize, String> {
        let count = self
            .connections
            .iter()
            .filter(|c| c.leak_fraction > 0.0)
            .count();
        if count == 0 {
            return Ok(0);
        }
        let cost = count as f64 * 650.0;
        if self.cash < cost {
            return Err(format!(
                "Network repair costs ${cost:.0}; insufficient cash"
            ));
        }
        self.cash -= cost;
        for connection in &mut self.connections {
            connection.leak_fraction = 0.0;
        }
        self.push_event(
            EventSeverity::Success,
            format!("Repaired {count} leaking line(s) for ${cost:.0}"),
        );
        Ok(count)
    }

    pub fn sell_product_tank(&mut self, tank_id: u32) -> Result<f64, String> {
        if !self.has_link(
            Endpoint::Machine(tank_id),
            Endpoint::Service(ServicePort::Market),
            LineKind::Product,
        ) {
            return Err("Connect the product tank to the dispatch terminal".into());
        }
        let tank = self
            .machine(tank_id)
            .ok_or_else(|| "Unknown tank".to_string())?;
        if tank.kind != MachineKind::ProductTank {
            return Err("Select a product tank".into());
        }
        let inventory = tank.inventory_t;
        let mut gross = 0.0;
        for product in ProductId::ALL {
            let index = product.index();
            let tonnes = inventory[index];
            if tonnes <= 0.0 {
                continue;
            }
            let (sold, product_gross) = self.market.sell(product, tonnes);
            gross += product_gross;
            self.machine_mut(tank_id).expect("tank exists").inventory_t[index] -= sold;
            if product == self.market.contract_product {
                self.delivered_contract_t += sold;
            }
        }
        if self.delivered_contract_t >= self.market.contract_target_t && !self.contract_paid {
            gross += 8_000.0;
            self.contract_paid = true;
            self.push_event(
                EventSeverity::Success,
                format!(
                    "CONTRACT COMPLETE · $8,000 BONUS · {}",
                    PRODUCTS[self.market.contract_product.index()].name
                ),
            );
        }
        self.cash += gross;
        self.push_event(
            EventSeverity::Success,
            format!("Dispatch settled · ${gross:.0}"),
        );
        Ok(gross)
    }

    pub fn total_products_t(&self) -> f64 {
        self.machines.iter().flat_map(|m| m.inventory_t).sum()
    }

    pub fn save_json(&self) -> Result<String, String> {
        #[derive(Serialize)]
        struct SaveEnvelope<'a> {
            version: u32,
            plant: &'a PlantSim,
        }
        serde_json::to_string(&SaveEnvelope {
            version: 2,
            plant: self,
        })
        .map_err(|error| format!("save encode failed: {error}"))
    }

    pub fn load_json(serialized: &str) -> Result<Self, String> {
        #[derive(Deserialize)]
        struct SaveEnvelope {
            version: u32,
            plant: PlantSim,
        }
        let mut envelope: SaveEnvelope = serde_json::from_str(serialized)
            .map_err(|error| format!("save decode failed: {error}"))?;
        if envelope.version != 2 {
            return Err(format!("unsupported save version {}", envelope.version));
        }
        let sources = envelope.plant.controller_sources.clone();
        for (id, source) in sources {
            let compiled = ScriptController::compile(&source)
                .map_err(|error| format!("controller #{id} could not be restored: {error}"))?;
            envelope.plant.script_controllers.insert(id, compiled);
        }
        Ok(envelope.plant)
    }

    pub fn reset_seed(&mut self, seed: u64) {
        *self = Self::new(seed);
    }
}

fn drain_leaked_buffer(from: &mut MachineState, line: LineKind, leak_t: f64) {
    if leak_t <= 0.0 {
        return;
    }
    match line {
        LineKind::RawBrine => {
            let v = from.raw_brine_m3.min(leak_t);
            from.raw_brine_m3 -= v;
        }
        LineKind::CleanBrine => {
            let v = from.clean_brine_m3.min(leak_t);
            from.clean_brine_m3 -= v;
        }
        LineKind::SpentBrine => {
            let v = from.spent_brine_m3.min(leak_t);
            from.spent_brine_m3 -= v;
        }
        LineKind::Acid => {
            let index = ReagentId::HydrochloricAcid.index();
            if from.kind == MachineKind::ReagentTank {
                from.reagents_t[index] = (from.reagents_t[index] - leak_t).max(0.0);
            } else {
                let p = ProductId::HydrochloricAcid.index();
                from.inventory_t[p] = (from.inventory_t[p] - leak_t).max(0.0);
            }
        }
        LineKind::Caustic => {
            let reagent = ReagentId::SodiumHydroxide.index();
            let product = ProductId::SodiumHydroxide.index();
            if from.kind == MachineKind::ReagentTank {
                from.reagents_t[reagent] = (from.reagents_t[reagent] - leak_t).max(0.0);
            } else {
                from.inventory_t[product] = (from.inventory_t[product] - leak_t).max(0.0);
            }
        }
        LineKind::WashWater => {
            let i = ReagentId::Water.index();
            from.reagents_t[i] = (from.reagents_t[i] - leak_t).max(0.0);
        }
        LineKind::SodaAsh => {
            let i = ReagentId::SodaAsh.index();
            from.reagents_t[i] = (from.reagents_t[i] - leak_t).max(0.0);
        }
        LineKind::HydratedLime => {
            let i = ReagentId::HydratedLime.index();
            from.reagents_t[i] = (from.reagents_t[i] - leak_t).max(0.0);
        }
        LineKind::LithiumLiquor => {
            let i = ProductId::LiClEluate.index();
            from.inventory_t[i] = (from.inventory_t[i] - leak_t).max(0.0);
        }
        LineKind::Salt => {
            let i = ProductId::SodiumChloride.index();
            from.inventory_t[i] = (from.inventory_t[i] - leak_t).max(0.0);
        }
        LineKind::Hydrogen => {
            let i = ProductId::HydrogenGas.index();
            from.inventory_t[i] = (from.inventory_t[i] - leak_t).max(0.0);
        }
        LineKind::Chlorine => {
            let i = ProductId::ChlorineGas.index();
            from.inventory_t[i] = (from.inventory_t[i] - leak_t).max(0.0);
        }
        LineKind::Steam => {
            from.steam_kwh = (from.steam_kwh - leak_t * 700.0).max(0.0);
        }
        LineKind::Solid => {
            for p in [ProductId::MagnesiumHydroxide, ProductId::CalciumCarbonate] {
                let i = p.index();
                let v = from.inventory_t[i].min(leak_t * 0.5);
                from.inventory_t[i] -= v;
            }
        }
        LineKind::Product => {
            for p in ProductId::ALL {
                let i = p.index();
                let v = from.inventory_t[i].min(leak_t / PRODUCT_COUNT as f64);
                from.inventory_t[i] -= v;
            }
        }
        _ => {}
    }
}

fn transfer_buffers(from: &mut MachineState, to: &mut MachineState, line: LineKind, max_t: f64) {
    match line {
        LineKind::RawBrine => {
            let v = from.raw_brine_m3.min(max_t);
            from.raw_brine_m3 -= v;
            to.raw_brine_m3 += v;
        }
        LineKind::CleanBrine => {
            let v = from.clean_brine_m3.min(max_t);
            from.clean_brine_m3 -= v;
            to.clean_brine_m3 += v;
        }
        LineKind::SpentBrine => {
            let v = from.spent_brine_m3.min(max_t);
            from.spent_brine_m3 -= v;
            to.spent_brine_m3 += v;
        }
        LineKind::Acid => {
            let reagent = ReagentId::HydrochloricAcid.index();
            let product = ProductId::HydrochloricAcid.index();
            let from_reagent = from.kind == MachineKind::ReagentTank;
            let v = if from_reagent {
                from.reagents_t[reagent].min(max_t)
            } else {
                from.inventory_t[product].min(max_t)
            };
            if from_reagent {
                from.reagents_t[reagent] -= v;
            } else {
                from.inventory_t[product] -= v;
            }
            if to.kind == MachineKind::ProductTank {
                to.inventory_t[product] += v;
            } else {
                to.reagents_t[reagent] += v;
            }
        }
        LineKind::Caustic => {
            let reagent = ReagentId::SodiumHydroxide.index();
            let product = ProductId::SodiumHydroxide.index();
            let from_reagent = from.kind == MachineKind::ReagentTank;
            let v = if from_reagent {
                from.reagents_t[reagent].min(max_t)
            } else {
                from.inventory_t[product].min(max_t)
            };
            if from_reagent {
                from.reagents_t[reagent] -= v;
            } else {
                from.inventory_t[product] -= v;
            }
            if to.kind == MachineKind::ProductTank {
                to.inventory_t[product] += v;
            } else {
                to.reagents_t[reagent] += v;
            }
        }
        LineKind::WashWater => {
            let i = ReagentId::Water.index();
            let v = from.reagents_t[i].min(max_t);
            from.reagents_t[i] -= v;
            to.reagents_t[i] += v;
        }
        LineKind::SodaAsh => {
            let i = ReagentId::SodaAsh.index();
            let v = from.reagents_t[i].min(max_t);
            from.reagents_t[i] -= v;
            to.reagents_t[i] += v;
        }
        LineKind::HydratedLime => {
            let i = ReagentId::HydratedLime.index();
            let v = from.reagents_t[i].min(max_t);
            from.reagents_t[i] -= v;
            to.reagents_t[i] += v;
        }
        LineKind::LithiumLiquor => transfer_product(from, to, ProductId::LiClEluate, max_t),
        LineKind::Salt => transfer_product(from, to, ProductId::SodiumChloride, max_t),
        LineKind::Hydrogen => transfer_product(from, to, ProductId::HydrogenGas, max_t),
        LineKind::Chlorine => transfer_product(from, to, ProductId::ChlorineGas, max_t),
        LineKind::Steam => {
            let v = from.steam_kwh.min(max_t * 700.0);
            from.steam_kwh -= v;
            to.steam_kwh += v;
        }
        LineKind::Solid => {
            for p in [ProductId::MagnesiumHydroxide, ProductId::CalciumCarbonate] {
                transfer_product(from, to, p, max_t);
            }
        }
        LineKind::Product => {
            for p in ProductId::ALL {
                transfer_product(from, to, p, max_t / PRODUCT_COUNT as f64);
            }
        }
        _ => {}
    }
}
fn transfer_product(
    from: &mut MachineState,
    to: &mut MachineState,
    product: ProductId,
    max_t: f64,
) {
    let i = product.index();
    let v = from.inventory_t[i].min(max_t);
    from.inventory_t[i] -= v;
    to.inventory_t[i] += v;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn plot_starts_empty_and_machine_costs_money() {
        let mut p = PlantSim::new(4);
        assert!(p.machines.is_empty());
        p.place_machine(MachineKind::WellPump, GridPos::new(2, 2))
            .unwrap();
        assert!(p.cash < 50_000.0);
    }
    #[test]
    fn incompatible_pipe_is_rejected() {
        let mut p = PlantSim::new(4);
        let pump = p
            .place_machine(MachineKind::WellPump, GridPos::new(2, 2))
            .unwrap();
        let cell = p
            .place_machine(MachineKind::ChlorAlkaliCell, GridPos::new(4, 2))
            .unwrap();
        assert!(matches!(
            p.connect(
                Endpoint::Machine(pump),
                Endpoint::Machine(cell),
                LineKind::RawBrine
            ),
            Err(LinkError::Incompatible { .. })
        ));
    }
    #[test]
    fn disconnected_pump_does_not_generate_brine() {
        let mut p = PlantSim::new(4);
        let id = p
            .place_machine(MachineKind::WellPump, GridPos::new(2, 2))
            .unwrap();
        p.paused = false;
        p.step(1.0);
        assert_eq!(p.machine(id).unwrap().raw_brine_m3, 0.0);
    }
    #[test]
    fn pretreatment_emits_both_magnesium_cake_and_salt_coproduct() {
        let mut p = PlantSim::new(14);
        let id = p
            .place_machine(MachineKind::Pretreatment, GridPos::new(2, 2))
            .unwrap();
        let state = p.machine_mut(id).unwrap();
        state.raw_brine_m3 = 1.0;
        state.reagents_t[ReagentId::SodiumHydroxide.index()] = 1.0;
        p.process_pretreatment(0, 0.25);
        let state = p.machine(id).unwrap();
        assert!(state.inventory_t[ProductId::MagnesiumHydroxide.index()] > 0.0);
        assert!(state.inventory_t[ProductId::SodiumChloride.index()] > 0.0);
    }
    #[test]
    fn leaking_brine_line_loses_material_instead_of_only_slowing_flow() {
        let mut p = PlantSim::new(12);
        let pump = p
            .place_machine(MachineKind::WellPump, GridPos::new(2, 2))
            .unwrap();
        let pretreat = p
            .place_machine(MachineKind::Pretreatment, GridPos::new(4, 2))
            .unwrap();
        p.connect(
            Endpoint::Machine(pump),
            Endpoint::Machine(pretreat),
            LineKind::RawBrine,
        )
        .unwrap();
        p.machine_mut(pump).unwrap().raw_brine_m3 = 0.5;
        p.connections[0].leak_fraction = 0.25;
        let link = p.connections[0].clone();
        p.transfer_one(&link);
        assert!(p.machine(pump).unwrap().raw_brine_m3 < 0.5);
        assert!(p.machine(pretreat).unwrap().raw_brine_m3 < 0.5);
        let total =
            p.machine(pump).unwrap().raw_brine_m3 + p.machine(pretreat).unwrap().raw_brine_m3;
        assert!(total < 0.5, "leak must remove mass, total={total}");
    }
    #[test]
    fn leaking_lines_can_be_repaired_for_a_visible_cost() {
        let mut p = PlantSim::new(13);
        let pump = p
            .place_machine(MachineKind::WellPump, GridPos::new(2, 2))
            .unwrap();
        let pretreat = p
            .place_machine(MachineKind::Pretreatment, GridPos::new(4, 2))
            .unwrap();
        p.connect(
            Endpoint::Machine(pump),
            Endpoint::Machine(pretreat),
            LineKind::RawBrine,
        )
        .unwrap();
        p.connections[0].leak_fraction = 0.08;
        let cash = p.cash;
        assert_eq!(p.repair_leaking_lines().unwrap(), 1);
        assert_eq!(p.connections[0].leak_fraction, 0.0);
        assert!(p.cash < cash);
    }
    #[test]
    fn save_load_round_trip_restores_machine_and_controller_source() {
        let mut p = PlantSim::new(42);
        let id = p
            .place_machine(MachineKind::CodeController, GridPos::new(3, 4))
            .unwrap();
        let source = "set(\"feed_valve\", 0.75);";
        p.compile_controller(id, source).unwrap();
        let encoded = p.save_json().unwrap();
        let restored = PlantSim::load_json(&encoded).unwrap();
        assert_eq!(restored.seed, 42);
        assert_eq!(
            restored.machine(id).unwrap().kind,
            MachineKind::CodeController
        );
        assert_eq!(
            restored.controller_sources.get(&id).map(String::as_str),
            Some(source)
        );
        assert!(restored.script_controllers.contains_key(&id));
    }
    #[test]
    fn elution_interlock_requires_a_completed_wash() {
        let mut p = PlantSim::new(9);
        let bed = p
            .place_machine(MachineKind::AdsorptionBed, GridPos::new(4, 4))
            .unwrap();
        let plc = p
            .place_machine(MachineKind::CodeController, GridPos::new(6, 4))
            .unwrap();
        p.connect(
            Endpoint::Machine(bed),
            Endpoint::Machine(plc),
            LineKind::LogicSensor,
        )
        .unwrap();
        p.connect(
            Endpoint::Machine(plc),
            Endpoint::Machine(bed),
            LineKind::LogicActuator,
        )
        .unwrap();
        p.compile_controller(
            plc,
            "set(\"feed_valve\", 0.0); set(\"wash_valve\", 0.0); set(\"elution_valve\", 1.0);",
        )
        .unwrap();
        let state = p.machine_mut(bed).unwrap();
        state.bed_loading_t = 0.01;
        state.reagents_t[ReagentId::HydrochloricAcid.index()] = 1.0;
        state.reagents_t[ReagentId::Water.index()] = 1.0;
        p.process_adsorption(p.machines.iter().position(|m| m.id == bed).unwrap(), 0.25);
        assert!(
            p.machine(bed)
                .unwrap()
                .alarm
                .as_deref()
                .unwrap_or("")
                .contains("WASH STAGE INCOMPLETE")
        );
        assert_eq!(
            p.machine(bed).unwrap().inventory_t[ProductId::LiClEluate.index()],
            0.0
        );
    }
    #[test]
    fn recovered_steam_reduces_elution_acid_and_is_consumed() {
        let mut p = PlantSim::new(11);
        let bed = p
            .place_machine(MachineKind::AdsorptionBed, GridPos::new(4, 4))
            .unwrap();
        let plc = p
            .place_machine(MachineKind::CodeController, GridPos::new(6, 4))
            .unwrap();
        p.connect(
            Endpoint::Machine(bed),
            Endpoint::Machine(plc),
            LineKind::LogicSensor,
        )
        .unwrap();
        p.connect(
            Endpoint::Machine(plc),
            Endpoint::Machine(bed),
            LineKind::LogicActuator,
        )
        .unwrap();
        p.compile_controller(plc, "set(\"elution_valve\", 0.85);")
            .unwrap();
        let state = p.machine_mut(bed).unwrap();
        state.bed_loading_t = 0.01;
        state.wash_done = true;
        state.reagents_t[ReagentId::HydrochloricAcid.index()] = 1.0;
        state.reagents_t[ReagentId::Water.index()] = 1.0;
        state.steam_kwh = 10.0;
        let before_acid = state.reagents_t[ReagentId::HydrochloricAcid.index()];
        p.process_adsorption(p.machines.iter().position(|m| m.id == bed).unwrap(), 0.25);
        let after = p.machine(bed).unwrap();
        assert!(after.reagents_t[ReagentId::HydrochloricAcid.index()] > before_acid - 0.00045);
        assert!(after.steam_kwh < 10.0);
        assert!(after.inventory_t[ProductId::LiClEluate.index()] > 0.0);
    }
}
