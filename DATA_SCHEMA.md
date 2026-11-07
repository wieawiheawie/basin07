# BASIN 07 — Data Schema v1

This is the content-authoring contract for the planned runtime data engine. Content is JSON validated against `content/schema/catalog.schema.json`; it is not a Rust source file. A content pack must declare a schema version and may be added/extended without adding a product-specific Rust enum or recipe function.

> **Implementation status:** the current ten-product JSON records are legacy v0 data. The Rust runtime still uses compile-time `ProductId`, `ReagentId`, `MachineKind`, formula and process tables. The schema and migration rules are defined here; the next implementation milestone must add the manifest loader, migrate the current slice, and make the game and validator consume the same parsed catalog before any catalogue expansion.

## 1. Package layout

```text
content/
  manifest.json
  elements.json
  compounds.json
  resources.json
  products.json
  reagents.json
  machines.json
  processes.json
  schema/catalog.schema.json
```

`manifest.json` is the package entry point. It contains `schema_version: 1` and the relative path for each registry. Paths must remain inside the content package; absolute paths, `..` traversal and remote URLs are rejected. The browser loads the manifest and registry files through Bevy's asset system, then validates them before the simulation starts.

## 2. Identity and units

- Every record has a stable, lowercase `id` (`snake_case`); display names may change, IDs are save/mod compatibility keys.
- All quantities are explicit SI or declared industry units. Never mix kg and t in one field.
- Temperature uses `degC`, pressure `bar_abs` or `bar_g` (the basis is mandatory), mass flow `kg_per_s` or `t_per_h`, energy `kWh` / `kWh_th`, power `kW`, density `kg_per_m3`, and atomic mass `g_per_mol`.
- Stoichiometric amounts use `mol` or `kmol` basis and are distinguished from mass-flow inputs.
- Numeric ranges must be finite. Negative capacities, prices, molecular masses or yields are invalid.
- Unknown properties are not inferred. An unknown thermodynamic value is `null` plus a note, not a guessed number.

## 3. Registries

### Elements (`elements.json`)

Each element stores a symbol ID, full name, atomic mass, atomic number and optional hazard/handling metadata. Compound formulas are validated against this registry.

### Compounds (`compounds.json`)

Each compound stores its formula and explicit elemental composition vector. The formula string is for display; the composition map is authoritative for mass/atom balance. Physical fields may include phase, density, melting point and boiling point with reference conditions. Hazard tags and incompatibilities are separate from market product quality.

A solution or variable brine is a `mixture` with a composition basis and reference conditions. It is not assigned a fake molecular formula.

### Resources (`resources.json`)

A resource is an explicit exogenous source: geothermal brine, geothermal heat, water allocation, grid power, purchased limestone, elemental sulfur, air or imported reagent feed. Sources define units, seed-variable ranges, composition and extraction/availability limits. Every chain must terminate at a declared raw resource or paid/imported feed.

### Products/items (`products.json`)

An item can be raw, intermediate, saleable product, byproduct, waste or utility. It links to a compound or mixture and defines unit, default assay, market value/demand, sector and unlock rules. Saleable items can define buyer grade requirements:

- `min_purity` as a fraction between 0 and 1;
- `max_impurities` as per-compound mass or mole fractions;
- optional permitted moisture/temperature/particle-size ranges;
- price response to purity and off-spec rejection/penalty rules.

Products are not automatically all available at start; `unlock` references research, surveying or experiment records.

### Reagents (`reagents.json`)

A reagent references a compound or utility, states whether it is imported, recovered or generated, and defines price, purity and source. A reagent is not also counted as a saleable product unless it has a separate explicit product item.

### Machines (`machines.json`)

A machine is a placed equipment definition with cost, size, power demand, throughput/capacity, wear model, operation-rule class and typed ports. Every port declares direction, network (`fluid`, `gas`, `solid`, `power`, `logic`, `heat`), allowed material/utility classes, pressure/temperature rating and nominal capacity. Machine definitions may expose sensors and actuators; those identifiers become the only names available to Rhai.

### Processes (`processes.json`)

A process selects a reusable engine operation and declares:

- compatible machine/capability;
- material inputs and coefficients (molar, mass, volume or solution-concentration basis);
- material outputs, including co-products, byproducts and waste;
- operating ranges for temperature, pressure, pH, ratio, residence time and purity;
- catalyst or consumable requirements;
- electrical work, heat input, recoverable heat and declared losses;
- conversion/yield and quality/impurity transfer behavior;
- hazard controls, interlocks and required waste routing.

At least one byproduct or waste destination is required. For a process that genuinely has no byproduct, the record must explicitly declare `secondary_streams: "none"` with a justification. No material may disappear because a handler simply subtracts an input buffer.

## 4. Example process record

Illustrative only; numerical operating windows must be populated from the selected process reference and explicitly labelled as game abstraction where vendor-specific ranges are not public.

```json
{
  "id": "carbonate_precipitation",
  "name": "Lithium carbonate precipitation",
  "operation": "precipitation",
  "machine": "agitated_reactor",
  "inputs": [
    { "material": "lithium_chloride_eluate", "amount": 2.0, "basis": "kmol" },
    { "material": "sodium_carbonate", "amount": 1.0, "basis": "kmol" }
  ],
  "outputs": [
    { "material": "lithium_carbonate", "amount": 1.0, "basis": "kmol", "role": "product" },
    { "material": "sodium_chloride", "amount": 2.0, "basis": "kmol", "role": "coproduct" }
  ],
  "conditions": {
    "temperature_c": { "min": 45.0, "max": 85.0 },
    "pressure_bar_abs": { "min": 0.8, "max": 2.0 },
    "ph": { "min": 9.0, "max": 11.0 },
    "residence_seconds": { "min": 300.0, "max": 1800.0 }
  },
  "energy": {
    "electric_kwh_per_t_feed": 18.0,
    "heat_in_kwh_th_per_t_feed": 0.0,
    "recoverable_heat_kwh_th_per_t_feed": 0.0,
    "declared_loss_kwh_th_per_t_feed": 0.0,
    "status": "game_balance_estimate"
  },
  "secondary_streams": "none",
  "quality_effects": { "mother_liquor_impurity_transfer": 0.08 },
  "hazard_controls": ["closed_reagent_transfer", "ph_interlock"]
}
```

The example is a schema illustration, not a claim that those reactor conditions or energy values are an industrial design recommendation. A real catalog record must attach sources and mark any tuned values as estimates.

## 5. Reusable operation classes

The operation field selects an engine rule, not a per-product hard-coded branch. Initial rule families include:

- `mixing`, `heating`, `cooling`, `evaporation`, `drying`;
- `filtration`, `settling`, `centrifugation`, `gas_separation`;
- `adsorption`, `wash`, `elution`, `ion_exchange`;
- `precipitation`, `neutralisation`, `crystallisation`;
- `electrolysis`, `gas_synthesis`, `calcination`, `slaking`;
- `heat_recovery`, `reinjection`, `waste_treatment`.

A content author may add new products and processes using an existing rule. A genuinely new unit operation must be implemented once in Rust and then described by data records. This keeps the content system extensible without pretending that arbitrary equations are executable by the catalog.

## 6. Content validation contract

The build-time validator must reject:

1. Duplicate IDs, missing references, invalid units/ranges or unknown element symbols.
2. Products with no dependency path to an exogenous resource or paid/imported input.
3. Orphan intermediates and process cycles that cannot bootstrap from a raw/imported input.
4. Element/mass imbalance beyond an explicit numerical tolerance.
5. Missing/unrouted byproducts or waste, or unaccounted process mass.
6. Energy records with invalid signs or impossible closure. If reaction enthalpy or thermodynamic data is missing, report `not validated` rather than claiming energy conservation.
7. Products that cannot meet any buyer quality specification or are structurally never profitable, and products profitable in every possible scenario where that indicates an exploit.

The validator generates a dependency graph and a raw-input tree for each marketable product. It estimates contribution margin across several feed grades, yields, assay outcomes, energy/reagent prices and market price bands. `always profitable` and `never profitable` are warnings requiring balance review, not automatically errors unless they make the economy unwinnable/exploitable.

After every catalog expansion, run both the validator and multi-seed economy harness; record counts, warnings and coded/preset win rates in `PROGRESS.md` before starting the next expansion.

## 7. Current legacy-field mapping

| Current v0 field | v1 field |
|---|---|
| `products[].id/name/sector/unit/reference_price` | `products[].id/name/sector/unit/market.reference_price` |
| `products[].hazard` | `compounds[].hazards` and/or item-specific handling tags |
| `products[].cheap_easy` | Remove from simulation; derive from complexity/capital/utility and keep only as a validator annotation if useful |
| `reactions[].inputs_mol/outputs_mol` | `processes[].inputs/outputs` with `basis: "mol"` or `"kmol"` |
| `reagents[].formula/source/use` | `reagents[].compound_id/source/uses` |
| Rust `ProductId` / `ReagentId` enums | runtime `ItemId` / `ReagentId` compact IDs created from stable string keys |
| Rust formula table | `elements.json` + `compounds.json` composition vectors |
| hard-coded per-machine `process_*` coefficients | reusable operation rule + process data fields |

The migration preserves the existing ten-product/two-sector gameplay slice. Do not add the next sector until its definitions pass the new schema, reachability, chemistry, waste, quality and economy gates.
