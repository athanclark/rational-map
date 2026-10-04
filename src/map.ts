import { Rational as Q } from "./rational.js";

export interface RangeOptions { includeLower?: boolean; includeUpper?: boolean; }
export interface Summary {
  readonly firstTime: Q;
  readonly lastTime: Q;
  readonly entryCount: bigint;
  readonly distinctCount: number;
  readonly maxGap: Q;
}
export type GroupingMode = "neighbors" | "span";
export interface QueryStats { visitedNodes: number; consumedSubtrees: number; }
export interface Overview { groups: readonly Summary[]; stats: Readonly<QueryStats>; }
interface Bounds { lower?: Q; upper?: Q; includeLower: boolean; includeUpper: boolean; }
interface Node<V> {
  readonly key: Q; readonly value: V; readonly weight: bigint;
  readonly left?: Node<V>; readonly right?: Node<V>;
  readonly height: number; readonly summary: Summary;
}
const height = <V>(n?: Node<V>): number => n?.height ?? 0;
const singleton = (key: Q, weight: bigint): Summary => Object.freeze({
  firstTime: key, lastTime: key, entryCount: weight, distinctCount: 1, maxGap: Q.zero,
});
function combine(a?: Summary, b?: Summary): Summary | undefined {
  if (!a) return b;
  if (!b) return a;
  return Object.freeze({ firstTime: a.firstTime, lastTime: b.lastTime,
    entryCount: a.entryCount + b.entryCount,
    distinctCount: a.distinctCount + b.distinctCount,
    maxGap: a.maxGap.max(b.firstTime.sub(a.lastTime)).max(b.maxGap),
  });
}
function node<V>(key: Q, value: V, weight: bigint, left?: Node<V>, right?: Node<V>): Node<V> {
  return {key, value, weight, left, right, height: 1 + Math.max(height(left), height(right)),
    summary: combine(combine(left?.summary, singleton(key, weight)), right?.summary)!};
}
function rotateLeft<V>(n: Node<V>): Node<V> {
  const r = n.right!;
  return node(r.key, r.value, r.weight, node(n.key, n.value, n.weight, n.left, r.left), r.right);
}
function rotateRight<V>(n: Node<V>): Node<V> {
  const l = n.left!;
  return node(l.key, l.value, l.weight, l.left, node(n.key, n.value, n.weight, l.right, n.right));
}
function balance<V>(n: Node<V>): Node<V> {
  const difference = height(n.left) - height(n.right);
  if (difference > 1) {
    if (height(n.left!.left) < height(n.left!.right)) {
      n = node(n.key, n.value, n.weight, rotateLeft(n.left!), n.right);
    }
    return rotateRight(n);
  }
  if (difference < -1) {
    if (height(n.right!.right) < height(n.right!.left)) {
      n = node(n.key, n.value, n.weight, n.left, rotateRight(n.right!));
    }
    return rotateLeft(n);
  }
  return n;
}
function put<V>(n: Node<V> | undefined, key: Q, value: V, weight: bigint): Node<V> {
  if (!n) return node(key, value, weight);
  const c = key.compare(n.key);
  if (c === 0) return node(n.key, value, weight, n.left, n.right);
  return balance(c < 0 ? node(n.key, n.value, n.weight, put(n.left, key, value, weight), n.right)
    : node(n.key, n.value, n.weight, n.left, put(n.right, key, value, weight)));
}
function remove<V>(n: Node<V> | undefined, key: Q): Node<V> | undefined {
  if (!n) return undefined;
  const c = key.compare(n.key);
  if (c < 0) return balance(node(n.key, n.value, n.weight, remove(n.left, key), n.right));
  if (c > 0) return balance(node(n.key, n.value, n.weight, n.left, remove(n.right, key)));
  if (!n.left) return n.right;
  if (!n.right) return n.left;
  let successor = n.right;
  while (successor.left) successor = successor.left;
  return balance(node(successor.key, successor.value, successor.weight, n.left, remove(n.right, successor.key)));
}
function below(q: Q, b: Bounds): boolean {
  if (!b.lower) return false;
  const c = q.compare(b.lower);
  return c < 0 || (c === 0 && !b.includeLower);
}
function above(q: Q, b: Bounds): boolean {
  if (!b.upper) return false;
  const c = q.compare(b.upper);
  return c > 0 || (c === 0 && !b.includeUpper);
}
function bounds(lower?: Q, upper?: Q, options: RangeOptions = {}): Bounds {
  if (lower !== undefined && !(lower instanceof Q) || upper !== undefined && !(upper instanceof Q)) {
    throw new TypeError("Bounds must be Rational values");
  }
  return {lower, upper, includeLower: options.includeLower ?? true, includeUpper: options.includeUpper ?? false};
}
function aggregate<V>(n: Node<V> | undefined, b: Bounds, stats: QueryStats): Summary | undefined {
  if (!n) return undefined;
  stats.visitedNodes++;
  const s = n.summary;
  if (below(s.lastTime, b) || above(s.firstTime, b)) return undefined;
  if (!below(s.firstTime, b) && !above(s.lastTime, b)) {
    stats.consumedSubtrees++;
    return s;
  }
  return combine(combine(aggregate(n.left, b, stats),
    !below(n.key, b) && !above(n.key, b) ? singleton(n.key, n.weight) : undefined),
    aggregate(n.right, b, stats));
}
function lowerBound<V>(n: Node<V> | undefined, key: Q | undefined, inclusive: boolean,
  stats?: QueryStats): Node<V> | undefined {
  let candidate: Node<V> | undefined;
  while (n) {
    if (stats) stats.visitedNodes++;
    const c = key === undefined ? 1 : n.key.compare(key);
    if (c > 0 || c === 0 && inclusive) { candidate = n; n = n.left; }
    else n = n.right;
  }
  return candidate;
}

/** Persistent AVL nodes, mutable Map facade, exact range folds and proximity summaries. */
export class RationalMap<V> implements Iterable<[Q, V]> {
  #root?: Node<V>;
  readonly #weight: (value: V) => bigint;
  constructor(weight: (value: V) => bigint = () => 1n) { this.#weight = weight; }
  get size(): number { return this.#root?.summary.distinctCount ?? 0; }
  get entryCount(): bigint { return this.#root?.summary.entryCount ?? 0n; }
  get height(): number { return height(this.#root); }
  #find(key: Q): Node<V> | undefined {
    let n = this.#root;
    while (n) { const c = key.compare(n.key); if (c === 0) return n; n = c < 0 ? n.left : n.right; }
    return undefined;
  }
  get(key: Q): V | undefined { return this.#find(key)?.value; }
  has(key: Q): boolean { return this.#find(key) !== undefined; }
  set(key: Q, value: V): this {
    if (!(key instanceof Q)) throw new TypeError("Keys must be Rational values");
    const weight = this.#weight(value);
    if (typeof weight !== "bigint" || weight <= 0n) throw new RangeError("Weights must be positive bigint");
    this.#root = put(this.#root, key, value, weight);
    return this;
  }
  delete(key: Q): boolean {
    if (!this.has(key)) return false;
    this.#root = remove(this.#root, key); return true;
  }
  clear(): void { this.#root = undefined; }
  clone(): RationalMap<V> {
    const copy = new RationalMap(this.#weight); copy.#root = this.#root; return copy;
  }
  minKey(): Q | undefined { return this.#root?.summary.firstTime; }
  maxKey(): Q | undefined { return this.#root?.summary.lastTime; }
  successor(key: Q, inclusive = false): [Q, V] | undefined {
    const n = lowerBound(this.#root, key, inclusive); return n ? [n.key, n.value] : undefined;
  }
  predecessor(key: Q, inclusive = false): [Q, V] | undefined {
    let n = this.#root, candidate: Node<V> | undefined;
    while (n) {
      const c = n.key.compare(key);
      if (c < 0 || c === 0 && inclusive) { candidate = n; n = n.right; } else n = n.left;
    }
    return candidate ? [candidate.key, candidate.value] : undefined;
  }
  *range(lower?: Q, upper?: Q, options: RangeOptions = {}): IterableIterator<[Q, V]> {
    const b = bounds(lower, upper, options), root = this.#root;
    function* walk(n?: Node<V>): IterableIterator<[Q, V]> {
      if (!n || below(n.summary.lastTime, b) || above(n.summary.firstTime, b)) return;
      yield* walk(n.left);
      if (!below(n.key, b) && !above(n.key, b)) yield [n.key, n.value];
      yield* walk(n.right);
    }
    yield* walk(root);
  }
  [Symbol.iterator](): IterableIterator<[Q, V]> { return this.range(); }
  aggregate(lower?: Q, upper?: Q, options: RangeOptions = {}): Summary | undefined {
    return aggregate(this.#root, bounds(lower, upper, options), {visitedNodes: 0, consumedSubtrees: 0});
  }
  countRange(lower?: Q, upper?: Q, options: RangeOptions = {}): bigint {
    return this.aggregate(lower, upper, options)?.entryCount ?? 0n;
  }
  overview(lower: Q | undefined, upper: Q | undefined, threshold: Q,
    mode: GroupingMode = "span", options: RangeOptions = {}): Overview {
    if (!(threshold instanceof Q) || threshold.compare(Q.zero) < 0) throw new RangeError("Threshold must be nonnegative");
    if (mode !== "span" && mode !== "neighbors") throw new TypeError("Unknown grouping mode");
    const b = bounds(lower, upper, options), root = this.#root;
    const stats: QueryStats = {visitedNodes: 0, consumedSubtrees: 0};
    const groups: Summary[] = [];
    if (mode === "neighbors" || threshold.equals(Q.zero)) {
      const emit = (s: Summary): void => {
        const previous = groups[groups.length - 1];
        if (previous && s.firstTime.sub(previous.lastTime).compare(threshold) < 0) {
          groups[groups.length - 1] = combine(previous, s)!;
        } else groups.push(s);
      };
      const walk = (n?: Node<V>): void => {
        if (!n) return;
        stats.visitedNodes++;
        const s = n.summary;
        if (below(s.lastTime, b) || above(s.firstTime, b)) return;
        if (!below(s.firstTime, b) && !above(s.lastTime, b) &&
          (s.distinctCount === 1 || s.maxGap.compare(threshold) < 0)) {
          stats.consumedSubtrees++; emit(s); return;
        }
        walk(n.left);
        if (!below(n.key, b) && !above(n.key, b)) emit(singleton(n.key, n.weight));
        walk(n.right);
      };
      walk(root);
    } else {
      let anchor = lowerBound(root, lower, b.includeLower, stats);
      while (anchor && !above(anchor.key, b)) {
        const cutoff = anchor.key.add(threshold);
        const clipped = upper !== undefined && upper.compare(cutoff) < 0;
        const groupBounds: Bounds = {lower: anchor.key, includeLower: true,
          upper: clipped ? upper : cutoff, includeUpper: clipped && b.includeUpper};
        const summary = aggregate(root, groupBounds, stats);
        if (summary) groups.push(summary);
        if (clipped) break;
        anchor = lowerBound(root, cutoff, true, stats);
      }
    }
    return Object.freeze({groups: Object.freeze(groups), stats: Object.freeze(stats)});
  }
}
