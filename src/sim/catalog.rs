use serde::{Deserialize, Serialize};

pub const PRODUCT_COUNT: usize = 10;
pub const REAGENT_COUNT: usize = 5;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum ProductId {
    LiClEluate = 0,
    LithiumCarbonate = 1,
    LithiumHydroxideMonohydrate = 2,
    MagnesiumHydroxide = 3,
    CalciumCarbonate = 4,
    SodiumChloride = 5,
    SodiumHydroxide = 6,
    ChlorineGas = 7,
    HydrogenGas = 8,
    HydrochloricAcid = 9,
}

impl ProductId {
    pub const ALL: [Self; PRODUCT_COUNT] = [
        Self::LiClEluate,
        Self::LithiumCarbonate,
        Self::LithiumHydroxideMonohydrate,
        Self::MagnesiumHydroxide,
        Self::CalciumCarbonate,
        Self::SodiumChloride,
        Self::SodiumHydroxide,
        Self::ChlorineGas,
        Self::HydrogenGas,
        Self::HydrochloricAcid,
    ];

    pub const fn index(self) -> usize {
        self as usize
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Sector {
    DleBatteryMaterials,
    BasicInorganicChemicals,
}

#[derive(Clone, Copy, Debug)]
pub struct ProductDef {
    pub id: ProductId,
    pub name: &'static str,
    pub sector: Sector,
    pub unit_price_usd_t: f64,
    pub hazardous: bool,
    pub cheap_easy: bool,
}

pub const PRODUCTS: [ProductDef; PRODUCT_COUNT] = [
    ProductDef {
        id: ProductId::LiClEluate,
        name: "Lithium chloride eluate",
        sector: Sector::DleBatteryMaterials,
        unit_price_usd_t: 7_800.0,
        hazardous: false,
        cheap_easy: true,
    },
    ProductDef {
        id: ProductId::LithiumCarbonate,
        name: "Lithium carbonate",
        sector: Sector::DleBatteryMaterials,
        unit_price_usd_t: 15_600.0,
        hazardous: false,
        cheap_easy: false,
    },
    ProductDef {
        id: ProductId::LithiumHydroxideMonohydrate,
        name: "Lithium hydroxide monohydrate",
        sector: Sector::DleBatteryMaterials,
        unit_price_usd_t: 21_200.0,
        hazardous: true,
        cheap_easy: false,
    },
    ProductDef {
        id: ProductId::MagnesiumHydroxide,
        name: "Magnesium hydroxide cake",
        sector: Sector::DleBatteryMaterials,
        unit_price_usd_t: 340.0,
        hazardous: false,
        cheap_easy: true,
    },
    ProductDef {
        id: ProductId::CalciumCarbonate,
        name: "Calcium carbonate cake",
        sector: Sector::DleBatteryMaterials,
        unit_price_usd_t: 220.0,
        hazardous: false,
        cheap_easy: true,
    },
    ProductDef {
        id: ProductId::SodiumChloride,
        name: "Industrial sodium chloride",
        sector: Sector::BasicInorganicChemicals,
        unit_price_usd_t: 160.0,
        hazardous: false,
        cheap_easy: true,
    },
    ProductDef {
        id: ProductId::SodiumHydroxide,
        name: "Sodium hydroxide solution",
        sector: Sector::BasicInorganicChemicals,
        unit_price_usd_t: 720.0,
        hazardous: true,
        cheap_easy: false,
    },
    ProductDef {
        id: ProductId::ChlorineGas,
        name: "Chlorine gas",
        sector: Sector::BasicInorganicChemicals,
        unit_price_usd_t: 1_150.0,
        hazardous: true,
        cheap_easy: false,
    },
    ProductDef {
        id: ProductId::HydrogenGas,
        name: "Hydrogen gas",
        sector: Sector::BasicInorganicChemicals,
        unit_price_usd_t: 1_650.0,
        hazardous: true,
        cheap_easy: false,
    },
    ProductDef {
        id: ProductId::HydrochloricAcid,
        name: "Hydrochloric acid",
        sector: Sector::BasicInorganicChemicals,
        unit_price_usd_t: 880.0,
        hazardous: true,
        cheap_easy: false,
    },
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum ReagentId {
    HydrochloricAcid = 0,
    SodiumHydroxide = 1,
    SodaAsh = 2,
    HydratedLime = 3,
    Water = 4,
}
impl ReagentId {
    pub const ALL: [Self; REAGENT_COUNT] = [
        Self::HydrochloricAcid,
        Self::SodiumHydroxide,
        Self::SodaAsh,
        Self::HydratedLime,
        Self::Water,
    ];
    pub const fn index(self) -> usize {
        self as usize
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ReagentDef {
    pub id: ReagentId,
    pub name: &'static str,
    pub unit_price: f64,
}
pub const REAGENTS: [ReagentDef; REAGENT_COUNT] = [
    ReagentDef {
        id: ReagentId::HydrochloricAcid,
        name: "Hydrochloric acid",
        unit_price: 880.0,
    },
    ReagentDef {
        id: ReagentId::SodiumHydroxide,
        name: "Sodium hydroxide",
        unit_price: 720.0,
    },
    ReagentDef {
        id: ReagentId::SodaAsh,
        name: "Soda ash",
        unit_price: 250.0,
    },
    ReagentDef {
        id: ReagentId::HydratedLime,
        name: "Hydrated lime",
        unit_price: 180.0,
    },
    ReagentDef {
        id: ReagentId::Water,
        name: "Process water",
        unit_price: 0.01,
    },
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub enum MachineKind {
    WellPump,
    Pretreatment,
    AdsorptionBed,
    ReagentTank,
    ProductTank,
    Carbonator,
    LithiumHydroxideConverter,
    ChlorAlkaliCell,
    AcidSynthesizer,
    ReinjectionPump,
    PresetController,
    CodeController,
}

impl MachineKind {
    pub const ALL: [Self; 12] = [
        Self::WellPump,
        Self::Pretreatment,
        Self::AdsorptionBed,
        Self::ReagentTank,
        Self::ProductTank,
        Self::Carbonator,
        Self::LithiumHydroxideConverter,
        Self::ChlorAlkaliCell,
        Self::AcidSynthesizer,
        Self::ReinjectionPump,
        Self::PresetController,
        Self::CodeController,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::WellPump => "Well pump",
            Self::Pretreatment => "Pretreatment / clarifier",
            Self::AdsorptionBed => "Adsorption + elution bed",
            Self::ReagentTank => "Reagent tank",
            Self::ProductTank => "Product tank",
            Self::Carbonator => "Carbonate reactor",
            Self::LithiumHydroxideConverter => "LiOH converter",
            Self::ChlorAlkaliCell => "Chlor-alkali cell",
            Self::AcidSynthesizer => "HCl synthesis / heat recovery",
            Self::ReinjectionPump => "Reinjection pump",
            Self::PresetController => "Cycle PLC",
            Self::CodeController => "Code controller",
        }
    }

    pub const fn cost(self) -> f64 {
        match self {
            Self::WellPump => 3_800.0,
            Self::Pretreatment => 6_200.0,
            Self::AdsorptionBed => 8_500.0,
            Self::ReagentTank => 1_600.0,
            Self::ProductTank => 1_800.0,
            Self::Carbonator => 7_500.0,
            Self::LithiumHydroxideConverter => 8_500.0,
            Self::ChlorAlkaliCell => 9_800.0,
            Self::AcidSynthesizer => 6_500.0,
            Self::ReinjectionPump => 3_200.0,
            Self::PresetController => 1_000.0,
            Self::CodeController => 2_200.0,
        }
    }

    pub const fn power_kw(self) -> f32 {
        match self {
            Self::WellPump => 28.0,
            Self::Pretreatment => 20.0,
            Self::AdsorptionBed => 14.0,
            Self::ReagentTank => 1.0,
            Self::ProductTank => 1.0,
            Self::Carbonator => 16.0,
            Self::LithiumHydroxideConverter => 24.0,
            Self::ChlorAlkaliCell => 85.0,
            Self::AcidSynthesizer => 12.0,
            Self::ReinjectionPump => 24.0,
            Self::PresetController => 0.5,
            Self::CodeController => 0.8,
        }
    }

    pub const fn can_input(self, line: LineKind) -> bool {
        use LineKind::*;
        match self {
            Self::WellPump => matches!(line, RawBrine | Power | LogicActuator),
            Self::Pretreatment => matches!(line, RawBrine | Caustic | Power | LogicActuator),
            Self::AdsorptionBed => matches!(
                line,
                CleanBrine | Acid | WashWater | Steam | Power | LogicActuator
            ),
            Self::ReagentTank => matches!(line, ReagentSupply | Power),
            Self::ProductTank => matches!(
                line,
                Product
                    | LithiumLiquor
                    | Salt
                    | Hydrogen
                    | Chlorine
                    | Acid
                    | Caustic
                    | Solid
                    | Power
            ),
            Self::Carbonator => matches!(line, LithiumLiquor | SodaAsh | Power | LogicActuator),
            Self::LithiumHydroxideConverter => matches!(
                line,
                Product | HydratedLime | WashWater | Caustic | Power | LogicActuator
            ),
            Self::ChlorAlkaliCell => matches!(line, Salt | WashWater | Power | LogicActuator),
            Self::AcidSynthesizer => matches!(line, Hydrogen | Chlorine | Power | LogicActuator),
            Self::ReinjectionPump => matches!(line, SpentBrine | Power | LogicActuator),
            Self::PresetController | Self::CodeController => matches!(line, LogicSensor | Power),
        }
    }

    pub const fn can_output(self, line: LineKind) -> bool {
        use LineKind::*;
        match self {
            Self::WellPump => matches!(line, RawBrine | LogicSensor),
            Self::Pretreatment => matches!(line, CleanBrine | Solid | Salt | LogicSensor),
            Self::AdsorptionBed => matches!(line, SpentBrine | LithiumLiquor | LogicSensor | Steam),
            Self::ReagentTank => matches!(
                line,
                Acid | Caustic | WashWater | SodaAsh | HydratedLime | LogicSensor
            ),
            Self::ProductTank => matches!(line, Product | Acid | Caustic | LogicSensor),
            Self::Carbonator => matches!(line, Product | Salt | LogicSensor),
            Self::LithiumHydroxideConverter => matches!(line, Product | Solid | LogicSensor),
            Self::ChlorAlkaliCell => matches!(line, Caustic | Hydrogen | Chlorine | LogicSensor),
            Self::AcidSynthesizer => matches!(line, Acid | Steam | LogicSensor),
            Self::ReinjectionPump => matches!(line, Reinjection | LogicSensor),
            Self::PresetController | Self::CodeController => {
                matches!(line, LogicActuator | LogicSensor)
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub enum LineKind {
    RawBrine,
    CleanBrine,
    SpentBrine,
    Reinjection,
    Acid,
    Caustic,
    WashWater,
    SodaAsh,
    HydratedLime,
    LithiumLiquor,
    Salt,
    Hydrogen,
    Chlorine,
    Steam,
    Solid,
    Product,
    Power,
    LogicSensor,
    LogicActuator,
    ReagentSupply,
}

impl LineKind {
    pub const fn name(self) -> &'static str {
        match self {
            Self::RawBrine => "Raw brine",
            Self::CleanBrine => "Treated brine",
            Self::SpentBrine => "Spent brine",
            Self::Reinjection => "Reinjection",
            Self::Acid => "Acid",
            Self::Caustic => "Caustic",
            Self::WashWater => "Wash water",
            Self::SodaAsh => "Soda ash",
            Self::HydratedLime => "Hydrated lime",
            Self::LithiumLiquor => "Lithium liquor",
            Self::Salt => "Salt brine",
            Self::Hydrogen => "Hydrogen gas",
            Self::Chlorine => "Chlorine gas",
            Self::Steam => "Recovered steam",
            Self::Solid => "Solids",
            Self::Product => "Product",
            Self::Power => "Power cable",
            Self::LogicSensor => "Logic sensor cable",
            Self::LogicActuator => "Logic actuator cable",
            Self::ReagentSupply => "Reagent supply",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub enum ServicePort {
    Wellhead,
    Grid,
    Reinjection,
    Supplier,
    Market,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub enum Endpoint {
    Service(ServicePort),
    Machine(u32),
}
