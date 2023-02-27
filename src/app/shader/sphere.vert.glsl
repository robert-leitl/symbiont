#version 300 es

uniform mat4 u_worldMatrix;
uniform mat4 u_worldInverseTransposeMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform sampler2D u_texture;
uniform float u_displacementStrength;
uniform vec3 u_pointerDir;

in vec3 position;
in vec3 normal;
in vec2 texcoord;
in vec3 tangent;

out vec3 v_position;
out vec2 v_texcoord;
out vec3 v_normal;
out vec3 v_tangent;
out vec3 v_surfaceToView;

#include "./distort.glsl"

void main() {
  // distort the vertex position
  vec3 pos = distort(u_texture, position, u_pointerDir, u_displacementStrength, u_time);

  vec4 worldPosition = u_worldMatrix * vec4(pos, 1.);
  gl_Position = u_projectionMatrix * u_viewMatrix * worldPosition;

  v_position = position;
  v_texcoord = texcoord;
  v_tangent = tangent;
  v_normal = normal;
  v_surfaceToView = u_cameraPos - worldPosition.xyz;
}