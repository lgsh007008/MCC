// 受限表达式求值（design/包装设计.md §3.2）：
// 只支持数字、参数变量、四则运算、% 与 min/max/ceil/floor/round/abs；
// 禁止 eval / Function / 属性访问 / 字符串，避免模板变成任意代码执行入口。

type TokenType = 'number' | 'identifier' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  start: number;
}

type ExpressionNode =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'unary'; operator: '+' | '-'; operand: ExpressionNode }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/' | '%'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'call'; name: string; args: ExpressionNode[] };

const OPERATORS = new Set(['+', '-', '*', '/', '%']);

function fail(message: string, position: number): never {
  throw new Error(`表达式错误（位置 ${position}）：${message}`);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'lparen', value: char, start: index });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: char, start: index });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char, start: index });
      index += 1;
      continue;
    }
    if (OPERATORS.has(char)) {
      tokens.push({ type: 'operator', value: char, start: index });
      index += 1;
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[0-9.]/.test(source[index]!)) {
        index += 1;
      }
      const value = source.slice(start, index);
      if (!/^\d+(\.\d+)?$/.test(value)) {
        fail(`非法数字 ${value}`, start);
      }
      tokens.push({ type: 'number', value, start });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index]!)) {
        index += 1;
      }
      tokens.push({ type: 'identifier', value: source.slice(start, index), start });
      continue;
    }
    fail(`不支持的字符 ${char}`, index);
  }
  tokens.push({ type: 'eof', value: '', start: source.length });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): ExpressionNode {
    const node = this.expression();
    const token = this.peek();
    if (token.type !== 'eof') {
      fail(`多余的输入 ${token.value}`, token.start);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private consume(type: TokenType, value?: string): Token {
    const token = this.peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      fail(`期望 ${value ?? type}，实际为 ${token.value || '结束'}`, token.start);
    }
    this.index += 1;
    return token;
  }

  private expression(): ExpressionNode {
    let node = this.term();
    while (this.peek().type === 'operator' && ['+', '-'].includes(this.peek().value)) {
      const operator = this.consume('operator').value as '+' | '-';
      node = { kind: 'binary', operator, left: node, right: this.term() };
    }
    return node;
  }

  private term(): ExpressionNode {
    let node = this.factor();
    while (this.peek().type === 'operator' && ['*', '/', '%'].includes(this.peek().value)) {
      const operator = this.consume('operator').value as '*' | '/' | '%';
      node = { kind: 'binary', operator, left: node, right: this.factor() };
    }
    return node;
  }

  private factor(): ExpressionNode {
    const token = this.peek();
    if (token.type === 'operator' && ['+', '-'].includes(token.value)) {
      const operator = this.consume('operator').value as '+' | '-';
      return { kind: 'unary', operator, operand: this.factor() };
    }
    return this.primary();
  }

  private primary(): ExpressionNode {
    const token = this.peek();
    if (token.type === 'number') {
      this.consume('number');
      return { kind: 'number', value: Number(token.value) };
    }
    if (token.type === 'identifier') {
      this.consume('identifier');
      if (this.peek().type === 'lparen') {
        this.consume('lparen');
        const args: ExpressionNode[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.expression());
          while (this.peek().type === 'comma') {
            this.consume('comma');
            args.push(this.expression());
          }
        }
        this.consume('rparen');
        return { kind: 'call', name: token.value, args };
      }
      return { kind: 'variable', name: token.value };
    }
    if (token.type === 'lparen') {
      this.consume('lparen');
      const node = this.expression();
      this.consume('rparen');
      return node;
    }
    fail(`意外的输入 ${token.value || '结束'}`, token.start);
  }
}

const FUNCTIONS: Record<string, { arity: 'one' | 'many'; fn: (...args: number[]) => number }> = {
  min: { arity: 'many', fn: (...args) => Math.min(...args) },
  max: { arity: 'many', fn: (...args) => Math.max(...args) },
  ceil: { arity: 'one', fn: (value) => Math.ceil(value) },
  floor: { arity: 'one', fn: (value) => Math.floor(value) },
  round: { arity: 'one', fn: (value) => Math.round(value) },
  abs: { arity: 'one', fn: (value) => Math.abs(value) },
};

function evaluate(node: ExpressionNode, scope: Record<string, number>): number {
  if (node.kind === 'number') {
    return node.value;
  }
  if (node.kind === 'variable') {
    const value = scope[node.name];
    if (value === undefined) {
      throw new Error(`表达式引用了未定义参数 ${node.name}`);
    }
    return value;
  }
  if (node.kind === 'unary') {
    const value = evaluate(node.operand, scope);
    return node.operator === '-' ? -value : value;
  }
  if (node.kind === 'binary') {
    const left = evaluate(node.left, scope);
    const right = evaluate(node.right, scope);
    if (node.operator === '+') return left + right;
    if (node.operator === '-') return left - right;
    if (node.operator === '*') return left * right;
    if (node.operator === '%') {
      if (right === 0) throw new Error('表达式除零');
      return left % right;
    }
    if (right === 0) throw new Error('表达式除零');
    return left / right;
  }
  const fn = FUNCTIONS[node.name];
  if (!fn) {
    throw new Error(`不支持的函数 ${node.name}`);
  }
  if (fn.arity === 'one' && node.args.length !== 1) {
    throw new Error(`函数 ${node.name} 需要 1 个参数`);
  }
  if (fn.arity === 'many' && node.args.length === 0) {
    throw new Error(`函数 ${node.name} 至少需要 1 个参数`);
  }
  const value = fn.fn(...node.args.map((arg) => evaluate(arg, scope)));
  if (!Number.isFinite(value)) {
    throw new Error('表达式结果不是有限数字');
  }
  return value;
}

export function evaluateExpression(source: string, scope: Record<string, number>): number {
  if (!source.trim()) {
    throw new Error('表达式不能为空');
  }
  const ast = new Parser(tokenize(source)).parse();
  const value = evaluate(ast, scope);
  if (!Number.isFinite(value)) {
    throw new Error('表达式结果不是有限数字');
  }
  return value;
}
