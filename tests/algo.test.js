import { parseExpression, parseProgram, parseFormat } from '../js/algo/parse.js';
import { run, compile, resolvePlaceholder, resolvePlainText, instantiate, algorithmProblems } from '../js/algo/engine.js';
import { formatNumber, sigFigs } from '../js/algo/values.js';
import { makeRng } from '../js/algo/rng.js';
import { rationalize } from '../js/algo/functions.js';
import { newQuestion } from '../js/model.js';
import { eq, ok, throws } from './assert.js';

// Evaluate a single expression.
function ev(expr, seed = 's') {
  const r = run(`x = ${expr}`, { seed });
  if (r.error) throw new Error(r.error.message);
  return r.values.get('x');
}
function evError(expr) {
  const r = run(`x = ${expr}`);
  ok(r.error, `expected an error for ${expr}`);
  return r.error.message;
}
const near = (a, b, msg) => ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);
const latex = (expr, fmt) => {
  const r = run(`x = ${expr}${fmt ? ` :: ${fmt}` : ''}`);
  return resolvePlaceholder(r, 'x');
};

export default {
  // ---- parsing and operators
  'arithmetic and precedence'() {
    eq(ev('2 + 3 * 4'), 14);
    eq(ev('(2 + 3) * 4'), 20);
    eq(ev('2 ^ 3 ^ 2'), 512);
    eq(ev('-2 ^ 2'), -4);
    eq(ev('10 \\ 3'), 3);
    eq(ev('-34 MOD 6'), -4);
    eq(ev('17 % 5'), 2);
    eq(ev('5!'), 120);
    eq(ev('0.1 + 0.2'), 0.3);
  },
  'comparisons and logic'() {
    eq(ev('3 < 4 & 4 <= 4'), 1);
    eq(ev('3 = 4 | 2 <> 2'), 0);
    eq(ev('NOT 3 = 4'), 1);
    eq(ev('true AND no'), 0);
    eq(ev('1 XOR 0'), 1);
    eq(ev('"abc" = "abc"'), 1);
  },
  'implicit multiplication is an error'() {
    throws(() => parseExpression('3x'), /3\*x/);
  },
  'strings concatenate but do not mix with numbers'() {
    eq(ev('"Mrs. " + "Lee"'), 'Mrs. Lee');
    ok(/needs numbers/.test(evError('"Mrs. " + 8')));
  },
  'division by zero is reported'() {
    ok(/Division by zero/.test(evError('1/0')));
  },
  'constants'() {
    near(ev('pi'), Math.PI);
    near(ev('e'), Math.E);
    eq(ev('yes + true'), 2);
  },

  // ---- programs
  'definitions can be in any order'() {
    const r = run('KE = 0.5*m*v^2\nm = 2\nv = 5');
    eq(r.error, null);
    eq(r.values.get('KE'), 25);
  },
  'circular definitions are reported'() {
    const r = run('a = b + 1\nb = a + 1');
    ok(/Circular/.test(r.error.message));
  },
  'undefined names are reported with a line'() {
    const r = run('a = 1\nb = c * 2');
    eq(r.error.line, 2);
    ok(/“c” isn’t defined/.test(r.error.message));
  },
  'duplicate definitions are reported'() {
    ok(compile('a = 1\na = 2').errors.length === 1);
  },
  'comments and blank lines are ignored'() {
    const r = run('# setup\n\nm = 3 # kg\n');
    eq(r.values.get('m'), 3);
  },
  'user functions'() {
    const r = run('sq(x) = x*x\nhyp(a, b) = sqrt(sq(a) + sq(b))\nc = hyp(3, 4)');
    eq(r.values.get('c'), 5);
  },
  'user functions can use variables'() {
    eq(run('k = 3\nf(x) = k*x\ny = f(2)').values.get('y'), 6);
  },
  'built-in names cannot be redefined'() {
    ok(compile('sin = 3').errors.length === 1);
  },
  'conditions redraw values until true'() {
    const r = run('a = rand(10)\nb = rand(10)\ncondition: a > b', { seed: 'cond' });
    eq(r.error, null);
    ok(r.values.get('a') > r.values.get('b'));
  },
  'impossible conditions give up with a message'() {
    const r = run('a = rand(3)\ncondition: a > 5');
    ok(/never true/.test(r.error.message));
  },
  'isunique condition gives distinct choices'() {
    const r = run('a = rand(4)\nb = rand(4)\nc = rand(4)\ncondition: isunique(a, b, c)', { seed: 'u' });
    eq(new Set([r.values.get('a'), r.values.get('b'), r.values.get('c')]).size, 3);
  },
  'unique directive is recorded'() {
    eq(compile('m = rand(5)\nunique: m').unique, ['m']);
    ok(compile('unique: zz').errors.length === 1);
  },

  // ---- reproducibility
  'same seed gives same values'() {
    const src = 'a = range(1, 100)\nb = range(0, 1, 0.01)';
    const r1 = run(src, { seed: 'test|B|q1' });
    const r2 = run(src, { seed: 'test|B|q1' });
    eq([...r1.values], [...r2.values]);
  },
  'different seeds usually differ'() {
    const src = 'a = range(1, 1000000)';
    const values = new Set(['A', 'B', 'C', 'D', 'E'].map((v) => run(src, { seed: `t|${v}` }).values.get('a')));
    ok(values.size >= 4);
  },
  'rng is uniform enough'() {
    const rng = makeRng('dist');
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[rng.int(0, 3)]++;
    ok(counts.every((c) => c > 850 && c < 1150), JSON.stringify(counts));
  },

  // ---- random functions
  'rand stays in range'() {
    for (let i = 0; i < 50; i++) {
      const v = ev('rand(6)', `r${i}`);
      ok(v >= 1 && v <= 6 && Number.isInteger(v));
    }
  },
  'range with a step'() {
    for (let i = 0; i < 50; i++) {
      const v = ev('range(2, 10, 0.5)', `s${i}`);
      ok(v >= 2 && v <= 10 && Number.isInteger(v * 2), String(v));
    }
  },
  'range default step follows the bounds'() {
    for (let i = 0; i < 30; i++) {
      ok(Number.isInteger(ev('range(1, 10)', `i${i}`)));
      const v = ev('range(1.5, 3.5)', `d${i}`);
      ok(Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, String(v));
    }
  },
  'range across zero with a step never gives 0'() {
    for (let i = 0; i < 80; i++) ok(ev('range(-2, 2, 1)', `z${i}`) !== 0);
  },
  'prime'() {
    for (let i = 0; i < 20; i++) ok([11, 13, 17, 19].includes(ev('prime(10, 20)', `p${i}`)));
  },

  // ---- math and trig
  'math functions'() {
    eq(ev('abs(-3)'), 3);
    eq(ev('int(-3.7)'), -3);
    eq(ev('floor(-3.2)'), -4);
    eq(ev('frac(3.25)'), 0.25);
    eq(ev('round(3.14159265, 4)'), 3.1416);
    eq(ev('round(1492.14, 100)'), 1500);
    eq(ev('round(1492.14, 10)'), 1490);
    eq(ev('sqr(16)'), 4);
    eq(ev('logb(8, 2)'), 3);
    eq(ev('max(3, 9, 4)'), 9);
  },
  'trig in radians and degrees'() {
    near(ev('sin(pi/6)'), 0.5);
    eq(ev('sind(30)'), 0.5);
    eq(ev('cosd(60)'), 0.5);
    near(ev('asind(0.5)'), 30);
    near(ev('deg(pi)'), 180);
    near(ev('atan2d(1, 1)'), 45);
  },
  'domain errors are explained'() {
    ok(/out of range/.test(evError('sqrt(-1)')));
    ok(/out of range/.test(evError('asin(2)')));
  },

  // ---- lists and statistics
  'lists and choose'() {
    eq(ev('choose(3, 1, 14, 3.2, 6, 9)'), 3.2);
    eq(run('l = list(1, 14, 3.2, 6, 9)\nx = choose(5, l)').values.get('x'), 9);
    eq(ev('choose(7, 10, 20, 30)'), 10);
    eq(run('f = list("apple", "pear")\nx = choose(2, f)').values.get('x'), 'pear');
  },
  'statistics'() {
    const l = 'list(30, 25, 19, 26, 31, 29, 23)';
    eq(ev(`quartile(${l}, 0)`), 19);
    eq(ev(`quartile(${l}, 1)`), 23);
    eq(ev(`quartile(${l}, 2)`), 26);
    eq(ev(`quartile(${l}, 3)`), 30);
    eq(ev(`quartile(${l}, 4)`), 31);
    eq(ev('mean(list(2, 4, 9))'), 5);
    eq(ev('median(list(4, 1, 3, 2))'), 2.5);
    eq(ev('mode(list(1, 2, 2, 3))'), 2);
    eq(ev('mode(list(1, 1, 2, 2))'), 0);
    eq(ev('sdev(list(2, 4, 4, 4, 5, 5, 7, 9))'), 2);
    eq(ev('sum(list(1, 2, 3.5))'), 6.5);
    eq(ev('comb(5, 2)'), 10);
    eq(ev('perm(5, 2)'), 20);
    eq(ev('sort(true, 1, 14, 3.2)'), [1, 3.2, 14]);
    eq(run('d = list(12, -3, 5)\nx = sort(false, d)').values.get('x'), [12, 5, -3]);
  },
  'makelist honours its summary'() {
    const r = run('d = makelist(9, 10, -1, 20, -1, 30, true)', { seed: 'ml' });
    const d = r.values.get('d');
    eq(d.length, 9);
    eq(d[0], 10);
    eq(d[8], 30);
    eq(d[4], 20);
    ok(d.every((x, i) => i === 0 || x >= d[i - 1]));
  },
  'number theory'() {
    eq(ev('gcf(24, 36)'), 12);
    eq(ev('lcd(4, 6)'), 12);
    eq(ev('isprime(97)'), 1);
    eq(ev('isrelprime(8, 15)'), 1);
  },

  // ---- strings
  'string functions'() {
    eq(ev('left("ExamView", 3)'), 'Exa');
    eq(ev('right("ExamView", 3)'), 'iew');
    eq(ev('mid("ExamView", 2, 4)'), 'xamV');
    eq(ev('instr("velocity", "city")'), 5);
    eq(ev('ucase("abc") + lcase("DEF")'), 'ABCdef');
    eq(ev('trim("  hi  ")'), 'hi');
    eq(ev('strdup("(2)", 3)'), '(2)(2)(2)');
    eq(ev('val("-4")'), -4);
    eq(ev('str(18)'), '18');
    eq(ev('format("$%1.2f", 13.4)'), '$13.40');
    eq(ev('format("%d feet", 17)'), '17 feet');
    eq(ev('if(3 > 2, "yes", "no")'), 'yes');
    eq(ev('sigfig(12362, 3, false)'), '12400');
    eq(ev('sigfig(2.14, 5, true)'), '2.1400');
  },
  'if only evaluates the chosen branch'() {
    eq(ev('if(1, 5, 1/0)'), 5);
  },

  // ---- display-only functions
  'fractions'() {
    eq(latex('fracs(22, 6)').latex, '\\frac{11}{3}');
    eq(latex('fracs(22, 11)').latex, '2');
    eq(latex('fracs(-3, 6)').latex, '-\\frac{1}{2}');
    eq(latex('mixfracs(22, 6)').latex, '3\\frac{2}{3}');
    eq(latex('mixfracs(2, 6)').latex, '\\frac{1}{3}');
    eq(latex('rfracs(22, 11)').latex, '\\frac{2}{1}');
    eq(rationalize(0.125), [1, 8]);
  },
  'repeating decimals and radicals'() {
    eq(latex('decs(18.333333333333)').latex, '18.\\overline{3}');
    eq(latex('decs(0.0142857142857)').latex, '0.0\\overline{142857}');
    eq(latex('decs(4.25)').latex, '4.25');
    eq(latex('sqrs(18)').latex, '3\\sqrt{2}');
    eq(latex('sqrs(16)').latex, '4');
    eq(latex('sqrs(-8)').latex, '2i\\sqrt{2}');
    eq(latex('sciens(143948.123)').latex, '1.44 \\times 10^{5}');
  },
  'display values cannot be used in arithmetic'() {
    const r = run('f = fracs(1, 2)\ng = f + 1');
    ok(/Display-only/.test(r.error.message));
  },

  // ---- formats
  'format specs parse'() {
    eq(parseFormat('sig 3'), { kind: 'sig', digits: 3 });
    eq(parseFormat('coef1'), { kind: 'coef1' });
    throws(() => parseFormat('dp'), /needs a number/);
    throws(() => parseFormat('bogus 2'), /Unknown format/);
  },
  'number formats'() {
    eq(formatNumber(13831.386, { kind: 'dp', digits: 2 }).text, '13831.39');
    eq(formatNumber(13831.386, { kind: 'dp', digits: 5 }).text, '13831.386');
    eq(formatNumber(13831.386, { kind: 'fixed', digits: 5 }).text, '13831.38600');
    eq(formatNumber(13831.386, { kind: 'comma', digits: 2 }).text, '13,831.39');
    eq(formatNumber(13831.386, { kind: 'comma', digits: 2 }).latex, '13{,}831.39');
    eq(formatNumber(123492883, { kind: 'sci', digits: 3 }).latex, '1.235 \\times 10^{8}');
    eq(formatNumber(2.1, { kind: 'sig', digits: 3 }).text, '2.10');
    eq(formatNumber(0.000123456, { kind: 'sig', digits: 2 }).text, '0.00012');
    eq(formatNumber(-4.9).text, '−4.9');
    eq(formatNumber(-4.9).latex, '-4.9');
    eq(formatNumber(6.02e23).text, null);
    eq(sigFigs(12362, 3), '12400');
  },
  'coefficient formats'() {
    eq(formatNumber(3, { kind: 'coef' }).latex, '+3');
    eq(formatNumber(-3, { kind: 'coef' }).latex, '-3');
    eq(formatNumber(1, { kind: 'coef' }).latex, '+');
    eq(formatNumber(1, { kind: 'coef1' }).latex, '');
    eq(formatNumber(-1, { kind: 'coef1' }).latex, '-');
    eq(formatNumber(3, { kind: 'coef1' }).latex, '3');
  },

  // ---- placeholders
  'placeholders use the variable format'() {
    const r = run('KE = 0.5*2.0*3.3^2 :: sig 3');
    eq(resolvePlaceholder(r, 'KE').text, '10.9');
    eq(resolvePlaceholder(r, 'KE :: dp 3').text, '10.89');
  },
  'inline expressions'() {
    const r = run('m = 2\nv = 5');
    eq(resolvePlaceholder(r, '= 0.5*m*v^2').text, '25');
    eq(resolvePlaceholder(r, '= m/3 :: fixed 2').text, '0.67');
    ok(resolvePlaceholder(r, '= q*2').error);
    ok(resolvePlaceholder(r, 'nope').error);
  },
  'plain text substitution for answers'() {
    const r = run('v = -4.9');
    eq(resolvePlainText(r, '[[v]]'), '-4.9');
    eq(resolvePlainText(r, '[[= v*2]] m/s'), '-9.8 m/s');
  },
  'testversion'() {
    const r = run('t = testversion', { version: 'C' });
    eq(r.values.get('t'), 'C');
  },

  // ---- questions
  'question instances and problems'() {
    const q = newQuestion('num');
    q.algorithm = 'm = range(1, 4)\nv = range(2, 6)';
    q.stem = 'A [[m]] kg cart at [[v]] m/s. KE?';
    q.answer.value = '[[= 0.5*m*v^2]]';
    const inst = instantiate(q, { seed: 'q|A' });
    const { m, v } = Object.fromEntries(inst.run.values);
    eq(Number(inst.plain(q.answer.value)), 0.5 * m * v * v);
    eq(algorithmProblems(q, inst), []);
    q.stem += ' [[w]]';
    ok(algorithmProblems(q, instantiate(q, { seed: 'q|A' })).some((p) => /“w” isn’t defined/.test(p)));
  },
  'program parse errors keep going'() {
    const { errors, defs } = parseProgram('a = 1\nb = = 2\nc = 3');
    eq(errors.length, 1);
    eq(errors[0].line, 2);
    eq(defs.length, 2);
  },
};
