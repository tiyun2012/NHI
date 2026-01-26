
# Asset Formats & Project Structure

The Ti3D Engine uses a file-based project structure. You can open any folder on your computer as a project.

## File Extensions

The engine recognizes specific file extensions to determine asset types:

*   **`.ti3d`**: Generic JSON container for engine assets (Scenes, Materials, Scripts, Physics Settings).
*   **`.obj`, `.fbx`, `.glb`**: 3D Models.
*   **`.png`, `.jpg`, `.jpeg`**: Textures.

## Asset JSON Schemas (`.ti3d`)

All `.ti3d` files must contain a root JSON object with at least `id`, `name`, and `type`.

### 1. Scene (`type: 'SCENE'`)
Stores the entire Entity Component System state.

```json
{
  "id": "uuid-v4",
  "name": "MainScene",
  "type": "SCENE",
  "data": {
    "json": "{ ... serialized ECS data ... }"
  }
}
```

### 2. Material (`type: 'MATERIAL'`)
Stores the Node Graph configuration for shaders.

```json
{
  "id": "uuid-v4",
  "name": "RedMetal",
  "type": "MATERIAL",
  "data": {
    "nodes": [
      { "id": "out", "type": "StandardMaterial", "position": { "x": 600, "y": 200 } },
      { "id": "col", "type": "Vec3", "position": { "x": 200, "y": 200 }, "data": { "x": 1, "y": 0, "z": 0 } }
    ],
    "connections": [
      { "id": "c1", "fromNode": "col", "fromPin": "out", "toNode": "out", "toPin": "albedo" }
    ],
    "glsl": " ... cached shader code ... "
  }
}
```

### 3. Script (`type: 'SCRIPT'`)
Stores visual logic graphs.

```json
{
  "id": "uuid-v4",
  "name": "RotateObject",
  "type": "SCRIPT",
  "data": {
    "nodes": [],
    "connections": []
  }
}
```

### 4. Physics Material (`type: 'PHYSICS_MATERIAL'`)

```json
{
  "id": "uuid-v4",
  "name": "BouncyRubber",
  "type": "PHYSICS_MATERIAL",
  "data": {
    "staticFriction": 0.6,
    "dynamicFriction": 0.6,
    "bounciness": 0.8,
    "density": 1.0
  }
}
```

### 5. Control Rig (`type: 'RIG'`)

```json
{
  "id": "uuid-v4",
  "name": "HumanoidLeg",
  "type": "RIG",
  "data": {
    "nodes": [ ... ],
    "connections": [ ... ]
  }
}
```

## Directory Structure

A standard project folder looks like this:

```
MyGameProject/
├── Content/
│   ├── Materials/
│   │   ├── PlayerMat.ti3d
│   │   └── FloorMat.ti3d
│   ├── Meshes/
│   │   ├── Hero.fbx
│   │   └── Environment.obj
│   ├── Textures/
│   │   ├── Diffuse.png
│   │   └── Normal.jpg
│   ├── Scenes/
│   │   └── Level01.ti3d
│   └── Scripts/
│       └── PlayerController.ti3d
└── Engine/ (Read Only defaults)
```
