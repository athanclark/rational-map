import Fraction from "fraction.js";

/** Immutable Q with explicit arithmetic and canonical n/d interchange. */
export class Rational {
  readonly #value: Fraction;

  private constructor(value: Fraction) {
    this.#value = Object.freeze(value);
    Object.freeze(this);
  }

  static from(numerator: bigint, denominator: bigint = 1n): Rational {
    if (typeof numerator !== "bigint" || typeof denominator !== "bigint") {
      throw new TypeError("Rational components must be bigint");
    }
    if (denominator === 0n) throw new RangeError("Zero denominator");
    return new Rational(new Fraction(numerator, denominator));
  }

  static parse(text: string): Rational {
    if (typeof text !== "string" || /^[+-]?\d+(?:\/[+-]?\d+)?$/.exec(text)?.[0] !== text) {
      throw new SyntaxError("Expected an integer or integer fraction");
    }
    const [n, d = "1"] = text.split("/");
    return Rational.from(BigInt(n!), BigInt(d));
  }

  static decodeCanonical(text: string): Rational {
    if (typeof text !== "string" || /^-?(?:0|[1-9]\d*)\/[1-9]\d*$/.exec(text)?.[0] !== text) {
      throw new SyntaxError("Expected canonical n/d");
    }
    const value = Rational.parse(text);
    if (value.toString() !== text) throw new SyntaxError("Noncanonical rational");
    return value;
  }

  static parseDecimal(text: string): Rational {
    if (typeof text !== "string") throw new TypeError("Decimal input must be text");
    const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match || match[0] !== text) throw new SyntaxError("Expected a finite decimal");
    const fractional = match[3] ?? match[4] ?? "";
    const digits = (match[2] ?? "0") + fractional;
    let n = BigInt(digits);
    if (match[1] === "-") n = -n;
    const exponent = BigInt(match[5] ?? "0") - BigInt(fractional.length);
    if (n === 0n) return Rational.zero;
    return exponent >= 0n
      ? Rational.from(n * 10n ** exponent)
      : Rational.from(n, 10n ** -exponent);
  }

  static readonly zero = Rational.from(0n);
  static readonly one = Rational.from(1n);

  get numerator(): bigint { return this.#value.s * this.#value.n; }
  get denominator(): bigint { return this.#value.d; }
  compare(other: Rational): -1 | 0 | 1 {
    return this.#value.compare(other.#value) as -1 | 0 | 1;
  }
  equals(other: Rational): boolean { return this.compare(other) === 0; }
  add(other: Rational): Rational { return new Rational(this.#value.add(other.#value)); }
  sub(other: Rational): Rational { return new Rational(this.#value.sub(other.#value)); }
  mul(other: Rational): Rational { return new Rational(this.#value.mul(other.#value)); }
  div(other: Rational): Rational {
    if (other.numerator === 0n) throw new RangeError("Division by zero");
    return new Rational(this.#value.div(other.#value));
  }
  neg(): Rational { return Rational.from(-this.numerator, this.denominator); }
  abs(): Rational { return this.numerator < 0n ? this.neg() : this; }
  min(other: Rational): Rational { return this.compare(other) <= 0 ? this : other; }
  max(other: Rational): Rational { return this.compare(other) >= 0 ? this : other; }
  floor(): Rational {
    const n = this.numerator, d = this.denominator;
    return Rational.from(n / d - (n < 0n && n % d !== 0n ? 1n : 0n));
  }
  ceil(): Rational {
    const n = this.numerator, d = this.denominator;
    return Rational.from(n / d + (n > 0n && n % d !== 0n ? 1n : 0n));
  }

  /** Explicit approximation; shift both integer components before Number conversion. */
  toApproximateNumber(): number {
    const signed = this.numerator;
    if (signed === 0n) return 0;
    const n = signed < 0n ? -signed : signed, d = this.denominator;
    const nBits = n.toString(2).length, dBits = d.toString(2).length;
    const nShift = Math.max(0, nBits - 54), dShift = Math.max(0, dBits - 54);
    const ratio = Number(n >> BigInt(nShift)) / Number(d >> BigInt(dShift));
    const shift = nShift - dShift;
    const result = shift > 1023 ? ratio * 2 ** 1023 * 2 ** (shift - 1023)
      : shift < -1022 ? ratio * 2 ** -1022 * 2 ** (shift + 1022)
      : ratio * 2 ** shift;
    return signed < 0n ? -result : result;
  }
  toString(): string { return `${this.numerator}/${this.denominator}`; }
  toJSON(): string { return this.toString(); }
  [Symbol.toPrimitive](): never {
    throw new TypeError("Use explicit Rational arithmetic or conversion methods");
  }
}
