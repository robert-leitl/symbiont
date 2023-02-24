#version 300 es

precision highp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;

out vec4 outColor;

#include "../libs/lygia/filter/median/2D_fast5.glsl"
#include "../libs/lygia/filter/boxBlur/2D.glsl"
#include "../libs/lygia/filter/gaussianBlur/2D.glsl"
#include "../libs/lygia/filter/bilateralBlur/2D.glsl"

void main() {
    vec2 size = vec2(textureSize(u_texture, 0));
    //vec4 color = bilateralBlur2D(u_texture, v_texcoord, .5 / size, 10);
    vec4 color = gaussianBlur2D(u_texture, v_texcoord, 2. / size, 6);
    //vec4 color = boxBlur2D(u_texture, v_texcoord, 2. / size, 6);
    outColor = color;
}