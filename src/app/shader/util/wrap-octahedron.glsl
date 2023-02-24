vec2 wrapOctahedron(vec2 uv) {
  vec2 st = abs(fract(uv * 0.5 - 0.5) * 2. - 1.);
  vec2 flip = sign(1. - abs(uv.xy * 2. - 1.));
  return (st * flip.yx);
}