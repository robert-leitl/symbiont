#version 300 es

precision highp float;

uniform mat4 u_worldInverseTransposeMatrix;
uniform mat4 u_worldInverseMatrix;
uniform sampler2D u_texture;
uniform float u_time;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;
in vec3 v_tangent;

#include "../libs/lygia/space/xyz2equirect.glsl"
#include "./util/octahedron2xyz.glsl"
#include "./util/xyz2octahedron.glsl"

void main() {
    vec3 P = normalize(v_position);

    vec2 uv = xyz2octahedron(P);

    vec3 N = normalize(v_normal);
    vec3 T = normalize(v_tangent);
    vec3 B = normalize(cross(N, T));
    mat3 tangentSpace = mat3(T, B, N);

    outColor = texture(u_texture, uv);
    outColor.rgb = vec3(outColor.r) * (max(0., dot(N, vec3(0., 0., 1.))) * 0.7 + 0.3);
    outColor.a = outColor.r;
}