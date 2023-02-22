#version 300 es

precision highp float;

in vec2 v_texcoord;

uniform float evaporateSpeed;
uniform float diffuseSpeed;
uniform float deltaTime;
uniform sampler2D tex;

out vec4 outColor;

void main() {
  vec4 originalValue = texture(tex, v_texcoord);

  // Simulate diffuse with a simple 3x3 blur
  vec4 sum;
  ivec2 size = textureSize(tex, 0);
  ivec2 samplePos = ivec2(v_texcoord * vec2(size));
  for (int offsetY = -1; offsetY <= 1; ++offsetY) {
    for (int offsetX = -1; offsetX <= 1; ++offsetX) {
      ivec2 sampleOff = ivec2(offsetX, offsetY);
      sum += texelFetch(tex, samplePos + sampleOff, 0);
    }
  }

  vec4 blurResult = sum / 9.0;

  vec4 diffusedValue = mix(originalValue, blurResult, diffuseSpeed * deltaTime);
  vec4 diffusedAndEvaporatedValue = max(vec4(0), diffusedValue - evaporateSpeed * deltaTime);

  outColor = vec4(diffusedAndEvaporatedValue.rgb, 1);
}