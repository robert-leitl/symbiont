#version 300 es

uniform mat4 u_worldMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

in vec3 position;
in vec3 normal;
in vec2 texcoord;
in vec3 tangent;

out vec3 v_position;
out vec3 v_normal;

void main() {
  vec3 pos = position;
  vec4 worldPosition = u_worldMatrix * vec4(pos, 1.);
  gl_Position = u_projectionMatrix * u_viewMatrix * worldPosition;

  v_position = pos;
  v_normal = (u_worldMatrix * vec4(normal, 0.)).xyz;
}