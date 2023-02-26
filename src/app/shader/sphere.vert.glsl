#version 300 es

uniform mat4 u_worldMatrix;
uniform mat4 u_worldInverseTransposeMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform sampler2D u_texture;
uniform float displacementStrength;
uniform vec3 u_pointerDir;

in vec3 position;
in vec3 normal;
in vec2 texcoord;
in vec3 tangent;

out vec3 v_position;
out vec2 v_texcoord;
out vec3 v_normal;
out vec3 v_tangent;

#include "./util/xyz2octahedron.glsl"

vec3 distort(vec3 position) {
  vec3 pos = position;
  vec2 st = xyz2octahedron(pos);
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
  // distort the vertex position
  vec3 pos = distort(position);

  // normal estimation
  /*vec2 texelSize = 1. / vec2(textureSize(u_texture, 0));
  float epsilon = texelSize.x * 2.;
  vec3 bitangent = cross(tangent, normal);
  vec3 t = distort(position + tangent * epsilon);
  vec3 b = distort(position + bitangent * epsilon);
  float normalStrength = 0.3;
  v_normal = normal + normalize(cross(t - pos, pos - b)) * normalStrength;*/

  vec4 worldPosition = u_worldMatrix * vec4(pos, 1.);
  gl_Position = u_projectionMatrix * u_viewMatrix * worldPosition;

  v_position = position;
  v_texcoord = texcoord;
  v_tangent = tangent; //(u_worldInverseTransposeMatrix * vec4(tangent, 0.)).xyz;
  v_normal = normal; //(u_worldInverseTransposeMatrix * vec4(normal, 0.)).xyz;
}