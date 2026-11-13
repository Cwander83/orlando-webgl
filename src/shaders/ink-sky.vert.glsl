varying vec3 vWorldDir;
varying vec2 vUv;

void main() {
  vUv = uv;
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
