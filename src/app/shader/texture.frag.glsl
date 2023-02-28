#version 300 es

precision highp float;

out vec4 outColor;

in vec2 v_texcoord;

#include "../libs/lygia/space/equirect2xyz.glsl"
#include "../libs/lygia/space/xyz2equirect.glsl"
#include "../libs/lygia/generative/snoise.glsl"
#include "../libs/lygia/generative/worley.glsl"

void main() {
    vec2 st = v_texcoord;
    vec3 dir = equirect2xyz(st);

    float noiseSimplex = snoise(dir * 90.);

    float noiseWorley_c = worley(dir * 30.);
    vec2 texelSize = vec2(dFdx(st).x, dFdy(st).y);
    float noiseScale = 100.;
    float noiseWorley_px = worley(equirect2xyz(st + texelSize) * noiseScale);
    float noiseWorley_py = worley(equirect2xyz(st + texelSize) * noiseScale);
    float noiseWorley_nx = worley(equirect2xyz(st - texelSize) * noiseScale);
    float noiseWorley_ny = worley(equirect2xyz(st - texelSize) * noiseScale);

    // calculate slopes
    float dy = noiseWorley_nx - noiseWorley_px;
    float dx = noiseWorley_ny - noiseWorley_py;

    // normalize and clamp
    float nz = 1. / sqrt(dx * dx + dy * dy + 1.);
    float nx = min(max(-dx * nz, -1.), 1.);
    float ny = min(max(-dy * nz, -1.), 1.);
    vec3 normal = vec3(nx, ny, nz);

    outColor = vec4(normal * 0.5 + 0.5, 1.);
}