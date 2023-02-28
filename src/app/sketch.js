import { mat4, quat, vec2, vec3, vec4 } from "gl-matrix";
import { filter, fromEvent, merge, throwIfEmpty } from "rxjs";
import * as twgl from "twgl.js";
import { ArcballControl } from "./utils/arcball-control";

import quadVert from './shader/quad.vert.glsl';
import processVert from './shader/process.vert.glsl';
import processFrag from './shader/process.frag.glsl';
import spreadFrag from './shader/spread.frag.glsl';
import sphereVert from './shader/sphere.vert.glsl';
import sphereFrag from './shader/sphere.frag.glsl';
import sphereBackVert from './shader/sphere-back.vert.glsl';
import sphereBackFrag from './shader/sphere-back.frag.glsl';
import textureVert from './shader/texture.vert.glsl';
import textureFrag from './shader/texture.frag.glsl';
import blurFrag from './shader/blur.frag.glsl';
import { rand } from "./utils";
import { GLBBuilder } from "./utils/glb-builder";
import { SecondOrderSystemValue } from "./utils/second-order-value";
import { SecondOrderSystemQuaternion } from "./utils/second-order-quaternion";

export class Sketch {

    TARGET_FRAME_DURATION = 16;
    #time = 0; // total time
    #deltaTime = 0; // duration betweent the previous and the current animation frame
    #frames = 0; // total framecount according to the target frame duration
    // relative frames according to the target frame duration (1 = 60 fps)
    // gets smaller with higher framerates --> use to adapt animation timing
    #deltaFrames = 0;
    

    camera = {
        matrix: mat4.create(),
        near: 2,
        far: 6,
        fov: Math.PI / 3,
        aspect: 1,
        position: vec3.fromValues(0, 0, 4),
        up: vec3.fromValues(0, 1, 0),
        matrices: {
            view: mat4.create(),
            projection: mat4.create(),
            inversProjection: mat4.create(),
            inversViewProjection: mat4.create()
        }
    };

    animationProps = {
    };

    settings = {
        moveSpeed: 240.82207943566836,
        turnSpeed: 60.712084174761483,
        trailWeight: 100.41252941466865,
        sensorOffsetDist: 11,
        sensorAngleSpacing: 0.8108652381980153,
        evaporateSpeed: 1.5932796335343884,
        diffuseSpeed: 37.7184512302995,
    }

    renderSettings = {
        displacementStrength: 0.02
    }

    AGENT_COUNT = 30000;

    texSize = [ 800, 800];

    pointer = [0, 0];
    pointerDir = [0, 0, -1];
    pointerStrength = 0;
    displacementStrength = new SecondOrderSystemValue(1.8, 0.6, 2, 0);
    pointerDirSOQ = new SecondOrderSystemQuaternion(2, 0.2, 1, quat.create());
    
    constructor(canvasElm, onInit = null, isDev = false, pane = null) {
        this.canvas = canvasElm;
        this.onInit = onInit;
        this.isDev = isDev;
        this.pane = pane;

        this.#init().then(() => {
            if (this.onInit) this.onInit(this)
        });
    }

    run(time = 0) {
        this.#deltaTime = Math.min(16, time - this.#time);
        this.#time = time;
        this.#deltaFrames = this.#deltaTime / this.TARGET_FRAME_DURATION;
        this.#frames += this.#deltaFrames;

        this.#animate(this.#deltaTime);
        this.#render();

        requestAnimationFrame((t) => this.run(t));
    }

    resize() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.viewportSize = vec2.set(
            this.viewportSize,
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );

        const needsResize = twgl.resizeCanvasToDisplaySize(this.canvas);

        if (needsResize) {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

            if (this.fbi1 && this.fbi2) {
                twgl.resizeFramebufferInfo(gl, this.fbi1, this.agentAttachments, this.texSize[0], this.texSize[1]);
                twgl.resizeFramebufferInfo(gl, this.fbi2, this.agentAttachments, this.texSize[0], this.texSize[1]);
            }
        }

        this.#updateProjectionMatrix(gl);
    }

    async #init() {
        this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false });

        this.touchevents = Modernizr.touchevents;

        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        twgl.addExtensionsToContext(gl);
        const ext = gl.getExtension('EXT_color_buffer_float');
        const ext2 = gl.getExtension('OES_texture_float_linear');

        this.viewportSize = vec2.fromValues(
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );
 
        // Setup Programs
        this.processPrg = twgl.createProgramInfo(gl, [processVert, processFrag], {
            transformFeedbackVaryings: ['v_position', 'v_axis'],
        });
        this.texturePrg = twgl.createProgramInfo(gl, [textureVert, textureFrag]);
        this.spreadPrg = twgl.createProgramInfo(gl, [quadVert, spreadFrag]);
        this.blurPrg = twgl.createProgramInfo(gl, [quadVert, blurFrag]);
        this.spherePrg = twgl.createProgramInfo(gl, [sphereVert, sphereFrag]);
        this.sphereBackPrg = twgl.createProgramInfo(gl, [sphereBackVert, sphereBackFrag]);

        // Setup Meshes
        this.quadBufferInfo = twgl.primitives.createXYQuadBufferInfo(gl);
        this.quadVAI = twgl.createVertexArrayInfo(gl, this.blurPrg, this.quadBufferInfo);
        this.sphereBufferInfo = twgl.primitives.createSphereBufferInfo(gl, 1, 15, 15);
        this.sphereVAI = twgl.createVertexArrayInfo(gl, this.spherePrg, this.sphereBufferInfo);

        // load the icosphere model
        this.glbBuilder = new GLBBuilder(gl);
        await this.glbBuilder.load(new URL('../assets/model.glb', import.meta.url));
        this.modelPrimitive = this.glbBuilder.getPrimitiveDataByMeshName('Icosphere.001');
        this.modelBuffers = this.modelPrimitive.buffers;
        this.modelBufferInfo = twgl.createBufferInfoFromArrays(gl, { 
            position: {...this.modelBuffers.vertices, numComponents: this.modelBuffers.vertices.numberOfComponents},
            normal: {...this.modelBuffers.normals, numComponents: this.modelBuffers.normals.numberOfComponents},
            texcoord: {...this.modelBuffers.texcoords, numComponents: this.modelBuffers.texcoords.numberOfComponents},
            tangent: {...this.modelBuffers.tangents, numComponents: this.modelBuffers.tangents.numberOfComponents},
            indices: {...this.modelBuffers.indices, numComponents: this.modelBuffers.indices.numberOfComponents}
        });
        this.icosphereVAI = twgl.createVertexArrayInfo(gl, this.spherePrg, this.modelBufferInfo);

        // Setup Framebuffers
        this.agentAttachments = [
            { 
                internalFormat: /*(ext && ext2) ? gl.RGBA32F :*/ gl.RGBA8, 
                min: gl.LINEAR,
                mag: gl.LINEAR,
                wrap: gl.REPEAT
            },
        ];
        this.fbi1 = twgl.createFramebufferInfo(gl, this.agentAttachments, this.texSize[0], this.texSize[1]);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.fbi2 = twgl.createFramebufferInfo(gl, this.agentAttachments, this.texSize[0], this.texSize[1]);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.blurFBI = twgl.createFramebufferInfo(gl, [{ min: gl.LINEAR, mag: gl.LINEAR }], this.texSize[0], this.texSize[1]);
        gl.generateMipmap(gl.TEXTURE_2D);
        const resScale = Math.max(this.viewportSize[0], this.viewportSize[1]) > 800 ? 1 : 0.5;
        this.textureFBI = twgl.createFramebufferInfo(
            gl, 
            [{minMag: gl.LINEAR}], 
            2048 * resScale, 1024 * resScale
        );

        // Create the albedo color ramp texture
        this.albedoRampTexture = twgl.createTexture(gl, 
            {
                minMag: gl.LINEAR,
                format: gl.RGB,
                wrap: gl.CLAMP_TO_EDGE,
                src: new Uint8Array([
                  155, 10, 10,
                  130, 20, 20,
                  190, 155, 160,
                  210, 190, 180,
                ]),
                width: 4,
                height: 1,
              }
        );

        await this.#initImageTextures();
        
        this.worldMatrix = mat4.create();
        this.worldInverseMatrix = mat4.create();
        this.worldInverseTransposeMatrix = mat4.create();

        this.resize();
        
        this.control = new ArcballControl(this.canvas);
        this.#initTweakpane();
        this.#updateCameraMatrix();
        this.#updateProjectionMatrix(gl);
        this.#initEvents();
        this.#initAgents();

        // render vars
        this.currentFBI = this.fbi1;
        this.sourceTFI = this.tfi1;
        this.then = 0;
    }

    #initAgents() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        const {positions, axis} = this.#createRandomAgents(this.AGENT_COUNT);
        this.tfi1 = this.#createAgents(positions, axis);
        this.tfi2 = this.#createAgents(positions, axis);

        twgl.setAttribInfoBufferFromArray(gl, this.tfi1.bufferInfo.attribs.position, positions);
        twgl.setAttribInfoBufferFromArray(gl, this.tfi2.bufferInfo.attribs.position, positions);
        twgl.setAttribInfoBufferFromArray(gl, this.tfi1.bufferInfo.attribs.axis, axis);
        twgl.setAttribInfoBufferFromArray(gl, this.tfi2.bufferInfo.attribs.axis, axis);
        twgl.bindFramebufferInfo(gl, this.fbi1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        twgl.bindFramebufferInfo(gl, this.fbi2);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    #createAgents(position, axis) {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        const bufferInfo = twgl.createBufferInfoFromArrays(gl, {
            position: { data: position, numComponents: 3, },
            axis: { data: axis, numComponents: 3, },
        });
        const vertexArrayInfo = twgl.createVertexArrayInfo(gl, this.processPrg, bufferInfo);
        const transformFeedback = twgl.createTransformFeedback(gl, this.processPrg, {
            v_position: bufferInfo.attribs.position,
            v_axis: bufferInfo.attribs.axis,
        });
        return {
            bufferInfo,
            transformFeedback,
            vertexArrayInfo,
        };
    }

    #createRandomAgents(maxAgents) {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        const positions = [];
        const axis = [];
        const PI_2 = Math.PI * 2;
        for (let i = 0; i < maxAgents; ++i) {
            let phi = rand(0, PI_2);
            let theta = rand(0, PI_2);
            let x = Math.cos(theta);
            let y = 0.0;
            let z = Math.sin(theta);
            y  = Math.cos(phi);
            x *= Math.sqrt(1.0 - y * y);
            z *= Math.sqrt(1.0 - y * y);

            positions.push(x, y, z);
            axis.push(
                rand(-1, 1),
                rand(-1, 1),
                rand(-1, 1),
            );
        }
        return {
            positions,
            axis
        }
    }

    #initEvents() {
        this.isPointerDown = false;

        fromEvent(this.canvas, 'pointerdown').subscribe((e) => {
            this.isPointerDown = true;
        });
        merge(
            fromEvent(this.canvas, 'pointerup'),
            fromEvent(this.canvas, 'pointerleave')
        ).subscribe(() => this.isPointerDown = false);

        fromEvent(this.canvas, 'pointermove').subscribe((e) => {
            this.pointer[0] = e.clientX;
            this.pointer[1] = this.viewportSize[1] - e.clientY;
        });
    }

    #initImageTextures() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        const envTexturePromise = new Promise((resolve) => {
            this.envTexture = twgl.createTexture(gl, {
                src: new URL('../assets/env.jpg', import.meta.url).toString(),
            }, () => resolve());
        });

        return Promise.all([envTexturePromise]);
    }

    #initTweakpane() {
        if (!this.pane) return;

        const simFolder = this.pane.addFolder({ title: 'Simulation', expanded: true});
        simFolder.addInput(this.settings, 'moveSpeed', {min: 0, max: 500});
        simFolder.addInput(this.settings, 'turnSpeed', {min: 0, max: 500});
        simFolder.addInput(this.settings, 'trailWeight', {min: 0, max: 300});
        simFolder.addInput(this.settings, 'sensorOffsetDist', {min: 0, max: 200});
        simFolder.addInput(this.settings, 'sensorAngleSpacing', {min: 0, max: 4});
        simFolder.addInput(this.settings, 'evaporateSpeed', {min: 0, max: 20});
        simFolder.addInput(this.settings, 'diffuseSpeed', {min: 0, max: 200});

        const renderFolder = this.pane.addFolder({ title: 'Rendering', expanded: true});
        renderFolder.addInput(this.renderSettings, 'displacementStrength', {min: -.1, max: .1});
    }

    #animate(deltaTime) {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        // use a fixed deltaTime of 16 ms adapted to
        // device frame rate
        deltaTime = 16 * this.#deltaFrames + 0.0001;

        this.control.update(deltaTime);
        mat4.fromQuat(this.worldMatrix, this.control.rotationQuat);

        // update the world inverse transpose
        mat4.invert(this.worldInverseMatrix, this.worldMatrix);
        mat4.transpose(this.worldInverseTransposeMatrix, this.worldInverseMatrix);

        // get the pointer direction from the 2d position
        const w = this.viewportSize[0];
        const h = this.viewportSize[1];
        const s = Math.max(w, h) - 1;
        const x = (2 * this.pointer[0] - w - 1) / s;
        const y = (2 * this.pointer[1] - h - 1) / s;
        const xySq = x * x + y * y;
        let z = 0;
        const rSq = .8;
        if (xySq <= rSq / 2)
            z = Math.sqrt(rSq - xySq);
        else
            z = (rSq / 2) / Math.sqrt(xySq); // hyperbolical function

        const spherePos = this.#screenToSpherePos(this.pointer);
        const newPointerDir = spherePos ? spherePos : vec3.fromValues(x, y, z);
        vec3.normalize(newPointerDir, newPointerDir);
        const pointerRotation = mat4.targetTo(mat4.create(), vec3.create(), newPointerDir, vec3.fromValues(0, 1, 0));
        const pointerQuat = mat4.getRotation(quat.create(), pointerRotation);
        this.pointerDirSOQ.updateApprox(deltaTime * 0.001, pointerQuat);
        this.pointerDir = vec3.transformQuat(this.pointerDir, vec3.fromValues(0, 0, -1), this.pointerDirSOQ.value);
        vec3.transformMat4(this.pointerDir, this.pointerDir, this.worldInverseMatrix);

        // get the pointer strength from the offset to the center
        const targetPointerStrength = spherePos ? 1 : 0;
        this.pointerStrength += (targetPointerStrength - this.pointerStrength) / 1.5;

        // update the displacement strength wobble
        this.displacementStrength.update(deltaTime * 0.001, this.pointerStrength);

        this.#animateAgents();
    }

    #animateAgents() {
        // use a fixed deltaTime of 16 ms adapted to
        // device frame rate
        const deltaTime = 1 / 60;

        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        const repeatCount = Math.max(1, 3 - Math.round(1 / (this.#deltaFrames + 0.00001)));
        console.log(repeatCount);
        for(let i=0; i<repeatCount; ++i) {
            let targetTFI = this.sourceTFI === this.tfi1 ? this.tfi2 : this.tfi1;
            this.outFBI = this.currentFBI === this.fbi1 ? this.fbi2 : this.fbi1;
    
            // update particle positions
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            twgl.bindFramebufferInfo(gl, this.outFBI);
    
            gl.useProgram(this.processPrg.program);
            gl.bindVertexArray(this.sourceTFI.vertexArrayInfo.vertexArrayObject);
            gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, targetTFI.transformFeedback);
            gl.beginTransformFeedback(gl.POINTS);
    
            twgl.setUniforms(this.processPrg, {
                resolution: this.texSize,
                u_pointer: this.pointer,
                u_pointerDir: this.pointerDir,
                u_pointerStrength: this.pointerStrength,
                deltaTime,
                tex: this.currentFBI.attachments[0],
            }, this.settings);
            twgl.drawBufferInfo(gl, this.sourceTFI.vertexArrayInfo, gl.POINTS, this.AGENT_COUNT);
    
            this.sourceTFI = targetTFI;
    
            gl.endTransformFeedback();
            gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    
            // update spread diffuse texture
            twgl.bindFramebufferInfo(gl, this.currentFBI);
            gl.useProgram(this.spreadPrg.program);
            gl.bindVertexArray(this.quadVAI.vertexArrayObject);
            twgl.setUniforms(this.spreadPrg, {
                deltaTime,
                tex: this.outFBI.attachments[0],
            }, this.settings);
            twgl.drawBufferInfo(gl, this.quadVAI);
    
            this.resultFBI = this.currentFBI;
            this.currentFBI = this.outFBI;
        }
    }

    #render() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        // render the texture
        if (!this.prerender) {
            this.prerender = true;
            twgl.bindFramebufferInfo(gl, this.textureFBI);
            gl.bindVertexArray(this.quadVAI.vertexArrayObject);
            gl.disable(gl.CULL_FACE);
            gl.disable(gl.DEPTH_TEST);
            this.gl.clearColor(0, 0, 0, 1);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
            this.gl.useProgram(this.texturePrg.program);
            twgl.setUniforms(this.texturePrg, {});
            twgl.drawBufferInfo(gl, this.quadVAI);
        }


        // blur texture
        twgl.bindFramebufferInfo(gl, this.blurFBI);
        gl.useProgram(this.blurPrg.program);
        gl.bindVertexArray(this.quadVAI.vertexArrayObject);
        twgl.setUniforms(this.blurPrg, {
            u_texture: this.outFBI.attachments[0],
        });
        twgl.drawBufferInfo(gl, this.quadVAI);

        // draw sphere
        twgl.bindFramebufferInfo(gl, null);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        this.gl.clearColor(1, 1, 0.99, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        gl.bindTexture(gl.TEXTURE_2D, this.resultFBI.attachments[0]);
        gl.generateMipmap(gl.TEXTURE_2D);

        gl.useProgram(this.spherePrg.program);
        gl.bindVertexArray(this.icosphereVAI.vertexArrayObject);
        
        gl.cullFace(gl.FRONT);
        gl.useProgram(this.sphereBackPrg.program);
        twgl.setUniforms(this.sphereBackPrg, {
            u_worldMatrix: this.worldMatrix,
            u_viewMatrix: this.camera.matrices.view,
            u_projectionMatrix: this.camera.matrices.projection,
            u_texture: this.blurFBI.attachments[0],
        }, this.renderSettings);
        twgl.drawBufferInfo(gl, this.icosphereVAI);
        gl.cullFace(gl.BACK);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.spherePrg.program);
        twgl.setUniforms(this.spherePrg, {
            u_worldMatrix: this.worldMatrix,
            u_viewMatrix: this.camera.matrices.view,
            u_projectionMatrix: this.camera.matrices.projection,
            u_worldInverseTransposeMatrix: this.worldInverseTransposeMatrix,
            u_time: this.#time,
            u_cameraPos: this.camera.position,
            u_texture: this.blurFBI.attachments[0],
            u_pointerDir: this.pointerDir,
            u_displacementStrength: this.renderSettings.displacementStrength * this.displacementStrength.value,
            u_albedoRampTexture: this.albedoRampTexture,
            u_envTexture: this.envTexture,
            u_noiseTexture: this.textureFBI.attachments[0]
        }, this.renderSettings);
        twgl.drawBufferInfo(gl, this.icosphereVAI);
        gl.disable(gl.BLEND);
    }

    #updateCameraMatrix() {
        mat4.targetTo(this.camera.matrix, this.camera.position, [0, 0, 0], this.camera.up);
        mat4.invert(this.camera.matrices.view, this.camera.matrix);
    }

    #updateProjectionMatrix(gl) {
        this.camera.aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

        const height = 1.45;
        const distance = this.camera.position[2];
        if (this.camera.aspect > 1) {
            this.camera.fov = 2 * Math.atan( height / distance );
        } else {
            this.camera.fov = 2 * Math.atan( (height / this.camera.aspect) / distance );
        }

        mat4.perspective(this.camera.matrices.projection, this.camera.fov, this.camera.aspect, this.camera.near, this.camera.far);
        mat4.invert(this.camera.matrices.inversProjection, this.camera.matrices.projection);
        mat4.multiply(this.camera.matrices.inversViewProjection, this.camera.matrix, this.camera.matrices.inversProjection)
    }

    #screenToSpherePos(screenPos) {
        // map to -1 to 1
        const x = (screenPos[0] / this.viewportSize[0]) * 2. - 1;
        const y = (screenPos[1] / this.viewportSize[1]) * 2. - 1;
        
        // l(t) = p + t * u
        const p = this.#screenToWorldPosition(x, y, 0);
        const u = vec3.subtract(vec3.create(), p, this.camera.position);
        vec3.normalize(u, u);

        // sphere at origin intersection
        const radius = 1.05;
        const c = vec3.dot(p, p) - radius * radius;
        const b = vec3.dot(u, p) * 2;
        const a = 1;
        const d = b * b - 4 * a * c;

        if (d < 0) { 
            // No solution
            return null;
        } else {
            const sd = Math.sqrt(d);
            const t1 = (-b + sd) / (2 * a);
            const t2 = (-b - sd) / (2 * a);
            const t = Math.min(t1, t2);

            vec3.scale(u, u, t);
            const i = vec3.add(vec3.create(), p, u);

            return i;
        }
    }

    #screenToWorldPosition(x, y, z) {
        const ndcPos = vec3.fromValues(x, y, z); 
        const worldPos = vec4.transformMat4(vec4.create(), vec4.fromValues(ndcPos[0], ndcPos[1], ndcPos[2], 1), this.camera.matrices.inversViewProjection);
        if (worldPos[3] !== 0){
            vec4.scale(worldPos, worldPos, 1 / worldPos[3]);
        }

        return worldPos;
    }
}