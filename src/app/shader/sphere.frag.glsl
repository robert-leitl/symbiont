#version 300 es

precision highp float;

uniform mat4 u_worldInverseTransposeMatrix;
uniform mat4 u_worldInverseMatrix;
uniform sampler2D u_texture;
uniform float u_time;
uniform vec3 u_pointerDir;
uniform float displacementStrength;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;
in vec3 v_tangent;

#include "./util/wrap-octahedron.glsl"
#include "./util/xyz2octahedron.glsl"

vec3 distort(vec3 position) {
  vec3 pos = position;
  vec2 st = wrapOctahedron(xyz2octahedron(pos));
  vec4 map = texture(u_texture, st);

  // increase the displacement near the pointer
  float pointerIntensity = smoothstep(0.5, 1., max(0., dot(pos, u_pointerDir)));

  // apply the vertex displacement
  float h = map.r;
  h = smoothstep(0.1, 1.5, h);
  float displacement = (1. - displacementStrength) + h * (displacementStrength + pointerIntensity * 0.05);
  pos *= displacement;

  return pos;
}

void main() {
    vec3 P = (v_position);
    vec2 uv = xyz2octahedron(P);

    vec3 tangent = normalize(v_tangent);
    vec2 texelSize = 1. / vec2(textureSize(u_texture, 0));
    float epsilon = 0.04;
    vec3 bitangent = cross(tangent, v_normal);
    vec3 t = distort(P + tangent * epsilon);
    vec3 b = distort(P + bitangent * epsilon);
    float normalStrength = 0.5;
    vec3 pos = distort(P);
    vec3 normal = normalize(v_normal) + normalize(cross(t - pos, pos - b)) * normalStrength;

    vec3 N = normalize(v_tangent);
    vec3 T = normalize(v_tangent);
    vec3 B = normalize(cross(N, T));
    mat3 tangentSpace = mat3(T, B, N);

    outColor = texture(u_texture, uv);
    float value = outColor.r;
    value = smoothstep(0.1, 1., value);
    outColor.rgb = vec3(value) * (max(0., dot(N, vec3(0., 0., 1.))) * 0.9 + 0.1);
    outColor.rgb = outColor.rgb * 0.9 + .1;
    outColor.a = outColor.r * 0.6;

    outColor = vec4(normal, 1.);
}