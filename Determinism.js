// Simulation arithmetic shared by browsers and Node; no engine-specific roots.
const Determinism = (() => {
  const distances = new Map();

  function random(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid seed');
    return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
  }

  function distance(x, y) {
    const a = Math.min(Math.abs(x), Math.abs(y));
    const b = Math.max(Math.abs(x), Math.abs(y));
    const key = `${a},${b}`;
    if (distances.has(key)) return distances.get(key);
    const squared = (a * a + b * b) * 1000000;
    if (!Number.isSafeInteger(squared)) throw new RangeError('Distance exceeds integer precision');
    let low = 0;
    let high = 1;
    while (high * high <= squared) high *= 2;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (middle * middle <= squared) low = middle;
      else high = middle;
    }
    // For integer n: sqrt(n) >= k + 1/2 exactly when n - k*k > k.
    const result = low + (squared - low * low > low ? 1 : 0);
    distances.set(key, result);
    return result;
  }

  // Two independent 32-bit accumulators: error detection, not authentication.
  function checksum(value) {
    const input = JSON.stringify(value);
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < input.length; index++) {
      const code = input.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619) >>> 0;
      second = Math.imul(second ^ code, 2246822519) >>> 0;
    }
    return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
  }
  return Object.freeze({ random, distance, checksum });
})();
if (typeof module !== 'undefined') module.exports = Determinism;
