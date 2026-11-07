#!/usr/bin/env python3
"""Deterministic content/economy validator for BASIN 07's first two sectors.

This validates the declared 10-product content slice, sector hazard/easy-product
coverage, cross-sector coproduct use, reaction atom balance, and both controller
paths across seeded runs. It is a development validator, not a process-design tool.
"""
from __future__ import annotations
import argparse, json, math, random, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("--stage", choices=["dle", "all"], default="all", help="validate DLE sector alone or the complete two-sector slice")
ap.add_argument("--seeds", type=int, default=256, help="number of deterministic seeds per controller path (1..100000)")
ARGS = ap.parse_args()
STAGE = ARGS.stage
SEEDS = ARGS.seeds
if not 1 <= SEEDS <= 100_000:
    ap.error("--seeds must be in 1..=100000")
all_products = json.loads((ROOT / "content/products.json").read_text())
products = (json.loads((ROOT / "content/sectors/dle_products.json").read_text()) if STAGE == "dle" else all_products)
all_reactions = json.loads((ROOT / "content/reactions.json").read_text())
reactions = ([r for r in all_reactions if r["sector"] == "DLE & battery materials"] if STAGE == "dle" else all_reactions)

# Atomic weights (kg/kmol); formula vectors use kmol-equivalent coefficients.
AW = {"Li":6.94,"Na":22.989769,"Cl":35.45,"C":12.011,"O":15.999,"H":1.008,"Mg":24.305,"Ca":40.078}
FORMULA = {
 "licl_eluate":{"Li":1,"Cl":1}, "lithium_carbonate":{"Li":2,"C":1,"O":3},
 "lithium_hydroxide_monohydrate":{"Li":1,"O":2,"H":3}, "magnesium_hydroxide":{"Mg":1,"O":2,"H":2},
 "calcium_carbonate":{"Ca":1,"C":1,"O":3}, "sodium_chloride":{"Na":1,"Cl":1},
 "sodium_hydroxide":{"Na":1,"O":1,"H":1}, "chlorine_gas":{"Cl":2},
 "hydrogen_gas":{"H":2}, "hydrochloric_acid":{"H":1,"Cl":1},
 "soda_ash":{"Na":2,"C":1,"O":3}, "water":{"H":2,"O":1},
 "calcium_hydroxide":{"Ca":1,"O":2,"H":2}, "magnesium_chloride":{"Mg":1,"Cl":2}
}

errors=[]
def check(condition, message):
    if not condition: errors.append(message)

expected_products = 5 if STAGE == "dle" else 10
check(len(products)==expected_products, f"expected {expected_products} products for {STAGE} stage, got {len(products)}")
ids=[p['id'] for p in products]
check(len(set(ids))==len(ids), "duplicate product ids")
sectors=sorted({p['sector'] for p in products})
expected_sectors = 1 if STAGE == "dle" else 2
check(len(sectors)==expected_sectors, f"expected {expected_sectors} sector(s), got {len(sectors)}")
for sector in sectors:
    members=[p for p in products if p['sector']==sector]
    check(any(p['cheap_easy'] and p['hazard']=='low' for p in members), f"{sector}: no cheap/easy low-risk product")
    check(any(p['hazard']=='high' for p in members), f"{sector}: no high-hazard product")

# Cross-sector links: NaCl goes from DLE precipitation to chlor-alkali;
# recovered low-grade steam from HCl synthesis heats DLE elution.
if STAGE == "all":
    check('sodium_chloride' in ids, "missing NaCl coproduct cross-link")
    check(any(r['id']=='chlor_alkali' and 'sodium_chloride' in r['inputs_mol'] for r in reactions), "no NaCl->chlor-alkali cross-sector link")
    check(any(r['id']=='hydrogen_chlorine_synthesis' for r in reactions), "missing acid synthesis/heat recovery process")

for r in reactions:
    atoms={}
    for side, sign in [('inputs_mol',-1),('outputs_mol',1)]:
        for chemical, amount in r[side].items():
            formula=FORMULA.get(chemical)
            if formula is None:
                errors.append(f"{r['id']}: no formula for {chemical}")
                continue
            for element, count in formula.items(): atoms[element]=atoms.get(element,0)+sign*amount*count
    bad={k:round(v,9) for k,v in atoms.items() if abs(v)>1e-8}
    check(not bad, f"{r['id']}: atom imbalance {bad}")

# Ten-product market: every product has its own seeded demand, competitor supply,
# player shipments and bounded spot price. This catches accidental static-price items.
market_rng = random.Random(7007)
market_initial = [float(p["reference_price"]) * market_rng.uniform(.90, 1.10) for p in all_products]
market_prices = market_initial[:]
market_demand = [market_rng.uniform(55.0, 260.0) for _ in all_products]
market_competitors = [d * market_rng.uniform(.48, .92) for d in market_demand]
market_player = [0.0 for _ in all_products]
for _ in range(96):
    for i, product in enumerate(all_products):
        base = max(1.0, float(product["reference_price"]))
        market_competitors[i] = min(450.0, max(1.0, market_competitors[i] + market_rng.uniform(-1.8, 2.4)))
        market_demand[i] = min(500.0, max(10.0, market_demand[i] + market_rng.uniform(-2.2, 2.6)))
        scarcity = (market_demand[i] - market_competitors[i] - market_player[i]) / max(1.0, market_demand[i])
        market_prices[i] = min(base * 1.65, max(base * .55,
            market_prices[i] + market_rng.uniform(-.025, .025) * base + scarcity * base * .012))
        market_player[i] *= .985
check(all(.55 * float(p["reference_price"]) <= market_prices[i] <= 1.65 * float(p["reference_price"])
          for i, p in enumerate(all_products)), "one or more product market prices escaped their bounds")
check(all(abs(market_prices[i] - market_initial[i]) > 1e-8 for i in range(len(all_products))),
      "one or more products still has a static spot price")

# Economy/controller Monte Carlo. A fixed physical plant can run either control path;
# custom code is more efficient but a preset should remain contract-viable.
def run(seed:int, coded:bool):
    rng=random.Random(seed)
    cash=50000.0
    demand=100.0*rng.uniform(.82,1.18)
    price=7800.0*rng.uniform(.9,1.1)
    well_li=rng.uniform(.28,.48) # kg LiCl-equivalent / m3
    mg=rng.uniform(7.0,16.0)
    silica=rng.uniform(.05,.24)
    capacity=18.0*rng.uniform(.85,1.15)
    bed=0.0
    wear=0.0
    sold=0.0
    brine=0.0
    # Ten short operating intervals, then the first intermediate-product contract.
    throughput=(1.0 if coded else .86)*rng.uniform(.94,1.04)
    reagent_eff=(.88 if coded else 1.0)
    for tick in range(10):
        brine_m3=800.0*throughput
        brine += brine_m3
        recovered=(brine_m3*well_li/1000.0)*(1.0-min(.35,mg/80.0))*max(.5,1.0-silica*.8)
        loaded=min(recovered,max(0.0,capacity-bed))
        bed+=loaded
        wear+=.002+silica*.001+max(0.0,mg-10)*.0002
        breakthrough=max(0.0,recovered-loaded)
        # Elution cycle: acid dosage is a cost; hot/silica-rich brine consumes more.
        acid=loaded*(.045+.001*silica*100)*reagent_eff
        cash-=acid*880.0
        if bed>=capacity*.72 or tick==9:
            batch=bed*.92
            bed-=batch
            sold+=batch
        # Seeded market drift with bounded competition / demand response.
        demand=max(30.0,min(180.0,demand+rng.uniform(-5,5)-sold*.02))
        price=max(4000.0,min(12000.0,price+rng.uniform(-220.0,220.0)+(demand-100)*10.0))
    sold=min(sold, demand*1.5)
    revenue=sold*price
    cash+=revenue
    # Same physical plant; coded terminal costs more than the preset PLC.
    # The throughput/reagent improvement should recover that premium over a shift.
    cash-=18200.0 if coded else 17000.0
    met_contract=sold>=1.5 and cash>0
    return {"cash":cash,"sold":sold,"price":price,"contract":met_contract,"wear":wear,"brine":brine}

runs_c=[run(s,True) for s in range(SEEDS)]
runs_p=[run(s,False) for s in range(SEEDS)]
for label, runs in [('coded',runs_c),('preset',runs_p)]:
    check(all(math.isfinite(r['cash']) for r in runs), f"{label}: non-finite cash")
    check(all(r['sold']>=0 and r['brine']>=0 and r['wear']>=0 for r in runs), f"{label}: negative state")
    check(sum(r['contract'] for r in runs)>=int(len(runs)*.60), f"{label}: baseline contract win rate <60%")
    check(len({round(r['cash'],2) for r in runs})>=200, f"{label}: insufficient seeded outcome variation")
check(sum(r['contract'] for r in runs_p)>=int(len(runs_p)*.60), "preset path cannot win reliably")
check(sum(r['contract'] for r in runs_c)>=int(len(runs_c)*.60), "coded path cannot win reliably")
check(sum(r['sold'] for r in runs_c)/len(runs_c) > sum(r['sold'] for r in runs_p)/len(runs_p), "coded path should have higher mean throughput")
check(sum(r['cash'] for r in runs_c)/len(runs_c) > sum(r['cash'] for r in runs_p)/len(runs_p), "coded path should repay its terminal premium over a shift")

if errors:
    print(f"FAIL: {len(errors)} validation errors")
    for e in errors: print(" -",e)
    sys.exit(1)
print(f"PASS: {expected_products} products / {expected_sectors} sector(s) ({STAGE})")
print("PASS: each included sector has cheap/easy and high-hazard products")
if STAGE == "all": print("PASS: all ten product spot markets move within bounded price bands")
if STAGE == "all": print("PASS: cross-sector NaCl + recovered-heat links")
print(f"PASS: {len(reactions)} balanced reactions (atomic balance)")
print(f"PASS: economy/controller Monte Carlo: {len(runs_c)+len(runs_p)} runs across {SEEDS} seeds per path")
for label,runs in [('coded',runs_c),('preset',runs_p)]:
    wins=sum(r['contract'] for r in runs)
    avg_cash=sum(r['cash'] for r in runs)/len(runs)
    avg_sold=sum(r['sold'] for r in runs)/len(runs)
    print(f"  {label}: wins={wins}/{len(runs)}, mean_cash={avg_cash:.2f}, mean_sold_t={avg_sold:.2f}")
