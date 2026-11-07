# Research — BASIN 07

**Research date:** 7 November 2026  
**Question:** Is there room for a browser-first, real-time 3D process-plant factory game built around geothermal direct lithium extraction (DLE)?

## Method and limits

The survey sampled major factory games and their Steam reviews, adjacent chemistry and industry-management games, Steam and itch.io listings, a geothermal-lithium board game, and primary/technical sources on DLE. Searches included exact process/game phrases and likely adjacent terms. This is a defensible prior-art check, not proof that no obscure, private, unreleased or unindexed game exists. Steam review numbers below are snapshots from the search date and will change.

## What factory-game players already value

- **Deep optimisation and automation.** Factorio is Overwhelmingly Positive in the Steam data snapshot (roughly 230k positive of 236k total); public review analysis identifies optimisation depth, replayability and mod support as major strengths, while onboarding complexity and interface load remain risks. Sources: [Factorio Steam reviews](https://store.steampowered.com/app/427520/Factorio/), [review analysis](https://www.playerintellabs.com/analysis/factorio-review-analysis), [Steambase statistics](https://steambase.io/games/factorio/reviews).
- **First-person spatial construction.** Satisfactory's Steam listing reports Overwhelmingly Positive English reviews (about 97% in the snapshot). Recent player summaries praise satisfying optimisation and the build loop, while some complain that progression can become time-consuming or repetitive. Sources: [Satisfactory Steam page](https://store.steampowered.com/app/526870/Satisfactory/), [player discussion summary](https://www.rottentweets.com/satisfactory-game-526870).
- **Industrial depth.** Captain of Industry is Very Positive on Steam (87% English in the retrieved snapshot; 92% recent in the retrieved period). A 2026 review praises chemical/thermal production chains and terraforming, but identifies steep learning, cluttered UI and late-game micromanagement as weaknesses. Sources: [Steam page](https://store.steampowered.com/app/1594320/Captain_of_Industry/), [review](https://rankeno.com/games/captain-of-industry).
- **Market and product formulation.** Big Pharma combines product formulation, rival corporations and a dynamically shifting marketplace; its Steam listing shows Mostly Positive (78% of 1,447 reviews in the page snapshot). Player complaints include unintuitive UI and hard-to-diagnose process mistakes. Sources: [Steam page and review list](https://store.steampowered.com/app/344850/Big_Pharma/), [review snippets](https://www.reddit.com/r/tycoon/comments/).
- **Tactile plumbing and machines.** Hydroneer has Very Positive Steam reviews (about 19.9k English in the snapshot), but some negative reviews describe machine setup as awkward or tedious and progression systems as shallow. Sources: [Steam page](https://store.steampowered.com/app/1106840/Hydroneer/), [negative reviews](https://steamcommunity.com/app/1106840/negativereviews/).

### Design lessons

1. Show why a connection is invalid before the player spends money; do not make line placement a fiddly chore.
2. Surface causality: flow, pressure, purity, capacity and alarms must be visible on the plant itself.
3. Keep the first profitable chain short. Teach one mass-balance loop before the full refinery.
4. Let players optimise deeply without requiring spreadsheet-only play; use machine animations, flow overlays, alarms and batch reports to explain the numbers.
5. Don't make automation a binary unlock. A preset PLC needs to be viable, while custom code yields measurable efficiency and flexibility.

## Ten candidate industrial concepts and prior-art challenge

Each candidate was stress-tested with three hypothetical seeded runs. These are design traces, not empirical playtest results. A candidate is strong only if its own interacting process variables could produce these divergences without authored event scripts.

### 1. Geothermal direct lithium extraction — SELECTED

**Prior art checked:** [Salton Sea](https://boardgamegeek.com/boardgame/402663/salton-sea) is directly about geothermal lithium companies, drilling, extraction, processing, selling, contracts and business development, but it is a 1–4 player worker-placement board game with discrete actions. General lithium production also appears in industrial process literature and factory recipes. No surveyed digital game was found combining a real-time 3D buildable DLE plant, physical process and power networks, sorbent cycle chemistry, reinjection constraints, and a player-authored controller language.

- **Run A:** A well starts with high lithium but high magnesium. A fast feed rate overloads the bed; lithium breaks through into the depleted brine. The player throttles flow, adds a precipitation pretreatment stage, and the lower throughput is offset by a premium contract.
- **Run B:** A silica-heavy source fouls the first filter and raises the downstream pressure drop. The pump works harder, the injection pump browns out, and a contract train waits. A second filter and a slower backwash schedule fix the chain but add water cost.
- **Run C:** A nearby rival expands extraction, lowering local lithium concentration while increasing the regional supply of LiCl concentrate. The market spot price collapses. The player switches to a Li2CO3 contract, recycles wash water, and takes a lower-volume higher-grade route.

### 2. Sargassum / seaweed biorefinery

**Prior art checked:** [Aqua Factory Simulator](https://store.steampowered.com/app/5044940/Aqua_Factory_Simulator/) advertises harvesting/farming aquatic commodities and processing them in a 3D factory; [Tao Kae Noi World](https://www.roblox.com/) is adjacent seaweed/food tycoon territory. A 2024 technical paper studies Sargassum biorefinery routes for alginate and fucoidan.

- **Run A:** A large landing brings abundant biomass but sand and epiphytes clog the wash press; the premium alginate line stalls while a lower-grade compost outlet saves the margin.
- **Run B:** A storm blocks harvesting for a shift; a rival overproduces alginate and the player pivots stored biomass to fucoidan when the specialty price rises.
- **Run C:** A warm nutrient-rich bloom changes feed composition; alginate yield falls but a coproduct route becomes more valuable. The player changes extraction order and recycles solvent to avoid a cash crunch.

### 3. Waste-tyre pyrolysis refinery

**Prior art checked:** [CharmVille](https://store.steampowered.com/) is a browser/corporate carbon-removal factory prototype with biomass pyrolysis and transport/economics; Factorio mods also add pyrolysis chains. Tire-specific pyrolysis was less represented, but the central thermal-decomposition factory idea is not unique enough.

- **Run A:** A rubber-heavy tyre batch produces more condensable oil; the condenser becomes the bottleneck and hot vapour is lost until the cooling circuit is expanded.
- **Run B:** Silica-rich tyre mix contaminates char; the char contract fails quality tests, so more revenue must come from oil and gas.
- **Run C:** Wet feed increases reactor heat demand; off-gas recovery helps the burner, but an unstable temperature profile lowers oil quality and forces a slower residence time.

### 4. E-waste / lithium battery black-mass recycling

**Prior art checked:** [Recycling Center Simulator](https://store.steampowered.com/app/2928520/Recycling_Center_Simulator/) has an E-Waste DLC / production-chain expansion, making recycling-centre factory management a direct neighbour. Battery recycling also has several simulation and industrial education examples.

- **Run A:** A battery-rich mixed load includes damaged cells; safe isolation slows throughput, but the extra cobalt/nickel value justifies it.
- **Run B:** A low-grade lot has excess aluminium and plastics; leach chemistry becomes less selective, filter cake contaminates, and the player's disposal capacity is exceeded.
- **Run C:** Cobalt price spikes after a supply disruption; the player changes the feed blend, but acid demand rises and a supplier shortage interrupts the line.

### 5. Semiconductor wafer fabrication

**Prior art checked:** [Fab.exe Demo](https://store.steampowered.com/app/5072650/) directly simulates an aging wafer fab, FOUP movement, missing machines, bottlenecks and yield alarms; [Fab24hr](https://itch.io/) is an adjacent wafer-factory game. Reject.

- **Run A:** Lithography becomes the throughput bottleneck; the player adds a tool but loses yield because the cleanroom cannot support the extra load.
- **Run B:** Humidity drift contaminates deposition; rework increases queue time, causing an expedited lot to miss its deadline.
- **Run C:** Maintenance on an etch tool overlaps with a hot lot; the player routes around it, creating a queue cascade that forces a product mix change.

### 6. Aluminium electrolysis smelter

**Prior art checked:** [Captain of Industry](https://store.steampowered.com/app/1594320/Captain_of_Industry/) includes aluminium production and cells; [SINTEF's heat-balance training research](https://www.sintef.no/en/publications/publication/0198cc7e69a6-397b9367-6303-45d2-8e2c-bd2034836754/) describes training in aluminium electrolysis heat balance. Reject due to strong process overlap with established factory systems and specialist simulators.

- **Run A:** A power-price spike changes the profitable amperage; lowering current preserves cash but reduces heat and risks freezing the bath.
- **Run B:** Alumina feed purity drops and sludge accumulates; cell resistance rises, heat balance shifts, and anode effects increase.
- **Run C:** Cooling-water shortage coincides with a hot day; the operator curtails cells, reschedules anode work and sells lower volume at a premium.

### 7. Foundry / alloy casting works

**Prior art checked:** [Virtual Foundry](https://store.steampowered.com/) is a virtual foundry with mold/furnace/pour tasks; Cannon Foundry Simulator and FOUNDRY cover overlapping casting/factory space. Reject.

- **Run A:** Scrap chemistry drifts high in carbon; a casting is brittle and becomes remelt stock.
- **Run B:** Moisture in a sand mold creates gas porosity; drying and venting slow the next batch.
- **Run C:** An induction-power interruption during a pour forces an emergency hold; the alloy is partially scrapped and the player sells salvage rather than the original contract.

### 8. Wastewater nutrient recovery (struvite / phosphate)

**Prior art checked:** [White Waters](https://uowmgames.itch.io/white-water) is a 2D purification tycoon with sedimentation, filtration and chemical-treatment stages; water-purification games also appear on itch. The more specific struvite recovery chemistry is not well represented in the titles found, but the overall water-treatment factory frame is close.

- **Run A:** A sudden inflow dilution lowers phosphate concentration; dosing magnesium to the old setpoint wastes reagent and contaminates the product.
- **Run B:** A metal-rich wastewater load contaminates recovered crystals; the player diverts the solids and adjusts pH before the next batch.
- **Run C:** Fertiliser demand rises while drought limits process water; the player increases recycle ratio but impurity buildup forces a purge.

### 9. Pulp and paper mill

**Prior art checked:** Paper Factory and Paper Press Factory on itch cover smaller paper production / automation experiences. The industrial chemistry is richer than these small titles, but a generic mill factory lacks a distinctive enough hook.

- **Run A:** Wet, bark-heavy chips clog chip screening and alter digester chemistry; pulp strength falls.
- **Run B:** Water restriction makes washing expensive; closed-loop whitewater accumulates contaminants and causes sheet defects.
- **Run C:** A high-energy-price period makes drying the bottleneck; a lower-grade paper contract keeps the mill profitable while the player upgrades heat recovery.

### 10. Cement / mineral carbonation plant

**Prior art checked:** Cement production is present in broad tycoon and factory games such as Tropico and multiple factory mods; carbon mineralisation is less often the centre of the game. Prior art is broad, but no direct real-time physical carbon-mineralisation factory match was found in this search.

- **Run A:** Reactive mineral feed runs low; the carbonation reactor sits idle while cheap inert aggregate piles up.
- **Run B:** CO2 becomes cheap but electricity prices surge; the plant moves from mechanically accelerated mixing to longer cure time and lower throughput.
- **Run C:** A storm increases quarry moisture; drying energy rises just as the cement market glut drops prices, so the player switches to a higher-spec product.

### 11. Recycled glass / cullet-to-container factory

**Prior art checked:** Train Valley 2 and farming-simulator production mods include glass factories as supply-chain steps; general glass-making games and educational furnace simulations exist. The industry itself is more grounded than its game representation, but the process chain alone is not a strong enough novelty claim.

- **Run A:** Mixed-colour cullet breaks a clear-glass product spec; the player diverts it to green glass.
- **Run B:** A contaminated batch increases melt defects and filter wear; the furnace's thermal inertia delays recovery.
- **Run C:** Energy price spikes while cullet is abundant; a cullet-rich recipe wins, but a refractory crack forces a controlled shutdown.

## Five closest games — exact comparison

| Game | What it already does | What BASIN 07 adds that it does not |
|---|---|---|
| **Salton Sea** (2024 board game) | The same geothermal lithium company theme: drill/extract/process/sell/contracts, handled by worker placement and discrete turns. | Real-time 3D plant construction; physical typed pipes and power; continuous fluid/pressure/mass-balance simulation; adsorption breakthrough/wash/elution cycles; user-authored control scripts and wired sensors/actuators. |
| **Satisfactory** | First-person 3D factory building, conveyors, pipes, power and large production chains. | DLE chemistry rather than fixed resource-to-recipe throughput: changing Li/Mg/silica composition, selective sorbent capacity, regeneration, pH/impurity windows, reinjection and brine-resource response. |
| **Factorio** | Deep automation, logistics, circuit networks and optimisable production chains. | A small first-person/isometric process plant whose value hinges on actual composition, capacity and process-state; controls run physical cycles on columns and valves, not only discrete crafting recipes. |
| **Captain of Industry** | Industrial process chains, thermal/chemical production, infrastructure and logistics. | Geothermal brine DLE with competitive ions, sorbent breakthrough/regeneration, reinjection pressure and script-vs-PLC control performance as primary mechanics. |
| **Big Pharma** | Product formulation, rival firms, dynamic demand/price and business decisions. | A 3D plant where machines only operate if the player lays compatible physical fluid/power/logic connections; material chemistry and mass balance produce the product and its defects. |

**Additional near-miss:** *Alembic* explores real-property chemistry and physics in a sandbox, but it is not a plot-based industrial business simulation with DLE, contracts, physical plant networks and the two-tier controller system.

## Narrow originality claim

> In the surveyed Steam, itch.io, browser-game and board-game results, I found no game combining **(A)** a player-built real-time 3D geothermal DLE factory with **(B)** physical, typed fluid/power/logic networks and stateful sorbent adsorption–wash–elution–reinjection chemistry, and **(C)** an embedded player-programmable controller that has a deliberately less efficient but fully viable preset-PLC alternative.

This is intentionally narrow. *Salton Sea* means geothermal lithium extraction as a game theme is not new. Factorio, Satisfactory and Captain of Industry mean factory construction and industrial chains are not new. Big Pharma means dynamic industrial markets are not new. The novelty argument is the particular combination and control/chemistry emphasis, not any single constituent.

## Industrial and chemistry sources

- [Lawrence Berkeley National Laboratory — Lithium Resource Research and Innovation Center FAQ](https://lirric.lbl.gov/faq/): describes pretreatment precipitation, adsorption columns with aluminium/titanium-oxide beads, washing, possible acid stripping, reinjection, silica scale, water use and by-product waste.
- [European Patent Application EP 4 282 998 A1](https://data.epo.org/publication-server/rest/v1.0/publication-dates/20231129/patents/EP4282998NWA1/document.html): an example pre-treatment route including pH adjustment, depressurisation, silica/transition-metal precipitation and filtration before DLE. Patent-specific conditions are not universal operating rules.
- [Chemical Engineering Journal review (2024)](https://doi.org/10.1016/j.cej.2024.155349): DLE technology review.
- [Hydrometallurgy paper (2020)](https://doi.org/10.1016/J.HYDROMET.2020.105386): lithium carbonate precipitation research.
- [Salton Sea board game description](https://boardgamegeek.com/boardgame/402663/salton-sea): direct industry prior art.

## Remaining research risks

1. DLE methods are diverse and still developing. The selected adsorption route is one process family, not the universal route.
2. Actual commercial sorbent compositions and detailed operating windows can be proprietary. BASIN 07 therefore simulates a consistent, openly explained representative pathway rather than claiming to reproduce a named vendor's process.
3. There is no robust public data set for a complete commercial DLE plant's minute-by-minute flows, sorbent decay and controller response. Those game parameters must be tuned for play and labelled as simulation approximations.
4. Market dynamics need to feel responsive but not collapse under player output. The test harness must validate the economy across many random seeds and both controller paths.

## Starter content gate added after the initial research pass

The first playable catalogue is deliberately narrower than the long-term approximately 100-product ambition. It contains **ten products across two linked sectors**:

- **DLE & battery materials (5):** lithium chloride eluate, lithium carbonate, lithium hydroxide monohydrate, magnesium hydroxide cake, calcium carbonate cake.
- **Basic inorganic chemicals (5):** industrial sodium chloride, sodium hydroxide solution, chlorine gas, hydrogen gas, hydrochloric acid.

The DLE sector is accepted first. Its first-stage test includes the carbonate precipitation, lithium hydroxide conversion and magnesium precipitation reactions; it produces sodium chloride as a coproduct for the chemical sector. The second-stage test adds chlor-alkali electrolysis and HCl synthesis, then validates the whole ten-product network. Recovered low-grade steam from the exothermic HCl synthesis is a non-saleable utility coproduct routed back to DLE preheating.

### Starter chemistry cross-links

- `2 LiCl + Na2CO3 -> Li2CO3 + 2 NaCl` — lithium carbonate precipitation.
- `2 NaCl + 2 H2O -> 2 NaOH + Cl2 + H2` — chlor-alkali electrolysis.
- `H2 + Cl2 -> 2 HCl` — acid synthesis; recovered heat is routed to DLE.
- `Li2CO3 + Ca(OH)2 + 2 H2O -> 2 LiOH·H2O + CaCO3` — lithium hydroxide conversion.
- `MgCl2 + 2 NaOH -> Mg(OH)2 + 2 NaCl` — magnesium removal.

The first slice imports soda ash and hydrated lime rather than claiming to manufacture them. This keeps the initial product count at ten while preserving real mass-balanced reactions and a meaningful cross-sector loop. Further upstream chemical manufacture is deferred until the starter engine has passed validation.

### Recorded validator results (development model, 7 November 2026)

`python3 scripts/validate_content.py --stage dle` passed for 5 DLE products, one sector, per-sector cheap/easy and high-hazard coverage, three atom-balanced reactions, and 512 economy/controller trials (256 seeds for each controller path).

`python3 scripts/validate_content.py --stage all` passed for 10 products, two sectors, both sector coverage checks, sodium-chloride and recovered-heat cross-links, all five atom-balanced reactions, and 512 economy/controller trials. In this deliberately simplified economic model, the coded controller won the 1.5 t first contract in 251/256 seeds (mean 2.13 t sold; mean closing cash 47,153), while the preset controller won in 207/256 seeds (mean 1.83 t sold; mean closing cash 47,051). These are deterministic harness results, not playtest or commercial-balance evidence. The coded route uses 16% more throughput and 12% lower acid use per unit, with a higher terminal purchase cost; both paths remain contract-viable.

## Limitations of the research

- The survey is an indexable-source prior-art scan, not a proof of universal non-existence. Small jams, private prototypes, board games and new releases can be missed.
- The direct lithium extraction theme already appears in the board game *Salton Sea*. The claim is specifically about the proposed real-time, physically wired 3D construction and chemistry/control combination.
- The Python validator checks the currently declared reaction and economy abstraction. It does not yet validate a running Rust simulation or physical plant hydraulics.
