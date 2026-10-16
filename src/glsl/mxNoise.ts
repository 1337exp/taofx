/**
 * Шум Перлина MaterialX на GLSL ES 3.00: построчный порт того, что делает `mx_noise_float` в TSL (three/src/nodes/materialx),
 * чтобы один граф давал одинаковую картинку в TSL и в GLSL. Хэш Дженкинса на целых, градиенты 2D и 3D, масштаб 0,6616 и 0,9820.
 * Целочисленные операции требуют WebGL2 (в three r186 и PIXI v8 он и так обязателен).
 */
export const MX_NOISE_GLSL = /* glsl */ `
float mx_negate_if(float v, bool b) { return b ? -v : v; }
uint mx_rotl32(uint x, int k) { return (x << uint(k)) | (x >> uint(32 - k)); }
uint mx_bjfinal(uint a, uint b, uint c) {
    c ^= b; c -= mx_rotl32(b, 14);
    a ^= c; a -= mx_rotl32(c, 11);
    b ^= a; b -= mx_rotl32(a, 25);
    c ^= b; c -= mx_rotl32(b, 16);
    a ^= c; a -= mx_rotl32(c, 4);
    b ^= a; b -= mx_rotl32(a, 14);
    c ^= b; c -= mx_rotl32(b, 24);
    return c;
}
uint mx_hash2(int x, int y) {
    uint a = 0xdeadbeefu + (2u << 2u) + 13u;
    uint b = a;
    uint c = a;
    a += uint(x);
    b += uint(y);
    return mx_bjfinal(a, b, c);
}
uint mx_hash3(int x, int y, int z) {
    uint a = 0xdeadbeefu + (3u << 2u) + 13u;
    uint b = a;
    uint c = a;
    a += uint(x);
    b += uint(y);
    c += uint(z);
    return mx_bjfinal(a, b, c);
}
float mx_fade(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float mx_grad2(uint hash, float x, float y) {
    uint h = hash & 7u;
    float u = h < 4u ? x : y;
    float v = 2.0 * (h < 4u ? y : x);
    return mx_negate_if(u, (h & 1u) != 0u) + mx_negate_if(v, (h & 2u) != 0u);
}
float mx_grad3(uint hash, float x, float y, float z) {
    uint h = hash & 15u;
    float u = h < 8u ? x : y;
    float v = h < 4u ? y : ((h == 12u || h == 14u) ? x : z);
    return mx_negate_if(u, (h & 1u) != 0u) + mx_negate_if(v, (h & 2u) != 0u);
}
float mx_bilerp(float v0, float v1, float v2, float v3, float s, float t) {
    float s1 = 1.0 - s;
    return (1.0 - t) * (v0 * s1 + v1 * s) + t * (v2 * s1 + v3 * s);
}
float mx_trilerp(float v0, float v1, float v2, float v3, float v4, float v5, float v6, float v7, float s, float t, float r) {
    float s1 = 1.0 - s;
    float t1 = 1.0 - t;
    float r1 = 1.0 - r;
    return r1 * (t1 * (v0 * s1 + v1 * s) + t * (v2 * s1 + v3 * s)) + r * (t1 * (v4 * s1 + v5 * s) + t * (v6 * s1 + v7 * s));
}
float mx_perlin2(vec2 p) {
    int X = int(floor(p.x));
    int Y = int(floor(p.y));
    float fx = p.x - float(X);
    float fy = p.y - float(Y);
    float u = mx_fade(fx);
    float v = mx_fade(fy);
    float result = mx_bilerp(
        mx_grad2(mx_hash2(X, Y), fx, fy),
        mx_grad2(mx_hash2(X + 1, Y), fx - 1.0, fy),
        mx_grad2(mx_hash2(X, Y + 1), fx, fy - 1.0),
        mx_grad2(mx_hash2(X + 1, Y + 1), fx - 1.0, fy - 1.0),
        u, v);
    return 0.6616 * result;
}
float mx_perlin3(vec3 p) {
    int X = int(floor(p.x));
    int Y = int(floor(p.y));
    int Z = int(floor(p.z));
    float fx = p.x - float(X);
    float fy = p.y - float(Y);
    float fz = p.z - float(Z);
    float u = mx_fade(fx);
    float v = mx_fade(fy);
    float w = mx_fade(fz);
    float result = mx_trilerp(
        mx_grad3(mx_hash3(X, Y, Z), fx, fy, fz),
        mx_grad3(mx_hash3(X + 1, Y, Z), fx - 1.0, fy, fz),
        mx_grad3(mx_hash3(X, Y + 1, Z), fx, fy - 1.0, fz),
        mx_grad3(mx_hash3(X + 1, Y + 1, Z), fx - 1.0, fy - 1.0, fz),
        mx_grad3(mx_hash3(X, Y, Z + 1), fx, fy, fz - 1.0),
        mx_grad3(mx_hash3(X + 1, Y, Z + 1), fx - 1.0, fy, fz - 1.0),
        mx_grad3(mx_hash3(X, Y + 1, Z + 1), fx, fy - 1.0, fz - 1.0),
        mx_grad3(mx_hash3(X + 1, Y + 1, Z + 1), fx - 1.0, fy - 1.0, fz - 1.0),
        u, v, w);
    return 0.9820 * result;
}
`;
