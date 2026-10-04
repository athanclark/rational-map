# rational-ordered-map

Exact arbitrary-precision rational arithmetic and an ordered map for browsers and
Node. Rational components use BigInt through Fraction.js. The map owns an augmented,
persistent AVL tree for exact bounds and cached proximity summaries.

This directory is a standalone npm project. Version 0.1.0 is an initial implementation;
the package has not been published to the npm registry.

## Build and test

Requires Node 20 or later.

~~~sh
npm ci
npm test
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
npm pack
~~~

The tarball includes declarations and a standalone browser bundle. Install it
locally, then import rational-ordered-map. Normal tests need no sibling project,
database, or running browser.

See [GitHub CI](CI.md) for standalone repository layout, test matrices, and
downloadable package artifacts.

## Use

~~~ts
import { Rational as Q, RationalMap } from "rational-ordered-map";

const times = new RationalMap<string>();
times.set(Q.parse("0"), "start");
times.set(Q.parse("2/4"), "middle");
times.set(Q.parse("1"), "end");

times.get(Q.parse("1/2"));             // "middle": equality is numeric
[...times.range(Q.zero, Q.one)];       // start and middle; [0, 1)
times.countRange(Q.zero, Q.one);       // 2n
times.overview(Q.zero, Q.from(2n), Q.one).groups;
// Two groups: [0/1, 1/2] with count 2n; [1/1, 1/1] with count 1n

const previous = times.clone();       // O(1) snapshot sharing immutable tree nodes
times.delete(Q.zero);                 // previous still contains the old tree
~~~

For a browser without a bundler, serve dist/browser.js and import its exports from
a module script. It bundles Fraction.js and needs no Node APIs, database, network,
native addon, or WebAssembly. BigInt and ES2020 runtime support are required.
The package also exports rational-ordered-map/browser for bundlers.

## Exact interchange and arithmetic

Construct with Q.from(n: bigint, d?: bigint), Q.parse(integerOrFraction),
Q.parseDecimal(decimalText), or Q.decodeCanonical(text). Canonical output is reduced
n/d with positive denominator, including /1 for integers and 0/1 for zero. toJSON()
uses the same string. Canonical decoding rejects alternate spellings; ordinary
parsing accepts signed components and normalizes them. Zero denominators,
malformed input, and division by zero throw.

~~~ts
Q.parseDecimal("0.1").add(Q.parseDecimal("0.2")).toString(); // "3/10"
Q.from(10n ** 1000n + 1n, 10n ** 1000n).compare(Q.one);     // 1
~~~

Methods: compare, equals, add, sub, mul, div, neg, abs, min, max, floor, ceil,
toString, and toApproximateNumber. Compare returns -1/0/1; floor and ceil return
rationals with denominator 1. Numerator and denominator getters return BigInt.
JavaScript arithmetic/coercion operators throw; use explicit methods.
Approximate conversion can round, overflow, or underflow. For rendering, subtract
the viewport origin and scale **in rational arithmetic before** converting to Number.

## Ordered queries and summaries

Range, aggregate, and countRange take optional lower and upper rationals.
Undefined means unbounded. Defaults are inclusive lower and exclusive upper;
pass {includeLower: false, includeUpper: true} to change them. Reversed bounds are
empty; equal bounds select a coordinate only when both endpoints are inclusive.
Iteration follows exact increasing time order. A range iterator captures its tree
when iteration first starts.

Set replaces a value at a numerically equal coordinate, like Haskell Map.
Get, has, delete, clear, size, entryCount, minKey, maxKey,
successor(key, inclusive?), and predecessor(key, inclusive?) are also available.

For multiple metadata entries at one time, store immutable buckets:

~~~ts
const buckets = new RationalMap<readonly string[]>(items => BigInt(items.length));
buckets.set(Q.parse("1/3"), ["event-a", "event-b"]);
~~~

Weights must be positive BigInt. Entry counts use BigInt; distinct counts and size
use JavaScript numbers because they count actual in-memory nodes. Values are shared
between clones. Mutating a value or changing its weight outside set can invalidate
application expectations; replace immutable buckets with set.

Overview(lower, upper, threshold, mode = "span", options?) returns groups and
diagnostic traversal stats. Groups have exact firstTime, lastTime, maxGap,
entryCount, and distinctCount. Threshold is a nonnegative rational:

- **span**: begin at the first remaining coordinate a and gather [a, a+threshold),
  clipped to the viewport. Each group's width is strictly less than the threshold.
- **neighbors**: join successive coordinates when their gap is strictly below the
  threshold. Chains can span much farther than the threshold.
- Zero threshold keeps each distinct coordinate separate; bucket weights remain intact.

Equality with the threshold separates groups. Neither mode rounds or discards
keys. Summaries describe every indexed value in the viewport; arbitrary metadata
predicates require a filtered map or enumeration.

## Performance and scope

Lookup, edits, and successor/predecessor use O(log n) tree steps. Ranges use
O(log n+k) for k results; cached aggregation uses O(log n) boundary traversal.
Span overviews use O(g log n) for g groups. Neighbor overviews skip entire subtrees
using their cached maximum gaps, but have O(n) worst-case traversal. Arithmetic
cost also depends on operand bit lengths; arbitrary precision is not constant time.

Edits copy O(log n) nodes, enabling O(1) clones. A dense-data test verifies that a
10,000-coordinate neighbor overview consumes the root with one node visit.
This release supports point coordinates and built-in summaries, without interval
overlap indexes or custom summary reducers.

Own code and Fraction.js are MIT licensed. The dependency's license banner is
retained in the standalone browser bundle.
