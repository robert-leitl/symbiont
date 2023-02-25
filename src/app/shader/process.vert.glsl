#version 300 es
  
in vec3 position;
in vec3 axis;

out vec3 v_position;
out vec3 v_axis;
out vec4 v_color;

uniform vec2 resolution;
uniform float moveSpeed;
uniform float turnSpeed;
uniform float trailWeight;
uniform float sensorOffsetDist;
uniform float sensorAngleSpacing;
uniform float deltaTime;
uniform sampler2D tex;
uniform vec2 u_pointer;
uniform vec3 u_pointerDir;
uniform vec2 u_pointerVelocity;

#include "../libs/lygia/math/const.glsl"
#include "./util/octahedron2xyz.glsl"
#include "./util/xyz2octahedron.glsl"

uint hash(uint s) {
    s ^= 2747636419u;
    s *= 2654435769u;
    s ^= s >> 16;
    s *= 2654435769u;
    s ^= s >> 16;
    s *= 2654435769u;
    return s;
}

float scaleToRange01(uint v) {
    return float(v) / 4294967295.0;
}

float sense(vec3 position, vec3 direction) {
    vec3 sensorCenter = position + direction * sensorOffsetDist;
    sensorCenter = normalize(sensorCenter);
    vec2 size = vec2(textureSize(tex, 0));
    vec2 sensorUV = xyz2octahedron(sensorCenter);
    vec4 s = texture(tex, sensorUV);
    return s.r;
}

vec3 shiftAxis(vec3 axis, vec3 offset) {
    return normalize(axis + offset);
}

void main() {
    uint width = uint(resolution.x);
    uint height = uint(resolution.y);
    uint random = hash(uint(position.y) * width + uint(position.x) + uint(gl_VertexID));
    float directionScaleFactor = 0.01;
    v_axis = normalize(axis);

    // get the direction weights
    // forward
    vec3 directionForward = cross(position, v_axis);
    float weightForward = sense(position, directionForward * directionScaleFactor);
    // left
    vec3 axisLeft = shiftAxis(v_axis, directionForward * sensorAngleSpacing);
    vec3 directionLeft = cross(position, axisLeft);
    float weightLeft = sense(position, directionLeft * directionScaleFactor);
    // right
    vec3 axisRight = shiftAxis(v_axis, directionForward * -sensorAngleSpacing);
    vec3 directionRight = cross(position, axisRight);
    float weightRight = sense(position, directionRight * directionScaleFactor);

    float randomSteerStrength = scaleToRange01(random);

    // continue in same direction
    if (weightForward > weightLeft && weightForward > weightRight) {
        //
    } else if (weightForward < weightLeft && weightForward < weightRight) {
        v_axis = shiftAxis(v_axis, directionForward * (randomSteerStrength - 0.5) * 2.0 * turnSpeed * deltaTime);
    } else if (weightRight > weightLeft) {
        v_axis = shiftAxis(v_axis, directionForward * -randomSteerStrength * turnSpeed * deltaTime);
    } else if (weightLeft > weightRight) {
        v_axis = shiftAxis(v_axis, directionForward * randomSteerStrength * turnSpeed * deltaTime);
    }

    // get the new direction of the agent according to its sensoring
    vec3 newDirection = cross(position, v_axis);

    // add pointer contribution
    vec3 pointer = normalize(u_pointerDir);
    vec3 toPointer = pointer - position;
    // the contribution strength is stronger the nearer the direction of the pointer to the position of the agent
    float pointerContributionRadius = 0.5;
    float pointerContributionStrength = smoothstep(1. - pointerContributionRadius, 1., max(0., dot(position, pointer)));
    // offset the agent direction to the pointer
    newDirection = normalize(newDirection - toPointer);
    // prevent a contribution in the center and on the edge of the radius (parabel)
    newDirection *= (1. - pointerContributionStrength) * pointerContributionStrength;
    // only apply pointer contribution when within center
    vec2 pointerPos = u_pointer * 2. - 1.;
    float pointerPosFactor = 1. -  smoothstep(0.5, 1., length(pointerPos));
    newDirection *= pointerPosFactor;
    // shift the axis toward the pointer
    float attraction = 1.2;
    v_axis = shiftAxis(v_axis, newDirection * attraction);

    // move agent
    newDirection = cross(position, v_axis) * directionScaleFactor;
    vec3 newPos = position + newDirection * moveSpeed * deltaTime;
    newPos = normalize(newPos);
    v_position = newPos;

    // draw the agent on the octahedron map
    gl_Position = vec4(xyz2octahedron(v_position) * 2. - 1., 0., 1.);
    gl_PointSize = 1.;
    v_color = vec4(vec3(trailWeight * deltaTime), 1.);
}