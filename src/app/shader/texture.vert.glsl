#version 300 es

in vec2 position;

out vec2 v_texcoord;

void main() {
    gl_Position = vec4(position, 0., 1.);
    v_texcoord = position * 0.5 + 0.5;
}