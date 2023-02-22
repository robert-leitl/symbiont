#version 300 es

uniform mat4 u_worldMatrix;
uniform mat4 u_worldInverseTransposeMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_time;
uniform vec3 u_cameraPos;

in vec3 position;
in vec3 normal;
in vec2 texcoord;
in vec3 tangent;

out vec3 v_position;
out vec2 v_texcoord;
out vec3 v_normal;
out vec3 v_tangent;


void main() {
  vec3 pos = position;

  vec4 worldPosition = u_worldMatrix * vec4(pos, 1.);
  gl_Position = u_projectionMatrix * u_viewMatrix * worldPosition;

  v_position = position;
  v_texcoord = texcoord;
  v_tangent = (u_worldInverseTransposeMatrix * vec4(tangent, 0.)).xyz;
  v_normal = (u_worldInverseTransposeMatrix * vec4(normal, 0.)).xyz;
}