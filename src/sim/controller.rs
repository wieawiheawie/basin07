use std::{collections::BTreeMap, sync::{Arc, RwLock}};
use rhai::{AST, Engine, EvalAltResult};

#[derive(Clone, Debug, Default)]
pub struct ControlOutputs {
    pub values: BTreeMap<String, f64>,
    pub alarms: Vec<String>,
}
impl ControlOutputs {
    pub fn value(&self, name: &str, fallback: f64) -> f64 { self.values.get(name).copied().unwrap_or(fallback) }
}

pub struct ScriptController {
    engine: Engine,
    ast: AST,
    sensors: Arc<RwLock<BTreeMap<String, f64>>>,
    outputs: Arc<RwLock<BTreeMap<String, f64>>>,
    alarms: Arc<RwLock<Vec<String>>>,
}

impl ScriptController {
    pub const MAX_OPERATIONS: u64 = 2_000;
    pub const MAX_CALL_LEVELS: usize = 16;

    pub fn compile(source: &str) -> Result<Self, String> {
        let sensors = Arc::new(RwLock::new(BTreeMap::<String, f64>::new()));
        let outputs = Arc::new(RwLock::new(BTreeMap::<String, f64>::new()));
        let alarms = Arc::new(RwLock::new(Vec::<String>::new()));
        if source.len() > 4_096 {
            return Err("compile: controller source exceeds 4096 bytes".into());
        }
        let mut engine = Engine::new();
        engine
            .set_max_operations(Self::MAX_OPERATIONS)
            .set_max_call_levels(Self::MAX_CALL_LEVELS)
            .set_max_variables(64)
            .set_max_functions(8)
            .set_max_expr_depths(32, 32)
            .set_max_string_size(1_024)
            .set_max_array_size(32)
            .set_max_map_size(32)
            .set_max_strings_interned(128);
        // Rhai's built-in console hooks are redirected to no-ops. The game exposes
        // only the explicit read/set/alarm bridge below; `no_module` removes imports.
        engine.on_print(|_| {});
        engine.on_debug(|_, _, _| {});

        let sensor_ref = Arc::clone(&sensors);
        engine.register_fn("read", move |name: &str| -> f64 {
            sensor_ref.read().unwrap_or_else(|e| e.into_inner()).get(name).copied().unwrap_or(0.0)
        });
        let output_ref = Arc::clone(&outputs);
        engine.register_fn("set", move |name: &str, value: f64| {
            // Actuator writes are setpoints. The plant solver still enforces physical limits.
            output_ref.write().unwrap_or_else(|e| e.into_inner()).insert(name.to_owned(), value.clamp(0.0, 1.0));
        });
        let alarm_ref = Arc::clone(&alarms);
        engine.register_fn("alarm", move |code: &str| {
            let mut list = alarm_ref.write().unwrap_or_else(|e| e.into_inner());
            if list.len() < 8 && !list.iter().any(|x| x == code) { list.push(code.to_owned()); }
        });
        let ast = engine.compile(source).map_err(|e| format!("compile: {e}"))?;
        Ok(Self { engine, ast, sensors, outputs, alarms })
    }

    pub fn run(&mut self, sensors: &BTreeMap<String, f64>) -> Result<ControlOutputs, String> {
        *self.sensors.write().unwrap_or_else(|e| e.into_inner()) = sensors.clone();
        self.outputs.write().unwrap_or_else(|e| e.into_inner()).clear();
        self.alarms.write().unwrap_or_else(|e| e.into_inner()).clear();
        self.engine.run_ast(&self.ast).map_err(|e: Box<EvalAltResult>| format!("runtime: {e}"))?;
        Ok(ControlOutputs { values: self.outputs.read().unwrap_or_else(|e| e.into_inner()).clone(), alarms: self.alarms.read().unwrap_or_else(|e| e.into_inner()).clone() })
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PresetController;
impl PresetController {
    pub fn tick(&self, breakthrough: f64, tank_level: f64, bed_loading: f64) -> ControlOutputs {
        let mut out = ControlOutputs::default();
        let change_cycle = breakthrough > 0.12 || bed_loading > 0.72;
        out.values.insert("feed_valve".into(), if change_cycle { 0.0 } else if tank_level < 0.92 { 0.86 } else { 0.35 });
        out.values.insert("wash_valve".into(), if change_cycle { 0.42 } else { 0.0 });
        out.values.insert("elution_valve".into(), if change_cycle && tank_level > 0.10 { 0.72 } else { 0.0 });
        out.values.insert("well_pump".into(), if tank_level < 0.88 { 0.86 } else { 0.45 });
        if breakthrough > 0.12 { out.alarms.push("PRESET_BREAKTHROUGH".into()); }
        out
    }
}

pub fn starter_script() -> &'static str {
    r#"
if read("bed.breakthrough") > 0.12 || read("bed.loading") > 0.72 {
    set("feed_valve", 0.0);
    set("wash_valve", 0.55);
    set("elution_valve", 0.85);
} else {
    set("feed_valve", 1.0);
    set("wash_valve", 0.0);
    set("elution_valve", 0.0);
}
if read("feed_tank.level") < 0.25 { set("well_pump", 0.75); }
"#
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn script_reads_sensors_and_sets_bounded_actuators() {
        let mut vm = ScriptController::compile("set(\"feed_valve\", read(\"bed.breakthrough\") * 10.0);").unwrap();
        let mut sensors = BTreeMap::new(); sensors.insert("bed.breakthrough".into(), 0.3);
        let out = vm.run(&sensors).unwrap();
        assert_eq!(out.value("feed_valve", -1.0), 1.0);
    }
    #[test] fn preset_emits_safe_cycle_when_breakthrough_is_high() {
        let out = PresetController.tick(0.2, 0.8, 0.9);
        assert_eq!(out.value("feed_valve", 1.0), 0.0);
        assert!(out.alarms.contains(&"PRESET_BREAKTHROUGH".into()));
    }
    #[test] fn runaway_script_is_bounded() {
        let mut vm = ScriptController::compile("loop { let x = 1 + 1; }").unwrap();
        let err = vm.run(&BTreeMap::new()).unwrap_err();
        assert!(err.contains("runtime"));
    }
}
