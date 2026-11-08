use super::controls::MainCamera;
use super::{GameSession, GraphicsMode, GraphicsSettings};
use crate::sim::catalog::{Endpoint, LineKind, MachineKind, ServicePort};
use crate::sim::network::{GridPos, service_position};
use bevy::prelude::*;
use std::collections::BTreeMap;

#[derive(Component)]
pub(crate) struct MachineVisual(pub(crate) u32);

#[derive(Component)]
pub(crate) struct PipeVisual(pub(crate) usize);

#[derive(Component)]
pub(crate) struct GroundVisual;

#[derive(Component)]
pub(crate) struct TileVisual;

#[derive(Component)]
pub(crate) struct ServiceVisual(ServicePort);

#[derive(Component)]
pub(crate) struct SceneDirectionalLight;

#[derive(Component)]
pub(crate) struct ScenePointLight;

#[derive(Clone)]
struct MaterialPair {
    low: Handle<StandardMaterial>,
    standard: Handle<StandardMaterial>,
}

impl MaterialPair {
    fn for_mode(&self, mode: GraphicsMode) -> Handle<StandardMaterial> {
        match mode {
            GraphicsMode::Low => self.low.clone(),
            GraphicsMode::Standard => self.standard.clone(),
        }
    }
}

#[derive(Resource, Clone)]
pub(crate) struct SceneAssets {
    machine_meshes: Vec<Handle<Mesh>>,
    pipe_mesh: Handle<Mesh>,
    tile_mesh: Handle<Mesh>,
    ground_mesh: Handle<Mesh>,
    service_mesh: Handle<Mesh>,
    ground_material: MaterialPair,
    tile_material: MaterialPair,
    machine_materials: Vec<MaterialPair>,
    service_materials: Vec<(ServicePort, MaterialPair)>,
    pipe_materials: Vec<(LineKind, MaterialPair)>,
    leak_material: MaterialPair,
}

impl SceneAssets {
    fn machine_material(&self, state: usize, mode: GraphicsMode) -> Handle<StandardMaterial> {
        self.machine_materials[state].for_mode(mode)
    }

    fn service_material(&self, port: ServicePort, mode: GraphicsMode) -> Handle<StandardMaterial> {
        self.service_materials
            .iter()
            .find(|(candidate, _)| *candidate == port)
            .map(|(_, pair)| pair.for_mode(mode))
            .expect("every service port has a shared material")
    }

    fn pipe_material(
        &self,
        line: LineKind,
        leaking: bool,
        mode: GraphicsMode,
    ) -> Handle<StandardMaterial> {
        if leaking {
            return self.leak_material.for_mode(mode);
        }
        self.pipe_materials
            .iter()
            .find(|(candidate, _)| *candidate == line)
            .map(|(_, pair)| pair.for_mode(mode))
            .expect("every line kind has a shared material")
    }
}

#[derive(Resource, Default)]
pub(crate) struct VisualRegistry {
    pub(crate) machine_entities: BTreeMap<u32, Entity>,
    pub(crate) pipe_entities: Vec<Entity>,
}

pub fn setup_scene(
    mut commands: Commands,
    graphics: Res<GraphicsSettings>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let machine_meshes = vec![
        meshes.add(Cylinder::new(0.48, 1.2)),
        meshes.add(Cuboid::new(0.92, 0.7, 0.92)),
        meshes.add(Cuboid::new(0.65, 0.55, 0.65)),
        meshes.add(Cuboid::new(1.05, 0.85, 1.05)),
    ];
    let pipe_mesh = meshes.add(Cuboid::new(1.0, 1.0, 1.0));
    let tile_mesh = meshes.add(Cuboid::new(1.46, 0.035, 1.46));
    let ground_mesh = meshes.add(Cuboid::new(29.0, 0.18, 23.0));
    let service_mesh = meshes.add(Cuboid::new(0.85, 0.55, 0.85));

    let ground_material = material_pair(&mut materials, Color::srgb(0.075, 0.115, 0.12), 0.0, 1.0);
    let tile_material = material_pair(&mut materials, Color::srgb(0.14, 0.19, 0.18), 0.0, 1.0);

    // Five shared status materials cover every machine; instances never allocate their own.
    let machine_materials = [
        Color::srgb(0.96, 0.77, 0.25), // selected
        Color::srgb(0.78, 0.28, 0.20), // alarm
        Color::srgb(0.22, 0.72, 0.54), // active
        Color::srgb(0.38, 0.58, 0.68), // powered/idle
        Color::srgb(0.38, 0.33, 0.31), // unpowered
    ]
    .into_iter()
    .map(|color| material_pair(&mut materials, color, 0.15, 0.82))
    .collect();

    let service_materials = [
        (ServicePort::Wellhead, Color::srgb(0.1, 0.58, 0.72)),
        (ServicePort::Grid, Color::srgb(0.95, 0.76, 0.22)),
        (ServicePort::Supplier, Color::srgb(0.76, 0.55, 0.23)),
        (ServicePort::Reinjection, Color::srgb(0.12, 0.55, 0.42)),
        (ServicePort::Market, Color::srgb(0.62, 0.47, 0.8)),
    ]
    .into_iter()
    .map(|(port, color)| (port, material_pair(&mut materials, color, 0.0, 0.9)))
    .collect();

    let pipe_materials = all_line_kinds()
        .into_iter()
        .map(|line| {
            (
                line,
                material_pair(&mut materials, line_color(line), 0.0, 0.9),
            )
        })
        .collect();
    let leak_material = material_pair(&mut materials, Color::srgb(0.96, 0.12, 0.06), 0.0, 0.9);

    let assets = SceneAssets {
        machine_meshes,
        pipe_mesh,
        tile_mesh,
        ground_mesh,
        service_mesh,
        ground_material,
        tile_material,
        machine_materials,
        service_materials,
        pipe_materials,
        leak_material,
    };
    commands.insert_resource(assets.clone());
    commands.init_resource::<VisualRegistry>();

    // All 252 floor tiles share one mesh and one material, allowing renderer batching.
    commands.spawn((
        Mesh3d(assets.ground_mesh.clone()),
        MeshMaterial3d(assets.ground_material.for_mode(graphics.mode)),
        Transform::from_xyz(0.0, -0.18, 0.0),
        GroundVisual,
    ));
    let tile_material = assets.tile_material.for_mode(graphics.mode);
    for z in 0..14 {
        for x in 0..18 {
            commands.spawn((
                Mesh3d(assets.tile_mesh.clone()),
                MeshMaterial3d(tile_material.clone()),
                Transform::from_xyz(tile_x(x), 0.0, tile_z(z)),
                TileVisual,
            ));
        }
    }

    // Each service shares the same box mesh and its one pre-created port material.
    for port in [
        ServicePort::Wellhead,
        ServicePort::Grid,
        ServicePort::Supplier,
        ServicePort::Reinjection,
        ServicePort::Market,
    ] {
        let position = service_world(port);
        commands.spawn((
            Mesh3d(assets.service_mesh.clone()),
            MeshMaterial3d(assets.service_material(port, graphics.mode)),
            Transform::from_xyz(position.x, 0.32, position.z),
            ServiceVisual(port),
        ));
    }

    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(20.0, 22.0, 22.0).looking_at(Vec3::ZERO, Vec3::Y),
        MainCamera,
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: if graphics.mode == GraphicsMode::Low {
                0.0
            } else {
                10_000.0
            },
            shadow_maps_enabled: graphics.mode == GraphicsMode::Standard,
            ..default()
        },
        Transform::from_xyz(-10.0, 18.0, 12.0).looking_at(Vec3::ZERO, Vec3::Y),
        SceneDirectionalLight,
    ));
    commands.spawn((
        PointLight {
            intensity: if graphics.mode == GraphicsMode::Low {
                0.0
            } else {
                12_000.0
            },
            range: 45.0,
            shadow_maps_enabled: false,
            ..default()
        },
        Transform::from_xyz(2.0, 14.0, 3.0),
        ScenePointLight,
    ));
}

fn material_pair(
    materials: &mut Assets<StandardMaterial>,
    color: Color,
    metallic: f32,
    roughness: f32,
) -> MaterialPair {
    let low = materials.add(StandardMaterial {
        base_color: color,
        metallic: 0.0,
        perceptual_roughness: 1.0,
        unlit: true,
        ..default()
    });
    let standard = materials.add(StandardMaterial {
        base_color: color,
        metallic,
        perceptual_roughness: roughness,
        unlit: false,
        ..default()
    });
    MaterialPair { low, standard }
}

fn machine_mesh_index(kind: MachineKind) -> usize {
    match kind {
        MachineKind::AdsorptionBed
        | MachineKind::ReagentTank
        | MachineKind::ProductTank
        | MachineKind::AcidSynthesizer => 0,
        MachineKind::WellPump | MachineKind::ReinjectionPump => 1,
        MachineKind::CodeController | MachineKind::PresetController => 2,
        MachineKind::Pretreatment
        | MachineKind::Carbonator
        | MachineKind::LithiumHydroxideConverter
        | MachineKind::ChlorAlkaliCell => 3,
    }
}

fn machine_material_index(
    session: &GameSession,
    id: u32,
    active: bool,
    powered: bool,
    alarm: bool,
) -> usize {
    if session.selected_machine == Some(id) {
        0
    } else if alarm {
        1
    } else if active {
        2
    } else if powered {
        3
    } else {
        4
    }
}

pub fn sync_scene_materials(
    graphics: Res<GraphicsSettings>,
    assets: Res<SceneAssets>,
    mut ground: Query<&mut MeshMaterial3d<StandardMaterial>, With<GroundVisual>>,
    mut tiles: Query<&mut MeshMaterial3d<StandardMaterial>, With<TileVisual>>,
    mut services: Query<(&ServiceVisual, &mut MeshMaterial3d<StandardMaterial>)>,
    mut directional_lights: Query<&mut DirectionalLight, With<SceneDirectionalLight>>,
    mut point_lights: Query<&mut PointLight, With<ScenePointLight>>,
) {
    if !graphics.is_changed() {
        return;
    }

    let mode = graphics.mode;
    if let Ok(mut material) = ground.single_mut() {
        let desired = assets.ground_material.for_mode(mode);
        if material.0 != desired {
            material.0 = desired;
        }
    }
    let tile_material = assets.tile_material.for_mode(mode);
    for mut material in &mut tiles {
        if material.0 != tile_material {
            material.0 = tile_material.clone();
        }
    }
    for (visual, mut material) in &mut services {
        let desired = assets.service_material(visual.0, mode);
        if material.0 != desired {
            material.0 = desired;
        }
    }

    let low = mode == GraphicsMode::Low;
    for mut light in &mut directional_lights {
        light.illuminance = if low { 0.0 } else { 10_000.0 };
        light.shadow_maps_enabled = !low;
    }
    for mut light in &mut point_lights {
        light.intensity = if low { 0.0 } else { 12_000.0 };
    }
}

pub fn sync_machines(
    mut commands: Commands,
    session: Res<GameSession>,
    graphics: Res<GraphicsSettings>,
    assets: Res<SceneAssets>,
    mut registry: ResMut<VisualRegistry>,
    mut existing: Query<(
        &MachineVisual,
        &mut Transform,
        &mut MeshMaterial3d<StandardMaterial>,
    )>,
) {
    if !session.is_changed() && !graphics.is_changed() {
        return;
    }

    for (&id, &entity) in &registry.machine_entities {
        if !session
            .plant
            .machines
            .iter()
            .any(|machine| machine.id == id)
        {
            commands.entity(entity).despawn();
        }
    }
    registry.machine_entities.retain(|id, _| {
        session
            .plant
            .machines
            .iter()
            .any(|machine| machine.id == *id)
    });

    for machine in &session.plant.machines {
        let material_index = machine_material_index(
            &session,
            machine.id,
            machine.active,
            machine.powered,
            machine.alarm.is_some(),
        );
        let material = assets.machine_material(material_index, graphics.mode);
        let position = Vec3::new(
            tile_x(machine.pos.x as i32),
            0.65,
            tile_z(machine.pos.z as i32),
        );
        let rotation =
            Quat::from_rotation_y(f32::from(machine.rotation) * std::f32::consts::FRAC_PI_2);

        let Some(entity) = registry.machine_entities.get(&machine.id).copied() else {
            let entity = commands
                .spawn((
                    Mesh3d(assets.machine_meshes[machine_mesh_index(machine.kind)].clone()),
                    MeshMaterial3d(material),
                    Transform {
                        translation: position,
                        rotation,
                        ..default()
                    },
                    MachineVisual(machine.id),
                ))
                .id();
            registry.machine_entities.insert(machine.id, entity);
            continue;
        };

        if let Ok((visual, mut transform, mut current_material)) = existing.get_mut(entity) {
            let _machine_id = visual.0;
            if transform.translation != position {
                transform.translation = position;
            }
            if transform.rotation != rotation {
                transform.rotation = rotation;
            }
            if current_material.0 != material {
                current_material.0 = material;
            }
        }
    }
}

pub fn sync_connections(
    mut commands: Commands,
    session: Res<GameSession>,
    graphics: Res<GraphicsSettings>,
    assets: Res<SceneAssets>,
    mut registry: ResMut<VisualRegistry>,
    mut existing_pipes: Query<(&PipeVisual, &mut MeshMaterial3d<StandardMaterial>)>,
) {
    if !session.is_changed() && !graphics.is_changed() {
        return;
    }

    while registry.pipe_entities.len() > session.plant.connections.len() {
        if let Some(entity) = registry.pipe_entities.pop() {
            commands.entity(entity).despawn();
        }
    }

    for (connection_index, connection) in session
        .plant
        .connections
        .iter()
        .enumerate()
        .skip(registry.pipe_entities.len())
    {
        let Some(a) = endpoint_position(connection.from, &session) else {
            continue;
        };
        let Some(b) = endpoint_position(connection.to, &session) else {
            continue;
        };
        let pa = Vec3::new(tile_x(a.x as i32), 0.42, tile_z(a.z as i32));
        let pb = Vec3::new(tile_x(b.x as i32), 0.42, tile_z(b.z as i32));
        let delta = pb - pa;
        let length = delta.length().max(0.1);
        let is_wire = matches!(
            connection.line,
            LineKind::Power | LineKind::LogicSensor | LineKind::LogicActuator
        );
        let thickness = if is_wire { 0.045 } else { 0.11 };
        let material = assets.pipe_material(
            connection.line,
            connection.leak_fraction > 0.0,
            graphics.mode,
        );
        let entity = commands
            .spawn((
                Mesh3d(assets.pipe_mesh.clone()),
                MeshMaterial3d(material),
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

    for (visual, mut current_material) in &mut existing_pipes {
        if let Some(connection) = session.plant.connections.get(visual.0) {
            let desired = assets.pipe_material(
                connection.line,
                connection.leak_fraction > 0.0,
                graphics.mode,
            );
            if current_material.0 != desired {
                current_material.0 = desired;
            }
        }
    }
}

fn endpoint_position(endpoint: Endpoint, session: &GameSession) -> Option<GridPos> {
    match endpoint {
        Endpoint::Service(port) => Some(service_position(port)),
        Endpoint::Machine(id) => session.plant.machine(id).map(|machine| machine.pos),
    }
}

fn all_line_kinds() -> [LineKind; 20] {
    [
        LineKind::RawBrine,
        LineKind::CleanBrine,
        LineKind::SpentBrine,
        LineKind::Reinjection,
        LineKind::Acid,
        LineKind::Caustic,
        LineKind::WashWater,
        LineKind::SodaAsh,
        LineKind::HydratedLime,
        LineKind::LithiumLiquor,
        LineKind::Salt,
        LineKind::Hydrogen,
        LineKind::Chlorine,
        LineKind::Steam,
        LineKind::Solid,
        LineKind::Product,
        LineKind::Power,
        LineKind::LogicSensor,
        LineKind::LogicActuator,
        LineKind::ReagentSupply,
    ]
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
    let position = service_position(port);
    Vec3::new(tile_x(position.x as i32), 0.0, tile_z(position.z as i32))
}
