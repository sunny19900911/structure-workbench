"""Small, bounded Excel formula interpreter. No eval, network or external links."""
import math
import re
from openpyxl.formula.tokenizer import Tokenizer


class FormulaError(ValueError):
    def __init__(self, message, code='#VALUE!', unsupported=False):
        super().__init__(message)
        self.code, self.unsupported = code, unsupported


class Reference(list):
    pass


def scalar(value):
    if isinstance(value, Reference):
        if len(value) != 1:
            raise FormulaError('此处需要单个单元格，暂不支持数组运算', unsupported=True)
        return value[0]
    return value


def number(value):
    value = scalar(value)
    if value is None or value == '':
        return 0
    try:
        n = float(value)
        if not math.isfinite(n):
            raise ValueError()
        return n
    except (ValueError, TypeError):
        raise FormulaError('值不能用于数值计算')


def parse(formula):
    if len(formula) > 8192:
        raise FormulaError('公式长度超过 8192', unsupported=True)
    try:
        tokens = [t for t in Tokenizer('=' + formula).items if t.type != 'WHITE-SPACE']
    except Exception:
        raise FormulaError('无法解析公式', unsupported=True)
    if len(tokens) > 512:
        raise FormulaError('公式超过 512 个标记', unsupported=True)
    pos = 0
    precedence = {'=':1, '<>':1, '<':1, '>':1, '<=':1, '>=':1, '&':2,
                  '+':3, '-':3, '*':4, '/':4, '^':5}

    def expression(minimum=0):
        nonlocal pos
        if pos >= len(tokens):
            raise FormulaError('公式缺少操作数', unsupported=True)
        token = tokens[pos]; pos += 1
        if token.type == 'OPERATOR-PREFIX' and token.value in ('+', '-'):
            node = ('unary', token.value, expression(6))
        elif token.type == 'PAREN' and token.subtype == 'OPEN':
            node = expression()
            close('PAREN')
        elif token.type == 'FUNC' and token.subtype == 'OPEN':
            name = token.value[:-1].upper()
            if name not in ('SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'IF'):
                raise FormulaError('暂不支持函数 ' + name, '#NAME?', True)
            args = []
            if pos < len(tokens) and tokens[pos].subtype != 'CLOSE':
                args.append(expression())
                while pos < len(tokens) and tokens[pos].type == 'SEP' and tokens[pos].subtype == 'ARG':
                    pos += 1; args.append(expression())
            close('FUNC')
            node = ('call', name, args)
        elif token.type == 'OPERAND':
            if token.subtype == 'NUMBER': node = ('literal', float(token.value))
            elif token.subtype == 'TEXT': node = ('literal', token.value[1:-1].replace('""', '"'))
            elif token.subtype == 'LOGICAL': node = ('literal', token.value.upper() == 'TRUE')
            elif token.subtype == 'ERROR': node = ('error', token.value)
            elif token.subtype == 'RANGE': node = ('reference', token.value)
            else: raise FormulaError('不支持的操作数', unsupported=True)
        else:
            raise FormulaError('暂不支持的公式语法：' + token.value, unsupported=True)
        while pos < len(tokens):
            token = tokens[pos]
            if token.type == 'OPERATOR-POSTFIX' and token.value == '%':
                pos += 1; node = ('percent', node); continue
            level = precedence.get(token.value, -1) if token.type == 'OPERATOR-INFIX' else -1
            if level < minimum: break
            pos += 1
            node = ('binary', token.value, node, expression(level + 1))
        return node

    def close(kind):
        nonlocal pos
        if pos >= len(tokens) or tokens[pos].type != kind or tokens[pos].subtype != 'CLOSE':
            raise FormulaError('公式括号不完整', unsupported=True)
        pos += 1

    try:
        result = expression()
    except RecursionError:
        raise FormulaError('公式嵌套过深', unsupported=True)
    if pos != len(tokens):
        raise FormulaError('暂不支持交集、联合或数组语法', unsupported=True)
    return result


def evaluate(node, resolve):
    kind = node[0]
    if kind == 'literal': return node[1]
    if kind == 'error': raise FormulaError(node[1], node[1])
    if kind == 'reference':
        values=resolve(node[1])
        for value in values:
            if isinstance(value,FormulaError): raise value
        return Reference(values)
    if kind == 'unary': return number(evaluate(node[2], resolve)) * (-1 if node[1] == '-' else 1)
    if kind == 'percent': return number(evaluate(node[1], resolve)) / 100
    if kind == 'binary':
        op = node[1]; a = scalar(evaluate(node[2], resolve)); b = scalar(evaluate(node[3], resolve))
        if op == '&':
            def text(v):
                if v is None: return ''
                if isinstance(v, bool): return 'TRUE' if v else 'FALSE'
                if isinstance(v, float) and v.is_integer(): return str(int(v))
                return str(v)
            return text(a) + text(b)
        if op in ('=', '<>', '<', '>', '<=', '>='):
            if a is None: a='' if isinstance(b,str) else False if isinstance(b,bool) else 0
            if b is None: b='' if isinstance(a,str) else False if isinstance(a,bool) else 0
            # Excel compares numbers before text before logical values; blanks are zero.
            def key(v):
                if v is None: v = 0
                if isinstance(v, bool): return (2, v)
                if isinstance(v, str): return (1, v.casefold())
                return (0, v)
            a, b = key(a), key(b)
            return {'=':a == b, '<>':a != b, '<':a < b, '>':a > b, '<=':a <= b, '>=':a >= b}[op]
        a, b = number(a), number(b)
        try:
            if op == '+': result = a + b
            elif op == '-': result = a - b
            elif op == '*': result = a * b
            elif op == '/': result = a / b
            else: result = a ** b
            if isinstance(result, complex) or not math.isfinite(result): raise OverflowError()
            return result
        except ZeroDivisionError: raise FormulaError('除数为零', '#DIV/0!')
        except (OverflowError, ValueError): raise FormulaError('数值超出计算范围', '#NUM!')
    name, args = node[1:]
    if name == 'IF':
        if len(args) not in (2, 3): raise FormulaError('IF 需要 2 或 3 个参数')
        condition = scalar(evaluate(args[0], resolve))
        if isinstance(condition, str):
            if condition.upper() not in ('TRUE', 'FALSE'): raise FormulaError('IF 条件不是逻辑值')
            condition = condition.upper() == 'TRUE'
        return evaluate(args[1], resolve) if condition else (evaluate(args[2], resolve) if len(args) == 3 else False)
    if not args: raise FormulaError(name + ' 至少需要一个参数')
    values = []
    for arg in args:
        if name == 'COUNT' and arg[0] == 'reference':
            referenced=resolve(arg[1])
            # Known Excel errors in a range are ignored by COUNT. Unsupported
            # formulas remain unknown, so COUNT must not claim a verified result.
            for value in referenced:
                if isinstance(value,FormulaError) and value.unsupported: raise value
            values.extend(v for v in referenced if isinstance(v,(int,float)) and not isinstance(v,bool))
            continue
        value = evaluate(arg, resolve)
        if isinstance(value, Reference):
            values.extend(v for v in value if isinstance(v, (int, float)) and not isinstance(v, bool))
        elif name == 'COUNT':
            try: values.append(number(value))
            except FormulaError: pass
        else: values.append(number(value))
    if name == 'SUM': return sum(values)
    if name == 'COUNT': return len(values)
    if name == 'MIN': return min(values, default=0)
    if name == 'MAX': return max(values, default=0)
    if not values: raise FormulaError('没有可求平均的数值', '#DIV/0!')
    return sum(values) / len(values)
