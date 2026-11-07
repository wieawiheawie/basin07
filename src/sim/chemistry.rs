use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum Compound {
    LithiumChloride,
    SodiumCarbonate,
    LithiumCarbonate,
    SodiumChloride,
    Water,
    SodiumHydroxide,
    Chlorine,
    Hydrogen,
    HydrochloricAcid,
    CalciumHydroxide,
    LithiumHydroxideMonohydrate,
    CalciumCarbonate,
    MagnesiumChloride,
    MagnesiumHydroxide,
}

#[derive(Clone, Copy, Debug)]
pub struct Term { pub compound: Compound, pub coefficient: i32 }
#[derive(Clone, Copy, Debug)]
pub struct Reaction { pub id: &'static str, pub name: &'static str, pub inputs: &'static [Term], pub outputs: &'static [Term] }

const fn term(compound: Compound, coefficient: i32) -> Term { Term { compound, coefficient } }

pub const REACTIONS: [Reaction; 5] = [
    Reaction { id: "carbonate_precipitation", name: "Lithium carbonate precipitation",
        inputs: &[term(Compound::LithiumChloride, 2), term(Compound::SodiumCarbonate, 1)],
        outputs: &[term(Compound::LithiumCarbonate, 1), term(Compound::SodiumChloride, 2)] },
    Reaction { id: "chlor_alkali", name: "Chlor-alkali electrolysis",
        inputs: &[term(Compound::SodiumChloride, 2), term(Compound::Water, 2)],
        outputs: &[term(Compound::SodiumHydroxide, 2), term(Compound::Chlorine, 1), term(Compound::Hydrogen, 1)] },
    Reaction { id: "hydrogen_chlorine_synthesis", name: "Hydrogen-chlorine acid synthesis",
        inputs: &[term(Compound::Hydrogen, 1), term(Compound::Chlorine, 1)],
        outputs: &[term(Compound::HydrochloricAcid, 2)] },
    Reaction { id: "lithium_hydroxide_conversion", name: "Lithium hydroxide causticisation",
        inputs: &[term(Compound::LithiumCarbonate, 1), term(Compound::CalciumHydroxide, 1), term(Compound::Water, 2)],
        outputs: &[term(Compound::LithiumHydroxideMonohydrate, 2), term(Compound::CalciumCarbonate, 1)] },
    Reaction { id: "magnesium_precipitation", name: "Magnesium precipitation",
        inputs: &[term(Compound::MagnesiumChloride, 1), term(Compound::SodiumHydroxide, 2)],
        outputs: &[term(Compound::MagnesiumHydroxide, 1), term(Compound::SodiumChloride, 2)] },
];

/// Element order: Li, Na, Mg, Ca, Cl, C, O, H.
pub const fn formula(compound: Compound) -> [i32; 8] {
    use Compound::*;
    match compound {
        LithiumChloride => [1,0,0,0,1,0,0,0],
        SodiumCarbonate => [0,2,0,0,0,1,3,0],
        LithiumCarbonate => [2,0,0,0,0,1,3,0],
        SodiumChloride => [0,1,0,0,1,0,0,0],
        Water => [0,0,0,0,0,0,1,2],
        SodiumHydroxide => [0,1,0,0,0,0,1,1],
        Chlorine => [0,0,0,0,2,0,0,0],
        Hydrogen => [0,0,0,0,0,0,0,2],
        HydrochloricAcid => [0,0,0,0,1,0,0,1],
        CalciumHydroxide => [0,0,0,1,0,0,2,2],
        LithiumHydroxideMonohydrate => [1,0,0,0,0,0,2,3],
        CalciumCarbonate => [0,0,0,1,0,1,3,0],
        MagnesiumChloride => [0,0,1,0,2,0,0,0],
        MagnesiumHydroxide => [0,0,1,0,0,0,2,2],
    }
}

pub fn reaction_balance(reaction: &Reaction) -> [i32; 8] {
    let mut balance = [0_i32; 8];
    for t in reaction.inputs {
        let f = formula(t.compound);
        for i in 0..8 { balance[i] -= f[i] * t.coefficient; }
    }
    for t in reaction.outputs {
        let f = formula(t.compound);
        for i in 0..8 { balance[i] += f[i] * t.coefficient; }
    }
    balance
}

#[derive(Clone, Debug)]
pub struct BalanceReport { pub total: usize, pub balanced: usize, pub failures: Vec<(&'static str, [i32; 8])> }
impl BalanceReport { pub fn all_balanced(&self) -> bool { self.total == self.balanced && self.failures.is_empty() } }

pub fn validate_all() -> BalanceReport {
    let mut failures = Vec::new();
    for reaction in &REACTIONS {
        let balance = reaction_balance(reaction);
        if balance.iter().any(|v| *v != 0) { failures.push((reaction.id, balance)); }
    }
    BalanceReport { total: REACTIONS.len(), balanced: REACTIONS.len() - failures.len(), failures }
}

pub fn molar_mass(compound: Compound) -> f64 {
    // g/mol; values are intentionally explicit and inspectable.
    const AW: [f64; 8] = [6.94, 22.989_769, 24.305, 40.078, 35.45, 12.011, 15.999, 1.008];
    formula(compound).iter().zip(AW).map(|(n, w)| *n as f64 * w).sum()
}

pub fn formula_table() -> BTreeMap<&'static str, [i32; 8]> {
    use Compound::*;
    [
        ("LiCl", LithiumChloride), ("Na2CO3", SodiumCarbonate), ("Li2CO3", LithiumCarbonate),
        ("NaCl", SodiumChloride), ("H2O", Water), ("NaOH", SodiumHydroxide), ("Cl2", Chlorine),
        ("H2", Hydrogen), ("HCl", HydrochloricAcid), ("Ca(OH)2", CalciumHydroxide),
        ("LiOH.H2O", LithiumHydroxideMonohydrate), ("CaCO3", CalciumCarbonate),
        ("MgCl2", MagnesiumChloride), ("Mg(OH)2", MagnesiumHydroxide),
    ].into_iter().map(|(n,c)| (n, formula(c))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn all_declared_reactions_are_atom_balanced() { assert!(validate_all().all_balanced(), "{:?}", validate_all().failures); }
    #[test] fn carbonate_molar_mass_is_positive() { assert!(molar_mass(Compound::LithiumCarbonate) > 70.0); }
}
