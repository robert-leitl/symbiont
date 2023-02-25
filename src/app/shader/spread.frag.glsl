#version 300 es

precision highp float;

in vec2 v_texcoord;

uniform float evaporateSpeed;
uniform float diffuseSpeed;
uniform float deltaTime;
uniform sampler2D tex;

out vec4 outColor;

#include "./util/wrap-octahedron.glsl"

#ifndef BOXBLUR2D_FAST9_SAMPLER_FNC
#define BOXBLUR2D_FAST9_SAMPLER_FNC(TEX, UV) texture(TEX, wrapOctahedron(UV))
#endif

#include "../libs/lygia/filter/boxBlur/2D_fast9.glsl"

void main() {
  vec2 resolution = vec2(textureSize(tex, 0));
  vec2 texelSize = 1. / resolution;

  // apply simple 3x3 box blur
  vec4 blurResult = boxBlur2D_fast9(tex, v_texcoord, texelSize);

  // combine diffused value and evaporate
  vec4 originalValue = texture(tex, v_texcoord);
  vec4 diffusedValue = mix(originalValue, blurResult, diffuseSpeed * deltaTime);
  vec4 diffusedAndEvaporatedValue = max(vec4(0), diffusedValue - evaporateSpeed * deltaTime);

  outColor = vec4(diffusedAndEvaporatedValue.rgb, 1.);
}