#!/usr/bin/env python3
"""Import selected licensed FBX files from the JustCreate3D Unity package.

The package and extracted files stay in .local-assets/ (gitignored). Vite embeds
them in the built game bundle; this script never extracts previews, prefabs,
materials, .blend files, or the full Unity package.
"""
from __future__ import annotations

import json
import sys
import tarfile
from pathlib import Path

PACK_ROOT = "Assets/LowPolyMedievalPropsLite"
MODEL_FILES = {
    "table": "Furniture_01.fbx",
    "stool": "Furniture_02.fbx",
    "tankard": "Jug_01.fbx",
    "mug": "Cup_01.fbx",
    "bread_basket": "Bucket_01.fbx",
    "cheese_wheel": "Plate_04.fbx",
    "barrel": "Barrel_01.fbx",
    "crate": "Box_01.fbx",
    "sack": "Bag_01.fbx",
    "candle": "Candle_01.fbx",
    "lantern": "Fire_01.fbx",
    "plank_floor": "WoodPlank_01.fbx",
}
TEXTURE_FILE = "MedievalProps_Texture_01.png"


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/import_medieval_props.py <LowPolyMedievalProps.unitypackage>", file=sys.stderr)
        return 2

    package = Path(sys.argv[1]).expanduser().resolve()
    if not package.is_file():
        print(f"Package not found: {package}", file=sys.stderr)
        return 2

    output_root = Path(".local-assets/medieval").resolve()
    models_dir = output_root / "Models"
    textures_dir = output_root / "Textures"
    models_dir.mkdir(parents=True, exist_ok=True)
    textures_dir.mkdir(parents=True, exist_ok=True)

    try:
        with tarfile.open(package, "r:*") as archive:
            members = {member.name: member for member in archive.getmembers()}
            paths: dict[str, str] = {}
            for member_name in members:
                if not member_name.endswith("/pathname"):
                    continue
                stream = archive.extractfile(member_name)
                if stream is None:
                    continue
                asset_path = stream.read().decode("utf-8", errors="replace").strip()
                paths[asset_path] = member_name

            requested = {
                f"{PACK_ROOT}/Models/{filename}": models_dir / filename
                for filename in MODEL_FILES.values()
            }
            requested[f"{PACK_ROOT}/Textures/{TEXTURE_FILE}"] = textures_dir / TEXTURE_FILE

            missing: list[str] = []
            extracted: list[str] = []
            for asset_path, destination in requested.items():
                pathname_member = paths.get(asset_path)
                if pathname_member is None:
                    missing.append(asset_path)
                    continue
                asset_member = pathname_member[:-len("pathname")] + "asset"
                member = members.get(asset_member)
                if member is None or not member.isfile():
                    missing.append(asset_path)
                    continue
                stream = archive.extractfile(member)
                if stream is None:
                    missing.append(asset_path)
                    continue
                destination.write_bytes(stream.read())
                extracted.append(asset_path)

            if missing:
                print("The package is missing required assets:", file=sys.stderr)
                for item in missing:
                    print(f"  - {item}", file=sys.stderr)
                return 1

    except (OSError, tarfile.TarError) as error:
        print(f"Could not read Unity package: {error}", file=sys.stderr)
        return 1

    manifest = {
        "author": "JustCreate3D (Oleh Lila)",
        "pack": "Low Poly Simple Medieval Props",
        "models": {key: f"Models/{filename}" for key, filename in MODEL_FILES.items()},
        "texture": f"Textures/{TEXTURE_FILE}",
    }
    (output_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Imported {len(MODEL_FILES)} FBX models and one shared texture to {output_root}")
    print("The originals remain local and gitignored; Vite embeds them into the game bundle.")
    print("No .blend files, previews, prefabs or standalone model downloads were created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
