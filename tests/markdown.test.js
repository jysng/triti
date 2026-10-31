// @ts-check
import { escapeHTML, renderMarkdown } from '../js/markdown.js';
import { describe, expect, it } from './harness.js';

/** Parse rendered HTML into an inert document for structural assertions. @param {string} html */
const parse = (html) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

describe('markdown', () => {
  it('escapes HTML', () => {
    expect(escapeHTML(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('renders the supported subset', () => {
    const html = renderMarkdown('# Title\n**bold** *it* ~~no~~ `code`\n\n- [x] done\n- [ ] todo\n\n1. one\n\n> quote\n\n---');
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>it</em>');
    expect(html).toContain('<del>no</del>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<input type="checkbox" disabled checked> done');
    expect(html).toContain('<ol><li>one</li></ol>');
    expect(html).toContain('<blockquote><p>quote</p></blockquote>');
    expect(html).toContain('<hr>');
  });

  it('turns hashtags into search links', () => {
    const a = parse(renderMarkdown('Felt good #Gratitude')).querySelector('a.tag');
    expect(a?.getAttribute('href')).toBe('#/search?q=%23gratitude');
  });

  const attacks = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](https://ok.example/"onmouseover="alert(1))',
    '`<svg onload=alert(1)>`',
    '```\n<iframe src=javascript:alert(1)>\n```',
    '**<b onclick=alert(1)>x</b>**',
    '\u0000<script>alert(1)</script>',
  ];
  for (const attack of attacks) {
    it(`neutralises ${JSON.stringify(attack).slice(0, 40)}`, () => {
      const body = parse(renderMarkdown(attack));
      expect(body.querySelectorAll('script,img,iframe,svg,object,embed,b').length).toBe(0);
      for (const el of body.querySelectorAll('*')) {
        for (const attr of el.attributes) {
          expect(attr.name).not.toMatch(/^on/i);
          if (attr.name === 'href') expect(attr.value).toMatch(/^(https?:|mailto:|#\/search)/i);
        }
      }
    });
  }

  it('only links http(s) and mailto', () => {
    const body = parse(renderMarkdown('[a](https://example.com) [b](mailto:me@example.com) [c](ftp://x)'));
    expect([...body.querySelectorAll('a')].map((a) => a.getAttribute('href')))
      .toEqual(['https://example.com', 'mailto:me@example.com']);
    expect(body.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
