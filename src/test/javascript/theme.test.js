const fs = require('fs');
const path = require('path');
const { loadApp, APP_PATH } = require('./setup/loadApp');

const CSS_PATH = path.join(path.dirname(APP_PATH), 'style.css');
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

/** A localStorage stand-in. `throws` makes every call fail, like some private modes. */
function fakeStorage(initial, throws) {
  const items = Object.assign({}, initial);
  return {
    items,
    getItem(key) {
      if (throws) throw new Error('storage disabled');
      return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null;
    },
    setItem(key, value) {
      if (throws) throw new Error('storage disabled');
      items[key] = String(value);
    }
  };
}

function theme(document) {
  return document.documentElement.getAttribute('data-theme');
}

function toggle(document) {
  return document.getElementById('theme-toggle');
}

/** CSS rule blocks as { selector, body }, comments stripped. */
function cssRules(css) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  while ((match = re.exec(clean)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

function variableNames(body) {
  return (body.match(/--[\w-]+(?=\s*:)/g) || []).sort();
}

describe('AC-1: theme toggle button', () => {
  test('is a plain button inside the header', async () => {
    const { document } = await loadApp();
    const button = toggle(document);
    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(document.getElementById('app-header').contains(button)).toBe(true);
    expect(document.getElementById('range-form').contains(button)).toBe(false);
  });

  test('switches dark -> light -> dark on click', async () => {
    const { document } = await loadApp();
    expect(theme(document)).toBe('dark');
    toggle(document).click();
    expect(theme(document)).toBe('light');
    toggle(document).click();
    expect(theme(document)).toBe('dark');
  });

  test('the label names the theme you get next', async () => {
    const { document } = await loadApp();
    expect(toggle(document).textContent).toBe('Light theme');
    toggle(document).click();
    expect(toggle(document).textContent).toBe('Dark theme');
  });

  test('clicking does not reload any data', async () => {
    const { document, api } = await loadApp();
    const before = api.calls.length;
    toggle(document).click();
    expect(api.calls.length).toBe(before);
  });
});

describe('AC-2: data-theme and CSS variables', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const rules = cssRules(css);
  const light = rules.find((r) => r.selector.includes('[data-theme="light"]'));
  const dark = rules.find((r) => r.selector.includes('[data-theme="dark"]'));

  test('app.js contains no colour values', () => {
    const js = fs.readFileSync(APP_PATH, 'utf8');
    expect(js).not.toMatch(COLOUR);
  });

  test('style.css has a light and a dark theme block', () => {
    expect(light).toBeDefined();
    expect(dark).toBeDefined();
  });

  test('both theme blocks define exactly the same variables', () => {
    expect(variableNames(light.body).length).toBeGreaterThan(0);
    expect(variableNames(dark.body)).toEqual(variableNames(light.body));
  });

  test('colour values appear only inside the theme blocks', () => {
    const offenders = rules
      .filter((r) => r !== light && r !== dark && COLOUR.test(r.body))
      .map((r) => r.selector);
    expect(offenders).toEqual([]);
  });

  test('chart bars, labels and values take their colour from variables', () => {
    for (const selector of ['.chart-svg .bar', '.chart-svg .bar.warn', '.chart-svg .bar-label', '.chart-svg .bar-value']) {
      const rule = rules.find((r) => r.selector === selector);
      expect(rule).toBeDefined();
      expect(rule.body).toMatch(/fill:\s*var\(--[\w-]+\)/);
    }
  });

  test('chart elements carry no inline colour after a toggle', async () => {
    const { document } = await loadApp();
    toggle(document).click();
    const marks = document.querySelectorAll('#chart-on-time *, #chart-tickets *');
    expect(marks.length).toBeGreaterThan(0);
    for (const el of marks) {
      expect(el.hasAttribute('fill')).toBe(false);
      expect(el.hasAttribute('style')).toBe(false);
    }
  });
});

describe('AC-3: persisted in localStorage', () => {
  test('a click saves the choice', async () => {
    const storage = fakeStorage();
    const { document } = await loadApp({ storage });
    toggle(document).click();
    expect(storage.items['ops-theme']).toBe('light');
    toggle(document).click();
    expect(storage.items['ops-theme']).toBe('dark');
  });

  test('a saved light theme is restored on load', async () => {
    const { document } = await loadApp({ storage: fakeStorage({ 'ops-theme': 'light' }) });
    expect(theme(document)).toBe('light');
    expect(toggle(document).textContent).toBe('Dark theme');
  });

  test('uses the browser localStorage when no storage is passed', async () => {
    const { document } = await loadApp();
    toggle(document).click();
    expect(window.localStorage.getItem('ops-theme')).toBe('light');
  });

  test('still toggles when storage throws', async () => {
    const { document } = await loadApp({ storage: fakeStorage({}, true) });
    expect(theme(document)).toBe('dark');
    toggle(document).click();
    expect(theme(document)).toBe('light');
  });

  test('the theme is applied even when the API is down', async () => {
    const { document } = await loadApp({
      storage: fakeStorage({ 'ops-theme': 'light' }),
      failing: ['/api/health']
    });
    expect(theme(document)).toBe('light');
  });
});

describe('AC-4: dark by default, OS setting ignored', () => {
  afterEach(() => {
    delete window.matchMedia;
  });

  test('opens dark when nothing is stored', async () => {
    const { document } = await loadApp({ storage: fakeStorage() });
    expect(theme(document)).toBe('dark');
    expect(toggle(document).textContent).toBe('Light theme');
  });

  test('an unknown saved value falls back to dark', async () => {
    const { document } = await loadApp({ storage: fakeStorage({ 'ops-theme': 'purple' }) });
    expect(theme(document)).toBe('dark');
  });

  test('stays dark when the OS prefers light', async () => {
    window.matchMedia = jest.fn((query) => ({ matches: query.includes('light'), media: query }));
    const { document } = await loadApp({ storage: fakeStorage() });
    expect(theme(document)).toBe('dark');
    expect(window.matchMedia).not.toHaveBeenCalled();
  });

  test('style.css has no prefers-color-scheme rule', () => {
    expect(fs.readFileSync(CSS_PATH, 'utf8')).not.toMatch(/prefers-color-scheme/);
  });

  test('index.html starts dark before any script runs', () => {
    const html = fs.readFileSync(path.join(path.dirname(APP_PATH), 'index.html'), 'utf8');
    expect(html).toMatch(/<html[^>]*\sdata-theme="dark"/);
  });
});
