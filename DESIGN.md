# BASIN 07 — Direct Lithium Extraction Plant Builder

**Working title:** BASIN 07  
**Genre:** 3D industrial factory / process-plant simulation  
**Platform:** Browser, Rust → WebAssembly  
**Research cut-off:** 7 November 2026

## One-sentence pitch

Start with an empty geothermal lease and limited capital, then build a physically connected direct-lithium-extraction plant whose brine chemistry, adsorption beds, reagent cycles, utility networks, control logic and commodity market all interact.

## The goal

Turn raw geothermal brine into saleable lithium products, fulfil customer contracts and grow the plant's net worth. The first contract accepts lithium-chloride-rich eluate so the player can earn money before building a full refinery. The next tier requires battery-spec lithium carbonate.

The player begins with cash, an empty industrial plot and a metered lease to a brine wellhead location. The plot contains no machinery, pipes, cables or controllers. A first-run job card says exactly what to ship, what purity is required, and when the buyer's offer expires.

## Why this industry

Direct lithium extraction (DLE) is a real family of brine-processing technologies. A documented adsorption pathway removes interfering minerals first, passes clarified brine through columns containing selective sorbent beads, washes and elutes the loaded beads, and reinjects the lithium-depleted brine. Silica removal is important because silica solids can accumulate in pipes and damage machinery. These are unusually useful game systems: the feed is chemically variable, a sorbent has finite capacity, a bed needs a cycle, waste streams need handling, and the plant has to return fluid to the reservoir. The real industry is still developing, and technology details vary by operator, so BASIN 07 uses one clearly labelled, simplified adsorption-based process rather than pretending to model every commercial DLE technology.

## The first ten minutes

1. **Read the first order:** deliver a small batch of low-grade LiCl concentrate to a nearby converter.
2. **Buy and place a wellhead pump:** the plot is otherwise empty.
3. **Build the feed route:** place brine pipe from the wellhead to a feed tank and a return route toward the reinjection connection.
4. **Place the starter process:** coarse solids removal, one adsorption bed, a wash/elution tank, and a product tank.
5. **Connect power and all required fluid lines:** an unconnected port does not silently work. Flow indicators show zero flow, and the machine's alarm identifies the missing connection.
6. **Choose control:** attach a basic preset cycle controller or write a short Rhai script, then physically wire its sensor and actuator ports.
7. **Run a short batch, inspect the quality report, and ship it.** The first payout arrives quickly. The next contract introduces carbonate precipitation and tighter impurity limits.

## Physical building verbs

- Place machines on a 2 m construction grid and rotate them in 90° steps.
- Connect visible pipe segments to compatible ports. Pipe types are not interchangeable: raw brine, treated brine, acid, wash water, reagent slurry, product liquor and reinjection each have distinct port classes.
- Lay electrical cable from the incoming supply to machines and controllers. A connected but undersized electrical branch can brown out under load.
- Place logic cable from sensors to a controller and from controller outputs to actuators. The controller cannot control a valve it is not wired to.
- Place conveyors only for dry solids (filter cake, soda ash, product bags). Fluids use pipes.
- Inspect a machine, pipe, tank or sensor to see live values, active alarms and a short cause → effect → fix explanation.

## The process chain

### Starter route: LiCl-rich concentrate

`Geothermal brine → wellhead/pump → feed tank → solids / silica pre-treatment → adsorption column → wash → acid elution → LiCl-rich product tank → shipment`

The spent/depleted brine must be routed to reinjection. The first contract allows an intermediate product grade, so the player learns flow, power, bed capacity and controller cycling before building the finishing plant.

### Refinery expansion: lithium carbonate

`LiCl-rich eluate → impurity polishing → soda-ash dosing → precipitation / crystallisation → solid-liquid separation → wash → dryer → bagging → shipment`

The core precipitation stoichiometry is represented as:

`2 LiCl + Na2CO3 → Li2CO3(s) + 2 NaCl`

This is a game model, not a process-design package. The simulation tracks mass balance, a simplified solubility/temperature window, dosing ratio, impurity carryover and product moisture. Exact equipment operating limits are intentionally abstracted into readable operating ranges.

## Systems that create the surprises

### 1. Variable reservoir and brine chemistry

Each site's brine source has a seed-generated but internally consistent profile: lithium concentration, magnesium/calcium competition, silica, iron, temperature, salinity and pressure. Drawdown and reinjection alter the local reservoir state over time. Neighboring simulated producers also draw from the shared basin. A good lithium zone can become less attractive if nearby extraction and reinjection patterns change concentration or pressure.

### 2. Flow, pressure and utilities

Pumps add head; pipe length, diameter, fittings and deposits consume pressure. Tanks buffer surges. A starved pump cavitates or trips; a high-pressure branch leaks; a shared power branch overloads when a dryer and injection pump start together. The player sees flow arrows, pressure values, leak markers and power loading.

### 3. Sorbent adsorption and regeneration

An adsorption bed has finite usable lithium capacity and a finite number of durable cycles. Magnesium and other competing ions reduce selectivity in the simplified model. A bed nearing breakthrough lets more lithium escape into the depleted stream. Washing consumes water; acid elution creates a concentrated product stream but also requires neutralisation and controlled disposal/reuse. Running the wrong sequence can dilute product or damage bed life.

### 4. Pretreatment, precipitation and fouling

If pH/pretreatment conditions are outside the selected process window, silica and metal solids pass downstream. They accumulate as scale in pipes, valves and heat exchangers. The scale increases pressure loss and reduces heat transfer. Filter cake can be disposed of, sold as a low-value by-product if its contaminant assay qualifies, or recycled into a permitted secondary route later in progression.

### 5. Reagent and water balance

Hydrochloric acid, soda ash, lime/limestone and wash water are bought from a shifting supply market. Freshwater allocation is a hard site limit. Reuse reduces water cost but contaminant buildup can poison the next wash or precipitation stage. Reagent concentration and delivered quality vary by supplier lot.

### 6. The market is a simulation, not a static price list

The world tracks demand, competitor capacity, product inventory, contract deadlines and price elasticity for LiCl concentrate, industrial-grade Li2CO3 and battery-grade Li2CO3. The player's shipments contribute to market supply and can depress the spot price. NPC producers expand, pause or switch routes in response to prices, brine quality and utility cost. Contracts offer fixed premiums but enforce volume, purity and deadline conditions.

### 7. Equipment wear and external shocks

Pumps, valves, filters and dryers accumulate wear from duty, abrasive solids and poor operating conditions. Ambient heat can increase cooling load; drought can tighten industrial-water allocation; grid pricing can make energy-intensive cycles expensive. These are state variables and feedbacks, not pre-written story twists.

## Initial 10-product slice: two connected sectors

The first content release is intentionally limited to two sectors and exactly ten marketable products. Imported reagents and utility streams are listed separately so a reagent is not falsely counted as a player-manufactured product.

| Sector | Product | Role | Risk / early-game role |
|---|---|---|---|
| DLE & battery materials | Lithium chloride eluate (LiCl-rich concentrate) | Adsorption/elution output | Starter sale; relatively low handling risk |
| DLE & battery materials | Lithium carbonate (Li2CO3) | Soda-ash precipitation product | Mid-tier battery-material product |
| DLE & battery materials | Lithium hydroxide monohydrate (LiOH·H2O) | Causticisation product | High-margin, high-hazard hot-caustic route |
| DLE & battery materials | Magnesium hydroxide cake (Mg(OH)2) | Pretreatment coproduct | Cheap, relatively easy mineral cake; assay limits apply |
| DLE & battery materials | Calcium carbonate cake (CaCO3) | LiOH conversion coproduct | Cheap, easy mineral cake; alternative filler/neutralisation outlet |
| Basic inorganic chemicals | Industrial sodium chloride (NaCl) | Carbonate precipitation / pretreatment coproduct | Cheap, easy commodity and chemical-sector feed |
| Basic inorganic chemicals | Sodium hydroxide solution (NaOH) | Chlor-alkali coproduct | Corrosive chemical; required in pretreatment and impurity removal |
| Basic inorganic chemicals | Chlorine gas (Cl2) | Chlor-alkali coproduct | High-hazard toxic gas; gas-tight piping and scrubbing required |
| Basic inorganic chemicals | Hydrogen gas (H2) | Chlor-alkali coproduct | High-hazard flammable gas; separation and ignition control required |
| Basic inorganic chemicals | Hydrochloric acid (HCl) | H2/Cl2 synthesis product | Corrosive reagent used for sorbent elution |

**Cross-sector material and utility links**

- Lithium carbonate precipitation follows `2 LiCl + Na2CO3 → Li2CO3 + 2 NaCl`. The sodium chloride coproduct is not landfill by default: a washed salt stream can feed the chlor-alkali cell.
- Chlor-alkali electrolysis follows `2 NaCl + 2 H2O → 2 NaOH + Cl2 + H2`. NaOH feeds DLE pretreatment; chlorine and hydrogen can be sold separately or sent to acid synthesis.
- Controlled acid synthesis follows `H2 + Cl2 → 2 HCl`. Its exothermic heat is recovered as low-grade steam and routed to the DLE feed/elution heater. This steam is a utility coproduct, not an eleventh saleable product.
- Lithium hydroxide causticisation follows `Li2CO3 + Ca(OH)2 + 2 H2O → 2 LiOH·H2O + CaCO3`. The hot caustic slurry is hazardous; the calcium carbonate cake is a cheap, low-risk outlet.
- Magnesium precipitation follows `MgCl2 + 2 NaOH → Mg(OH)2 + 2 NaCl`. A pH overshoot wastes caustic and can contaminate the recovered cake.

**Imported first-slice reagents:** soda ash (Na2CO3) and hydrated lime (Ca(OH)2) are bought from suppliers. The raw brine is a variable resource mixture, not a manufactured product. Soda-ash manufacture and further mineral/construction sectors are intentionally deferred until after the ten-product engine passes validation.

**Sector acceptance gates:** DLE is validated on its own before the chemical sector is accepted. After Basic Inorganic Chemicals is added, the validator is rerun against all ten products, all five balanced reactions, the NaCl and recovered-heat cross-links, and both controller paths. No third sector begins until that combined gate passes.

## Processes and equipment represented in the starter slice

| Process | Primary equipment | Key operating state | Readable failure |
|---|---|---|---|
| Brine lift and transfer | Wellhead pump, raw-brine pipe | Flow, head, power draw | Pump starved, cavitation, pressure loss |
| Magnesium / solids pretreatment | pH dosing vessel, clarifier, filter press | pH, solids loading, filter differential pressure | Caustic overshoot, filter blinded, impure cake |
| Lithium adsorption | Packed adsorption column | Bed loading, breakthrough, temperature, flow | Lithium breakthrough, competitive-ion capacity loss |
| Wash and elution | Wash tank, acid tank, elution vessel | Wash ratio, acid dose, cycle state | Diluted eluate, acid shortage, premature cycle transition |
| Carbonate precipitation | Carbonator, crystalliser, filter press | Soda-ash ratio, pH, temperature, residence time | Incomplete precipitation, excess salt, off-spec crystals |
| Lithium hydroxide conversion | Causticisation reactor, crystalliser, dryer | Lime ratio, temperature, caustic strength | Corrosive overflow, poor conversion, wet product |
| Chlor-alkali | Membrane electrolyser, brine tank, gas separator | Salt concentration, current, gas separation | Low conductivity, chlorine/hydrogen crossover, high cell voltage |
| HCl synthesis / heat recovery | Burner/absorber, heat exchanger, acid tank | Gas ratio, temperature, scrubber state | Residual chlorine, H2 hazard, acid leak, lost heat recovery |
| Reinjection | Booster pump, reinjection line | Pressure, flow, permitted volume | Backpressure, scaling, reservoir pressure excursion |

The first 10 minutes teach only the brine lift → pretreatment → adsorption → elution → LiCl sale route, plus required reinjection. The chemical sector is unlocked with the first contract payout. The player can keep buying HCl/NaOH from the supplier or close the loop by building the chemical sector. This gives an early profitable chain without hiding the interdependence of the full plant.

## Code versus preset controllers

Both approaches must be physically wired to sensor and actuator ports. Both can win.

### Custom code

The in-game controller editor uses **Rhai**, embedded in Rust. The game exposes a tiny, whitelisted API: read named sensor values, set pump speed, open/close a valve, change a dose setpoint, and set alarm flags. A script runs on a fixed control interval, not every render frame. Runtime limits are enforced with Rhai's operation and call-depth limits; scripts get no filesystem, network or host access.

Example starter logic:

```rhai
if read("bed_a.breakthrough") > 0.12 {
    set("feed_to_bed_a", 0.0);
    set("bed_a_to_wash", 1.0);
} else {
    set("feed_to_bed_a", 1.0);
    set("bed_a_to_wash", 0.0);
}

if read("feed_tank.level") < 0.25 {
    set("well_pump", 0.35);
}
```

Custom scripts can sample more often and use continuous setpoints. A good script should target roughly 100% of the reference throughput and reagent efficiency for the same physical plant. Poor scripts can still waste material or damage equipment.

### Preset controller blocks

The starter `Cycle PLC` runs a robust adsorption/wash/elution sequence with basic high/low interlocks. It deliberately samples more slowly and uses coarse setpoints. The first balance target is 86% of a well-tuned script's throughput, 12% more reagent per tonne, and 8–12% more electricity at the same physical layout. The DLE and chemical sectors share the same physical plant and recipes regardless of control path. That is a real tradeoff, not an unusable trap: preset control costs less player time and can satisfy early and mid-tier contracts. Later preset PLCs improve, but never reach the control ceiling of custom scripts.

## Progression and success

- **Tier 0 — Pilot lease:** LiCl-rich concentrate; one adsorption bed; simple controller.
- **Tier 1 — Refinery:** battery-spec lithium carbonate; soda ash precipitation; filter and dryer.
- **Tier 2 — Better selectivity:** second bed, counter-current wash, better pretreatment, more sensor options and scriptable interlocks.
- **Tier 3 — Basin-scale operations:** second well zone, additional product/by-product contracts, reinjection constraints, rival producers and tougher environmental/quality audits.

The short-term objective is always visible in the current contract card. Long-term objectives are cashflow, reputation, technology and sustainable reservoir performance. A run can continue as an open-ended business sandbox after the first major contract milestone.

## Failure readability

Every failed machine or rejected batch must answer three questions:

1. **What is wrong?** e.g. `ADSORBER A — lithium breakthrough 18% (limit 12%)`.
2. **Why did it happen?** e.g. `feed Mg/Li ratio rose; bed capacity fell; flow stayed at 1.0 m³/min`.
3. **What can fix it?** e.g. `reduce flow, add pretreatment, switch to wash, or replace the bed media`.

Diagnostics appear on the machine, the process overview and the batch-quality report. No hidden recipe failure should require guessing.

## Controls

- WASD / arrow keys: move the camera focus.
- Right mouse drag: orbit camera.
- Mouse wheel: zoom.
- Left click: select / place / inspect.
- `1`–`8`: select build tool.
- `R`: rotate selected building.
- `P`: pipe mode; click compatible ports to route a pipe.
- `C`: cable mode; connect power ports.
- `L`: logic wiring mode.
- `Space`: pause / resume simulation.
- `Tab`: switch between build and operation overlays.
- `Esc`: close panel / pause.

Exact bindings can change during implementation, but the in-game key legend is authoritative.

## Visual and audio direction

A warm, stylised industrial site at the edge of a volcanic basin: pale salt flats, dark basalt, faded safety-yellow machinery, cobalt/teal process pipes, orange acid lines and white high-voltage cable. Buildings are low-poly, but machine states animate: tank levels rise, pumps spin, lines carry coloured flow, pressure needles twitch, filters load with solids and brine flashes through transparent inspection spools. Sound is purposeful and quiet: pump hum, relay clicks, valve thunks, tank resonance, distant geothermal vents and alarm tones with distinct patterns.

## Scope for the first polished slice

- One compact plot and one brine source.
- Six process buildings: wellhead pump, feed/clarifier tank, filter, adsorption bed, wash/elution tank, product tank.
- One finishing line: precipitation vessel, filter press, dryer, bagger.
- Manual pipe/cable connection.
- A starter preset controller and an embedded script editor.
- A live spot market and one contract type per product tier.
- A deterministic headless simulation harness.

The first content gate is exactly ten products across DLE & battery materials and basic inorganic chemicals. The first playable build will prioritise the LiCl starter route and the NaCl/NaOH/Cl2/H2/HCl loop; lithium carbonate and lithium hydroxide remain the next operating expansions inside the same ten-product catalogue. Soda ash and hydrated lime are imported reagents. Further sectors and the remaining long-form product catalogue are future expansion, not a claim about the first playable build.
