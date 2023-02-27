#version 300 es

precision highp float;

uniform mat4 u_worldMatrix;
uniform mat4 u_worldInverseTransposeMatrix;
uniform mat4 u_worldInverseMatrix;
uniform sampler2D u_texture;
uniform float u_time;
uniform vec3 u_pointerDir;
uniform float u_displacementStrength;
uniform sampler2D u_albedoRampTexture;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;
in vec3 v_tangent;
in vec3 v_surfaceToView;

#include "./distort.glsl"
#include "../libs/lygia/lighting/specular/blinnPhong.glsl"

void main() {
    vec2 uv = xyz2octahedron(normalize(v_position));
    vec3 pos = (u_worldMatrix * vec4(v_position, 0.)).xyz;
    vec3 L = normalize(vec3(1., 1., 1.));
    vec3 V = normalize(v_surfaceToView);
    vec3 P = distort(u_texture, v_position, u_pointerDir, u_displacementStrength, u_time);
    vec3 N = normalize(v_normal);
    vec3 T = normalize(v_tangent);
    vec3 B = cross(T, N);

    vec2 epsilon = vec2(0.05);
    vec3 t = distort(u_texture, v_position + T * epsilon.x, u_pointerDir, u_displacementStrength, u_time);
    vec3 b = distort(u_texture, v_position + B * epsilon.y, u_pointerDir, u_displacementStrength, u_time);
    float normalStrength = 0.8;
    N = N + normalize(cross(t - P, P - b)) * normalStrength;
    N = (u_worldInverseTransposeMatrix * vec4(normalize(N), 0.)).xyz;


    outColor = texture(u_texture, uv);
    float value = outColor.r;
    value = smoothstep(0.1, 1., value);
    
    // fresnel term
    float fresnel = 1. - max(0., dot(N, V));

    // albedo color
    vec3 albedo = texture(u_albedoRampTexture, vec2(1. - value, 0.)).rgb;
    // boost the vains on the edge (simulate subsurface scattering)
    albedo += (fresnel * fresnel * smoothstep(0.6, 1., value)) * 0.4 + fresnel * 0.1 * (1. - value);
    
    // specular
    float specular = specularBlinnPhong(L, N, V, 40.);

    // combined color
    vec3 color = albedo + specular * 0.1;

    outColor = vec4(color, 1.);
}