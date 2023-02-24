#version 300 es

precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
    outColor = v_color;
    outColor.a = 0.01;
    outColor = vec4(1.);
}