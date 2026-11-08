# Third-party assets and credits

## Low Poly Simple Medieval Props

**Author:** JustCreate3D (Oleh Lila)  
**Pack page:** https://justcreate3d.itch.io/low-poly-simple-medieval-props  
**Source package:** LowPolyMedievalPropsLite_2020.3.0_SRP_v1.0.unitypackage  
**Licence:** the author's own licence terms, described on the linked pack page. This is **not CC0** and should not be described as a Creative Commons licence.

The pack licence permits personal and commercial use, modifications, and inclusion of the assets as integrated content in a compiled game or application. It does **not** permit redistributing the model files separately (modified or unmodified), as an asset pack/library/template, or through an application feature that lets users extract, reuse, or edit the source models. Copyright remains with the author. Attribution is not a stated requirement; Deskbound credits the author here voluntarily.

The repository therefore does not store the Unity package or extracted FBX/texture source files. The .gitignore excludes *.unitypackage and .local-assets/. scripts/import_medieval_props.py extracts only the selected FBX models and shared texture into the local ignored directory. During build, the Vite plugin embeds them into the Deskbound application bundle; the application does not offer the models as individual downloads. Do not upload the source assets to GitHub or publish an asset-only download. No .blend files are included or generated.

### Pack-to-game mapping

The pack does not contain exact equivalents for every tavern prop. These are the closest included choices:

| Deskbound prop | Source model | Notes |
| --- | --- | --- |
| table_1 | Furniture_01.fbx | Four-legged wooden table used as the tavern table |
| stool_1–stool_3 | Furniture_02.fbx | Bench-style seating is used as a stool substitute |
| tankards | Jug_01.fbx | Jug model used as tavern drinkware |
| mugs | Cup_01.fbx | Cup model |
| bread basket | Bucket_01.fbx | Container substitute |
| cheese wheel | Plate_04.fbx | Plate model with a small procedural cheese detail |
| barrel | Barrel_01.fbx | Rain-water source prop |
| crate | Box_01.fbx | Garden-side storage |
| sack | Bag_01.fbx | Garden-side storage |
| candle | Candle_01.fbx | Candle model |
| lantern | Fire_01.fbx | Brazier/fire prop used as a warm-light substitute |
| plank floor | WoodPlank_01.fbx | Repeated as an instanced platform |

A procedural version remains available for each prop if the local import is missing or a model fails to load. The table and props are rescaled to the miniature world; imported model floor points are normalized before placement.


## Animated resident characters

The five tiny residents use rigged low-poly characters by **Quaternius**, sourced from Poly Pizza. Each of the following individual model pages explicitly identifies the asset as **Public Domain (CC0)**:

| In-game character variant | Original asset | Source |
| --- | --- | --- |
| Business outfit | Business Man | https://poly.pizza/m/JFrLIKqvCH |
| Hoodie | Hoodie Character | https://poly.pizza/m/gKLBoRsyKe |
| Casual outfit | Casual Character | https://poly.pizza/m/kZ3DmIoGip |
| Punk outfit | Punk | https://poly.pizza/m/BTALZymknF |

These GLB files are committed under `public/models/residents/` because CC0 permits copying, modification and redistribution. The source files contain rigged skeletons and animation clips including Idle, Walk and Interact. Deskbound loads each unique GLB once, then skeleton-clones the scene for resident instances. Quaternius is credited voluntarily; the CC0 dedication does not require attribution.
