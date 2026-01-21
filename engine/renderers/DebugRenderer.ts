
export class DebugRenderer {
    gl: WebGL2RenderingContext | null = null;
    program: WebGLProgram | null = null;
    
    // Lines
    maxLines = 150000; 
    lineBufferData = new Float32Array(this.maxLines * 14); // 2 verts * 7 floats (x,y,z,r,g,b,a)
    lineCount = 0;
    lineVAO: WebGLVertexArrayObject | null = null;
    lineVBO: WebGLBuffer | null = null;

    // Points
    maxPoints = 100000;
    pointBufferData = new Float32Array(this.maxPoints * 9); // x,y,z,r,g,b,a,size,border
    pointCount = 0;
    pointVAO: WebGLVertexArrayObject | null = null;
    pointVBO: WebGLBuffer | null = null;

    // Triangles
    maxTriangles = 50000;
    triangleBufferData = new Float32Array(this.maxTriangles * 21); // 3 verts * 7 floats
    triangleCount = 0;
    triangleVAO: WebGLVertexArrayObject | null = null;
    triangleVBO: WebGLBuffer | null = null;

    uniforms: { u_vp: WebGLUniformLocation | null } = { u_vp: null };

    init(gl: WebGL2RenderingContext) {
        if (!gl) return;
        this.gl = gl;
        
        // Updated Shader to support RGBA and Primitives
        const vs = `#version 300 es
        layout(location=0) in vec3 a_pos; 
        layout(location=1) in vec4 a_color; 
        layout(location=2) in float a_size; 
        layout(location=3) in float a_border;
        uniform mat4 u_vp; 
        out vec4 v_color; 
        out float v_border;
        void main() { 
            gl_Position = u_vp * vec4(a_pos, 1.0); 
            
            // Bias: Pulls geometry slightly towards camera to overlay on meshes.
            // Value tuned to 0.00005 to fix back-face bleed-through while preventing Z-fighting.
            gl_Position.z -= 0.00005 * gl_Position.w;
            
            v_color = a_color; 
            v_border = a_border;
            gl_PointSize = a_size;
        }`;
        const fs = `#version 300 es
        precision mediump float; 
        in vec4 v_color; 
        in float v_border;
        out vec4 color; 
        void main() { 
            // Point Rendering Logic
            if (v_border >= 0.0) {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if (dist > 0.5) discard;
                
                vec3 c = v_color.rgb;
                if (v_border > 0.0 && dist > (0.5 - v_border)) {
                    c = vec3(1.0, 0.9, 0.0); // Bright Yellow Border
                }
                float alpha = smoothstep(0.5, 0.45, dist) * v_color.a;
                color = vec4(c, alpha);
            } else {
                // Lines / Triangles
                color = v_color;
            }
        }`;
        
        const createShader = (type: number, src: string) => {
            const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
            if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
            return s;
        };
        const p = gl.createProgram()!;
        const vShader = createShader(gl.VERTEX_SHADER, vs); const fShader = createShader(gl.FRAGMENT_SHADER, fs);
        if (!vShader || !fShader) return;
        gl.attachShader(p, vShader); gl.attachShader(p, fShader); gl.linkProgram(p);
        this.program = p;
        this.uniforms.u_vp = gl.getUniformLocation(p, 'u_vp');
        
        // Init Line VAO (Stride 28: 3+4 floats = 7 * 4 bytes)
        this.lineVAO = gl.createVertexArray(); this.lineVBO = gl.createBuffer();
        gl.bindVertexArray(this.lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.lineBufferData.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); 
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
        // Disable point attributes for lines
        gl.disableVertexAttribArray(2); gl.vertexAttrib2f(2, 0.0, 0.0);
        gl.disableVertexAttribArray(3); gl.vertexAttrib1f(3, -1.0); // -1 indicates not a point
        gl.bindVertexArray(null);

        // Init Point VAO (Stride 36: 3+4+1+1 floats = 9 * 4 bytes)
        this.pointVAO = gl.createVertexArray(); this.pointVBO = gl.createBuffer();
        gl.bindVertexArray(this.pointVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.pointBufferData.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); 
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 36, 28); // Size
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32); // Border
        gl.bindVertexArray(null);

        // Init Triangle VAO (Stride 28: 3+4 floats = 7 * 4 bytes)
        this.triangleVAO = gl.createVertexArray(); this.triangleVBO = gl.createBuffer();
        gl.bindVertexArray(this.triangleVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.triangleVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.triangleBufferData.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); 
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
        gl.disableVertexAttribArray(2); gl.vertexAttrib2f(2, 0.0, 0.0);
        gl.disableVertexAttribArray(3); gl.vertexAttrib1f(3, -1.0); // Not a point
        gl.bindVertexArray(null);
    }

    begin() { 
        this.lineCount = 0; 
        this.pointCount = 0;
        this.triangleCount = 0;
    }

    drawLine(p1: {x:number, y:number, z:number}, p2: {x:number, y:number, z:number}, color: {r:number, g:number, b:number, a?:number}) {
        if (this.lineCount >= this.maxLines) return;
        const i = this.lineCount * 14;
        const a = color.a !== undefined ? color.a : 1.0;
        this.lineBufferData[i] = p1.x; this.lineBufferData[i+1] = p1.y; this.lineBufferData[i+2] = p1.z;
        this.lineBufferData[i+3] = color.r; this.lineBufferData[i+4] = color.g; this.lineBufferData[i+5] = color.b; this.lineBufferData[i+6] = a;
        this.lineBufferData[i+7] = p2.x; this.lineBufferData[i+8] = p2.y; this.lineBufferData[i+9] = p2.z;
        this.lineBufferData[i+10] = color.r; this.lineBufferData[i+11] = color.g; this.lineBufferData[i+12] = color.b; this.lineBufferData[i+13] = a;
        this.lineCount++;
    }

    drawPoint(p: {x:number, y:number, z:number}, color: {r:number, g:number, b:number, a?:number}, size: number, border: number = 0.0) {
        this.drawPointRaw(p.x, p.y, p.z, color.r, color.g, color.b, color.a ?? 1.0, size, border);
    }

    drawPointRaw(x: number, y: number, z: number, r: number, g: number, b: number, a: number, size: number, border: number = 0.0) {
        if (this.pointCount >= this.maxPoints) return;
        const i = this.pointCount * 9;
        this.pointBufferData[i] = x;   this.pointBufferData[i+1] = y;   this.pointBufferData[i+2] = z;
        this.pointBufferData[i+3] = r; this.pointBufferData[i+4] = g; this.pointBufferData[i+5] = b; this.pointBufferData[i+6] = a;
        this.pointBufferData[i+7] = size;
        this.pointBufferData[i+8] = border;
        this.pointCount++;
    }

    drawTriangle(p1: {x:number, y:number, z:number}, p2: {x:number, y:number, z:number}, p3: {x:number, y:number, z:number}, color: {r:number, g:number, b:number, a?:number}) {
        if (this.triangleCount >= this.maxTriangles) return;
        const i = this.triangleCount * 21;
        const a = color.a !== undefined ? color.a : 1.0;
        
        // Vert 1
        this.triangleBufferData[i] = p1.x; this.triangleBufferData[i+1] = p1.y; this.triangleBufferData[i+2] = p1.z;
        this.triangleBufferData[i+3] = color.r; this.triangleBufferData[i+4] = color.g; this.triangleBufferData[i+5] = color.b; this.triangleBufferData[i+6] = a;
        // Vert 2
        this.triangleBufferData[i+7] = p2.x; this.triangleBufferData[i+8] = p2.y; this.triangleBufferData[i+9] = p2.z;
        this.triangleBufferData[i+10] = color.r; this.triangleBufferData[i+11] = color.g; this.triangleBufferData[i+12] = color.b; this.triangleBufferData[i+13] = a;
        // Vert 3
        this.triangleBufferData[i+14] = p3.x; this.triangleBufferData[i+15] = p3.y; this.triangleBufferData[i+16] = p3.z;
        this.triangleBufferData[i+17] = color.r; this.triangleBufferData[i+18] = color.g; this.triangleBufferData[i+19] = color.b; this.triangleBufferData[i+20] = a;
        
        this.triangleCount++;
    }

    render(viewProjection: Float32Array) {
        if (!this.gl || !this.program) return;
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.u_vp, false, viewProjection);
        
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        
        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Render Triangles (First, so lines draw on top if depth test allows or if we disable depth write for transparents)
        if (this.triangleCount > 0 && this.triangleVAO) {
            gl.depthMask(false); // Translucent triangles typically shouldn't write depth
            gl.bindVertexArray(this.triangleVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.triangleVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.triangleBufferData.subarray(0, this.triangleCount * 21));
            gl.drawArrays(gl.TRIANGLES, 0, this.triangleCount * 3);
            gl.depthMask(true);
        }

        // Render Lines
        if (this.lineCount > 0 && this.lineVAO) {
            gl.bindVertexArray(this.lineVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineBufferData.subarray(0, this.lineCount * 14));
            gl.drawArrays(gl.LINES, 0, this.lineCount * 2);
        }

        // Render Points
        if (this.pointCount > 0 && this.pointVAO) {
            gl.bindVertexArray(this.pointVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pointBufferData.subarray(0, this.pointCount * 9));
            gl.drawArrays(gl.POINTS, 0, this.pointCount);
        }

        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }
}
