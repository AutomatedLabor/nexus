package aether_compiler

import (
	"strings"
	"testing"
)

// Helpers ----------------------------------------------------------------

// tokenKinds returns the kinds of all tokens (excluding the trailing
// EOF) — useful for asserting on the overall shape of the token stream.
func tokenKinds(toks []Token) []TokenKind {
	if len(toks) == 0 {
		return nil
	}
	out := make([]TokenKind, 0, len(toks)-1)
	for _, t := range toks[:len(toks)-1] {
		out = append(out, t.Kind)
	}
	return out
}

// tokenValues returns the values of all tokens (excluding EOF).
func tokenValues(toks []Token) []string {
	if len(toks) == 0 {
		return nil
	}
	out := make([]string, 0, len(toks)-1)
	for _, t := range toks[:len(toks)-1] {
		out = append(out, t.Value)
	}
	return out
}

func lastIsEof(toks []Token) bool {
	return len(toks) > 0 && toks[len(toks)-1].Kind == TokenEof
}

// lex runs the lexer without raising on errors, returning just the tokens.
func lex(s string) []Token {
	toks, _ := TokenizeWithErrors(s, "<test>")
	return toks
}

// ---------------------------------------------------------------------------
// Lexer tests (80+)
// ---------------------------------------------------------------------------

func TestEmpty(t *testing.T) {
	toks := lex("")
	if !lastIsEof(toks) {
		t.Fatalf("expected trailing EOF")
	}
	if len(toks) != 1 {
		t.Fatalf("expected 1 token (EOF), got %d", len(toks))
	}
}

func TestWhitespace(t *testing.T) {
	toks := lex("   \t\r\n  \n  ")
	if !lastIsEof(toks) {
		t.Fatalf("expected trailing EOF")
	}
	if len(toks) != 1 {
		t.Fatalf("expected only EOF, got %d tokens", len(toks))
	}
}

func TestLineComment(t *testing.T) {
	toks := lex("// hello world\n")
	if len(toks) != 1 {
		t.Fatalf("comment-only source should yield just EOF")
	}
}

func TestBlockComment(t *testing.T) {
	toks := lex("/* hello */")
	if len(toks) != 1 {
		t.Fatalf("block comment-only source should yield just EOF")
	}
}

func TestNestedBlockComment(t *testing.T) {
	toks := lex("/* outer /* inner */ still outer */")
	if len(toks) != 1 {
		t.Fatalf("nested block comment should be skipped")
	}
}

func TestUnterminatedBlockComment(t *testing.T) {
	_, errs := TokenizeWithErrors("/* unterminated", "<test>")
	if len(errs) == 0 {
		t.Fatalf("expected an error for unterminated block comment")
	}
}

func TestIntLiteral(t *testing.T) {
	toks := lex("42")
	if len(toks) != 2 || toks[0].Kind != TokenInt || toks[0].Value != "42" {
		t.Fatalf("expected Int(42), got %+v", toks)
	}
}

func TestIntWithUnderscores(t *testing.T) {
	toks := lex("1_000_000")
	if toks[0].Kind != TokenInt || toks[0].Value != "1000000" {
		t.Fatalf("expected underscore-stripped int, got %+v", toks[0])
	}
}

func TestFloatLiteral(t *testing.T) {
	toks := lex("3.14")
	if toks[0].Kind != TokenFloat || toks[0].Value != "3.14" {
		t.Fatalf("expected Float(3.14), got %+v", toks[0])
	}
}

func TestFloatWithExp(t *testing.T) {
	toks := lex("1e10")
	if toks[0].Kind != TokenFloat || toks[0].Value != "1e10" {
		t.Fatalf("expected Float(1e10), got %+v", toks[0])
	}
}

func TestFloatWithSignedExp(t *testing.T) {
	toks := lex("1.5e-3")
	if toks[0].Kind != TokenFloat || toks[0].Value != "1.5e-3" {
		t.Fatalf("expected Float(1.5e-3), got %+v", toks[0])
	}
}

func TestHexLiteral(t *testing.T) {
	toks := lex("0xff")
	if toks[0].Kind != TokenHex || toks[0].Value != "0xff" {
		t.Fatalf("expected Hex(0xff), got %+v", toks[0])
	}
}

func TestHexUppercase(t *testing.T) {
	toks := lex("0xDEAD")
	if toks[0].Kind != TokenHex || toks[0].Value != "0xDEAD" {
		t.Fatalf("expected Hex(0xDEAD), got %+v", toks[0])
	}
}

func TestBinaryLiteral(t *testing.T) {
	toks := lex("0b1010")
	if toks[0].Kind != TokenBinary || toks[0].Value != "0b1010" {
		t.Fatalf("expected Binary, got %+v", toks[0])
	}
}

func TestOctalLiteral(t *testing.T) {
	toks := lex("0o777")
	if toks[0].Kind != TokenOctal || toks[0].Value != "0o777" {
		t.Fatalf("expected Octal, got %+v", toks[0])
	}
}

func TestCharLiteral(t *testing.T) {
	toks := lex("'a'")
	if toks[0].Kind != TokenChar || toks[0].Value != "a" {
		t.Fatalf("expected Char(a), got %+v", toks[0])
	}
}

func TestCharEscapeN(t *testing.T) {
	toks := lex("'\\n'")
	if toks[0].Kind != TokenChar || toks[0].Value != "\n" {
		t.Fatalf("expected Char(newline), got %+v", toks[0])
	}
}

func TestCharEscapeUnicode(t *testing.T) {
	toks := lex("'\\u{1F600}'")
	if toks[0].Value != "😀" {
		t.Fatalf("expected 😀, got %q", toks[0].Value)
	}
}

func TestEmptyCharLiteral(t *testing.T) {
	_, errs := TokenizeWithErrors("''", "<test>")
	if len(errs) == 0 {
		t.Fatalf("expected error for empty char literal")
	}
}

func TestUnterminatedCharLiteral(t *testing.T) {
	_, errs := TokenizeWithErrors("'a", "<test>")
	if len(errs) == 0 {
		t.Fatalf("expected error for unterminated char literal")
	}
}

func TestStringLiteral(t *testing.T) {
	toks := lex(`"hello"`)
	if toks[0].Kind != TokenString {
		t.Fatalf("expected String, got %+v", toks[0])
	}
	if len(toks[0].Segments) != 1 || toks[0].Segments[0].Kind != "text" || toks[0].Segments[0].Value != "hello" {
		t.Fatalf("expected single text segment 'hello', got %+v", toks[0].Segments)
	}
}

func TestStringEscapes(t *testing.T) {
	toks := lex(`"a\nb"`)
	if len(toks[0].Segments) != 1 || toks[0].Segments[0].Value != "a\nb" {
		t.Fatalf("expected 'a\\nb' decoded, got %+v", toks[0].Segments[0])
	}
}

func TestFStringInterpolation(t *testing.T) {
	toks := lex(`f"hello {name}!"`)
	if toks[0].Kind != TokenString {
		t.Fatalf("expected String, got %+v", toks[0])
	}
	if len(toks[0].Segments) != 3 {
		t.Fatalf("expected 3 segments, got %d", len(toks[0].Segments))
	}
	if toks[0].Segments[0].Value != "hello " || toks[0].Segments[0].Kind != "text" {
		t.Fatalf("segment 0 wrong: %+v", toks[0].Segments[0])
	}
	if toks[0].Segments[1].Kind != "interp" || toks[0].Segments[1].Value != "name" {
		t.Fatalf("segment 1 wrong: %+v", toks[0].Segments[1])
	}
	if toks[0].Segments[2].Value != "!" || toks[0].Segments[2].Kind != "text" {
		t.Fatalf("segment 2 wrong: %+v", toks[0].Segments[2])
	}
}

func TestFStringNestedBraces(t *testing.T) {
	toks := lex(`f"{ {x: 1}.x }"`)
	if len(toks[0].Segments) != 1 || toks[0].Segments[0].Kind != "interp" {
		t.Fatalf("expected single interp segment, got %+v", toks[0].Segments)
	}
	// The interp value includes any inner spaces between the outer
	// `{` ... `}` and the nested construct.
	want := " {x: 1}.x "
	if toks[0].Segments[0].Value != want {
		t.Fatalf("interp value wrong: got %q want %q", toks[0].Segments[0].Value, want)
	}
}

func TestFStringNestedString(t *testing.T) {
	toks := lex(`f"{ "literal" }"`)
	if len(toks[0].Segments) != 1 || toks[0].Segments[0].Kind != "interp" {
		t.Fatalf("expected single interp segment, got %+v", toks[0].Segments)
	}
	want := ` "literal" `
	if toks[0].Segments[0].Value != want {
		t.Fatalf("interp value wrong: got %q want %q", toks[0].Segments[0].Value, want)
	}
}

func TestUnterminatedString(t *testing.T) {
	_, errs := TokenizeWithErrors(`"unterminated`, "<test>")
	if len(errs) == 0 {
		t.Fatalf("expected error for unterminated string")
	}
}

func TestUnterminatedFStringInterpolation(t *testing.T) {
	_, errs := TokenizeWithErrors(`f"{ unbalanced }`, "<test>")
	if len(errs) == 0 {
		t.Fatalf("expected error for unterminated interpolation")
	}
}

func TestIdent(t *testing.T) {
	toks := lex("foo")
	if toks[0].Kind != TokenIdent || toks[0].Value != "foo" {
		t.Fatalf("expected Ident(foo), got %+v", toks[0])
	}
}

func TestIdentWithDigits(t *testing.T) {
	toks := lex("foo123")
	if toks[0].Kind != TokenIdent || toks[0].Value != "foo123" {
		t.Fatalf("expected Ident(foo123), got %+v", toks[0])
	}
}

func TestUnderscoreIdent(t *testing.T) {
	toks := lex("_foo")
	if toks[0].Kind != TokenIdent || toks[0].Value != "_foo" {
		t.Fatalf("expected Ident(_foo), got %+v", toks[0])
	}
}

func TestDollarIdent(t *testing.T) {
	toks := lex("$foo")
	if toks[0].Kind != TokenIdent || toks[0].Value != "$foo" {
		t.Fatalf("expected Ident($foo), got %+v", toks[0])
	}
}

func TestKeywordLet(t *testing.T) {
	toks := lex("let")
	if toks[0].Kind != TokenKeyword || toks[0].Value != "let" {
		t.Fatalf("expected Keyword(let), got %+v", toks[0])
	}
}

func TestAllKeywords(t *testing.T) {
	all := []string{"let", "mut", "const", "fn", "enum", "struct", "type",
		"match", "if", "else", "while", "for", "in", "return", "break",
		"continue", "print", "true", "false", "unit", "self", "as",
		"range", "import", "pub", "use", "or", "do", "trait", "impl",
		"dyn", "move"}
	for _, kw := range all {
		toks := lex(kw)
		if toks[0].Kind != TokenKeyword || toks[0].Value != kw {
			t.Errorf("expected Keyword(%s), got %+v", kw, toks[0])
		}
	}
}

func TestNonKeywordIdent(t *testing.T) {
	toks := lex("foo")
	if toks[0].Kind != TokenIdent {
		t.Fatalf("expected Ident, got %+v", toks[0])
	}
}

func TestPunctSingleChar(t *testing.T) {
	for _, p := range []string{"+", "-", "*", "/", "%", "&", "|", "^",
		"<", ">", "=", "(", ")", "[", "]", "{", "}", ",", ";", ":",
		".", "@", "#", "?", "!", "~"} {
		toks := lex(p)
		if toks[0].Kind != TokenPunct || toks[0].Value != p {
			t.Errorf("expected Punct(%s), got %+v", p, toks[0])
		}
	}
}

func TestPunctMultiChar(t *testing.T) {
	for _, p := range []string{"..", "..=", "...", "::", "->", "=>", "==",
		"!=", "<=", ">=", "&&", "||", "+=", "-=", "*=", "/=", "%=",
		"<<", ">>", "??"} {
		toks := lex(p)
		if toks[0].Kind != TokenPunct || toks[0].Value != p {
			t.Errorf("expected Punct(%s), got %+v", p, toks[0])
		}
	}
}

func TestLongestMatchPunct(t *testing.T) {
	// "..=" should be one token, not ".." then "=".
	toks := lex("..=")
	if toks[0].Kind != TokenPunct || toks[0].Value != "..=" || len(toks) != 2 {
		t.Fatalf("expected one Punct(..=), got %+v", toks)
	}
}

func TestThreeDotsIsOneToken(t *testing.T) {
	toks := lex("...")
	if toks[0].Kind != TokenPunct || toks[0].Value != "..." || len(toks) != 2 {
		t.Fatalf("expected Punct(...), got %+v", toks)
	}
}

func TestUnexpectedCharacter(t *testing.T) {
	// `@` is a valid punct, but `$` followed by `@` is fine. Use a
	// truly unrecognised byte — `?` is a punct, so use a non-ASCII
	// non-identifier char like `\x01`.
	_, errs := TokenizeWithErrors("\x01", "<test>")
	if len(errs) == 0 {
		t.Fatalf("expected error for unexpected character")
	}
}

func TestPositions(t *testing.T) {
	toks := lex("let x = 1;")
	first := toks[0]
	if first.Loc.Start.Line != 1 || first.Loc.Start.Col != 1 || first.Loc.Start.Offset != 0 {
		t.Fatalf("expected first token to start at 1:1 (offset 0), got %+v", first.Loc.Start)
	}
	if first.Value != "let" {
		t.Fatalf("first token should be 'let', got %q", first.Value)
	}
}

func TestLineColTracking(t *testing.T) {
	toks := lex("a\nb")
	// a at 1:1, b at 2:1
	if toks[0].Loc.Start.Line != 1 {
		t.Fatalf("expected 'a' on line 1, got %d", toks[0].Loc.Start.Line)
	}
	if toks[1].Loc.Start.Line != 2 || toks[1].Loc.Start.Col != 1 {
		t.Fatalf("expected 'b' at 2:1, got %d:%d", toks[1].Loc.Start.Line, toks[1].Loc.Start.Col)
	}
}

func TestLetStatement(t *testing.T) {
	toks := lex("let x = 1;")
	// 5 statement tokens + trailing EOF = 6
	if len(toks) != 6 {
		t.Fatalf("expected 6 tokens (let x = 1 ; EOF), got %d", len(toks))
	}
	if toks[0].Value != "let" || toks[1].Value != "x" || toks[2].Value != "=" || toks[3].Value != "1" || toks[4].Value != ";" {
		t.Fatalf("token values wrong: %+v", toks)
	}
}

func TestFloatVsFieldAccess(t *testing.T) {
	// `.5` should be a float (no prev atom).
	toks := lex(".5")
	if toks[0].Kind != TokenFloat {
		t.Fatalf("expected Float, got %+v", toks[0])
	}
	// `a.5` — `.5` after `a` should be a field access on a tuple
	// (Punct(.) + Int(5)).
	toks = lex("a.5")
	if toks[0].Kind != TokenIdent || toks[1].Kind != TokenPunct || toks[1].Value != "." || toks[2].Kind != TokenInt || toks[2].Value != "5" {
		t.Fatalf("expected Ident . Punct(.) Int(5), got %+v", toks)
	}
}

func TestFloatAfterParen(t *testing.T) {
	toks := lex(").5")
	// `)` is a prev-atom; `.5` should be field access (Punct(.) Int(5)).
	if toks[1].Kind != TokenPunct || toks[2].Kind != TokenInt {
		t.Fatalf("expected Punct(.) Int(5) after `)`, got %+v", toks)
	}
}

func TestInvalidNumberLiteral(t *testing.T) {
	_, errs := TokenizeWithErrors("12abc", "<test>")
	if len(errs) == 0 {
		t.Fatalf("expected error for invalid number literal")
	}
}

func TestExponentRecovery(t *testing.T) {
	// "1e" — lexer tries to parse exponent, fails, restores.
	toks := lex("1e")
	if toks[0].Kind != TokenInt || toks[0].Value != "1" {
		t.Fatalf("expected Int(1), got %+v", toks[0])
	}
	if toks[1].Kind != TokenIdent || toks[1].Value != "e" {
		t.Fatalf("expected Ident(e), got %+v", toks[1])
	}
}

func TestCommentThenCode(t *testing.T) {
	toks := lex("// comment\nlet x = 1;")
	// 5 statement tokens + EOF = 6
	if len(toks) != 6 {
		t.Fatalf("expected 6 tokens after comment, got %d", len(toks))
	}
}

func TestTokenKindsHelper(t *testing.T) {
	got := tokenKinds(lex("let x = 1;"))
	want := []TokenKind{TokenKeyword, TokenIdent, TokenPunct, TokenInt, TokenPunct}
	if len(got) != len(want) {
		t.Fatalf("kinds mismatch: got %v want %v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("kind at %d: got %v want %v", i, got[i], want[i])
		}
	}
}

func TestEofHasLocation(t *testing.T) {
	toks := lex("let x = 1;")
	eof := toks[len(toks)-1]
	if eof.Kind != TokenEof {
		t.Fatalf("expected EOF last, got %+v", eof)
	}
	if eof.Loc.Start.Offset != 10 {
		t.Fatalf("expected EOF at offset 10, got %d", eof.Loc.Start.Offset)
	}
}

func TestIsKeywordHelper(t *testing.T) {
	toks := lex("let")
	if !IsKeyword(toks[0], "let") {
		t.Fatalf("IsKeyword(let, let) should be true")
	}
	if IsKeyword(toks[0], "fn") {
		t.Fatalf("IsKeyword(let, fn) should be false")
	}
}

func TestIsPunctHelper(t *testing.T) {
	toks := lex("=")
	if !IsPunct(toks[0], "=") {
		t.Fatalf("IsPunct(=, =) should be true")
	}
	if IsPunct(toks[0], "==") {
		t.Fatalf("IsPunct(=, ==) should be false")
	}
}

func TestStringWithInterpAndText(t *testing.T) {
	toks := lex(`f"result: {x}"`)
	segs := toks[0].Segments
	if len(segs) != 2 {
		t.Fatalf("expected 2 segments, got %d", len(segs))
	}
	if segs[0].Kind != "text" || segs[0].Value != "result: " {
		t.Fatalf("segment 0 wrong: %+v", segs[0])
	}
	if segs[1].Kind != "interp" || segs[1].Value != "x" {
		t.Fatalf("segment 1 wrong: %+v", segs[1])
	}
}

func TestMultiExprFString(t *testing.T) {
	toks := lex(`f"{a} - {b}"`)
	if len(toks[0].Segments) != 3 {
		t.Fatalf("expected 3 segments (a, text, b), got %d", len(toks[0].Segments))
	}
}

func TestEmptyString(t *testing.T) {
	toks := lex(`""`)
	if toks[0].Kind != TokenString || len(toks[0].Segments) != 0 {
		t.Fatalf("expected empty String, got %+v", toks[0])
	}
}

func TestMultipleStatements(t *testing.T) {
	toks := lex("let a = 1; let b = 2;")
	// 10 statement tokens + EOF = 11
	if len(toks) != 11 {
		t.Fatalf("expected 11 tokens, got %d", len(toks))
	}
}

func TestSourceWithCommentsEverywhere(t *testing.T) {
	toks := lex(`
// top comment
let x = 1; // trailing comment
/* block */ let y = 2;
`)
	// 10 statement tokens + EOF
	if len(toks) != 11 {
		t.Fatalf("expected 11 tokens, got %d", len(toks))
	}
}

func TestTabsAndNewlines(t *testing.T) {
	toks := lex("\tlet\n\tx = 1;")
	if toks[0].Value != "let" {
		t.Fatalf("expected 'let' first, got %q", toks[0].Value)
	}
}

func TestCRLFLineEndings(t *testing.T) {
	toks := lex("let\r\nx = 1;")
	if toks[0].Value != "let" || toks[1].Value != "x" {
		t.Fatalf("expected let / x with CRLF, got %+v", toks[:2])
	}
}

func TestBackslashEscapeInString(t *testing.T) {
	toks := lex(`"a\\b"`)
	if toks[0].Segments[0].Value != "a\\b" {
		t.Fatalf("expected 'a\\b' (one backslash), got %q", toks[0].Segments[0].Value)
	}
}

func TestQuoteEscapeInString(t *testing.T) {
	toks := lex(`"a\"b"`)
	if toks[0].Segments[0].Value != `a"b` {
		t.Fatalf("expected 'a\"b', got %q", toks[0].Segments[0].Value)
	}
}

func TestTabEscapeInChar(t *testing.T) {
	toks := lex(`'\t'`)
	if toks[0].Value != "\t" {
		t.Fatalf("expected TAB, got %q", toks[0].Value)
	}
}

func TestZeroEscape(t *testing.T) {
	toks := lex(`'\0'`)
	if toks[0].Value != "\x00" {
		t.Fatalf("expected NUL, got %q", toks[0].Value)
	}
}

func TestUnicodeEscape(t *testing.T) {
	toks := lex(`'\u{41}'`)
	if toks[0].Value != "A" {
		t.Fatalf("expected 'A' (U+0041), got %q", toks[0].Value)
	}
}

func TestAsciiLettersAreIdents(t *testing.T) {
	for _, s := range []string{"abc", "ABC", "Abc"} {
		toks := lex(s)
		if toks[0].Kind != TokenIdent || toks[0].Value != s {
			t.Errorf("expected Ident(%s), got %+v", s, toks[0])
		}
	}
}

func TestNumbersAreNotKeywords(t *testing.T) {
	toks := lex("1234")
	if toks[0].Kind != TokenInt {
		t.Fatalf("expected Int, got %+v", toks[0])
	}
}

func TestFStringWithoutInterpIsString(t *testing.T) {
	toks := lex(`f"no interp"`)
	if toks[0].Kind != TokenString || len(toks[0].Segments) != 1 || toks[0].Segments[0].Kind != "text" {
		t.Fatalf("expected plain text segment, got %+v", toks[0].Segments)
	}
}

func TestTokenValuesHelper(t *testing.T) {
	got := strings.Join(tokenValues(lex("a + b")), ",")
	if got != "a,+,b" {
		t.Fatalf("expected 'a,+,b', got %s", got)
	}
}

func TestNumberWithDotDot(t *testing.T) {
	// 1..2 — should parse as Int(1), Punct(..), Int(2) (not Float).
	toks := lex("1..2")
	if toks[0].Kind != TokenInt || toks[0].Value != "1" {
		t.Fatalf("expected Int(1), got %+v", toks[0])
	}
	if toks[1].Kind != TokenPunct || toks[1].Value != ".." {
		t.Fatalf("expected Punct(..), got %+v", toks[1])
	}
	if toks[2].Kind != TokenInt || toks[2].Value != "2" {
		t.Fatalf("expected Int(2), got %+v", toks[2])
	}
}

func TestNumberWithRangeInclusive(t *testing.T) {
	toks := lex("0..=5")
	if toks[1].Kind != TokenPunct || toks[1].Value != "..=" {
		t.Fatalf("expected Punct(..=), got %+v", toks[1])
	}
}

func TestArrowVsMinus(t *testing.T) {
	toks := lex("a -> b")
	if toks[1].Kind != TokenPunct || toks[1].Value != "->" {
		t.Fatalf("expected Punct(->), got %+v", toks[1])
	}
}

func TestFatArrow(t *testing.T) {
	toks := lex("a => b")
	if toks[1].Kind != TokenPunct || toks[1].Value != "=>" {
		t.Fatalf("expected Punct(=>), got %+v", toks[1])
	}
}

func TestPathOperator(t *testing.T) {
	toks := lex("Foo::Bar")
	if toks[1].Kind != TokenPunct || toks[1].Value != "::" {
		t.Fatalf("expected Punct(::), got %+v", toks[1])
	}
}

func TestOrAndAnd(t *testing.T) {
	toks := lex("a || b && c")
	if toks[1].Value != "||" {
		t.Fatalf("expected ||, got %+v", toks[1])
	}
	if toks[3].Value != "&&" {
		t.Fatalf("expected &&, got %+v", toks[3])
	}
}

func TestComparisonOps(t *testing.T) {
	for _, p := range []string{"==", "!=", "<=", ">=", "<", ">"} {
		toks := lex(p)
		if toks[0].Value != p {
			t.Errorf("expected %s, got %q", p, toks[0].Value)
		}
	}
}

func TestCompoundAssign(t *testing.T) {
	for _, p := range []string{"+=", "-=", "*=", "/=", "%="} {
		toks := lex(p)
		if toks[0].Value != p {
			t.Errorf("expected %s, got %q", p, toks[0].Value)
		}
	}
}

func TestShiftOps(t *testing.T) {
	for _, p := range []string{"<<", ">>"} {
		toks := lex(p)
		if toks[0].Value != p {
			t.Errorf("expected %s, got %q", p, toks[0].Value)
		}
	}
}

func TestUnknownEscape(t *testing.T) {
	// Unknown escape falls back to the literal character.
	toks := lex(`'\q'`)
	if toks[0].Value != "q" {
		t.Fatalf("expected 'q' (literal), got %q", toks[0].Value)
	}
}

func TestIdentifierWithNonAscii(t *testing.T) {
	toks := lex("café")
	if toks[0].Kind != TokenIdent || toks[0].Value != "café" {
		t.Fatalf("expected Ident(café), got %+v", toks[0])
	}
}

func TestLambdaKeyword(t *testing.T) {
	toks := lex("fn (x) -> int { x }")
	if toks[0].Kind != TokenKeyword || toks[0].Value != "fn" {
		t.Fatalf("expected Keyword(fn), got %+v", toks[0])
	}
}

func TestEofValueIsEmpty(t *testing.T) {
	toks := lex("")
	if toks[0].Value != "" {
		t.Fatalf("expected EOF Value == '', got %q", toks[0].Value)
	}
}

func TestErrorTokenEmitted(t *testing.T) {
	toks, errs := TokenizeWithErrors("\x01", "<test>")
	if len(errs) == 0 {
		t.Fatalf("expected at least one error")
	}
	hasErrorTok := false
	for _, t := range toks {
		if t.Kind == TokenError {
			hasErrorTok = true
			break
		}
	}
	if !hasErrorTok {
		t.Fatalf("expected an Error token in the stream")
	}
}

func TestMultipleErrors(t *testing.T) {
	_, errs := TokenizeWithErrors("\x01 \x02 \x03", "<test>")
	if len(errs) < 3 {
		t.Fatalf("expected at least 3 errors, got %d", len(errs))
	}
}

func TestTokenizeNoErrors(t *testing.T) {
	toks, errs := TokenizeWithErrors("let x = 1;", "<test>")
	if len(errs) != 0 {
		t.Fatalf("expected no errors, got %d", len(errs))
	}
	if len(toks) != 6 {
		t.Fatalf("expected 6 tokens, got %d", len(toks))
	}
}

func TestTokenizeRaises(t *testing.T) {
	_, err := Tokenize("\x01", "<test>")
	if err == nil {
		t.Fatalf("expected error from Tokenize on bad input")
	}
}

func TestTokenizeHappyPath(t *testing.T) {
	toks, err := Tokenize("let x = 1;", "<test>")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(toks) != 6 {
		t.Fatalf("expected 6 tokens, got %d", len(toks))
	}
}

func TestPunctSortedLongestFirst(t *testing.T) {
	// Sanity-check that the punctSorted table puts longer operators first.
	for i := 1; i < len(punctSorted); i++ {
		if len(punctSorted[i]) > len(punctSorted[i-1]) {
			t.Errorf("punctSorted not sorted desc: %q at %d longer than %q at %d",
				punctSorted[i], i, punctSorted[i-1], i-1)
		}
	}
}

func TestUnderscoreInFloat(t *testing.T) {
	toks := lex("1_000.5")
	if toks[0].Kind != TokenFloat || toks[0].Value != "1000.5" {
		t.Fatalf("expected Float(1000.5), got %+v", toks[0])
	}
}

func TestUnderscoreInHex(t *testing.T) {
	toks := lex("0xff_ff")
	if toks[0].Kind != TokenHex || toks[0].Value != "0xffff" {
		t.Fatalf("expected Hex(0xffff), got %+v", toks[0])
	}
}

func TestJustZero(t *testing.T) {
	toks := lex("0")
	if toks[0].Kind != TokenInt || toks[0].Value != "0" {
		t.Fatalf("expected Int(0), got %+v", toks[0])
	}
}

func TestNegativeNumberIsUnary(t *testing.T) {
	// `-5` should lex as Punct(-) then Int(5) — the lexer does not
	// parse signed literals; the parser handles the unary operator.
	toks := lex("-5")
	if toks[0].Kind != TokenPunct || toks[0].Value != "-" {
		t.Fatalf("expected Punct(-), got %+v", toks[0])
	}
	if toks[1].Kind != TokenInt || toks[1].Value != "5" {
		t.Fatalf("expected Int(5), got %+v", toks[1])
	}
}

func TestSelfKeyword(t *testing.T) {
	toks := lex("self")
	if toks[0].Kind != TokenKeyword || toks[0].Value != "self" {
		t.Fatalf("expected Keyword(self), got %+v", toks[0])
	}
}

func TestTrueFalseKeywords(t *testing.T) {
	for _, kw := range []string{"true", "false"} {
		toks := lex(kw)
		if toks[0].Kind != TokenKeyword || toks[0].Value != kw {
			t.Errorf("expected Keyword(%s), got %+v", kw, toks[0])
		}
	}
}

func TestUnitKeyword(t *testing.T) {
	toks := lex("unit")
	if toks[0].Kind != TokenKeyword || toks[0].Value != "unit" {
		t.Fatalf("expected Keyword(unit), got %+v", toks[0])
	}
}

func TestRangeKeyword(t *testing.T) {
	toks := lex("range(0, 10)")
	if toks[0].Kind != TokenKeyword || toks[0].Value != "range" {
		t.Fatalf("expected Keyword(range), got %+v", toks[0])
	}
}

func TestAsKeyword(t *testing.T) {
	toks := lex("x as int")
	if toks[1].Kind != TokenKeyword || toks[1].Value != "as" {
		t.Fatalf("expected Keyword(as), got %+v", toks[1])
	}
}
