#version 300 es

precision highp float;

uniform sampler2D tex;

in vec2 v_texcoord;

out vec4 outputColor;

void main () {
    vec4 inputColor = texture(tex, v_texcoord);
    outputColor = inputColor;
}