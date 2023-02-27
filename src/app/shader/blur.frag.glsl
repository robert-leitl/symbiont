#version 300 es

precision highp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;

out vec4 outColor;

#include "./util/wrap-octahedron.glsl"

#ifndef GAUSSIANBLUR2D_SAMPLER_FNC
#define GAUSSIANBLUR2D_SAMPLER_FNC(TEX, UV) texture(TEX, wrapOctahedron(UV))
#endif

#include "../libs/lygia/filter/gaussianBlur/2D.glsl"

void main() {
    vec2 size = vec2(textureSize(u_texture, 0));
    vec4 color = gaussianBlur2D(u_texture, v_texcoord, 1.5 / size, 8);
    outColor = color;
}