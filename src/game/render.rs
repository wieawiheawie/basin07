use super::GameSession;
use super::controls::MainCamera;
use crate::sim::catalog::{LineKind, MachineKind, ServicePort};
use crate::sim::network::{GridPos, endpoint_position};
use bevy::prelude::*;
use std::collections::BTreeMap;

#[derive(Component)]
pub(crate) struct MachineVisual(pub(crate) u32);

#[derive(Component)]
pub(crate) struct PipeVisual(pub(crate) usize);

#[derive(Resource)]
pub(crate) struct SceneAssets {
    pub(crate) machine_meshes: Vec<Handle<Mesh>>,
    pub(crate) pipe_mesh: Handle<Mesh>,
}

#[derive(Resource, Default)]
pub(crate) struct VisualRegistry {
    pub(crate) machine_entities: BTreeMap<u32, Entity>,
    pub(crate) pipe_entities: Vec<Entity>,
}

pub fn setup_scene(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let ground_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.075, 0.115, 0.12),
        perceptual_roughness: 0.98,
        ..default()
    });
    let tile_a = materials.add(StandardMaterial {
        base_color: Color::srgb(0.14, 0.19, 0.18),
        perceptual_roughness: 0.9,
        ..default()
    });
    let tile_b = materials.add(StandardMaterial {
        base_color: Color::srgb(0.12, 0.165, 0.16),
        perceptual_roughness: 0.9,
        ..default()
    });
    let pipe_mesh = meshes.add(Cuboid::new(1.0, 1.0, 1.0));
    let tile_mesh = meshes.add(Cuboid::new(1.46, 0.035, 1.46));
    let mut machine_meshes = Vec::with_capacity(MachineKind::ALL.len());
    for kind in MachineKind::ALL {
        let mesh = match kind {
            MachineKind::AdsorptionBed
            | MachineKind::ReagentTank
            | MachineKind::ProductTank
            | MachineKind::AcidSynthesizer => meshes.add(Cylinder::new(0.48, 1.2)),
            MachineKind::WellPump | MachineKind::ReinjectionPump => {
                meshes.add(Cuboid::new(0.92, 0.7, 0.92))
            }
            MachineKind::CodeController | MachineKind::PresetController => {
                meshes.add(Cuboid::new(0.65, 0.55, 0.65))
            }
            MachineKind::Pretreatment
            | MachineKind::Carbonator
            | MachineKind::LithiumHydroxideConverter
            | MachineKind::ChlorAlkaliCell => meshes.add(Cuboid::new(1.05, 0.85, 1.05)),
        };
        machine_meshes.push(mesh);
    }
    commands.insert_resource(SceneAssets {
        machine_meshes,
        pipe_mesh,
    });
    commands.init_resource::<VisualRegistry>();

    // Ground and work plot.
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(29.0, 0.18, 23.0))),
        MeshMaterial3d(ground_material),
        Transform::from_xyz(0.0, -0.18, 0.0),
    ));
    for z in 0..14 {
        for x in 0..18 {
            let material = if (x + z) % 2 == 0 {
                tile_a.clone()
            } else {
                tile_b.clone()
            };
            commands.spawn((
                Mesh3d(tile_mesh.clone()),
                MeshMaterial3d(material),
                Transform::from_xyz(tile_x(x), 0.0, tile_z(z)),
            ));
        }
    }
    // Boundary service boxes: west = wellhead/grid, north = supplier, east = reinjection/dispatch.
    for (port, color) in [
        (ServicePort::Wellhead, Color::srgb(0.1, 0.58, 0.72)),
        (ServicePort::Grid, Color::srgb(0.95, 0.76, 0.22)),
        (ServicePort::Supplier, Color::srgb(0.76, 0.55, 0.23)),
        (ServicePort::Reinjection, Color::srgb(0.12, 0.55, 0.42)),
        (ServicePort::Market, Color::srgb(0.62, 0.47, 0.8)),
    ] {
        let p = service_world(port);
        commands.spawn((
            Mesh3d(meshes.add(Cuboid::new(0.85, 0.55, 0.85))),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: color,
                emissive: color.into(),
                ..default()
            })),
            Transform::from_xyz(p.x, 0.32, p.z),
        ));
    }

    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(20.0, 22.0, 22.0).looking_at(Vec3::ZERO, Vec3::Y),
        MainCamera,
    ));
    commands.spawn((
        DirectionalLight::default(),
        Transform::from_xyz(-10.0, 18.0, 12.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        PointLight {
            intensity: 28_000.0,
            range: 45.0,
            ..default()
        },
        Transform::from_xyz(2.0, 14.0, 3.0),
    ));
}

pub fn sync_machines(
    mut commands: Commands,
    session: Res<GameSession>,
    assets: Res<SceneAssets>,
    mut registry: ResMut<VisualRegistry>,
    mut existing: Query<(
        &MachineVisual,
        &mut Transform,
        &MeshMaterial3d<StandardMaterial>,
    )>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let active_ids: Vec<u32> = session.plant.machines.iter().map(|m| m.id).collect();
    let stale: Vec<u32> = registry
        .machine_entities
        .keys()
        .filter(|id| !active_ids.contains(id))
        .copied()
        .collect();
    for id in stale {
        if let Some(entity) = registry.machine_entities.remove(&id) {
            commands.entity(entity).despawn();
        }
    }
    for machine in &session.plant.machines {
        let entity = if let Some(entity) = registry.machine_entities.get(&machine.id).copied() {
            entity
        } else {
            let index = MachineKind::ALL
                .iter()
                .position(|k| *k == machine.kind)
                .unwrap_or(0);
            // Each machine owns its material: status tinting must not recolour every machine.
            let material = materials.add(StandardMaterial {
                base_color: Color::srgb(0.38, 0.52, 0.56),
                metallic: 0.35,
                perceptual_roughness: 0.55,
                ..default()
            });
            let entity = commands
                .spawn((
                    Mesh3d(assets.machine_meshes[index].clone()),
                    MeshMaterial3d(material),
                    Transform::from_xyz(
                        tile_x(machine.pos.x as i32),
                        0.65,
                        tile_z(machine.pos.z as i32),
                    ),
                    MachineVisual(machine.id),
                ))
                .id();
            registry.machine_entities.insert(machine.id, entity);
            entity
        };
        if let Ok((visual, mut transform, material)) = existing.get_mut(entity) {
            let _id = visual.0;
            transform.translation = Vec3::new(
                tile_x(machine.pos.x as i32),
                0.65,
                tile_z(machine.pos.z as i32),
            );
            if let Some(mut mat) = materials.get_mut(&material.0) {
                mat.base_color = if session.selected_machine == Some(machine.id) {
                    Color::srgb(0.96, 0.77, 0.25)
                } else if machine.alarm.is_some() {
                    Color::srgb(0.78, 0.28, 0.20)
                } else if machine.active {
                    Color::srgb(0.22, 0.72, 0.54)
                } else if machine.powered {
                    Color::srgb(0.38, 0.58, 0.68)
                } else {
                    Color::srgb(0.38, 0.33, 0.31)
                };
            }
        }
    }
}

pub fn sync_connections(
    mut commands: Commands,
    session: Res<GameSession>,
    assets: Res<SceneAssets>,
    mut registry: ResMut<VisualRegistry>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    existing_pipes: Query<(&PipeVisual, &MeshMaterial3d<StandardMaterial>)>,
) {
    while registry.pipe_entities.len() > session.plant.connections.len() {
        if let Some(entity) = registry.pipe_entities.pop() {
            commands.entity(entity).despawn();
        }
    }
    let positions: Vec<(u32, MachineKind, GridPos)> = session
        .plant
        .machines
        .iter()
        .map(|m| (m.id, m.kind, m.pos))
        .collect();
    for (connection_index, connection) in session
        .plant
        .connections
        .iter()
        .enumerate()
        .skip(registry.pipe_entities.len())
    {
        let Some(a) = endpoint_position(connection.from, &positions) else {
            continue;
        };
        let Some(b) = endpoint_position(connection.to, &positions) else {
            continue;
        };
        let pa = Vec3::new(tile_x(a.x as i32), 0.42, tile_z(a.z as i32));
        let pb = Vec3::new(tile_x(b.x as i32), 0.42, tile_z(b.z as i32));
        let delta = pb - pa;
        let length = delta.length().max(0.1);
        let color = if connection.leak_fraction > 0.0 {
            Color::srgb(0.96, 0.12, 0.06)
        } else {
            line_color(connection.line)
        };
        let handle = materials.add(StandardMaterial {
            base_color: color,
            metallic: 0.35,
            perceptual_roughness: 0.4,
            ..default()
        });
        let is_wire = matches!(
            connection.line,
            LineKind::Power | LineKind::LogicSensor | LineKind::LogicActuator
        );
        let thickness = if is_wire { 0.045 } else { 0.11 };
        let entity = commands
            .spawn((
                Mesh3d(assets.pipe_mesh.clone()),
                MeshMaterial3d(handle),
                Transform {
                    translation: (pa + pb) * 0.5,
                    rotation: Quat::from_rotation_arc(Vec3::Y, delta.normalize_or_zero()),
                    scale: Vec3::new(thickness, length, thickness),
                },
                PipeVisual(connection_index),
            ))
            .id();
        registry.pipe_entities.push(entity);
    }
    for (visual, material_handle) in &existing_pipes {
        if let Some(connection) = session.plant.connections.get(visual.0) {
            let color = if connection.leak_fraction > 0.0 {
                Color::srgb(0.96, 0.12, 0.06)
            } else {
                line_color(connection.line)
            };
            if let Some(mut material) = materials.get_mut(&material_handle.0) {
                material.base_color = color;
                material.emissive = if connection.leak_fraction > 0.0 {
                    color.into()
                } else {
                    Color::BLACK.into()
                };
            }
        }
    }
}

fn line_color(line: LineKind) -> Color {
    match line {
        LineKind::Power => Color::srgb(0.96, 0.76, 0.2),
        LineKind::RawBrine => Color::srgb(0.12, 0.58, 0.76),
        LineKind::CleanBrine => Color::srgb(0.25, 0.8, 0.82),
        LineKind::SpentBrine => Color::srgb(0.43, 0.45, 0.55),
        LineKind::Acid => Color::srgb(0.85, 0.37, 0.20),
        LineKind::Caustic => Color::srgb(0.6, 0.3, 0.74),
        LineKind::WashWater => Color::srgb(0.3, 0.72, 0.85),
        LineKind::SodaAsh => Color::srgb(0.78, 0.73, 0.6),
        LineKind::HydratedLime => Color::srgb(0.84, 0.82, 0.7),
        LineKind::LithiumLiquor => Color::srgb(0.33, 0.86, 0.75),
        LineKind::Salt => Color::srgb(0.84, 0.84, 0.75),
        LineKind::Hydrogen => Color::srgb(0.62, 0.8, 0.94),
        LineKind::Chlorine => Color::srgb(0.7, 0.82, 0.18),
        LineKind::Steam => Color::srgb(0.85, 0.88, 0.9),
        LineKind::Solid => Color::srgb(0.58, 0.48, 0.38),
        LineKind::Product => Color::srgb(0.76, 0.64, 0.31),
        LineKind::LogicSensor => Color::srgb(0.68, 0.42, 0.92),
        LineKind::LogicActuator => Color::srgb(0.92, 0.45, 0.72),
        LineKind::ReagentSupply => Color::srgb(0.75, 0.6, 0.4),
        LineKind::Reinjection => Color::srgb(0.15, 0.62, 0.5),
    }
}

pub(crate) fn tile_x(x: i32) -> f32 {
    -13.5 + x as f32 * 1.5 + 0.75
}
pub(crate) fn tile_z(z: i32) -> f32 {
    -10.5 + z as f32 * 1.5 + 0.75
}
fn service_world(port: ServicePort) -> Vec3 {
    let pos = crate::sim::network::service_position(port);
    Vec3::new(tile_x(pos.x as i32), 0.0, tile_z(pos.z as i32))
}
