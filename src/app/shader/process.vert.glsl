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

#include "../libs/lygia/math/const.glsl"
#include "../libs/lygia/space/xyz2equirect.glsl"
#include "../libs/lygia/space/equirect2xyz.glsl"

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
    vec2 sensorUV = xyz2equirect(sensorCenter);
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

    // continue in same direction
    if (weightForward > weightLeft && weightForward > weightRight) {
        //
    } else if (weightForward < weightLeft && weightForward < weightRight) {
        v_axis = getAxis(position, axis, (randomSteerStrength - 0.5) * 2.0 * turnSpeed * deltaTime);
    } else if (weightRight > weightLeft) {
        v_axis = getAxis(position, axis, -randomSteerStrength * turnSpeed * deltaTime);
    } else if (weightLeft > weightRight) {
        v_axis = getAxis(position, axis, randomSteerStrength * turnSpeed * deltaTime);
    }

    // add pointer contribution
    vec3 pointer = equirect2xyz(u_pointer);
    float dist = max(0., dot(position, pointer)) * 0.2;
    vec3 toPointer = pointer - position;
    vec3 dir = cross(position, normalize(v_axis));
    dir = normalize(dir - toPointer) * dist;
    v_axis = normalize(v_axis + dir);

    // move agent
    vec3 newDirection = getDirection(position, v_axis, 0.);
    vec3 newPos = position + newDirection * moveSpeed * deltaTime;
    newPos = normalize(newPos);

    v_position = newPos;

    //v_position = normalize(position);

    gl_Position = vec4(xyz2equirect(v_position) * 2. - 1., 0., 1.);
    gl_PointSize = 1.0 * (2. * abs(gl_Position.y));
    v_color = vec4(vec3(trailWeight * deltaTime), 1);
}