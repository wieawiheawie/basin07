use super::catalog::{PRODUCT_COUNT, PRODUCTS, ProductId};

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct MarketState {
    pub price_usd_t: [f64; PRODUCT_COUNT],
    pub demand_t: [f64; PRODUCT_COUNT],
    pub competitor_supply_t: [f64; PRODUCT_COUNT],
    pub player_supply_t: [f64; PRODUCT_COUNT],
    pub contract_product: ProductId,
    pub contract_target_t: f64,
    pub contract_price_usd_t: f64,
    pub contract_time_left_minutes: f64,
    pub contract_revision: u32,
}

impl MarketState {
    pub fn new(seed: u64) -> Self {
        let mut rng = DeterministicRng::new(seed ^ 0xA53C_91E7_4D2B_6F10);
        let price_usd_t =
            std::array::from_fn(|i| PRODUCTS[i].unit_price_usd_t * rng.range(0.90, 1.10));
        let demand_t = std::array::from_fn(|i| {
            let base = match ProductId::ALL[i] {
                ProductId::LiClEluate => 100.0,
                ProductId::LithiumCarbonate | ProductId::LithiumHydroxideMonohydrate => 55.0,
                ProductId::SodiumChloride => 260.0,
                _ => 85.0,
            };
            base * rng.range(0.82, 1.18)
        });
        let competitor_supply_t = std::array::from_fn(|i| demand_t[i] * rng.range(0.48, 0.92));
        let player_supply_t = [0.0; PRODUCT_COUNT];
        let contract_product = ProductId::LiClEluate;
        let contract_price_usd_t = price_usd_t[contract_product.index()] * 1.12;
        Self {
            price_usd_t,
            demand_t,
            competitor_supply_t,
            player_supply_t,
            contract_product,
            contract_target_t: 0.05,
            contract_price_usd_t,
            contract_time_left_minutes: 120.0,
            contract_revision: 1,
        }
    }

    pub fn price_for(&self, product: ProductId) -> f64 {
        self.price_usd_t[product.index()]
    }

    pub fn demand_for(&self, product: ProductId) -> f64 {
        self.demand_t[product.index()]
    }

    /// Advance all ten markets. Player shipments affect later prices through local supply.
    pub fn step(&mut self, rng: &mut DeterministicRng) {
        for product in ProductId::ALL {
            let i = product.index();
            let base = PRODUCTS[i].unit_price_usd_t.max(1.0);
            self.competitor_supply_t[i] =
                (self.competitor_supply_t[i] + rng.range(-1.8, 2.4)).clamp(1.0, 450.0);
            self.demand_t[i] = (self.demand_t[i] + rng.range(-2.2, 2.6)).clamp(10.0, 500.0);
            let scarcity =
                (self.demand_t[i] - self.competitor_supply_t[i] - self.player_supply_t[i])
                    / self.demand_t[i].max(1.0);
            self.price_usd_t[i] =
                (self.price_usd_t[i] + rng.range(-0.025, 0.025) * base + scarcity * base * 0.012)
                    .clamp(base * 0.55, base * 1.65);
            self.player_supply_t[i] *= 0.985;
        }
    }

    /// Refresh a completed or expired offer. The first offer is always the starter LiCl route;
    /// later offers broaden to battery chemicals and the shared chlor-alkali chain.
    pub fn refresh_contract(&mut self, rng: &mut DeterministicRng) {
        const AVAILABLE: [ProductId; 5] = [
            ProductId::LiClEluate,
            ProductId::LithiumCarbonate,
            ProductId::LithiumHydroxideMonohydrate,
            ProductId::SodiumChloride,
            ProductId::SodiumHydroxide,
        ];
        let product = AVAILABLE[(rng.next_u64() as usize) % AVAILABLE.len()];
        let demand = self.demand_t[product.index()];
        self.contract_product = product;
        self.contract_target_t = (demand * rng.range(0.0007, 0.0018)).clamp(0.025, 0.45);
        self.contract_price_usd_t = self.price_for(product) * rng.range(1.10, 1.28);
        self.contract_time_left_minutes = rng.range(90.0, 210.0);
        self.contract_revision = self.contract_revision.wrapping_add(1);
    }

    /// Returns the quantity accepted by the market and the paid value. Contracts pay their
    /// quoted premium; non-contract shipments receive the current spot price after impact.
    pub fn sell(&mut self, product: ProductId, tonnes: f64) -> (f64, f64) {
        let i = product.index();
        let unserved_demand =
            self.demand_t[i] - self.competitor_supply_t[i] * 0.15 - self.player_supply_t[i];
        let sold = tonnes.max(0.0).min(unserved_demand.max(0.0));
        let market_price = self.price_usd_t[i] * (1.0 - (sold / self.demand_t[i].max(1.0)) * 0.08);
        let paid_price = if product == self.contract_product {
            market_price.max(self.contract_price_usd_t)
        } else {
            market_price
        };
        self.player_supply_t[i] += sold;
        (sold, sold * paid_price.max(0.0))
    }
}

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub struct DeterministicRng {
    state: u64,
}

impl DeterministicRng {
    pub fn new(seed: u64) -> Self {
        Self { state: seed.max(1) }
    }
    pub fn next_u64(&mut self) -> u64 {
        // xorshift64*; deterministic and sufficient for simulation variability, not cryptography.
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / ((1_u64 << 53) as f64)
    }
    pub fn range(&mut self, min: f64, max: f64) -> f64 {
        min + (max - min) * self.unit()
    }
}

#[derive(Clone, Debug)]
pub struct EconomyHarnessReport {
    pub runs: usize,
    pub coded_wins: usize,
    pub preset_wins: usize,
    pub coded_mean_tonnes: f64,
    pub preset_mean_tonnes: f64,
    pub coded_mean_cash: f64,
    pub preset_mean_cash: f64,
    pub both_paths_viable: bool,
    pub outcomes_vary: bool,
}

#[derive(Clone, Copy, Debug)]
struct Trial {
    sold_t: f64,
    closing_cash: f64,
    contract: bool,
}

fn trial(seed: u64, coded: bool) -> Trial {
    let mut rng = DeterministicRng::new(seed.wrapping_add(if coded { 0x1142 } else { 0xF00D }));
    let mut market = MarketState::new(seed);
    let mut cash = 50_000.0;
    let lithium_kg_m3 = rng.range(0.28, 0.48);
    let magnesium_index = rng.range(7.0, 16.0);
    let silica_kg_m3 = rng.range(0.05, 0.24);
    let bed_capacity_t = 0.018 * rng.range(0.85, 1.15);
    let throughput = (if coded { 1.0 } else { 0.86 }) * rng.range(0.94, 1.04);
    let acid_factor = if coded { 0.88 } else { 1.0 };
    let mut bed_load_t = 0.0;
    let mut sold_t = 0.0;
    let mut acid_t = 0.0;
    let mut wear = 0.0;

    for tick in 0..10 {
        let brine_m3 = 800.0 * throughput;
        let recovered_t = brine_m3 * lithium_kg_m3 / 1_000.0
            * (1.0 - (magnesium_index / 80.0).min(0.35))
            * (1.0 - silica_kg_m3 * 0.8).max(0.5);
        let loaded_t = recovered_t.min((bed_capacity_t - bed_load_t).max(0.0));
        bed_load_t += loaded_t;
        wear += 0.002 + silica_kg_m3 * 0.001 + (magnesium_index - 10.0).max(0.0) * 0.0002;
        let breakthrough_t = (recovered_t - loaded_t).max(0.0);
        // Breakthrough is a loss; it does not get magically added to the product buffer.
        acid_t += loaded_t * (0.045 + silica_kg_m3 * 0.1) * acid_factor;
        if bed_load_t >= bed_capacity_t * 0.72 || tick == 9 {
            let batch = bed_load_t * 0.92;
            bed_load_t -= batch;
            sold_t += batch;
        }
        cash -= acid_t.max(0.0) * 880.0 * 0.1;
        cash -= breakthrough_t * 190.0;
        market.step(&mut rng);
        wear = wear.min(1.0);
    }
    let (market_sold, gross) = market.sell(ProductId::LiClEluate, sold_t);
    sold_t = market_sold;
    cash += gross;
    cash -= if coded { 18_200.0 } else { 17_000.0 };
    Trial {
        sold_t,
        closing_cash: cash,
        contract: sold_t >= market.contract_target_t && cash > 0.0,
    }
}

pub fn run_harness(seeds: usize) -> EconomyHarnessReport {
    let runs = seeds.max(1);
    let mut coded_wins = 0;
    let mut preset_wins = 0;
    let mut coded_tonnes = 0.0;
    let mut preset_tonnes = 0.0;
    let mut coded_cash = 0.0;
    let mut preset_cash = 0.0;
    let mut coded_signatures = Vec::with_capacity(runs);
    let mut preset_signatures = Vec::with_capacity(runs);
    for seed in 0..runs {
        let a = trial(seed as u64, true);
        let b = trial(seed as u64, false);
        coded_wins += usize::from(a.contract);
        preset_wins += usize::from(b.contract);
        coded_tonnes += a.sold_t;
        preset_tonnes += b.sold_t;
        coded_cash += a.closing_cash;
        preset_cash += b.closing_cash;
        coded_signatures.push((a.sold_t * 100.0) as i64);
        preset_signatures.push((b.sold_t * 100.0) as i64);
    }
    coded_signatures.sort_unstable();
    coded_signatures.dedup();
    preset_signatures.sort_unstable();
    preset_signatures.dedup();
    EconomyHarnessReport {
        runs,
        coded_wins,
        preset_wins,
        coded_mean_tonnes: coded_tonnes / runs as f64,
        preset_mean_tonnes: preset_tonnes / runs as f64,
        coded_mean_cash: coded_cash / runs as f64,
        preset_mean_cash: preset_cash / runs as f64,
        both_paths_viable: coded_wins >= runs * 3 / 5 && preset_wins >= runs * 3 / 5,
        outcomes_vary: coded_signatures.len() >= runs * 3 / 4
            && preset_signatures.len() >= runs * 3 / 4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_control_paths_are_viable_and_seeded_runs_vary() {
        let report = run_harness(256);
        assert!(report.both_paths_viable, "{report:?}");
        assert!(report.outcomes_vary, "{report:?}");
        assert!(
            report.coded_mean_tonnes > report.preset_mean_tonnes,
            "{report:?}"
        );
    }

    #[test]
    fn all_product_prices_are_bounded_and_move() {
        let mut market = MarketState::new(7);
        let initial = market.price_usd_t;
        let mut rng = DeterministicRng::new(7);
        for _ in 0..10_000 {
            market.step(&mut rng);
            for product in ProductId::ALL {
                let i = product.index();
                let base = PRODUCTS[i].unit_price_usd_t.max(1.0);
                assert!((base * 0.55..=base * 1.65).contains(&market.price_usd_t[i]));
            }
        }
        assert!(
            ProductId::ALL
                .iter()
                .all(|p| market.price_for(*p) != initial[p.index()])
        );
    }

    #[test]
    fn shipment_cannot_exceed_unserved_market_demand() {
        let mut market = MarketState::new(99);
        let demand = market.demand_for(ProductId::LiClEluate);
        let (first, _) = market.sell(ProductId::LiClEluate, demand * 10.0);
        let (second, _) = market.sell(ProductId::LiClEluate, demand * 10.0);
        assert!(first <= demand);
        assert_eq!(second, 0.0);
    }
}
