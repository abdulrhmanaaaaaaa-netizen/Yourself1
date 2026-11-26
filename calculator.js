const MAX_LENGTH = 120;
const MAX_TOKENS = 80;
const MAX_VALUE = 1e15;

export function evaluateExpression(input) {
  const source = String(input ?? '')
    .replace(/[×x]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/\s+/g, '');

  if (!source || source.length > MAX_LENGTH) throw new Error('صيغة العملية غير صالحة.');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+|[()+\-*/%])/g) || [];
  if (tokens.join('') !== source || tokens.length > MAX_TOKENS) throw new Error('صيغة العملية غير صالحة.');

  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const finite = value => {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) throw new Error('النتيجة خارج النطاق.');
    return value;
  };

  function primary() {
    if (peek() === '(') {
      take();
      const value = expression();
      if (take() !== ')') throw new Error('قوس غير مغلق.');
      return value;
    }
    const token = take();
    if (!token || !/^\d+(?:\.\d*)?$|^\.\d+$/.test(token)) throw new Error('أدخل رقمًا صالحًا.');
    return finite(Number(token));
  }

  function postfix() {
    let value = primary();
    while (peek() === '%') {
      take();
      value = finite(value / 100);
    }
    return value;
  }

  function unary() {
    if (peek() === '+') { take(); return unary(); }
    if (peek() === '-') { take(); return finite(-unary()); }
    return postfix();
  }

  function product() {
    let value = unary();
    while (peek() === '*' || peek() === '/') {
      const op = take();
      const right = unary();
      if (op === '/' && right === 0) throw new Error('لا يمكن القسمة على صفر.');
      value = finite(op === '*' ? value * right : value / right);
    }
    return value;
  }

  function expression() {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const op = take();
      const right = product();
      value = finite(op === '+' ? value + right : value - right);
    }
    return value;
  }

  const result = expression();
  if (index !== tokens.length) throw new Error('صيغة العملية غير مكتملة.');
  const rounded = Number(result.toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}
