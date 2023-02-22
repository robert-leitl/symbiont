import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { filter, fromEvent, merge, throwIfEmpty } from "rxjs";
import * as twgl from "twgl.js";
import { ArcballControl } from "./utils/arcball-control";

import quadVert from './shader/quad.vert.glsl';
import processVert from './shader/process.vert.glsl';
import processFrag from './shader/process.frag.glsl';
import spreadFrag from './shader/spread.frag.glsl';
import rampFrag from './shader/ramp.frag.glsl';
import sphereVert from './shader/sphere.vert.glsl';
import sphereFrag from './shader/sphere.frag.glsl';
import { rand } from "./utils";

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
        near: 0.1,
        far: 5,
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
        moveSpeed: 169.82207943566836,
        turnSpeed: 54.712084174761483,
        trailWeight: 150.41252941466865,
        sensorOffsetDist: 11,
        sensorAngleSpacing: 0.6108652381980153,
        sensorSize: 2.8288838422724623,
        evaporateSpeed: 1.5932796335343884,
        diffuseSpeed: 37.7184512302995,
    }

    AGENT_COUNT = 105000;

    texSize = [1800, 800];
    
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

        this.control.update(this.#deltaTime);
        mat4.fromQuat(this.worldMatrix, this.control.rotationQuat);

        // update the world inverse transpose
        mat4.invert(this.worldInverseMatrix, this.worldMatrix);
        mat4.transpose(this.worldInverseTransposeMatrix, this.worldInverseMatrix);

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

            twgl.resizeFramebufferInfo(gl, this.fbi1, this.agentAttachments, this.texSize[0], this.texSize[1]);
            twgl.resizeFramebufferInfo(gl, this.fbi2, this.agentAttachments, this.texSize[0], this.texSize[1]);
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
        this.displayPrg = twgl.createProgramInfo(gl, [quadVert, rampFrag]);
        this.spreadPrg = twgl.createProgramInfo(gl, [quadVert, spreadFrag]);
        this.spherePrg = twgl.createProgramInfo(gl, [sphereVert, sphereFrag]);

        // Setup Meshes
        this.quadBufferInfo = twgl.primitives.createXYQuadBufferInfo(gl);
        this.quadVAI = twgl.createVertexArrayInfo(gl, this.displayPrg, this.quadBufferInfo);
        this.sphereBufferInfo = twgl.primitives.createSphereBufferInfo(gl, 1, 15, 15);
        this.sphereVAI = twgl.createVertexArrayInfo(gl, this.spherePrg, this.sphereBufferInfo);

        // Setup Framebuffers
        this.agentAttachments = [
            { 
                internalFormat: (ext && ext2) ? gl.RGBA32F : gl.RGBA8, 
                min: gl.LINEAR,
                mag: gl.LINEAR,
                wrap: gl.REPEAT
            },
        ];
        this.fbi1 = twgl.createFramebufferInfo(gl, this.agentAttachments);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.fbi2 = twgl.createFramebufferInfo(gl, this.agentAttachments);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        
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
        this.current = this.agents1;
        this.then = 0;
    }

    #initAgents() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        const {positions, axis} = this.#createRandomAgents(this.AGENT_COUNT);
        this.agents1 = this.#createAgents(positions, axis);
        this.agents2 = this.#createAgents(positions, axis);

        twgl.setAttribInfoBufferFromArray(gl, this.agents1.bufferInfo.attribs.position, positions);
        twgl.setAttribInfoBufferFromArray(gl, this.agents2.bufferInfo.attribs.position, positions);
        twgl.setAttribInfoBufferFromArray(gl, this.agents1.bufferInfo.attribs.axis, axis);
        twgl.setAttribInfoBufferFromArray(gl, this.agents2.bufferInfo.attribs.axis, axis);
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
    };

    #initEvents() {
        this.isPointerDown = false;

        fromEvent(this.canvas, 'pointerdown').subscribe((e) => {
            this.isPointerDown = true;
        });
        merge(
            fromEvent(this.canvas, 'pointerup'),
            fromEvent(this.canvas, 'pointerleave')
        ).subscribe(() => this.isPointerDown = false);
    }

    #initImageTextures() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        return Promise.all([dirtTexturePromise]);
    }

    #initTweakpane() {
        if (!this.pane) return;

        const simFolder = this.pane.addFolder({ title: 'Simulation', expanded: true});
        simFolder.addInput(this.settings, 'moveSpeed', {min: 0, max: 300});
        simFolder.addInput(this.settings, 'turnSpeed', {min: 0, max: 300});
        simFolder.addInput(this.settings, 'trailWeight', {min: 0, max: 200});
        simFolder.addInput(this.settings, 'sensorOffsetDist', {min: 0, max: 100});
        simFolder.addInput(this.settings, 'sensorAngleSpacing', {min: 0, max: 2});
        simFolder.addInput(this.settings, 'sensorSize', {min: 0, max: 10});
        simFolder.addInput(this.settings, 'evaporateSpeed', {min: 0, max: 10});
        simFolder.addInput(this.settings, 'diffuseSpeed', {min: 0, max: 100});
    }

    #animate(deltaTime) {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        // use a fixed deltaTime of 16 ms adapted to
        // device frame rate
        deltaTime = 16 * this.#deltaFrames;
    }

    #render() {
        // use a fixed deltaTime of 16 ms adapted to
        // device frame rate
        let deltaTime = 16 * this.#deltaFrames;
        deltaTime = 1 / 60;

        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        const dest = this.current === this.agents1 ? this.agents2 : this.agents1;
        const destFBI = this.currentFBI === this.fbi1 ? this.fbi2 : this.fbi1;

        // update particle positions
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        twgl.bindFramebufferInfo(gl, destFBI);

        gl.useProgram(this.processPrg.program);
        gl.bindVertexArray(this.current.vertexArrayInfo.vertexArrayObject);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, dest.transformFeedback);
        gl.beginTransformFeedback(gl.POINTS);

        twgl.setUniforms(this.processPrg, {
            resolution: this.texSize,
            deltaTime,
            tex: this.currentFBI.attachments[0],
        }, this.settings);
        twgl.drawBufferInfo(gl, this.current.vertexArrayInfo, gl.POINTS, this.AGENT_COUNT);

        this.current = dest;

        gl.endTransformFeedback();
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

        // update spread diffuse texture
        twgl.bindFramebufferInfo(gl, this.currentFBI);
        gl.useProgram(this.spreadPrg.program);
        gl.bindVertexArray(this.quadVAI.vertexArrayObject);
        twgl.setUniforms(this.spreadPrg, {
            deltaTime,
            tex: destFBI.attachments[0],
        }, this.settings);
        twgl.drawBufferInfo(gl, this.quadVAI);

        // draw sphere
        twgl.bindFramebufferInfo(gl, null);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        gl.bindTexture(gl.TEXTURE_2D, this.currentFBI.attachments[0]);
        gl.generateMipmap(gl.TEXTURE_2D);

        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(this.spherePrg.program);
        gl.bindVertexArray(this.sphereVAI.vertexArrayObject);
        twgl.setUniforms(this.spherePrg, {
            u_worldMatrix: this.worldMatrix,
            u_viewMatrix: this.camera.matrices.view,
            u_projectionMatrix: this.camera.matrices.projection,
            u_worldInverseTransposeMatrix: this.worldInverseTransposeMatrix,
            u_time: this.#time,
            u_cameraPos: this.camera.position,
            u_texture: this.currentFBI.attachments[0],
        });
        twgl.drawBufferInfo(gl, this.sphereVAI);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);

        this.currentFBI = destFBI;
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
}