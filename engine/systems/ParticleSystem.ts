
import { ComponentStorage } from '../ecs/ComponentStorage';
import { COMPONENT_MASKS } from '../constants';
import { assetManager } from '../AssetManager';
import { compileShader } from '../ShaderCompiler';
import { consoleService } from '../Console';

const PARTICLE_VS = `#version 300 es
precision highp float;

layout(location=0) in vec3 a_center;
layout(location=1) in vec3 a_color;
layout(location=2) in float a_size;
layout(location=3) in float a_life; // 0..1 (1=birth, 0=death)
layout(location=4) in float a_texIndex;
layout(location=5) in float a_effectIndex;

uniform mat4 u_viewProjection;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraUp;

out vec3 v_color;
out vec2 v_uv;
out float v_texIndex;
out float v_effectIndex;
out float v_life;

// Dummy outputs to match mesh render system interface if needed by shared shaders
out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_objectPos;
out float v_isSelected;
out vec4 v_weights;
out float v_softWeight;

void main() {
    // Billboarding logic
    vec3 toCam = normalize(u_cameraPos - a_center);
    vec3 right = normalize(cross(u_cameraUp, toCam));
    vec3 up = cross(toCam, right);
    
    // Quad expansion (indices: 0,1,2, 0,2,3 for 4 verts)
    int id = gl_VertexID % 4;
    vec2 offset = vec2(0.0);
    if(id == 0) offset = vec2(-0.5, -0.5);
    else if(id == 1) offset = vec2(0.5, -0.5);
    else if(id == 2) offset = vec2(0.5, 0.5);
    else if(id == 3) offset = vec2(-0.5, 0.5);
    
    vec3 pos = a_center + (right * offset.x + up * offset.y) * a_size;
    
    v_uv = offset + 0.5;
    v_color = a_color; 
    v_texIndex = a_texIndex;
    v_effectIndex = a_effectIndex;
    v_life = a_life;
    
    // Dummy values
    v_normal = toCam;
    v_worldPos = pos;
    v_objectPos = vec3(0.0);
    v_isSelected = 0.0;
    v_weights = vec4(0.0);
    v_softWeight = 0.0;
    
    gl_Position = u_viewProjection * vec4(pos, 1.0);
}`;

const PARTICLE_FS = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;

in vec3 v_color;
in vec2 v_uv;
in float v_texIndex;
in float v_effectIndex;
in float v_life;

uniform sampler2DArray u_textures;

layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData;

void main() {
    vec4 texColor = vec4(1.0);
    if (v_texIndex > 0.5) {
        texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    } else {
        float d = length(v_uv - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.8, 1.0, d);
        texColor = vec4(1.0, 1.0, 1.0, a);
    }
    
    float lifeAlpha = min(v_life * 3.0, 1.0);
    float finalAlpha = texColor.a * lifeAlpha;
    
    if (finalAlpha < 0.01) discard;

    vec3 finalColor = v_color * texColor.rgb;
    
    outColor = vec4(finalColor, finalAlpha);
    outData = vec4(v_effectIndex / 255.0, 0.0, 0.0, 1.0);
}`;

// Structure of Arrays for zero-allocation updates
class EmitterInstance {
    count = 0;
    capacity: number;
    
    // Physics State
    x: Float32Array;
    y: Float32Array;
    z: Float32Array;
    vx: Float32Array;
    vy: Float32Array;
    vz: Float32Array;
    
    // Visual State
    life: Float32Array;
    maxLife: Float32Array;
    size: Float32Array;
    r: Float32Array;
    g: Float32Array;
    b: Float32Array;
    
    spawnAccumulator = 0;
    
    // Render Data (Interleaved)
    bufferData: Float32Array;
    
    constructor(maxCount: number) {
        this.capacity = maxCount + 100; // Slight buffer
        
        this.x = new Float32Array(this.capacity);
        this.y = new Float32Array(this.capacity);
        this.z = new Float32Array(this.capacity);
        this.vx = new Float32Array(this.capacity);
        this.vy = new Float32Array(this.capacity);
        this.vz = new Float32Array(this.capacity);
        
        this.life = new Float32Array(this.capacity);
        this.maxLife = new Float32Array(this.capacity);
        this.size = new Float32Array(this.capacity);
        this.r = new Float32Array(this.capacity);
        this.g = new Float32Array(this.capacity);
        this.b = new Float32Array(this.capacity);

        this.bufferData = new Float32Array(this.capacity * 10); // stride 10
    }

    spawn(px: number, py: number, pz: number, 
          vx: number, vy: number, vz: number, 
          life: number, size: number, 
          cr: number, cg: number, cb: number) {
        if (this.count >= this.capacity) return;
        
        const i = this.count++;
        this.x[i] = px; this.y[i] = py; this.z[i] = pz;
        this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
        this.life[i] = life; this.maxLife[i] = life;
        this.size[i] = size;
        this.r[i] = cr; this.g[i] = cg; this.b[i] = cb;
    }

    remove(index: number) {
        if (index >= this.count) return;
        const last = --this.count;
        
        // Swap with last
        this.x[index] = this.x[last];
        this.y[index] = this.y[last];
        this.z[index] = this.z[last];
        this.vx[index] = this.vx[last];
        this.vy[index] = this.vy[last];
        this.vz[index] = this.vz[last];
        this.life[index] = this.life[last];
        this.maxLife[index] = this.maxLife[last];
        this.size[index] = this.size[last];
        this.r[index] = this.r[last];
        this.g[index] = this.g[last];
        this.b[index] = this.b[last];
    }
}

export class ParticleSystem {
    gl: WebGL2RenderingContext | null = null;
    defaultProgram: WebGLProgram | null = null;
    materialPrograms: Map<number, WebGLProgram> = new Map();
    emitters: Map<number, EmitterInstance> = new Map();
    
    vao: WebGLVertexArrayObject | null = null;
    vbo: WebGLBuffer | null = null;
    
    // Increased max batch for high performance
    MAX_BATCH = 50000; 

    init(gl: WebGL2RenderingContext) {
        this.gl = gl;
        
        const createProg = (vsSrc: string, fsSrc: string) => {
            const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
            const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
            const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
            return p;
        };

        this.defaultProgram = createProg(PARTICLE_VS, PARTICLE_FS);
        
        this.vao = gl.createVertexArray();
        this.vbo = gl.createBuffer();
        
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        // Pre-allocate GPU memory
        gl.bufferData(gl.ARRAY_BUFFER, this.MAX_BATCH * 10 * 4, gl.DYNAMIC_DRAW);
        
        const stride = 10 * 4;
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0); // Center
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12); // Color
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24); // Size
        gl.vertexAttribDivisor(2, 1);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 28); // Life
        gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 32); // Tex
        gl.vertexAttribDivisor(4, 1);
        gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 36); // Effect
        gl.vertexAttribDivisor(5, 1);
        
        gl.bindVertexArray(null);
    }

    getMaterialProgram(materialId: number): WebGLProgram | null {
        if (!this.gl) return null;
        if (this.materialPrograms.has(materialId)) return this.materialPrograms.get(materialId)!;

        const uuid = assetManager.getMaterialUUID(materialId);
        if (!uuid) return null;
        const asset = assetManager.getAsset(uuid);
        if (!asset || asset.type !== 'MATERIAL') return null;

        const result = compileShader(asset.data.nodes, asset.data.connections);
        if (typeof result === 'string') return null;

        const vs = this.gl.createShader(this.gl.VERTEX_SHADER)!; 
        this.gl.shaderSource(vs, PARTICLE_VS); 
        this.gl.compileShader(vs);
        
        const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER)!; 
        this.gl.shaderSource(fs, result.fs); 
        this.gl.compileShader(fs);
        
        const prog = this.gl.createProgram()!;
        this.gl.attachShader(prog, vs); 
        this.gl.attachShader(prog, fs); 
        this.gl.linkProgram(prog);

        if (this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
            this.materialPrograms.set(materialId, prog);
            return prog;
        }
        return null;
    }

    update(dt: number, store: ComponentStorage) {
        const safeDt = Math.min(dt, 0.1);

        for (let i = 0; i < store.capacity; i++) {
            if (!store.isActive[i] || !(store.componentMask[i] & COMPONENT_MASKS.PARTICLE_SYSTEM)) {
                if (this.emitters.has(i)) this.emitters.delete(i); 
                continue;
            }

            let emitter = this.emitters.get(i);
            const maxCount = store.psMaxCount[i];
            
            if (!emitter || emitter.capacity < maxCount) { 
                emitter = new EmitterInstance(maxCount);
                this.emitters.set(i, emitter);
            }

            // Spawn Logic
            emitter.spawnAccumulator += safeDt * store.psRate[i];
            const spawnCount = Math.floor(emitter.spawnAccumulator);
            emitter.spawnAccumulator -= spawnCount;
            const actualSpawn = Math.min(spawnCount, 50); // Cap per frame spawn

            if (actualSpawn > 0) {
                const shape = store.psShape[i];
                const wmOffset = i * 16;
                const rx = store.worldMatrix[wmOffset+12];
                const ry = store.worldMatrix[wmOffset+13];
                const rz = store.worldMatrix[wmOffset+14];
                const speed = store.psSpeed[i];
                const life = store.psLife[i];
                const size = store.psSize[i];
                const cr = store.psColorR[i];
                const cg = store.psColorG[i];
                const cb = store.psColorB[i];

                for (let k = 0; k < actualSpawn; k++) {
                    let vx=0, vy=1, vz=0;
                    
                    if (shape === 1) { // Cone
                        vx = (Math.random() - 0.5);
                        vz = (Math.random() - 0.5);
                        vy = 1.0;
                    } else { // Sphere
                        const theta = Math.random() * Math.PI * 2;
                        const phi = Math.acos(2 * Math.random() - 1);
                        vx = Math.sin(phi) * Math.cos(theta);
                        vy = Math.sin(phi) * Math.sin(theta);
                        vz = Math.cos(phi);
                    }
                    
                    const len = Math.sqrt(vx*vx+vy*vy+vz*vz);
                    if (len > 0) { vx/=len; vy/=len; vz/=len; }
                    
                    emitter.spawn(rx, ry, rz, vx*speed, vy*speed, vz*speed, life, size * (0.5 + Math.random()*0.5), cr, cg, cb);
                }
            }

            // Update Logic (SoA)
            const count = emitter.count;
            for (let j = count - 1; j >= 0; j--) {
                emitter.life[j] -= safeDt;
                if (emitter.life[j] <= 0) {
                    emitter.remove(j);
                    continue;
                }
                
                emitter.vy[j] += 0.5 * safeDt; // Buoyancy
                
                // Drag
                emitter.vx[j] *= 0.99;
                emitter.vy[j] *= 0.99;
                emitter.vz[j] *= 0.99;
                
                emitter.x[j] += emitter.vx[j] * safeDt;
                emitter.y[j] += emitter.vy[j] * safeDt;
                emitter.z[j] += emitter.vz[j] * safeDt;
            }
        }
    }

    render(viewProj: Float32Array, camPos: {x:number, y:number, z:number}, textureArray: WebGLTexture | null, time: number, store: ComponentStorage) {
        if (!this.gl || !this.defaultProgram || !this.vao) return;
        const gl = this.gl;
        
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL); 
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false); 
        
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

        this.emitters.forEach((emitter, idx) => {
            if (emitter.count === 0) return;
            
            const matId = store.psMaterialIndex[idx];
            const program = (matId > 0 && this.materialPrograms.has(matId)) ? this.materialPrograms.get(matId)! : this.defaultProgram!;

            gl.useProgram(program);
            
            // Set Uniforms (Could be optimized by caching locations)
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewProjection'), false, viewProj);
            gl.uniform3f(gl.getUniformLocation(program, 'u_cameraPos'), camPos.x, camPos.y, camPos.z);
            gl.uniform3f(gl.getUniformLocation(program, 'u_cameraUp'), 0, 1, 0); 
            gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
            gl.uniform1i(gl.getUniformLocation(program, 'u_isParticle'), 1);

            if (textureArray) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
                gl.uniform1i(gl.getUniformLocation(program, 'u_textures'), 0);
            }

            const texIdx = store.psTextureId[idx];
            const effectIdx = store.effectIndex[idx];
            
            // Pack Data
            const count = emitter.count;
            const data = emitter.bufferData;
            let ptr = 0;
            
            for(let i = 0; i < count; i++) {
                data[ptr++] = emitter.x[i];
                data[ptr++] = emitter.y[i];
                data[ptr++] = emitter.z[i];
                
                data[ptr++] = emitter.r[i];
                data[ptr++] = emitter.g[i];
                data[ptr++] = emitter.b[i];
                
                const lifeRatio = emitter.life[i] / emitter.maxLife[i];
                data[ptr++] = emitter.size[i] * Math.sin(lifeRatio * Math.PI); 
                data[ptr++] = lifeRatio;
                data[ptr++] = texIdx;
                data[ptr++] = effectIdx;
            }
            
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, ptr));
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 4, count);
        });

        gl.bindVertexArray(null);
        gl.depthMask(true);
    }
}
