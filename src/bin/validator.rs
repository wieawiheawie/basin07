use basin07_core::sim::{chemistry, economy};

fn main() {
    let seeds = parse_seeds();
    let chemistry = chemistry::validate_all();
    println!(
        "chemistry: {} balanced / {} total",
        chemistry.balanced, chemistry.total
    );
    let report = economy::run_harness(seeds);
    println!(
        "coded:  {}/{} contracts, {:.2} t mean, ${:.0} mean cash",
        report.coded_wins, report.runs, report.coded_mean_tonnes, report.coded_mean_cash
    );
    println!(
        "preset: {}/{} contracts, {:.2} t mean, ${:.0} mean cash",
        report.preset_wins, report.runs, report.preset_mean_tonnes, report.preset_mean_cash
    );
    if !chemistry.all_balanced() || !report.both_paths_viable || !report.outcomes_vary {
        std::process::exit(1);
    }
}

fn parse_seeds() -> usize {
    let mut args = std::env::args().skip(1);
    let mut seeds = 256_usize;
    while let Some(arg) = args.next() {
        if arg == "--seeds" {
            let Some(value) = args.next() else {
                eprintln!("missing value after --seeds");
                std::process::exit(2);
            };
            seeds = value.parse::<usize>().unwrap_or_else(|_| {
                eprintln!("invalid --seeds value: {value}");
                std::process::exit(2);
            });
            if seeds == 0 || seeds > 100_000 {
                eprintln!("--seeds must be in 1..=100000");
                std::process::exit(2);
            }
        } else {
            eprintln!("unknown argument: {arg}\nusage: basin-validator [--seeds N]");
            std::process::exit(2);
        }
    }
    seeds
}
