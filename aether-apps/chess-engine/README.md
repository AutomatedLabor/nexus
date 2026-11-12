# Aether Chess Engine

A complete chess move generator and validator written in pure Aether, with FEN
parsing/serialisation, pseudo-legal move generation for all six piece types,
check and checkmate detection, castling-rights tracking, en-passant captures,
and auto-queen promotion. The implementation is ~850 lines of pure Aether with
no host calls beyond the inline builtins (`push`, `len`, `panic`, `str`,
`int`, `charCode`, `fromCharCode`, `strSlice`, `assert_eq`).

## Board representation

The board is an 8×8 array of single-character strings using FEN encoding:

- `.` — empty
- `P N B R Q K` — white pieces (pawn, knight, bishop, rook, queen, king)
- `p n b r q k` — black pieces

Squares are indexed `[row, col]` where row 0 = rank 8 (top, black's back rank)
and row 7 = rank 1 (bottom, white's back rank). Col 0 = file a (left), col 7 =
file h (right). Algebraic notation (`"e4"`, `"a8"`) is used for `makeMove` and
`legalMoves`; the helpers `sq_to_idx` and `idx_to_sq` translate.

The `Board` struct also tracks:

- `turn` — `"w"` or `"b"`, whose move it is
- `castling` — `"KQkq"` or subset; `"-"` if no rights remain
- `en_passant` — algebraic target square or `"-"`
- `halfmove` — half-move clock (50-move rule)
- `fullmove` — full-move number (starts at 1, increments after black's move)

## Public surface

| Function | Signature | Description |
|---|---|---|
| `new` | `() -> Board` | The starting position. |
| `fromFen` | `(string) -> Board` | Parse a 6-field FEN string. |
| `toFen` | `(Board) -> string` | Serialise a board back to FEN. |
| `printBoard` | `(Board) -> ()` | Pretty-print the board with rank/file labels. |
| `makeMove` | `(Board, from: string, to: string) -> Board` | Make a move; from/to in algebraic. Returns a new board (no mutation). |
| `legalMoves` | `(Board, pos: string) -> [[int]]` | Pseudo-legal moves from `pos`; list of `[row, col]` targets. |
| `inCheck` | `(Board, color: string) -> bool` | Is `color`'s king attacked? |
| `isCheckmate` | `(Board, color: string) -> bool` | `color` to move, in check, no escape. |
| `isStalemate` | `(Board, color: string) -> bool` | `color` to move, not in check, no move (bonus). |

> The public function is `makeMove`, not `move`, because `move` is a reserved
> keyword in Aether v3 (RFC-004 borrow checker). The compile error when naming
> a function `move` is `undefined name 'b'` — the parser silently drops the
> parameter list. Renaming to `makeMove` resolves it. The examples and tests
> import `makeMove` accordingly.

## Movement rules implemented

- **Pawn**: forward one (or two from starting rank), diagonal captures,
  en-passant capture, auto-promotion to queen on the last rank (no
  under-promotion).
- **Knight**: the 8 L-shapes.
- **Bishop**: any diagonal direction (sliding).
- **Rook**: any orthogonal direction (sliding).
- **Queen**: bishop + rook.
- **King**: one square in any direction. Castling is **documented but not
  implemented** — the FEN castling rights are tracked and updated when a king
  or rook moves, but `makeMove` does not accept `"O-O"` or `"O-O-O"` as input.

## Pseudo-legal vs legal

`legalMoves` returns **pseudo-legal** moves: they follow the piece's movement
rules but may leave the mover's king in check, or even capture the enemy king
on the next move. This is the standard "pseudo-legal" definition used by chess
engines for performance reasons.

`isCheckmate` and `isStalemate` filter the pseudo-legal list through
`makeMove` + `inCheck` to find **legal** moves — i.e., those that don't leave
the mover's king in check. This is correct but slow (quadratic in the number
of moves); a production engine would use a more sophisticated filter.

The rook test in `tests/tests.ae` documents the pseudo-legal king-capture
behaviour explicitly: a rook on a1 with an enemy king on e1 has 11 pseudo-legal
moves (b1, c1, d1, e1-capture, a2..a8), not 10. Real chess engines treat
king-capture positions as illegal and never generate them; this engine does
not — the legality filter only checks the mover's king, not the opponent's.

## Check and checkmate detection

`inCheck(b, color)` walks the attacker's piece types (pawn, knight, king,
sliding bishop/queen, sliding rook/queen) and tests whether any sits on a
square that attacks the king's square. This avoids generating the full move
list for the opponent — O(piece types) instead of O(legal moves).

`isCheckmate(b, color)` enumerates every piece of `color`, generates its
pseudo-legal moves, makes each one, and checks whether the resulting position
leaves `color`'s king in check. If no move escapes, it's checkmate.

## The Fool's mate

The example demonstrates the fastest possible checkmate:

```
1. f3    e5
2. g4    Qh4#
```

White's king on e1 is attacked by the black queen on h4 along the
e1-h4 diagonal. White has no legal escape: the king can't move (d1, d2, e2, f2
are blocked or attacked), no piece can interpose, and no piece can capture
the queen. `isCheckmate` returns `true`.

## Files

```
chess-engine/
├── aether.toml     # package manifest
├── README.md       # this file
├── src/
│   └── chess.ae    # ~850 LOC: the engine
├── tests/
│   └── tests.ae   # 25+ assertions, all passing
└── examples/
    └── example.ae # starting position, 3 moves, fool's mate, FEN setup
```

## Running

```bash
# Run the example (from repo root):
bun -e "import {runModule} from '/home/z/my-project/aether/core/modules/modules'; \
  const r = runModule('aether-apps/chess-engine/examples/example.ae', \
  {maxSteps:50000000}); \
  console.log('lines=', (r.output||[]).length, 'err=', r.error);"

# Run the tests:
bun -e "import {runModule} from '/home/z/my-project/aether/core/modules/modules'; \
  const r = runModule('aether-apps/chess-engine/tests/tests.ae', \
  {maxSteps:50000000}); \
  console.log('output:', r.output, 'err=', r.error);"
```

## Aether evaluator quirks encountered

Writing a real chess engine in Aether v3 surfaced several evaluator quirks
that the code carefully avoids:

1. **`move` is a reserved keyword** (RFC-004). `pub fn move(b, from, to)` —
   even at top level — fails to register the function; calls error with
   `undefined name 'b'`. Renamed to `makeMove`.
2. **`if cond { stmt }` as a statement requires `;` after the closing `}`** —
   otherwise the parser eats the next statement as part of the if expression
   and silently skips it. The chess source carefully adds `;` after every
   multi-line if/while block and `;` inside every single-line if block.
3. **`if cond { stmt }` as a single-line statement needs `;` inside the
   block** too: `if cond { stmt; }` (and optionally `;` after the `}` as well).
4. **No `for in` loops** — the for-loop-scope quirk means a `let` before a
   `for` loop referenced after the loop fails. All iteration uses `while`
   with explicit indices.
5. **`/` is float division** — not an issue here, all chess arithmetic is
   integer, but worth noting.

## Known limitations

- **No castling**: the king/rook movement rules and FEN rights are tracked, but
  `makeMove` does not accept `"O-O"` or `"O-O-O"`.
- **Auto-queen promotion only**: pawns reaching the last rank always promote
  to a queen; no under-promotion (knight, bishop, rook).
- **Pseudo-legal king captures**: as noted above, the move generator will
  generate moves that capture the enemy king. This is a known divergence from
  real chess and is documented in the rook-move test.
- **No threefold repetition or 50-move draw**: `halfmove` and `fullmove`
  counters are tracked, but no `isDraw` function is provided.
- **No move-history**: each `makeMove` returns a fresh `Board`; there's no
  undo or move log.

## Why this matters

The chess engine is a non-trivial "real" application: it has a real data
model, multiple interacting subsystems (move generation, check detection,
FEN I/O, castling tracking), and a non-trivial test suite covering edge
cases (en passant, promotion, castling-rights changes, fool's mate). It
exercises every Aether feature that a typical application would use:
structs, `pub fn` exports, `while` iteration, nested `if`/`else`, string
manipulation, array indexing and assignment, mutable variables, recursion
(in `isCheckmate`/`isStalemate`), and `panic` for unreachable states. If
Aether v3 can host a chess engine, it can host most application code.
