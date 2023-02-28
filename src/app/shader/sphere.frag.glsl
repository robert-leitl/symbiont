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
uniform sampler2D u_envTexture;
uniform sampler2D u_noiseTexture;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;
in vec3 v_tangent;
in vec3 v_surfaceToView;

#include "./distort.glsl"
#include "../libs/lygia/lighting/specular/blinnPhong.glsl"
#include "../libs/lygia/space/xyz2equirect.glsl"
#include "../libs/lygia/generative/snoise.glsl"
#include "../libs/lygia/color/tonemap/linear.glsl"
#include "../libs/lygia/color/hueShift.glsl"
#include "../libs/lygia/color/desaturate.glsl"

void main() {
    vec3 positionNorm = normalize(v_position);
    vec3 normal = normalize(v_normal);

    // noise texture
    vec4 noiseTex = texture(u_noiseTexture, xyz2equirect(positionNorm));
    vec3 noiseNormal = noiseTex.xyz * 2. - 1.;

    vec2 uv = xyz2octahedron(positionNorm);
    vec3 pos = (u_worldMatrix * vec4(v_position, 0.)).xyz;
    vec3 L = normalize(vec3(1., 1., 1.));
    vec3 V = normalize(v_surfaceToView);
    vec3 P = distort(u_texture, v_position, u_pointerDir, u_displacementStrength, u_time);
    vec3 N = normal;
    vec3 T = normalize(v_tangent);
    vec3 B = cross(T, N);

    // get the value from the simulation
    outColor = texture(u_texture, uv);
    float value = outColor.r + noiseTex.a * 0.05;
    float rampValue = smoothstep(0.05, 1., value);

    // get the normal from the simulation
    vec2 epsilon = vec2(0.05);
    vec3 t = distort(u_texture, v_position + T * epsilon.x, u_pointerDir, u_displacementStrength, u_time);
    vec3 b = distort(u_texture, v_position + B * epsilon.y, u_pointerDir, u_displacementStrength, u_time);
    float normalStrength = 0.8;
    N = N + normalize(cross(t - P, P - b)) * normalStrength;

    // apply the noise normal to the already pertubed normal
    B = cross(T, N);
    T = cross(N, B);
    mat3 tangentSpace = mat3(T, B, N);
    N = normalize(N + tangentSpace * noiseNormal * rampValue * .1);

    N = (u_worldInverseTransposeMatrix * vec4(normalize(N), 0.)).xyz;
    vec3 R = reflect(V, N);
    
    // fresnel term
    float fresnel = 1. - max(0., dot(N, V));

    // get a flat fresnel to simulate subsurface scattering on the edges
    vec3 worldNormal = (u_worldInverseTransposeMatrix * vec4(normal, 0.)).xyz;
    float flatFresnel = 1. - max(0., dot(worldNormal, V));

    // albedo color
    vec3 albedo = texture(u_albedoRampTexture, vec2(1. - rampValue, 0.)).rgb;
    // boost the vains on the edge (simulate subsurface scattering)
    albedo += (flatFresnel * flatFresnel * smoothstep(0.3, 1., value)) * 0.9;
    albedo += flatFresnel * flatFresnel * .3 * (1. - value);
    
    // specular
    float specular = specularBlinnPhong(L, N, V, 300.);

    // environment reflection
    vec3 envReflection = texture(u_envTexture, xyz2equirect(R)).rgb;

    // combined color
    vec3 color = albedo * 0.95 + (envReflection * 0.3 + specular * 0.2) * rampValue;

    outColor = tonemapLinear(vec4(color, rampValue * 0.1 + 0.9));

    //outColor = noiseTex;
    //outColor.a = 1.;
    //outColor = vec4(N, 1.);
}