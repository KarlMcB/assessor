export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\nexpected ${e}\n     got ${a}`);
}

export function ok(value, msg = 'expected truthy') {
  if (!value) throw new Error(msg);
}

export function throws(fn, pattern) {
  try {
    fn();
  } catch (err) {
    if (pattern && !pattern.test(err.message)) throw new Error(`threw "${err.message}", expected ${pattern}`);
    return;
  }
  throw new Error('expected an error');
}
