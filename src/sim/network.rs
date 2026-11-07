use serde::{Deserialize, Serialize};

use super::catalog::{Endpoint, LineKind, MachineKind, ServicePort};

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct GridPos { pub x: i16, pub z: i16 }
impl GridPos {
    pub const fn new(x: i16, z: i16) -> Self { Self { x, z } }
    pub fn manhattan(self, other: Self) -> u16 { (self.x - other.x).unsigned_abs() + (self.z - other.z).unsigned_abs() }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Connection {
    pub from: Endpoint,
    pub to: Endpoint,
    pub line: LineKind,
    pub length_m: f32,
    pub diameter_mm: u16,
    pub leak_fraction: f32,
    pub fouling: f32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LinkError {
    SameEndpoint,
    Incompatible { from: Endpoint, to: Endpoint, line: LineKind },
    Duplicate,
    UnknownMachine(u32),
}

pub fn service_position(service: ServicePort) -> GridPos {
    match service {
        ServicePort::Wellhead => GridPos::new(-1, 2),
        ServicePort::Grid => GridPos::new(-1, 10),
        ServicePort::Reinjection => GridPos::new(18, 10),
        ServicePort::Supplier => GridPos::new(6, -1),
        ServicePort::Market => GridPos::new(18, 3),
    }
}

pub fn endpoint_position(endpoint: Endpoint, machines: &[(u32, MachineKind, GridPos)]) -> Option<GridPos> {
    match endpoint {
        Endpoint::Service(s) => Some(service_position(s)),
        Endpoint::Machine(id) => machines.iter().find(|(machine_id,_,_)| *machine_id == id).map(|(_,_,pos)| *pos),
    }
}

pub fn compatible(from: Endpoint, to: Endpoint, line: LineKind, kinds: &[(u32, MachineKind)]) -> bool {
    if from == to { return false; }
    let from_service = match from { Endpoint::Service(s) => Some(s), _ => None };
    let to_service = match to { Endpoint::Service(s) => Some(s), _ => None };

    if let (Some(s), Endpoint::Machine(id)) = (from_service, to) {
        let kind = kinds.iter().find(|(machine_id,_)| *machine_id == id).map(|(_,k)| *k);
        return match (s, kind, line) {
            (ServicePort::Wellhead, Some(MachineKind::WellPump), LineKind::RawBrine) => true,
            (ServicePort::Grid, Some(k), LineKind::Power) => k.power_kw() > 0.0,
            (ServicePort::Supplier, Some(MachineKind::ReagentTank), LineKind::ReagentSupply) => true,
            _ => false,
        };
    }
    if let (Endpoint::Machine(id), Some(s)) = (from, to_service) {
        let kind = kinds.iter().find(|(machine_id,_)| *machine_id == id).map(|(_,k)| *k);
        return matches!((kind, s, line), (Some(MachineKind::ReinjectionPump), ServicePort::Reinjection, LineKind::Reinjection)
            | (Some(MachineKind::ProductTank), ServicePort::Market, LineKind::Product));
    }
    if from_service.is_some() || to_service.is_some() { return false; }

    let (Endpoint::Machine(a), Endpoint::Machine(b)) = (from, to) else { return false; };
    let from_kind = kinds.iter().find(|(id,_)| *id == a).map(|(_,k)| *k);
    let to_kind = kinds.iter().find(|(id,_)| *id == b).map(|(_,k)| *k);
    match (from_kind, to_kind) {
        (Some(f), Some(t)) => f.can_output(line) && t.can_input(line),
        _ => false,
    }
}

pub fn new_connection(from: Endpoint, to: Endpoint, line: LineKind, length_m: f32, diameter_mm: u16) -> Connection {
    Connection { from, to, line, length_m, diameter_mm, leak_fraction: 0.0, fouling: 0.0 }
}

pub fn flow_capacity_t_per_hour(diameter_mm: u16, pressure_bar: f32, length_m: f32, fouling: f32) -> f32 {
    let diameter_m = diameter_mm as f32 / 1000.0;
    let area = std::f32::consts::PI * diameter_m * diameter_m * 0.25;
    let pressure_factor = pressure_bar.max(0.0).sqrt();
    let length_factor = 1.0 / (1.0 + length_m.max(0.0) * 0.008);
    let fouling_factor = (1.0 - fouling.clamp(0.0, 0.9)).max(0.1);
    (area * pressure_factor * length_factor * fouling_factor * 3_600.0).max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn service_links_are_directional_and_typed() {
        let kinds = vec![(1, MachineKind::WellPump), (2, MachineKind::Pretreatment)];
        assert!(compatible(Endpoint::Service(ServicePort::Wellhead), Endpoint::Machine(1), LineKind::RawBrine, &kinds));
        assert!(!compatible(Endpoint::Service(ServicePort::Wellhead), Endpoint::Machine(2), LineKind::RawBrine, &kinds));
        assert!(!compatible(Endpoint::Machine(1), Endpoint::Service(ServicePort::Wellhead), LineKind::RawBrine, &kinds));
    }
    #[test]
    fn narrow_or_fouled_pipe_has_less_capacity() {
        let wide = flow_capacity_t_per_hour(100, 5.0, 5.0, 0.0);
        let narrow = flow_capacity_t_per_hour(50, 5.0, 5.0, 0.0);
        let fouled = flow_capacity_t_per_hour(100, 5.0, 5.0, 0.5);
        assert!(wide > narrow && wide > fouled);
    }
}
