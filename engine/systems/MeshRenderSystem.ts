
import { ComponentStorage } from '../ecs/ComponentStorage';
import { INITIAL_CAPACITY, COMPONENT_MASKS } from '../constants';

interface MeshBatch {
    vao: WebGLVertexArrayObject;
    count: number;
    indexType: number; 
    instanceBuffer: WebGLBuffer;
    cpuBuffer: Float32Array; 
    instanceCount: number; 
    hasSkin: boolean;
    softWeightBuffer: WebGLBuffer; 
    vertexCount: number; 

    positionBuffer: WebGLBuffer;
    normalBuffer: WebGLBuffer;
    uvBuffer: WebGLBuffer;
    indexBuffer: WebGLBuffer;
    positionByteLength: number;
    normalByteLength: number;
    uvByteLength: number;
    indexByteLength: number;
    softWeightByteLength: number;
    vertexColorByteLength?: number;
    vertexColorBuffer?: WebGLBuffer;
    jointIndexBuffer?: WebGLBuffer;
    jointWeightBuffer?: WebGLBuffer;
}

const VS_TEMPLATE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in mat4 a_model; // Occupies locations 2, 3, 4, 5
layout(location=6) in vec3 a_color;
layout(location=7) in float a_isSelected;
layout(location=8) in vec2 a_uv;
layout(location=9) in float a_texIndex;
layout(location=10) in float a_effectIndex;
layout(location=11) in vec4 a_joints;
layout(location=12) in vec4 a_weights;
layout(location=13) in vec3 a_vertexColor;
layout(location=14) in float a_softWeight;

uniform mat4 u_viewProjection;
uniform highp float u_time;
uniform sampler2DArray u_textures;
uniform sampler2D u_boneTexture; 
uniform int u_hasSkinning; 

out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_objectPos; 
out vec3 v_color;
out float v_isSelected;
out vec2 v_uv;
out float v_texIndex;
out float v_effectIndex;
out vec4 v_joints;
out vec4 v_weights;
out float v_softWeight;
out float v_life;

// %VERTEX_LOGIC%

mat4 getBoneMatrix(int jointIndex) {
    int base = jointIndex * 4;
    vec4 r1 = texelFetch(u_boneTexture, ivec2(base, 0), 0);
    vec4 r2 = texelFetch(u_boneTexture, ivec2(base+1, 0), 0);
    vec4 r3 = texelFetch(u_boneTexture, ivec2(base+2, 0), 0);
    vec4 r4 = texelFetch(u_boneTexture, ivec2(base+3, 0), 0);
    return transpose(mat4(r1, r2, r3, r4));
}

void main() {
    mat4 model = a_model;
    vec4 localPos = vec4(a_position, 1.0);
    vec3 localNormal = a_normal;

    if (u_hasSkinning == 1) {
        mat4 skinMatrix = 
            a_weights.x * getBoneMatrix(int(a_joints.x)) +
            a_weights.y * getBoneMatrix(int(a_joints.y)) +
            a_weights.z * getBoneMatrix(int(a_joints.z)) +
            a_weights.w * getBoneMatrix(int(a_joints.w));
        localPos = skinMatrix * localPos;
        localNormal = mat3(skinMatrix) * localNormal;
    }

    vec4 initialWorldPos = model * localPos;
    v_worldPos = initialWorldPos.xyz;
    v_normal = normalize(mat3(model) * localNormal);
    v_objectPos = a_position;
    v_uv = a_uv;
    v_color = a_color * a_vertexColor;
    v_isSelected = a_isSelected;
    v_texIndex = a_texIndex;
    v_effectIndex = a_effectIndex;
    v_life = 1.0; 
    
    v_joints = a_joints;
    v_weights = a_weights;
    v_softWeight = a_softWeight;
    
    vec3 vertexOffset = vec3(0.0);
    // %VERTEX_BODY%
    
    localPos.xyz += vertexOffset;
    vec4 finalWorldPos = model * localPos;
    gl_Position = u_viewProjection * finalWorldPos;
    
    v_worldPos = finalWorldPos.xyz;
}`;

const FS_DEFAULT_SOURCE = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;

in highp vec3 v_normal;
in highp vec3 v_worldPos;
in highp vec3 v_objectPos;
in highp vec3 v_color;
in highp float v_isSelected;
in highp vec2 v_uv;
in highp float v_texIndex;
in highp float v_effectIndex;
in highp vec4 v_joints;
in highp vec4 v_weights;
in highp float v_softWeight;
in highp float v_life;

uniform sampler2DArray u_textures;
uniform int u_renderMode; 
uniform vec3 u_cameraPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform float u_lightIntensity;
uniform float u_time;
uniform float u_showHeatmap;
uniform int u_selectedBoneIndex; 

layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData; 

vec3 getStylizedLighting(vec3 normal, vec3 viewDir, vec3 albedo) {
    float NdotL = dot(normal, -u_lightDir);
    float lightBand = smoothstep(0.0, 0.05, NdotL);
    vec3 shadowColor = vec3(0.05, 0.05, 0.15); 
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
    vec3 litColor = albedo * u_lightColor * u_lightIntensity;
    vec3 finalLight = mix(shadowColor * albedo, litColor, lightBand);
    finalLight += vec3(rim) * 0.5 * u_lightColor;
    return finalLight;
}

vec3 heatMap(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.25) return mix(vec3(0,0,1), vec3(0,1,1), t * 4.0);
    if (t < 0.5) return mix(vec3(0,1,1), vec3(0,1,0), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(0,1,0), vec3(1,1,0), (t - 0.5) * 4.0);
    return mix(vec3(1,1,0), vec3(1,0,0), (t - 0.75) * 4.0);
}

void main() {
    vec3 normal = normalize(v_normal);
    vec3 viewDir = normalize(u_cameraPos - v_worldPos);
    vec4 texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    vec3 albedo = v_color * texColor.rgb;
    vec3 result = vec3(0.0);
    
    if (u_renderMode == 0) result = getStylizedLighting(normal, viewDir, albedo);
    else if (u_renderMode == 1) result = normal * 0.5 + 0.5;
    else if (u_renderMode == 2) result = albedo;
    else if (u_renderMode == 5) {
       float influence = 0.0;
       if (int(v_joints.x) == u_selectedBoneIndex) influence += v_weights.x;
       if (int(v_joints.y) == u_selectedBoneIndex) influence += v_weights.y;
       if (int(v_joints.z) == u_selectedBoneIndex) influence += v_weights.z;
       if (int(v_joints.w) == u_selectedBoneIndex) influence += v_weights.w;
       
       vec3 heat = heatMap(influence);
       float lighting = 0.5 + 0.5 * dot(normal, -u_lightDir);
       result = heat * lighting;
       if (influence <= 0.001) result = vec3(0.1); 
    }
    else result = albedo;
    
    if (v_softWeight > 0.0001 && u_showHeatmap > 0.5) {
        vec3 heat = heatMap(v_softWeight);
        float pulse = 0.5 + 0.5 * sin(u_time * 10.0);
        float blend = smoothstep(0.0, 0.2, v_softWeight) * 0.7;
        result = mix(result, heat, blend);
        float lines = step(0.9, fract(v_softWeight * 10.0));
        result += lines * 0.5 * heat * (0.5 + 0.5 * pulse);
    }

    outColor = vec4(result, 1.0);
    outData = vec4(v_effectIndex / 255.0, 0.0, 0.0, 1.0);
}`;

export class MeshRenderSystem {
    gl: WebGL2RenderingContext | null = null;
    defaultProgram: WebGLProgram | null = null;
    materialPrograms: Map<number, WebGLProgram> = new Map();
    meshes: Map<number, MeshBatch> = new Map();
    textureArray: WebGLTexture | null = null;
    boneTexture: WebGLTexture | null = null;
    
    // Uniform Cache
    private uniformCache = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

    // State
    selectedBoneIndex: number = -1;

    // Bucket Pooling to reduce GC
    private buckets: Map<number, number[]> = new Map();
    private excludedBuckets: Map<number, number[]> = new Map();
    private bucketPool: number[][] = []; 

    init(gl: WebGL2RenderingContext) {
        this.gl = gl;
        const defaultVS = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', '').replace('// %VERTEX_BODY%', '');
        this.defaultProgram = this.createProgram(gl, defaultVS, FS_DEFAULT_SOURCE);
        this.initTextureArray(gl);
        this.initBoneTexture(gl);
        
        gl.vertexAttrib3f(13, 1.0, 1.0, 1.0);
        gl.vertexAttrib1f(14, 0.0);
    }
    
    private getUniformLocation(gl: WebGL2RenderingContext, program: WebGLProgram, name: string) {
        let map = this.uniformCache.get(program);
        if (!map) {
            map = new Map();
            this.uniformCache.set(program, map);
        }
        if (map.has(name)) return map.get(name)!;
        const loc = gl.getUniformLocation(program, name);
        map.set(name, loc);
        return loc;
    }

    private createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
        const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
        
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { console.error('VS Error', gl.getShaderInfoLog(vs)); return null; }
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error('FS Error', gl.getShaderInfoLog(fs)); return null; }
        
        const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Link Error', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    private initTextureArray(gl: WebGL2RenderingContext) {
        this.textureArray = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 256, 256, 16);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    private initBoneTexture(gl: WebGL2RenderingContext) {
        this.boneTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.boneTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const data = new Float32Array(1024 * 4);
        for(let i=0; i<256; i++) {
            const base = i * 16;
            data[base] = 1; data[base+5] = 1; data[base+10] = 1; data[base+15] = 1;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, 1, 0, gl.RGBA, gl.FLOAT, data);
    }

    uploadTexture(layerIndex: number, image: HTMLImageElement) {
        if (!this.gl || !this.textureArray) return;
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 256, 256);
        this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, this.textureArray);
        this.gl.texSubImage3D(this.gl.TEXTURE_2D_ARRAY, 0, 0, 0, layerIndex, 256, 256, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
    }

    uploadBoneMatrices(matrices: Float32Array) {
        if (!this.gl || !this.boneTexture) return;
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.boneTexture);
        const pixelCount = matrices.length / 4; 
        this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, pixelCount, 1, this.gl.RGBA, this.gl.FLOAT, matrices);
    }

    registerMesh(id: number, geometry: any) {
        if (!this.gl) return;
        const gl = this.gl;
        const existingMesh = this.meshes.get(id);
        let vao = existingMesh?.vao;
        if (!vao) vao = gl.createVertexArray()!;

        gl.bindVertexArray(vao);
        if (existingMesh) {
            gl.deleteBuffer(existingMesh.positionBuffer);
            gl.deleteBuffer(existingMesh.normalBuffer);
            gl.deleteBuffer(existingMesh.uvBuffer);
            gl.deleteBuffer(existingMesh.indexBuffer);
            if (existingMesh.vertexColorBuffer) gl.deleteBuffer(existingMesh.vertexColorBuffer);
            if (existingMesh.jointIndexBuffer) gl.deleteBuffer(existingMesh.jointIndexBuffer);
            if (existingMesh.jointWeightBuffer) gl.deleteBuffer(existingMesh.jointWeightBuffer);
        }

        const createBuf = (typed: ArrayBufferView, target: number, usage: number) => {
            const b = gl.createBuffer()!; gl.bindBuffer(target, b); gl.bufferData(target, typed, usage); return b;
        };

        const positions = geometry.vertices instanceof Float32Array ? geometry.vertices : new Float32Array(geometry.vertices);
        const vertexCount = (positions.length / 3) | 0;
        const positionBuffer = createBuf(positions, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const normals = geometry.normals instanceof Float32Array ? geometry.normals : new Float32Array(geometry.normals || positions.length);
        const normalBuffer = createBuf(normals, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        const uvs = geometry.uvs instanceof Float32Array ? geometry.uvs : new Float32Array(geometry.uvs || vertexCount * 2);
        const uvBuffer = createBuf(uvs, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0);

        let vertexColorBuffer: WebGLBuffer | undefined;
        let vertexColorByteLength: number | undefined;
        if (geometry.colors && geometry.colors.length > 0) {
            const colors = geometry.colors instanceof Float32Array ? geometry.colors : new Float32Array(geometry.colors);
            vertexColorByteLength = colors.byteLength;
            vertexColorBuffer = createBuf(colors, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(13); gl.vertexAttribPointer(13, 3, gl.FLOAT, false, 0, 0);
        } else {
            gl.disableVertexAttribArray(13);
        }

        let softWeightBuffer: WebGLBuffer;
        let softWeightByteLength: number;
        if (existingMesh && existingMesh.softWeightBuffer && existingMesh.vertexCount === vertexCount) {
            softWeightBuffer = existingMesh.softWeightBuffer;
            softWeightByteLength = existingMesh.softWeightByteLength;
        } else {
            if (existingMesh?.softWeightBuffer) gl.deleteBuffer(existingMesh.softWeightBuffer);
            const softWeights = new Float32Array(vertexCount).fill(0);
            softWeightBuffer = createBuf(softWeights, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
            softWeightByteLength = softWeights.byteLength;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, softWeightBuffer);
        gl.enableVertexAttribArray(14); gl.vertexAttribPointer(14, 1, gl.FLOAT, false, 0, 0);

        const hasSkin = !!(geometry.jointIndices && geometry.jointWeights);
        let jointIndexBuffer, jointWeightBuffer;
        if (hasSkin) {
             const jI = geometry.jointIndices instanceof Float32Array ? geometry.jointIndices : new Float32Array(geometry.jointIndices);
             jointIndexBuffer = createBuf(jI, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
             gl.enableVertexAttribArray(11); gl.vertexAttribPointer(11, 4, gl.FLOAT, false, 0, 0);
             
             const jW = geometry.jointWeights instanceof Float32Array ? geometry.jointWeights : new Float32Array(geometry.jointWeights);
             jointWeightBuffer = createBuf(jW, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
             gl.enableVertexAttribArray(12); gl.vertexAttribPointer(12, 4, gl.FLOAT, false, 0, 0);
        } else {
             gl.disableVertexAttribArray(11); gl.disableVertexAttribArray(12);
        }

        let indices: ArrayBufferView;
        let indexType: number;
        if (geometry.indices instanceof Uint32Array) { indices = geometry.indices; indexType = gl.UNSIGNED_INT; }
        else if (geometry.indices instanceof Uint16Array) { indices = geometry.indices; indexType = gl.UNSIGNED_SHORT; }
        else { indices = new Uint16Array(geometry.indices || []); indexType = gl.UNSIGNED_SHORT; }
        
        const indexBuffer = createBuf(indices, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);

        let inst = existingMesh?.instanceBuffer;
        if (!inst) {
            const stride = 22 * 4;
            inst = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, inst);
            gl.bufferData(gl.ARRAY_BUFFER, INITIAL_CAPACITY * stride, gl.DYNAMIC_DRAW);
            for (let k = 0; k < 4; k++) {
                gl.enableVertexAttribArray(2 + k);
                gl.vertexAttribPointer(2 + k, 4, gl.FLOAT, false, stride, k * 16);
                gl.vertexAttribDivisor(2 + k, 1);
            }
            gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16 * 4); gl.vertexAttribDivisor(6, 1);
            gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19 * 4); gl.vertexAttribDivisor(7, 1);
            gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, 20 * 4); gl.vertexAttribDivisor(9, 1);
            gl.enableVertexAttribArray(10); gl.vertexAttribPointer(10, 1, gl.FLOAT, false, stride, 21 * 4); gl.vertexAttribDivisor(10, 1);
        }
        
        gl.bindVertexArray(null);

        this.meshes.set(id, {
            vao,
            count: (indices as any).length,
            indexType,
            instanceBuffer: inst,
            cpuBuffer: existingMesh?.cpuBuffer || new Float32Array(INITIAL_CAPACITY * 22),
            instanceCount: 0,
            hasSkin,
            softWeightBuffer,
            vertexCount,
            positionBuffer, normalBuffer, uvBuffer, indexBuffer,
            positionByteLength: positions.byteLength,
            normalByteLength: normals.byteLength,
            uvByteLength: uvs.byteLength,
            indexByteLength: indices.byteLength,
            softWeightByteLength,
            vertexColorByteLength,
            vertexColorBuffer,
            jointIndexBuffer, jointWeightBuffer
        });
    }

    updateMeshGeometry(id: number, geometry: any, opts: { positions?: boolean, normals?: boolean, uvs?: boolean, vertexColors?: boolean, indices?: boolean } = { positions: true, normals: true }) {
        if (!this.gl) return;
        const gl = this.gl;
        const mesh = this.meshes.get(id);
        if (!mesh) { this.registerMesh(id, geometry); return; }

        const positions = geometry.vertices;
        const vertexCount = ((positions.length ?? 0) / 3) | 0;
        if (mesh.vertexCount !== vertexCount) { this.registerMesh(id, geometry); return; }
        
        const updateBuf = (target: number, buffer: WebGLBuffer, typed: ArrayBufferView, prev: number) => {
             gl.bindBuffer(target, buffer);
             if (typed.byteLength === prev) {
                 gl.bufferSubData(target, 0, typed);
                 return prev;
             }
             gl.bufferData(target, typed.byteLength, gl.DYNAMIC_DRAW);
             gl.bufferSubData(target, 0, typed);
             return typed.byteLength;
        };

        if (opts.positions) {
             const p = positions instanceof Float32Array ? positions : new Float32Array(positions);
             mesh.positionByteLength = updateBuf(gl.ARRAY_BUFFER, mesh.positionBuffer, p, mesh.positionByteLength);
        }
        if (opts.normals && geometry.normals) {
             const n = geometry.normals instanceof Float32Array ? geometry.normals : new Float32Array(geometry.normals);
             mesh.normalByteLength = updateBuf(gl.ARRAY_BUFFER, mesh.normalBuffer, n, mesh.normalByteLength);
        }
        if (opts.uvs && geometry.uvs) {
             const u = geometry.uvs instanceof Float32Array ? geometry.uvs : new Float32Array(geometry.uvs);
             mesh.uvByteLength = updateBuf(gl.ARRAY_BUFFER, mesh.uvBuffer, u, mesh.uvByteLength);
        }
        if (opts.vertexColors && geometry.colors && mesh.vertexColorBuffer && mesh.vertexColorByteLength !== undefined) {
             const c = geometry.colors instanceof Float32Array ? geometry.colors : new Float32Array(geometry.colors);
             mesh.vertexColorByteLength = updateBuf(gl.ARRAY_BUFFER, mesh.vertexColorBuffer, c, mesh.vertexColorByteLength);
        }
        if (opts.indices && geometry.indices) {
             let idx: Uint16Array | Uint32Array;
             if (geometry.indices instanceof Uint32Array || geometry.indices instanceof Uint16Array) idx = geometry.indices;
             else idx = new Uint16Array(geometry.indices);
             
             if (idx.length !== mesh.count) {
                 mesh.count = idx.length;
             }
             mesh.indexByteLength = updateBuf(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer, idx, mesh.indexByteLength);
        }
    }

    updateSoftSelectionBuffer(meshId: number, weights: Float32Array) {
        if (!this.gl) return;
        const gl = this.gl;
        const mesh = this.meshes.get(meshId);
        if (!mesh) return;

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.softWeightBuffer);
        if (weights.byteLength === mesh.softWeightByteLength) {
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, weights);
        } else {
            gl.bufferData(gl.ARRAY_BUFFER, weights.byteLength, gl.DYNAMIC_DRAW);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, weights);
            mesh.softWeightByteLength = weights.byteLength;
        }
    }

    updateMaterial(materialId: number, shaderData: any) {
        if (!this.gl) return;
        const parts = shaderData.vs.split('// --- Graph Body (VS) ---');
        const vsSource = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', parts[0]||'').replace('// %VERTEX_BODY%', parts[1]||'');
        const program = this.createProgram(this.gl, vsSource, shaderData.fs);
        if (program) {
            const old = this.materialPrograms.get(materialId); if (old) this.gl.deleteProgram(old);
            this.materialPrograms.set(materialId, program);
        }
    }

    // Optimized: Reuse arrays
    prepareBuckets(store: ComponentStorage, count: number) {
        this.buckets.forEach(arr => arr.length = 0);
        this.excludedBuckets.forEach(arr => arr.length = 0);

        for (let i = 0; i < count; i++) {
            if (store.isActive[i] && store.meshType[i] !== 0) { 
                const key = (store.materialIndex[i] << 16) | store.meshType[i];
                const map = (store.effectIndex[i] >= 99.5) ? this.excludedBuckets : this.buckets;
                
                let arr = map.get(key);
                if (!arr) {
                    arr = this.bucketPool.pop() || [];
                    map.set(key, arr);
                }
                arr.push(i);
            }
        }
    }

    render(store: ComponentStorage, selected: Set<number>, vp: Float32Array, cam: any, time: number, lightDir: number[], lightColor: number[], lightIntensity: number, renderMode: number, pass: 'OPAQUE' | 'OVERLAY', softSelData?: any) {
        const gl = this.gl!;
        gl.vertexAttrib3f(13, 1.0, 1.0, 1.0);
        gl.vertexAttrib1f(14, 0.0);

        const targetBuckets = pass === 'OPAQUE' ? this.buckets : this.excludedBuckets;

        targetBuckets.forEach((indices, key) => {
            if (indices.length === 0) return;
            const matId = key >> 16; const meshId = key & 0xFFFF; const mesh = this.meshes.get(meshId); if(!mesh) return;
            const program = (matId > 0 && this.materialPrograms.has(matId)) ? this.materialPrograms.get(matId)! : this.defaultProgram!;
            gl.useProgram(program);

            const u = (name: string) => this.getUniformLocation(gl, program, name);

            let loc = u('u_viewProjection'); if (loc) gl.uniformMatrix4fv(loc, false, vp);
            loc = u('u_time'); if (loc) gl.uniform1f(loc, time);
            loc = u('u_cameraPos'); if (loc) gl.uniform3f(loc, cam.x, cam.y, cam.z);
            loc = u('u_renderMode'); if (loc) gl.uniform1i(loc, renderMode);
            loc = u('u_lightDir'); if (loc) gl.uniform3fv(loc, lightDir);
            loc = u('u_lightColor'); if (loc) gl.uniform3fv(loc, lightColor);
            loc = u('u_lightIntensity'); if (loc) gl.uniform1f(loc, lightIntensity);
            loc = u('u_showHeatmap'); if (loc) gl.uniform1f(loc, softSelData?.heatmapVisible ? 1.0 : 0.0);
            loc = u('u_selectedBoneIndex'); if (loc) gl.uniform1i(loc, this.selectedBoneIndex);
            loc = u('u_isParticle'); if (loc) gl.uniform1i(loc, 0);

            if (this.boneTexture) {
                gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.boneTexture);
                const loc = u('u_boneTexture');
                if (loc) gl.uniform1i(loc, 1);
                
                const locSkin = u('u_hasSkinning');
                if (locSkin) gl.uniform1i(locSkin, mesh.hasSkin ? 1 : 0);
            }

            if (this.textureArray) { 
                gl.activeTexture(gl.TEXTURE0); 
                gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray); 
                const loc = u('u_textures');
                if (loc) gl.uniform1i(loc, 0);
            }

            let instanceIdx = 0;
            const stride = 22; 
            const data = mesh.cpuBuffer;

            for (let i = 0; i < indices.length; i++) {
                const idx = indices[i];
                if (!store.isActive[idx]) continue;
                
                const base = idx * 16;
                for(let k=0; k<16; k++) data[instanceIdx * stride + k] = store.worldMatrix[base + k];
                data[instanceIdx * stride + 16] = store.colorR[idx];
                data[instanceIdx * stride + 17] = store.colorG[idx];
                data[instanceIdx * stride + 18] = store.colorB[idx];
                data[instanceIdx * stride + 19] = selected.has(idx) ? 1.0 : 0.0;
                data[instanceIdx * stride + 20] = store.textureIndex[idx];
                data[instanceIdx * stride + 21] = store.effectIndex[idx];

                instanceIdx++;
                if (instanceIdx >= INITIAL_CAPACITY) break;
            }

            if (instanceIdx > 0) {
                gl.bindVertexArray(mesh.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, instanceIdx * stride));
                gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, mesh.indexType, 0, instanceIdx);
            }
        });
    }
}
