import { renderRich, renderInline } from '../js/richtext.js';
import { eq, ok } from './assert.js';

export default {
  'plain paragraph'() {
    eq(renderRich('Hello'), '<p>Hello</p>');
  },

  'html is escaped'() {
    eq(renderRich('<b>x</b> & y'), '<p>&lt;b&gt;x&lt;/b&gt; &amp; y</p>');
  },

  'paragraphs and line breaks'() {
    eq(renderRich('a\nb\n\nc'), '<p>a<br>b</p><p>c</p>');
  },

  'bold italic sup sub'() {
    eq(renderInline('**F** is *net* m^2^ v~0~'), '<strong>F</strong> is <em>net</em> m<sup>2</sup> v<sub>0</sub>');
  },

  'inline math renders with KaTeX'() {
    const html = renderInline('Use $F = ma$ here');
    ok(html.includes('class="katex"'), 'katex markup');
    ok(html.startsWith('Use '), 'text before math kept');
    ok(!html.includes('$'), 'delimiters removed');
  },

  'math is not touched by markdown rules'() {
    const html = renderInline('$a*b*c$');
    ok(!html.includes('<em>'), 'no italics inside math');
  },

  'display math'() {
    ok(renderRich('$$\\frac{1}{2}mv^2$$').includes('math-display'));
  },

  'escaped dollar stays literal'() {
    eq(renderInline('costs \\$5 and \\$6'), 'costs $5 and $6');
  },

  'unclosed dollar stays literal'() {
    eq(renderInline('only $5'), 'only $5');
  },

  'less-than inside math survives'() {
    ok(renderInline('$0 < \\theta < 90^\\circ$').includes('katex'));
  },

  'bad LaTeX does not throw'() {
    ok(renderInline('$\\frac{1}{$').includes('katex'));
  },

  'variables become chips'() {
    ok(renderInline('v = [[v0]] m/s').includes('<span class="var-chip"'));
  },

  'placeholders resolve in text and math'() {
    const resolve = (c) => (c.trim() === 'v' ? { latex: '-4.9', text: '−4.9' } : { error: 'nope' });
    eq(renderInline('v is [[v]]', {}, resolve), 'v is −4.9');
    ok(renderInline('$x = [[v]]$', {}, resolve).includes('4.9'));
    ok(renderInline('[[w]]', {}, resolve).includes('var-error'));
  },

  'images resolve from the library'() {
    const html = renderInline('![d](img:abc|200)', { abc: 'data:image/png;base64,AAA' });
    ok(html.includes('src="data:image/png;base64,AAA"'));
    ok(html.includes('width:200px'));
    ok(renderInline('![d](img:zzz)').includes('missing image'));
  },

  'lists'() {
    eq(renderRich('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
    eq(renderRich('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  },

  'table with header'() {
    eq(renderRich('| t | x |\n|---|---|\n| 1 | 2 |'), '<table class="q-table"><thead><tr><th>t</th><th>x</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
  },
};
