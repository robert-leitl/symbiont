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
uniform float sensorSize;
uniform float deltaTime;
uniform sampler2D tex;
uniform vec2 u_pointer;
uniform vec3 u_pointerDir;
uniform vec2 u_pointerVelocity;

#include "../libs/lygia/math/const.glsl"
#include "../libs/lygia/space/xyz2equirect.glsl"
#include "../libs/lygia/space/equirect2xyz.glsl"
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

float sense(vec2 position, float sensorAngle) {
    vec2 sensorDir = vec2(cos(sensorAngle), sin(sensorAngle));
    vec2 sensorCenter = position + sensorDir * sensorOffsetDist;
    vec2 size = vec2(textureSize(tex, 0));
    vec2 sensorUV = sensorCenter / size;
    vec4 s = textureLod(tex, sensorUV, sensorSize);
    return s.r;
}

float sense(vec3 position, vec3 direction) {
    vec3 sensorCenter = position + direction * sensorOffsetDist;
    sensorCenter = normalize(sensorCenter);
    vec2 size = vec2(textureSize(tex, 0));
    vec2 sensorUV = xyz2octahedron(sensorCenter);
    vec4 s = texture(tex, sensorUV);
    return s.r;
}

vec3 getAxis(vec3 pos, vec3 axis, float offset) {
    vec3 dir = cross(position, normalize(axis));
    return normalize(axis + dir * offset);
}

vec3 getDirection(vec3 pos, vec3 axis, float offset) {
    vec3 newAxis = getAxis(pos, axis, offset);
    return cross(position, newAxis) * 0.01;
}

void main() {
    uint width = uint(resolution.x);
    uint height = uint(resolution.y);
    uint random = hash(uint(position.y) * width + uint(position.x) + uint(gl_VertexID));
    vec3 direction = getDirection(position, axis, 0.);

    float weightForward = sense(position, direction);
    float weightLeft = sense(position, getDirection(position, axis, sensorAngleSpacing));
    float weightRight = sense(position, getDirection(position, axis, -sensorAngleSpacing));

    float randomSteerStrength = scaleToRange01(random);

    v_axis = normalize(axis);

    vec3 pointer = normalize(u_pointerDir);
    float dist = smoothstep(0.9, 1., max(0., dot(position, pointer)));
    float pointerTurnSpeed = turnSpeed; // * (1. - dist);

    // continue in same direction
    if (weightForward > weightLeft && weightForward > weightRight) {
        //
    } else if (weightForward < weightLeft && weightForward < weightRight) {
        v_axis = getAxis(position, axis, (randomSteerStrength - 0.5) * 2.0 * pointerTurnSpeed * deltaTime);
    } else if (weightRight > weightLeft) {
        v_axis = getAxis(position, axis, -randomSteerStrength * pointerTurnSpeed * deltaTime);
    } else if (weightLeft > weightRight) {
        v_axis = getAxis(position, axis, randomSteerStrength * pointerTurnSpeed * deltaTime);
    }

    // add pointer contribution
    vec3 toPointer = pointer - position;
    dist = smoothstep(0.4, 1., max(0., dot(position, pointer)));
    //toPointer = cross(position, toPointer) - toPointer * 3.; // tangential influence
    vec3 dir = cross(position, normalize(v_axis));
    dir = normalize(dir - toPointer) * dist * 1.2;
    //v_axis = normalize(v_axis + dir);
    float velocityFactor = length(u_pointerVelocity) * 0.3 + 0.7;
    vec2 pointerPos = u_pointer * 2. - 1.;
    float pointerPosFactor = 1. -  smoothstep(0.5, 1., length(pointerPos));
    v_axis = normalize(v_axis + dir * (1. - dist) * pointerPosFactor);

    // move agent
    vec3 newDirection = getDirection(position, v_axis, 0.);
    vec3 newPos = position + newDirection * moveSpeed * deltaTime;
    newPos = normalize(newPos);

    v_position = newPos;
    //v_position = position;

    //v_position = normalize(position);

    gl_Position = vec4(xyz2octahedron(v_position) * 2. - 1., 0., 1.);
    gl_PointSize = 1.0 * (2. * abs(gl_Position.y));
    gl_PointSize = 1.;
    v_color = vec4(vec3(trailWeight * deltaTime), 1.);
}