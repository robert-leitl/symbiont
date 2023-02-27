#version 300 es

precision highp float;

uniform sampler2D u_texture;

in vec3 v_position;
in vec3 v_normal;

out vec4 outColor;

#include "./util/xyz2octahedron.glsl"

void main() {
    float attenuation = dot(vec3(0., 0., -1.), v_normal);
    vec2 uv = xyz2octahedron(normalize(v_position));
    outColor = mix(vec4(0.5, 0.5, 0.8, 1.) * 1.2, vec4(1.), 1. - texture(u_texture, uv) * attenuation);
}