#version 300 es

precision highp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;

out vec4 outColor;

//#define SAMPLER_FNC(TEX, UV) texture(TEX, wrapOctahedron(UV))
/*#ifndef GAUSSIANBLUR2D_SAMPLER_FNC
#define GAUSSIANBLUR2D_SAMPLER_FNC
vec4 myFunc(sampler2D tex, vec2 st) {
    return texture(tex, st);
}
#endif

#include "../libs/lygia/filter/gaussianBlur/2D.glsl"*/
#include "./util/wrap-octahedron.glsl"

vec4 gaussianBlur2D(in sampler2D tex, in vec2 st, in vec2 offset, const int kernelSize) {
    vec4 accumColor = vec4(0.);
    float kernelSizef = float(kernelSize);

    float accumWeight = 0.;
    const float k = .15915494; // 1 / (2*PI)
    float kernelSize2 = kernelSizef * kernelSizef;

    for (int j = 0; j < kernelSize; j++) {
        if (j >= kernelSize)
            break;
        float y = -.5 * (kernelSizef - 1.) + float(j);
        for (int i = 0; i < kernelSize; i++) {
            if (i >= kernelSize)
                break;
            float x = -.5 * (kernelSizef - 1.) + float(i);
            float weight = (k / kernelSizef) * exp(-(x * x + y * y) / (2. * kernelSize2));
            vec2 uv = st + vec2(x, y) * offset;
            uv = wrapOctahedron(uv);
            accumColor += weight * texture(tex, uv);
            accumWeight += weight;
        }
    }
    return accumColor / accumWeight;
}


void main() {
    vec2 size = vec2(textureSize(u_texture, 0));
    //vec4 color = bilateralBlur2D(u_texture, v_texcoord, .5 / size, 10);
    vec4 color = gaussianBlur2D(u_texture, v_texcoord, 2. / size, 6);
    //vec4 color = boxBlur2D(u_texture, v_texcoord, 2. / size, 6);
    outColor = color;
}