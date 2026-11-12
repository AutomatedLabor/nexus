// Package aether_compiler is a Go port of the Aether compiler
// front-end (lexer + parser). This file mirrors
// aether/core/lexer/lexer.ts token-for-token.
package aether_compiler

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ----------------------------------------------------------------------------
// Token model
// ----------------------------------------------------------------------------

// TokenKind enumerates the kinds of tokens produced by the lexer.
type TokenKind string

const (
	TokenInt     TokenKind = "Int"
	TokenFloat   TokenKind = "Float"
	TokenHex     TokenKind = "Hex"
	TokenBinary  TokenKind = "Binary"
	TokenOctal   TokenKind = "Octal"
	TokenChar    TokenKind = "Char"
	TokenString  TokenKind = "String"
	TokenIdent   TokenKind = "Ident"
	TokenKeyword TokenKind = "Keyword"
	TokenPunct   TokenKind = "Punct"
	TokenEof     TokenKind = "Eof"
	TokenError   TokenKind = "Error"
)

// Token is one lexical token from the Aether source.
type Token struct {
	Kind     TokenKind
	Value    string          // raw source slice; empty for String tokens
	Segments []StringSegment // populated for String tokens
	Loc      SourceLocation
}

// LexError is a lexer diagnostic, kept alongside the tokens so the
// caller can collect all errors before bailing.
type LexError struct {
	Message string
	Loc     SourceLocation
}

// Error implements the error interface so LexError values can be
// returned (and raised) by callers who want exception-style errors.
func (e *LexError) Error() string {
	return e.Message
}

// ----------------------------------------------------------------------------
// Keyword + operator tables
// ----------------------------------------------------------------------------

var keywords = map[string]bool{
	"let": true, "mut": true, "const": true, "fn": true, "enum": true,
	"struct": true, "type": true, "match": true, "if": true, "else": true,
	"while": true, "for": true, "in": true, "return": true, "break": true,
	"continue": true, "print": true, "true": true, "false": true,
	"unit": true, "self": true, "as": true, "range": true, "import": true,
	"pub": true, "use": true, "or": true, "do": true,
	// v3: trait / impl / dyn
	"trait": true, "impl": true, "dyn": true,
	// v3-borrow: move expression (RFC-004)
	"move": true,
}

// All multi/single-character operators, sorted by descending length
// at init time so the longest match wins.
var punctSorted []string

// punctAll is the full list of Aether operators.
var punctAll = []string{
	"..=", "...", "..", "::", "->", "=>", "==", "!=", "<=", ">=", "&&", "||",
	"+=", "-=", "*=", "/=", "%=", "<<", ">>", "??", "?", "!", "~",
	"+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "=",
	"(", ")", "[", "]", "{", "}", ",", ";", ":", ".", "@", "#",
}

func init() {
	// Sort by descending length.
	punctSorted = make([]string, len(punctAll))
	copy(punctSorted, punctAll)
	// Simple insertion sort by length desc — list is tiny.
	for i := 1; i < len(punctSorted); i++ {
		j := i
		for j > 0 && len(punctSorted[j]) > len(punctSorted[j-1]) {
			punctSorted[j], punctSorted[j-1] = punctSorted[j-1], punctSorted[j]
			j--
		}
	}
}

// ----------------------------------------------------------------------------
// Lexer state
// ----------------------------------------------------------------------------

type lexerState struct {
	src    string
	file   string
	pos    int
	line   int
	col    int
	tokens []Token
	errors []LexError
}

func newLexerState(src, file string) *lexerState {
	return &lexerState{
		src: src, file: file,
		pos: 0, line: 1, col: 1,
		tokens: []Token{},
		errors: []LexError{},
	}
}

func (s *lexerState) cur() byte {
	if s.pos < len(s.src) {
		return s.src[s.pos]
	}
	return 0
}

func (s *lexerState) peek(n int) byte {
	if s.pos+n < len(s.src) {
		return s.src[s.pos+n]
	}
	return 0
}

// advance consumes one byte and updates line/col. We treat each
// byte as a position unit (the source is assumed to be UTF-8 — see
// the comment in scanIdent for the rune-aware identifier scan).
func (s *lexerState) advance() byte {
	c := s.src[s.pos]
	if c == '\n' {
		s.line++
		s.col = 1
	} else {
		s.col++
	}
	s.pos++
	return c
}

func (s *lexerState) posOf() Position {
	return Position{Line: s.line, Col: s.col, Offset: s.pos}
}

func (s *lexerState) locFrom(start Position) SourceLocation {
	return MakeLoc(start, s.posOf(), s.file)
}

func (s *lexerState) push(kind TokenKind, start Position, value string, segments []StringSegment) {
	t := Token{
		Kind:  kind,
		Value: value,
		Loc:   MakeLoc(start, s.posOf(), s.file),
	}
	if segments != nil {
		t.Segments = segments
	}
	s.tokens = append(s.tokens, t)
}

func (s *lexerState) err(start Position, message string) {
	loc := MakeLoc(start, s.posOf(), s.file)
	s.errors = append(s.errors, LexError{Message: message, Loc: loc})
	s.tokens = append(s.tokens, Token{Kind: TokenError, Value: "", Loc: loc})
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

// Tokenize lexes Aether source, returning the first LexError if any.
// Callers who want all errors should use TokenizeWithErrors.
func Tokenize(source string, file string) ([]Token, error) {
	tokens, errs := TokenizeWithErrors(source, file)
	if len(errs) > 0 {
		return tokens, &errs[0]
	}
	return tokens, nil
}

// TokenizeWithErrors lexes Aether source, never returning an error.
// All lexer diagnostics are collected in the second return value;
// any unrecoverable position emits a TokenError token so the parser
// can recover.
func TokenizeWithErrors(source, file string) ([]Token, []LexError) {
	s := newLexerState(source, file)
	for s.pos < len(s.src) {
		start := s.posOf()
		c := s.cur()
		// Whitespace
		if c == ' ' || c == '\t' || c == '\r' || c == '\n' {
			s.advance()
			continue
		}
		// Comments
		if c == '/' && s.peek(1) == '/' {
			s.skipLineComment()
			continue
		}
		if c == '/' && s.peek(1) == '*' {
			s.skipBlockComment(start)
			continue
		}
		// Numbers
		if isDigit(c) || (c == '.' && isDigit(s.peek(1)) && !s.prevIsAtom()) {
			s.scanNumber(start)
			continue
		}
		// Char
		if c == '\'' {
			s.scanChar(start)
			continue
		}
		// String (possibly f-string)
		if c == '"' || (c == 'f' && s.peek(1) == '"') {
			s.scanString(start)
			continue
		}
		// Identifiers / keywords (rune-aware)
		if isIdentStartByte(c) {
			s.scanIdent(start)
			continue
		}
		// Punctuation
		if s.scanPunct(start) {
			continue
		}
		// Unrecognised character
		s.err(start, fmt.Sprintf("unexpected character %q", rune(c)))
		s.advance()
	}
	// EOF
	eofPos := s.posOf()
	s.tokens = append(s.tokens, Token{Kind: TokenEof, Value: "", Loc: MakeLoc(eofPos, eofPos, s.file)})
	return s.tokens, s.errors
}

// ----------------------------------------------------------------------------
// Byte-class predicates
// ----------------------------------------------------------------------------

func isDigit(c byte) bool { return c >= '0' && c <= '9' }
func isHexDigit(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}
func isBinDigit(c byte) bool { return c == '0' || c == '1' }
func isOctDigit(c byte) bool { return c >= '0' && c <= '7' }

// isIdentStartByte reports whether c may begin an Aether identifier.
// We accept ASCII letters, underscore, and dollar; for non-ASCII we
// fall back to decoding a rune and checking unicode.IsLetter.
func isIdentStartByte(c byte) bool {
	if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '$' {
		return true
	}
	if c < 0x80 {
		return false
	}
	r, _ := utf8.DecodeRuneInString(string(c))
	return unicode.IsLetter(r) || r == '_'
}

// isIdentContRune reports whether r may appear after the first
// character of an identifier.
func isIdentContRune(r rune) bool {
	if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
		(r >= '0' && r <= '9') || r == '_' || r == '$' {
		return true
	}
	return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_'
}

// prevIsAtom returns true if the previous token is something that,
// if followed by `.`, must be treated as field access rather than
// the start of a float literal.
func (s *lexerState) prevIsAtom() bool {
	if len(s.tokens) == 0 {
		return false
	}
	prev := s.tokens[len(s.tokens)-1]
	switch prev.Kind {
	case TokenIdent, TokenChar, TokenString:
		return true
	case TokenInt, TokenFloat, TokenHex, TokenBinary, TokenOctal:
		return true
	case TokenPunct:
		return prev.Value == ")" || prev.Value == "]"
	case TokenKeyword:
		return prev.Value == "true" || prev.Value == "false" ||
			prev.Value == "self" || prev.Value == "unit"
	}
	return false
}

// ----------------------------------------------------------------------------
// Comment skippers
// ----------------------------------------------------------------------------

func (s *lexerState) skipLineComment() {
	for s.pos < len(s.src) && s.cur() != '\n' {
		s.advance()
	}
}

func (s *lexerState) skipBlockComment(start Position) {
	s.advance() // consume /
	s.advance() // consume *
	depth := 1
	for s.pos < len(s.src) && depth > 0 {
		if s.cur() == '/' && s.peek(1) == '*' {
			s.advance()
			s.advance()
			depth++
		} else if s.cur() == '*' && s.peek(1) == '/' {
			s.advance()
			s.advance()
			depth--
		} else {
			s.advance()
		}
	}
	if depth > 0 {
		s.err(start, "unterminated block comment")
	}
}

// ----------------------------------------------------------------------------
// Numbers
// ----------------------------------------------------------------------------

func (s *lexerState) scanNumber(start Position) {
	var raw strings.Builder
	// Hex / binary / octal prefixes.
	if s.cur() == '0' && (s.peek(1) == 'x' || s.peek(1) == 'X') {
		s.advance()
		s.advance()
		for s.pos < len(s.src) && (isHexDigit(s.cur()) || s.cur() == '_') {
			raw.WriteByte(s.advance())
		}
		s.push(TokenHex, start, "0x"+stripUnderscores(raw.String()), nil)
		return
	}
	if s.cur() == '0' && (s.peek(1) == 'b' || s.peek(1) == 'B') {
		s.advance()
		s.advance()
		for s.pos < len(s.src) && (isBinDigit(s.cur()) || s.cur() == '_') {
			raw.WriteByte(s.advance())
		}
		s.push(TokenBinary, start, "0b"+stripUnderscores(raw.String()), nil)
		return
	}
	if s.cur() == '0' && (s.peek(1) == 'o' || s.peek(1) == 'O') {
		s.advance()
		s.advance()
		for s.pos < len(s.src) && (isOctDigit(s.cur()) || s.cur() == '_') {
			raw.WriteByte(s.advance())
		}
		s.push(TokenOctal, start, "0o"+stripUnderscores(raw.String()), nil)
		return
	}
	// Decimal int / float.
	isFloat := false
	enteredExp := false
	for s.pos < len(s.src) && (isDigit(s.cur()) || s.cur() == '_') {
		raw.WriteByte(s.advance())
	}
	// Fractional part.
	if s.cur() == '.' && isDigit(s.peek(1)) {
		isFloat = true
		raw.WriteByte(s.advance())
		for s.pos < len(s.src) && (isDigit(s.cur()) || s.cur() == '_') {
			raw.WriteByte(s.advance())
		}
	}
	// Exponent.
	if s.cur() == 'e' || s.cur() == 'E' {
		save := s.pos
		saveLine, saveCol := s.line, s.col
		enteredExp = true
		var exp strings.Builder
		exp.WriteByte(s.advance()) // e
		if s.cur() == '+' || s.cur() == '-' {
			exp.WriteByte(s.advance())
		}
		if isDigit(s.cur()) {
			isFloat = true
			for s.pos < len(s.src) && isDigit(s.cur()) {
				exp.WriteByte(s.advance())
			}
			raw.WriteString(exp.String())
		} else {
			// not an exponent; restore
			s.pos = save
			s.line = saveLine
			s.col = saveCol
		}
	}
	// Reject identifiers glued onto numbers (e.g. "12abc").
	if s.pos < len(s.src) && isIdentStartByte(s.cur()) && !isDigit(s.cur()) {
		isExpChar := s.cur() == 'e' || s.cur() == 'E'
		if !isExpChar || !enteredExp {
			for s.pos < len(s.src) {
				r, size := utf8.DecodeRuneInString(s.src[s.pos:])
				if !isIdentContRune(r) {
					break
				}
				for i := 0; i < size; i++ {
					raw.WriteByte(s.advance())
				}
			}
			s.err(start, fmt.Sprintf("invalid number literal %q", raw.String()))
			return
		}
	}
	kind := TokenInt
	if isFloat {
		kind = TokenFloat
	}
	s.push(kind, start, stripUnderscores(raw.String()), nil)
}

func stripUnderscores(s string) string {
	return strings.ReplaceAll(s, "_", "")
}

// ----------------------------------------------------------------------------
// Characters
// ----------------------------------------------------------------------------

func (s *lexerState) scanEscape() string {
	c := s.advance()
	switch c {
	case 'n':
		return "\n"
	case 'r':
		return "\r"
	case 't':
		return "\t"
	case '0':
		return "\x00"
	case '\\':
		return "\\"
	case '\'':
		return "'"
	case '"':
		return "\""
	case 'u':
		// \u{HEX}
		hex := strings.Builder{}
		if s.cur() == '{' {
			s.advance()
			for s.pos < len(s.src) && s.cur() != '}' && hex.Len() < 8 {
				hex.WriteByte(s.advance())
			}
			if s.cur() == '}' {
				s.advance()
			}
		}
		// Parse hex code point.
		var code int
		if hex.Len() > 0 {
			_, err := fmt.Sscanf(hex.String(), "%x", &code)
			if err != nil {
				return ""
			}
		}
		if code < 0 || code > 0x10FFFF {
			return ""
		}
		return string(rune(code))
	}
	return string(c)
}

func (s *lexerState) scanChar(start Position) {
	s.advance() // consume opening '
	if s.pos >= len(s.src) {
		s.err(start, "unterminated char literal")
		return
	}
	var value string
	if s.cur() == '\\' {
		s.advance()
		value = s.scanEscape()
	} else if s.cur() == '\'' {
		s.err(start, "empty char literal")
		s.advance()
		return
	} else {
		value = string(s.advance())
	}
	if s.cur() != '\'' {
		s.err(start, "unterminated char literal")
		return
	}
	s.advance() // consume closing '
	s.push(TokenChar, start, value, nil)
}

// ----------------------------------------------------------------------------
// Strings (with interpolation)
// ----------------------------------------------------------------------------

func (s *lexerState) scanString(start Position) {
	isF := false
	if s.cur() == 'f' {
		isF = true
		s.advance()
	}
	s.advance() // consume opening "
	segments := []StringSegment{}
	var text strings.Builder
	for s.pos < len(s.src) && s.cur() != '"' {
		c := s.cur()
		if c == '\\' {
			s.advance()
			text.WriteString(s.scanEscape())
			continue
		}
		if isF && c == '{' {
			if text.Len() > 0 {
				segments = append(segments, StringSegment{Kind: "text", Value: text.String()})
				text.Reset()
			}
			s.advance() // consume {
			depth := 1
			var inner strings.Builder
			for s.pos < len(s.src) && depth > 0 {
				c2 := s.cur()
				if c2 == '{' {
					depth++
					inner.WriteByte(s.advance())
					continue
				}
				if c2 == '}' {
					depth--
					if depth == 0 {
						s.advance()
						break
					}
					inner.WriteByte(s.advance())
					continue
				}
				if c2 == '"' {
					// consume nested string verbatim
					inner.WriteByte(s.advance())
					for s.pos < len(s.src) && s.cur() != '"' {
						if s.cur() == '\\' {
							inner.WriteByte(s.advance())
							inner.WriteByte(s.advance())
							continue
						}
						inner.WriteByte(s.advance())
					}
					if s.pos < len(s.src) {
						inner.WriteByte(s.advance())
					}
					continue
				}
				inner.WriteByte(s.advance())
			}
			if depth > 0 {
				s.err(start, "unterminated string interpolation")
				return
			}
			segments = append(segments, StringSegment{Kind: "interp", Value: inner.String()})
			continue
		}
		text.WriteByte(s.advance())
	}
	if text.Len() > 0 {
		segments = append(segments, StringSegment{Kind: "text", Value: text.String()})
	}
	if s.pos >= len(s.src) {
		s.err(start, "unterminated string literal")
		return
	}
	s.advance() // consume closing "
	s.push(TokenString, start, "", segments)
}

// ----------------------------------------------------------------------------
// Identifiers / keywords
// ----------------------------------------------------------------------------

func (s *lexerState) scanIdent(start Position) {
	var raw strings.Builder
	for s.pos < len(s.src) {
		r, size := utf8.DecodeRuneInString(s.src[s.pos:])
		if !isIdentContRune(r) {
			break
		}
		for i := 0; i < size; i++ {
			raw.WriteByte(s.advance())
		}
	}
	name := raw.String()
	if keywords[name] {
		s.push(TokenKeyword, start, name, nil)
	} else {
		s.push(TokenIdent, start, name, nil)
	}
}

// ----------------------------------------------------------------------------
// Punctuation (longest-match)
// ----------------------------------------------------------------------------

func (s *lexerState) startsWithAt(p string) bool {
	if s.pos+len(p) > len(s.src) {
		return false
	}
	return s.src[s.pos:s.pos+len(p)] == p
}

func (s *lexerState) scanPunct(start Position) bool {
	for _, p := range punctSorted {
		if s.startsWithAt(p) {
			for i := 0; i < len(p); i++ {
				s.advance()
			}
			s.push(TokenPunct, start, p, nil)
			return true
		}
	}
	return false
}

// ----------------------------------------------------------------------------
// Predicate helpers (mirror the TS IsKeyword / IsPunct)
// ----------------------------------------------------------------------------

// IsKeyword reports whether t is a Keyword token with the given value.
func IsKeyword(t Token, kw string) bool {
	return t.Kind == TokenKeyword && t.Value == kw
}

// IsPunct reports whether t is a Punct token with the given value.
func IsPunct(t Token, p string) bool {
	return t.Kind == TokenPunct && t.Value == p
}
