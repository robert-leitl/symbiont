#version 300 es

precision highp float;

out vec4 outColor;

in vec2 v_texcoord;

#include "../libs/lygia/space/equirect2xyz.glsl"
#include "../libs/lygia/space/xyz2equirect.glsl"
#include "../libs/lygia/generative/snoise.glsl"

void main() {
    vec2 st = v_texcoord;
    vec3 dir = equirect2xyz(st);

    float noise = snoise(dir * 90.);

    outColor = vec4(noise);
}