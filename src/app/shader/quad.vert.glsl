
#version 300 es

layout(location = 0) in vec4 position;

out vec2 v_texcoord;

void main() {
    gl_Position = position;
    v_texcoord = position.xy * 0.5 + 0.5;
}