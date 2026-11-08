pub const GRID_SIZE: usize = 128;
pub const GRID_CELLS: usize = GRID_SIZE * GRID_SIZE;
pub const DESK_SIZE: f32 = 10.0;
pub const CELL_SIZE: f32 = DESK_SIZE / (GRID_SIZE as f32 - 1.0);

pub struct FlowBuffers {
    east: Vec<f32>,
    west: Vec<f32>,
    south: Vec<f32>,
    north: Vec<f32>,
    delta: Vec<f32>,
}

impl FlowBuffers {
    pub fn new() -> Self {
        Self {
            east: vec![0.0; GRID_CELLS],
            west: vec![0.0; GRID_CELLS],
            south: vec![0.0; GRID_CELLS],
            north: vec![0.0; GRID_CELLS],
            delta: vec![0.0; GRID_CELLS],
        }
    }

    pub fn step(
        &mut self,
        height: &[f32],
        water: &mut [f32],
        dt: f32,
        allow_edge_spill: bool,
        evaporation_rate: f32,
    ) {
        self.east.fill(0.0);
        self.west.fill(0.0);
        self.south.fill(0.0);
        self.north.fill(0.0);
        self.delta.fill(0.0);

        let flow_rate = 2.4;
        for z in 0..GRID_SIZE {
            for x in 0..GRID_SIZE {
                let index = z * GRID_SIZE + x;
                let surface = height[index] + water[index];
                let mut east = 0.0;
                let mut west = 0.0;
                let mut south = 0.0;
                let mut north = 0.0;

                if x + 1 < GRID_SIZE {
                    let neighbour = index + 1;
                    east = ((surface - height[neighbour] - water[neighbour]).max(0.0))
                        * flow_rate
                        * dt;
                }
                if x > 0 {
                    let neighbour = index - 1;
                    west = ((surface - height[neighbour] - water[neighbour]).max(0.0))
                        * flow_rate
                        * dt;
                }
                if z + 1 < GRID_SIZE {
                    let neighbour = index + GRID_SIZE;
                    south = ((surface - height[neighbour] - water[neighbour]).max(0.0))
                        * flow_rate
                        * dt;
                }
                if z > 0 {
                    let neighbour = index - GRID_SIZE;
                    north = ((surface - height[neighbour] - water[neighbour]).max(0.0))
                        * flow_rate
                        * dt;
                }

                let requested = east + west + south + north;
                let scale = if requested > water[index] * 0.45 && requested > 0.0 {
                    water[index] * 0.45 / requested
                } else {
                    1.0
                };
                self.east[index] = east * scale;
                self.west[index] = west * scale;
                self.south[index] = south * scale;
                self.north[index] = north * scale;
            }
        }

        for z in 0..GRID_SIZE {
            for x in 0..GRID_SIZE {
                let index = z * GRID_SIZE + x;
                let outgoing = self.east[index]
                    + self.west[index]
                    + self.south[index]
                    + self.north[index];

                self.delta[index] -= outgoing;
                if x + 1 < GRID_SIZE {
                    self.delta[index + 1] += self.east[index];
                }
                if x > 0 {
                    self.delta[index - 1] += self.west[index];
                }
                if z + 1 < GRID_SIZE {
                    self.delta[index + GRID_SIZE] += self.south[index];
                }
                if z > 0 {
                    self.delta[index - GRID_SIZE] += self.north[index];
                }
            }
        }

        for z in 0..GRID_SIZE {
            for x in 0..GRID_SIZE {
                let index = z * GRID_SIZE + x;
                water[index] = (water[index] + self.delta[index]).max(0.0);

                if allow_edge_spill
                    && (x == 0 || z == 0 || x + 1 == GRID_SIZE || z + 1 == GRID_SIZE)
                {
                    let excess = (height[index] + water[index] - 0.18).max(0.0);
                    water[index] = (water[index] - (excess * 2.5 * dt).min(water[index])).max(0.0);
                }

                if evaporation_rate > 0.0 {
                    water[index] = (water[index] - water[index] * evaporation_rate * dt).max(0.0);
                }
            }
        }
    }
}

pub fn total_volume(depth: &[f32]) -> f32 {
    depth.iter().sum::<f32>() * CELL_SIZE * CELL_SIZE
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn internal_flow_conserves_volume() {
        let height = vec![0.0; GRID_CELLS];
        let mut water = vec![0.0; GRID_CELLS];
        let mut flow = FlowBuffers::new();
        water[64 * GRID_SIZE + 64] = 0.25;
        water[64 * GRID_SIZE + 65] = 0.08;
        let before = total_volume(&water);

        for _ in 0..240 {
            flow.step(&height, &mut water, 1.0 / 60.0, false, 0.0);
        }

        let after = total_volume(&water);
        assert!((before - after).abs() < 0.00001, "volume changed from {before} to {after}");
    }

    #[test]
    fn water_can_leave_the_grid_only_through_edge_spill() {
        let height = vec![0.0; GRID_CELLS];
        let mut water = vec![0.0; GRID_CELLS];
        let mut flow = FlowBuffers::new();
        water[GRID_SIZE / 2] = 0.0;
        water[10] = 0.25;
        let before = total_volume(&water);

        for _ in 0..240 {
            flow.step(&height, &mut water, 1.0 / 60.0, true, 0.0);
        }

        assert!(total_volume(&water) <= before);
    }
}
