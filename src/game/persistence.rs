use crate::sim::plant::PlantSim;

const SAVE_KEY: &str = "basin07.save.v2";

pub fn save_plant(plant: &PlantSim) -> Result<(), String> {
    let data = plant.save_json()?;
    #[cfg(target_arch = "wasm32")]
    {
        let window = web_sys::window().ok_or_else(|| "browser window unavailable".to_string())?;
        let storage = window
            .local_storage()
            .map_err(|e| format!("localStorage error: {e:?}"))?
            .ok_or_else(|| "localStorage unavailable".to_string())?;
        storage
            .set_item(SAVE_KEY, &data)
            .map_err(|e| format!("save failed: {e:?}"))?;
        Ok(())
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = SAVE_KEY;
        std::fs::write("basin07-save.json", data).map_err(|e| format!("save failed: {e}"))
    }
}

pub fn load_plant() -> Result<PlantSim, String> {
    #[cfg(target_arch = "wasm32")]
    {
        let window = web_sys::window().ok_or_else(|| "browser window unavailable".to_string())?;
        let storage = window
            .local_storage()
            .map_err(|e| format!("localStorage error: {e:?}"))?
            .ok_or_else(|| "localStorage unavailable".to_string())?;
        let data = storage
            .get_item(SAVE_KEY)
            .map_err(|e| format!("load failed: {e:?}"))?
            .ok_or_else(|| "No browser save found. Press F5 after building a plant.".to_string())?;
        PlantSim::load_json(&data)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = SAVE_KEY;
        let data = std::fs::read_to_string("basin07-save.json")
            .map_err(|e| format!("load failed: {e}"))?;
        PlantSim::load_json(&data)
    }
}
