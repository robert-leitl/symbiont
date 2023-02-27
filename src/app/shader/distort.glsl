#include "./util/wrap-octahedron.glsl"
#include "./util/xyz2octahedron.glsl"

vec3 distort(
    sampler2D tex, 
    vec3 position, 
    vec3 pointerDir,
    float displacementStrength,
    float time
) {
  vec3 pos = position;
  vec2 st = wrapOctahedron(xyz2octahedron(pos));
  vec4 map = texture(tex, st);

  // increase the displacement near the pointer
  float pointerOffset = max(0., dot(pos, normalize(pointerDir)));
  float pointerIntensity = smoothstep(0.5, 1., pointerOffset);
  pos *= pow(pointerOffset, 4.) * 7. * displacementStrength + 1.;

  // apply the vertex displacement
  float h = map.r;
  h = smoothstep(0.1, 1.5, h);
  float displacement = 1. + h * (displacementStrength + 0.05 + pointerIntensity * 2. * displacementStrength);
  pos *= displacement;

  // apply wobble displacement
  float wobbleStrength = 0.04;
  pos.x *= sin(time * 0.0005 + pos.x) * wobbleStrength + (1. - wobbleStrength);
  pos.y *= cos(time * 0.0009 + pos.y) * wobbleStrength + (1. - wobbleStrength);

  return pos;
}