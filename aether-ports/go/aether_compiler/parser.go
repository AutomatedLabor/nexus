// Package aether_compiler is a Go port of the Aether compiler
// front-end. This file mirrors aether/core/parser/parser.ts — a
// recursive-descent + Pratt parser that produces a *Program AST.
package aether_compiler

import (
	"fmt"
	"strconv"
	"strings"
)

// ----------------------------------------------------------------------------
// Parse result types
// ----------------------------------------------------------------------------

// ParseError is one parser diagnostic.
type ParseError struct {
	Message string
	Loc     SourceLocation
}

// Error implements error.
func (e *ParseError) Error() string { return e.Message }

// ParseResult is the outcome of parsing a token stream.
type ParseResult struct {
	Program *Program
	Errors  []ParseError
}

// ----------------------------------------------------------------------------
// Precedence (matches parser.ts exactly)
// ----------------------------------------------------------------------------

var binPrec = map[string]int{
	"||": 1,
	"&&": 2,
	"==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3,
	// Bitwise / shift — looser than add (5), tighter than range (4):
	"|": 4, "^": 4, "&": 4, "<<": 4, ">>": 4,
	"+": 5, "-": 5,
	"*": 6, "/": 6, "%": 6,
	// `as` is precedence 7 (handled specially in the binary loop)
}

const rangePrec = 4
const asPrec = 7

var primitiveTypes = map[string]bool{"int": true, "float": true, "bool": true, "string": true, "char": true}

// parseAbort is raised to abort a sub-parse for error recovery.
type parseAbort struct {
	message string
	loc     SourceLocation
}

// ----------------------------------------------------------------------------
// Parser
// ----------------------------------------------------------------------------

// Parser is a recursive-descent + Pratt parser. See module docstring.
type Parser struct {
	tokens        []Token
	pos           int
	errors        []ParseError
	file          string
	pendingDerive []string // nil unless a #[derive(...)] attribute is pending
}

// New builds a fresh parser around the given token stream.
func NewParser(tokens []Token, file string) *Parser {
	return &Parser{tokens: tokens, file: file}
}

// Parse runs the top-level parse loop.
func (p *Parser) Parse() ParseResult {
	body := []Stmt{}
	start := p.peek().Loc.Start
	for !p.atEnd() {
		stmt := p.parseStmt()
		if stmt != nil {
			body = append(body, stmt)
		}
	}
	var end Position
	if len(p.tokens) > 0 {
		end = p.tokens[len(p.tokens)-1].Loc.End
	} else {
		end = start
	}
	prog := &Program{Loc_: MakeLoc(start, end, p.file), Body: body}
	return ParseResult{Program: prog, Errors: p.errors}
}

// ----------------------------------------------------------------------------
// Token helpers
// ----------------------------------------------------------------------------

func (p *Parser) peek() Token {
	if p.pos < len(p.tokens) {
		return p.tokens[p.pos]
	}
	return Token{Kind: TokenEof, Value: "", Loc: SourceLocationZero}
}

func (p *Parser) peekN(n int) Token {
	if p.pos+n < len(p.tokens) {
		return p.tokens[p.pos+n]
	}
	return Token{Kind: TokenEof, Value: "", Loc: SourceLocationZero}
}

func (p *Parser) advance() Token {
	if p.pos < len(p.tokens) {
		t := p.tokens[p.pos]
		p.pos++
		return t
	}
	return p.peek()
}

func (p *Parser) atEnd() bool {
	return p.peek().Kind == TokenEof
}

func (p *Parser) isPunct(value string) bool {
	t := p.peek()
	if t.Kind != TokenPunct {
		return false
	}
	return t.Value == value
}

func (p *Parser) isPunctAny(values ...string) bool {
	t := p.peek()
	if t.Kind != TokenPunct {
		return false
	}
	for _, v := range values {
		if t.Value == v {
			return true
		}
	}
	return false
}

func (p *Parser) isKeyword(value string) bool {
	return IsKeyword(p.peek(), value)
}

func (p *Parser) eatPunct(value string) bool {
	if p.isPunct(value) {
		p.advance()
		return true
	}
	return false
}

func (p *Parser) eatKeyword(value string) bool {
	if p.isKeyword(value) {
		p.advance()
		return true
	}
	return false
}

func (p *Parser) expectPunct(value string) *Token {
	if p.isPunct(value) {
		t := p.advance()
		return &t
	}
	p.err(fmt.Sprintf("expected %q, found %q at %s", value, fallback(p.peek().Value), locStr(p.peek().Loc)))
	return nil
}

func (p *Parser) expectIdent() string {
	t := p.peek()
	if t.Kind == TokenIdent {
		p.advance()
		return t.Value
	}
	p.err(fmt.Sprintf("expected identifier, found %q at %s", fallback(t.Value), locStr(t.Loc)))
	return "_"
}

func (p *Parser) err(message string) {
	p.errors = append(p.errors, ParseError{Message: message, Loc: p.peek().Loc})
}

func (p *Parser) errAt(message string, loc SourceLocation) {
	p.errors = append(p.errors, ParseError{Message: message, Loc: loc})
}

func (p *Parser) recover() {
	for !p.atEnd() {
		t := p.advance()
		if t.Kind == TokenPunct && (t.Value == ";" || t.Value == "}") {
			return
		}
	}
}

func (p *Parser) locFrom(start SourceLocation) SourceLocation {
	if p.pos > 0 {
		end := p.tokens[p.pos-1].Loc.End
		return MakeLoc(start.Start, end, p.file)
	}
	return MakeLoc(start.Start, start.End, p.file)
}

func fallback(v string) string {
	if v == "" {
		return "<eof>"
	}
	return v
}

func locStr(loc SourceLocation) string {
	return fmt.Sprintf("%d:%d", loc.Start.Line, loc.Start.Col)
}

// ----------------------------------------------------------------------------
// Top-level statements
// ----------------------------------------------------------------------------

func (p *Parser) parseStmt() (out Stmt) {
	start := p.peek().Loc
	defer func() {
		if r := recover(); r != nil {
			if pa, ok := r.(parseAbort); ok {
				p.errAt(pa.message, pa.loc)
				p.recover()
				out = nil
				return
			}
			panic(r) // re-raise
		}
	}()

	if p.isPunct("#") {
		p.parseDeriveAttribute()
		return p.parseStmt()
	}
	if p.isKeyword("let") {
		return p.parseLet()
	}
	if p.isKeyword("const") {
		return p.parseConst()
	}
	if p.isKeyword("fn") {
		return p.parseFnOrLambda()
	}
	if p.isKeyword("enum") {
		return p.parseEnum()
	}
	if p.isKeyword("struct") {
		return p.parseStruct()
	}
	if p.isKeyword("type") {
		return p.parseTypeAlias()
	}
	if p.isKeyword("trait") {
		return p.parseTrait()
	}
	if p.isKeyword("impl") {
		return p.parseImpl()
	}
	if p.isKeyword("return") {
		return p.parseReturn()
	}
	if p.isKeyword("break") {
		p.advance()
		p.expectPunct(";")
		return &Break{Loc_: p.locFrom(start)}
	}
	if p.isKeyword("continue") {
		p.advance()
		p.expectPunct(";")
		return &Continue{Loc_: p.locFrom(start)}
	}
	if p.isKeyword("while") {
		return p.parseWhile()
	}
	if p.isKeyword("for") {
		return p.parseFor()
	}
	if p.isKeyword("import") {
		return p.parseImport()
	}
	if p.isKeyword("pub") {
		return p.parsePub()
	}
	if p.isKeyword("print") {
		return p.parsePrint()
	}
	return p.parseExprOrAssignStmt()
}

func (p *Parser) parseDeriveAttribute() {
	p.expectPunct("#")
	p.expectPunct("[")
	nameTok := p.advance()
	if nameTok.Value != "derive" {
		p.errAt(fmt.Sprintf("expected 'derive' attribute, found %q", nameTok.Value), nameTok.Loc)
		for !p.isPunct("]") && !p.atEnd() {
			p.advance()
		}
		p.eatPunct("]")
		return
	}
	p.expectPunct("(")
	var names []string
	if !p.isPunct(")") {
		for {
			if p.isPunct(")") {
				break
			}
			t := p.advance()
			if t.Kind == TokenIdent {
				names = append(names, t.Value)
			} else {
				p.errAt(fmt.Sprintf("expected trait name in derive, found %q", t.Value), t.Loc)
			}
			if !p.eatPunct(",") {
				break
			}
		}
	}
	p.expectPunct(")")
	p.expectPunct("]")
	p.pendingDerive = names
}

func (p *Parser) consumePendingDerive() []string {
	d := p.pendingDerive
	p.pendingDerive = nil
	return d
}

// ----------------------------------------------------------------------------
// Trait / impl
// ----------------------------------------------------------------------------

func (p *Parser) parseTrait() Stmt {
	start := p.peek().Loc
	p.advance() // trait
	name := p.expectIdent()
	typeParams := p.parseTypeParams()
	var superTraits []string
	if p.eatPunct(":") {
		for {
			if p.isPunct("{") {
				break
			}
			t := p.advance()
			if t.Kind == TokenIdent {
				superTraits = append(superTraits, t.Value)
			} else {
				p.errAt(fmt.Sprintf("expected super-trait name, found %q", t.Value), t.Loc)
			}
			if !p.eatPunct("+") {
				break
			}
		}
	}
	p.expectPunct("{")
	var methods []TraitMethodDecl
	var assocTypes []TraitAssocTypeDecl
	for !p.isPunct("}") && !p.atEnd() {
		if p.isKeyword("type") {
			tStart := p.peek().Loc
			p.advance()
			tName := p.expectIdent()
			bound := ""
			if p.eatPunct(":") {
				bound = p.advance().Value
			}
			p.expectPunct(";")
			assocTypes = append(assocTypes, TraitAssocTypeDecl{Name: tName, Bound: bound, Loc: p.locFrom(tStart)})
			continue
		}
		if p.isKeyword("fn") {
			mStart := p.peek().Loc
			p.advance()
			mName := p.expectIdent()
			params := p.parseParams()
			var ret TypeNode
			if p.eatPunct("->") {
				ret = p.parseType()
			}
			hasDefault := false
			var body *Block
			if p.isPunct("{") {
				b := p.parseBlock()
				body = &b
				hasDefault = true
			} else {
				p.expectPunct(";")
			}
			methods = append(methods, TraitMethodDecl{
				Loc: p.locFrom(mStart), Name: mName, Params: params,
				Ret: ret, HasDefault: hasDefault, Body: body,
			})
			continue
		}
		p.err(fmt.Sprintf("expected 'fn' or 'type' inside trait body, found %q", p.peek().Value))
		p.recover()
	}
	p.expectPunct("}")
	return &TraitDecl{
		Loc_: p.locFrom(start), Name: name, TypeParams: typeParams,
		SuperTraits: superTraits, Methods: methods, AssocTypes: assocTypes,
	}
}

func (p *Parser) parseImpl() Stmt {
	start := p.peek().Loc
	p.advance() // impl
	typeParams := p.parseTypeParams()
	traitNameTok := p.advance()
	if traitNameTok.Kind != TokenIdent {
		p.errAt(fmt.Sprintf("expected trait name after 'impl', found %q", traitNameTok.Value), traitNameTok.Loc)
	}
	var traitTypeArgs []TypeNode
	if p.isPunct("<") {
		p.advance()
		var args []TypeNode
		if !p.isPunct(">") {
			for {
				if p.isPunct(">") {
					break
				}
				args = append(args, p.parseType())
				if !p.eatPunct(",") {
					break
				}
			}
		}
		p.expectPunct(">")
		traitTypeArgs = args
	}
	if !p.eatKeyword("for") {
		p.err(fmt.Sprintf("expected 'for' in impl block, found %q at %s", p.peek().Value, locStr(p.peek().Loc)))
	}
	implType := p.parseType()
	p.expectPunct("{")
	var methods []ImplMethodDecl
	var assocTypes []ImplAssocTypeDecl
	for !p.isPunct("}") && !p.atEnd() {
		if p.isKeyword("type") {
			tStart := p.peek().Loc
			p.advance()
			tName := p.expectIdent()
			p.expectPunct("=")
			tType := p.parseType()
			p.expectPunct(";")
			assocTypes = append(assocTypes, ImplAssocTypeDecl{Name: tName, Type: tType, Loc: p.locFrom(tStart)})
			continue
		}
		if p.isKeyword("fn") {
			mStart := p.peek().Loc
			p.advance()
			mName := p.expectIdent()
			params := p.parseParams()
			var ret TypeNode
			if p.eatPunct("->") {
				ret = p.parseType()
			}
			body := p.parseBlock()
			methods = append(methods, ImplMethodDecl{
				Loc: p.locFrom(mStart), Name: mName, Params: params,
				Ret: ret, Body: body,
			})
			continue
		}
		p.err(fmt.Sprintf("expected 'fn' or 'type' inside impl body, found %q", p.peek().Value))
		p.recover()
	}
	p.expectPunct("}")
	return &ImplBlock{
		Loc_: p.locFrom(start), TraitName: traitNameTok.Value,
		TraitTypeArgs: traitTypeArgs, ImplType: implType,
		TypeParams: typeParams, Methods: methods, AssocTypes: assocTypes,
	}
}

// ----------------------------------------------------------------------------
// let / const / fn / enum / struct / type
// ----------------------------------------------------------------------------

func (p *Parser) parseLet() Stmt {
	start := p.peek().Loc
	p.advance() // let
	mutable := false
	if p.isKeyword("mut") {
		p.advance()
		mutable = true
	}
	name := p.expectIdent()
	var t TypeNode
	if p.eatPunct(":") {
		t = p.parseType()
	}
	p.expectPunct("=")
	init := p.parseExpr(true)
	p.expectPunct(";")
	loc := p.locFrom(start)
	if mutable {
		return &MutLet{Loc_: loc, Name: name, Type: t, Init: init}
	}
	return &Let{Loc_: loc, Name: name, Type: t, Init: init}
}

func (p *Parser) parseConst() Stmt {
	start := p.peek().Loc
	p.advance() // const
	name := p.expectIdent()
	var t TypeNode
	if p.eatPunct(":") {
		t = p.parseType()
	}
	p.expectPunct("=")
	init := p.parseExpr(true)
	p.expectPunct(";")
	return &Const{Loc_: p.locFrom(start), Name: name, Type: t, Init: init}
}

func (p *Parser) parseFnOrLambda() Stmt {
	start := p.peek().Loc
	p.advance() // fn
	if p.peek().Kind == TokenIdent {
		name := p.advance().Value
		generics := p.parseTypeParams()
		params := p.parseParams()
		var ret TypeNode
		if p.eatPunct("->") {
			ret = p.parseType()
		}
		body := p.parseBlock()
		return &FnDecl{Loc_: p.locFrom(start), Name: name, Generics: generics, Params: params, Ret: ret, Body: &body}
	}
	// lambda used as expression statement (rare)
	p.pos-- // un-consume fn
	e := p.parseExpr(true)
	p.expectPunct(";")
	return &ExprStmt{Loc_: p.locFrom(start), Expr: e}
}

func (p *Parser) parseEnum() Stmt {
	start := p.peek().Loc
	p.advance() // enum
	name := p.expectIdent()
	generics := p.parseTypeParams()
	p.expectPunct("{")
	var variants []EnumVariantDecl
	for !p.isPunct("}") && !p.atEnd() {
		vStart := p.peek().Loc
		vName := p.expectIdent()
		if vName == "_" {
			p.recover()
			continue
		}
		if p.eatPunct("(") {
			var types []TypeNode
			if !p.isPunct(")") {
				for {
					if p.isPunct(")") {
						break
					}
					types = append(types, p.parseType())
					if !p.eatPunct(",") {
						break
					}
				}
			}
			p.expectPunct(")")
			variants = append(variants, EnumVariantDecl{Name: vName, Kind: "tuple", Types: types, Loc: p.locFrom(vStart)})
		} else if p.eatPunct("{") {
			var fields []StructField
			if !p.isPunct("}") {
				for {
					if p.isPunct("}") {
						break
					}
					fname := p.expectIdent()
					p.expectPunct(":")
					ftype := p.parseType()
					fields = append(fields, StructField{Name: fname, Type: ftype, Loc: p.locFrom(vStart)})
					if !p.eatPunct(",") {
						break
					}
				}
			}
			p.expectPunct("}")
			variants = append(variants, EnumVariantDecl{Name: vName, Kind: "struct", Fields: fields, Loc: p.locFrom(vStart)})
		} else {
			variants = append(variants, EnumVariantDecl{Name: vName, Kind: "unit", Loc: p.locFrom(vStart)})
		}
		p.eatPunct(",")
	}
	p.expectPunct("}")
	return &EnumDecl{Loc_: p.locFrom(start), Name: name, Generics: generics, Variants: variants, Derive: p.consumePendingDerive()}
}

func (p *Parser) parseStruct() Stmt {
	start := p.peek().Loc
	p.advance() // struct
	name := p.expectIdent()
	generics := p.parseTypeParams()
	p.expectPunct("{")
	var fields []StructField
	if !p.isPunct("}") {
		for {
			if p.isPunct("}") {
				break
			}
			fname := p.expectIdent()
			p.expectPunct(":")
			ftype := p.parseType()
			fields = append(fields, StructField{Name: fname, Type: ftype, Loc: p.locFrom(start)})
			if !p.eatPunct(",") {
				break
			}
		}
	}
	p.expectPunct("}")
	return &StructDecl{Loc_: p.locFrom(start), Name: name, Generics: generics, Fields: fields, Derive: p.consumePendingDerive()}
}

func (p *Parser) parseTypeAlias() Stmt {
	start := p.peek().Loc
	p.advance() // type
	name := p.expectIdent()
	generics := p.parseTypeParams()
	p.expectPunct("=")
	t := p.parseType()
	p.expectPunct(";")
	return &TypeAlias{Loc_: p.locFrom(start), Name: name, Generics: generics, Type: t}
}

func (p *Parser) parseReturn() Stmt {
	start := p.peek().Loc
	p.advance() // return
	var e Expr
	if !(p.isPunct(";") || p.isPunct("}") || p.atEnd()) {
		e = p.parseExpr(true)
	}
	p.expectPunct(";")
	return &Return{Loc_: p.locFrom(start), Expr: e}
}

func (p *Parser) parseWhile() Stmt {
	start := p.peek().Loc
	p.advance() // while
	cond := p.parseExpr(false)
	body := p.parseBlock()
	return &While{Loc_: p.locFrom(start), Cond: cond, Body: &body}
}

func (p *Parser) parseFor() Stmt {
	start := p.peek().Loc
	p.advance() // for
	varName := p.expectIdent()
	if !p.eatKeyword("in") {
		p.err(fmt.Sprintf("expected 'in', found %q at %s", p.peek().Value, locStr(p.peek().Loc)))
	}
	iterable := p.parseExpr(false)
	body := p.parseBlock()
	return &ForIn{Loc_: p.locFrom(start), VarName: varName, Iterable: iterable, Body: &body}
}

func (p *Parser) parseImport() Stmt {
	start := p.peek().Loc
	p.advance() // import
	path := ""
	var names []string
	if p.isPunct("{") {
		p.advance()
		for {
			if p.isPunct("}") {
				break
			}
			n := p.expectIdent()
			names = append(names, n)
			if !p.eatPunct(",") {
				break
			}
		}
		p.expectPunct("}")
		if p.peek().Kind == TokenIdent && p.peek().Value == "from" {
			p.advance()
			if p.peek().Kind == TokenString {
				path = stringSegmentsText(p.peek().Segments)
				p.advance()
			} else {
				p.err(fmt.Sprintf("expected string after from, found %q", p.peek().Value))
			}
		} else {
			p.err(fmt.Sprintf("expected 'from' after import names, found %q", p.peek().Value))
		}
	} else {
		if p.peek().Kind == TokenString {
			path = stringSegmentsText(p.peek().Segments)
			p.advance()
		} else {
			p.err(fmt.Sprintf("expected string after import, found %q", p.peek().Value))
		}
		if p.eatPunct("{") {
			for {
				if p.isPunct("}") {
					break
				}
				n := p.expectIdent()
				names = append(names, n)
				if !p.eatPunct(",") {
					break
				}
			}
			p.expectPunct("}")
		}
	}
	p.eatPunct(";")
	return &Import{Loc_: p.locFrom(start), Path: path, Names: names}
}

func (p *Parser) parsePub() Stmt {
	start := p.peek().Loc
	p.advance() // pub
	if p.isKeyword("fn") {
		d := p.parseFnOrLambda()
		if fd, ok := d.(*FnDecl); ok {
			fd.Exported = true
		}
		return d
	}
	p.err(fmt.Sprintf("expected 'fn' after 'pub', found %q", p.peek().Value))
	p.recover()
	return &ExprStmt{Loc_: p.locFrom(start), Expr: &UnitLit{Loc_: p.locFrom(start)}}
}

func (p *Parser) parsePrint() Stmt {
	start := p.peek().Loc
	p.advance() // print
	p.expectPunct("(")
	e := p.parseExpr(true)
	p.expectPunct(")")
	p.expectPunct(";")
	return &Print{Loc_: p.locFrom(start), Expr: e}
}

func (p *Parser) parseExprOrAssignStmt() Stmt {
	start := p.peek().Loc
	e := p.parseExpr(true)
	if p.isPunct("=") {
		p.advance()
		value := p.parseExpr(true)
		p.expectPunct(";")
		return &AssignStmt{Loc_: p.locFrom(start), Target: e, Value: value}
	}
	if p.isPunctAny("+=", "-=", "*=", "/=", "%=") {
		op := p.advance().Value[0:1]
		value := p.parseExpr(true)
		p.expectPunct(";")
		return &AssignStmt{Loc_: p.locFrom(start), Target: e, Value: &CompoundAssign{Loc_: p.locFrom(start), Op: op, Target: e, Value: value}}
	}
	p.expectPunct(";")
	return &ExprStmt{Loc_: p.locFrom(start), Expr: e}
}

// ----------------------------------------------------------------------------
// Type parameters and parameters
// ----------------------------------------------------------------------------

func (p *Parser) parseTypeParams() []TypeParam {
	var out []TypeParam
	if !p.isPunct("<") {
		return out
	}
	p.advance()
	for {
		if p.isPunct(">") {
			break
		}
		nameTok := p.advance()
		constraint := ""
		if p.eatPunct(":") {
			constraint = p.advance().Value
		}
		out = append(out, TypeParam{Name: nameTok.Value, Constraint: constraint, Loc: nameTok.Loc})
		if !p.eatPunct(",") {
			break
		}
	}
	p.expectPunct(">")
	return out
}

func (p *Parser) parseParams() []Param {
	var out []Param
	p.expectPunct("(")
	if !p.isPunct(")") {
		for {
			if p.isPunct(")") {
				break
			}
			start := p.peek().Loc
			nameTok := p.advance()
			if nameTok.Kind != TokenIdent && !IsKeyword(nameTok, "self") {
				p.errAt(fmt.Sprintf("expected parameter name, found %q at %s", nameTok.Value, locStr(nameTok.Loc)), nameTok.Loc)
			}
			var t TypeNode
			if p.eatPunct(":") {
				t = p.parseType()
			}
			out = append(out, Param{Name: nameTok.Value, Type: t, Loc: start})
			if !p.eatPunct(",") {
				break
			}
		}
	}
	p.expectPunct(")")
	return out
}

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

func (p *Parser) parseType() TypeNode {
	return p.parseFuncType()
}

func (p *Parser) parseFuncType() TypeNode {
	if p.isKeyword("fn") {
		start := p.peek().Loc
		p.advance()
		p.expectPunct("(")
		var params []TypeNode
		if !p.isPunct(")") {
			for {
				if p.isPunct(")") {
					break
				}
				params = append(params, p.parseType())
				if !p.eatPunct(",") {
					break
				}
			}
		}
		p.expectPunct(")")
		p.expectPunct("->")
		ret := p.parseType()
		return &FuncType{Loc_: p.locFrom(start), Params: params, Ret: ret}
	}
	return p.parsePrimaryType()
}

func (p *Parser) parsePrimaryType() TypeNode {
	t := p.peek()
	start := t.Loc
	if p.isPunct("(") {
		p.advance()
		if p.eatPunct(")") {
			return &UnitType{Loc_: p.locFrom(start)}
		}
		var types []TypeNode
		for {
			if p.isPunct(")") {
				break
			}
			types = append(types, p.parseType())
			if !p.eatPunct(",") {
				break
			}
		}
		p.expectPunct(")")
		return &TupleType{Loc_: p.locFrom(start), Types: types}
	}
	if p.isPunct("[") {
		p.advance()
		elem := p.parseType()
		p.expectPunct("]")
		return &ArrayType{Loc_: p.locFrom(start), Elem: elem}
	}
	if p.isKeyword("map") || (t.Kind == TokenIdent && t.Value == "map") {
		p.advance()
		p.expectPunct("[")
		key := p.parseType()
		p.expectPunct("]")
		value := p.parseType()
		return &MapType{Loc_: p.locFrom(start), Key: key, Value: value}
	}
	if p.isKeyword("option") || (t.Kind == TokenIdent && t.Value == "option") {
		p.advance()
		p.expectPunct("<")
		inner := p.parseType()
		p.expectPunct(">")
		return &OptionType{Loc_: p.locFrom(start), Inner: inner}
	}
	if p.isKeyword("result") || (t.Kind == TokenIdent && t.Value == "result") {
		p.advance()
		p.expectPunct("<")
		ok := p.parseType()
		p.expectPunct(",")
		errT := p.parseType()
		p.expectPunct(">")
		return &ResultType{Loc_: p.locFrom(start), Ok: ok, Err: errT}
	}
	if p.isKeyword("dyn") {
		p.advance()
		traitTok := p.advance()
		if traitTok.Kind != TokenIdent {
			p.errAt(fmt.Sprintf("expected trait name after 'dyn', found %q", traitTok.Value), traitTok.Loc)
		}
		return &DynType{Loc_: p.locFrom(start), TraitName: traitTok.Value}
	}
	if t.Kind == TokenIdent || t.Kind == TokenKeyword {
		name := p.advance().Value
		if primitiveTypes[name] {
			return &PrimitiveType{Loc_: p.locFrom(start), Name: name}
		}
		if name == "unit" {
			return &UnitType{Loc_: p.locFrom(start)}
		}
		if p.isPunct("<") {
			p.advance()
			var args []TypeNode
			for {
				if p.isPunct(">") {
					break
				}
				args = append(args, p.parseType())
				if !p.eatPunct(",") {
					break
				}
			}
			p.expectPunct(">")
			return &GenericType{Loc_: p.locFrom(start), Name: name, Args: args}
		}
		return &NamedType{Loc_: p.locFrom(start), Name: name}
	}
	p.err(fmt.Sprintf("expected type, found %q at %s", fallback(t.Value), locStr(t.Loc)))
	return &UnitType{Loc_: p.locFrom(start)}
}

// ----------------------------------------------------------------------------
// Patterns
// ----------------------------------------------------------------------------

func (p *Parser) parsePattern() Pattern {
	pat := p.parsePatternAtom()
	if p.isPunct("|") {
		patterns := []Pattern{pat}
		for p.eatPunct("|") {
			patterns = append(patterns, p.parsePatternAtom())
		}
		startPos := pat.Loc().Start
		var endPos Position
		if p.pos > 0 {
			endPos = p.tokens[p.pos-1].Loc.End
		} else {
			endPos = startPos
		}
		return &OrPat{Loc_: MakeLoc(startPos, endPos, p.file), Patterns: patterns}
	}
	return pat
}

func (p *Parser) parsePatternAtom() Pattern {
	t := p.peek()
	start := t.Loc
	if p.isPunct("_") || (t.Kind == TokenIdent && t.Value == "_") {
		p.advance()
		return &WildcardPat{Loc_: p.locFrom(start)}
	}
	if p.isPunct("..") {
		p.advance()
		return &RestPat{Loc_: p.locFrom(start)}
	}
	if p.isPunct("(") {
		p.advance()
		var elements []Pattern
		if !p.isPunct(")") {
			for {
				if p.isPunct(")") {
					break
				}
				elements = append(elements, p.parsePattern())
				if !p.eatPunct(",") {
					break
				}
			}
		}
		p.expectPunct(")")
		return &TuplePat{Loc_: p.locFrom(start), Elements: elements}
	}
	if p.isPunct("[") {
		p.advance()
		var elems []Pattern
		rest := -1
		if !p.isPunct("]") {
			i := 0
			for {
				if p.isPunct("]") {
					break
				}
				if p.isPunct("..") {
					p.advance()
					rest = i
				} else {
					elems = append(elems, p.parsePattern())
					i++
				}
				if !p.eatPunct(",") {
					break
				}
			}
		}
		p.expectPunct("]")
		return &ArrayPat{Loc_: p.locFrom(start), Elements: elems, Rest: rest}
	}
	if p.isKeyword("mut") {
		p.advance()
		name := p.expectIdent()
		var t TypeNode
		if p.eatPunct(":") {
			t = p.parseType()
		}
		return &BindPat{Loc_: p.locFrom(start), Name: name, Mut: true, Type: t}
	}
	if t.Kind == TokenIdent || t.Kind == TokenKeyword {
		name := p.advance().Value
		if p.isPunct("::") {
			p.advance()
			variant := p.advance().Value
			var subpatterns []Pattern
			if p.eatPunct("(") {
				if !p.isPunct(")") {
					for {
						if p.isPunct(")") {
							break
						}
						subpatterns = append(subpatterns, p.parsePattern())
						if !p.eatPunct(",") {
							break
						}
					}
				}
				p.expectPunct(")")
			}
			return &EnumPat{Loc_: p.locFrom(start), EnumName: name, Variant: variant, Subpatterns: subpatterns}
		}
		if p.isPunct("{") {
			p.advance()
			var fields []StructPatField
			hasRest := false
			if !p.isPunct("}") {
				for {
					if p.isPunct("}") {
						break
					}
					if p.isPunct("..") {
						p.advance()
						hasRest = true
						break
					}
					fname := p.expectIdent()
					var pat Pattern
					if p.eatPunct(":") {
						pat = p.parsePattern()
					} else if fname != "_" {
						pat = &BindPat{Loc_: p.locFrom(start), Name: fname}
					} else {
						pat = &WildcardPat{Loc_: p.locFrom(start)}
					}
					if fname != "_" {
						fields = append(fields, StructPatField{Name: fname, Pattern: pat, Loc: p.locFrom(start)})
					}
					if !p.eatPunct(",") {
						break
					}
				}
			}
			p.expectPunct("}")
			return &StructPat{Loc_: p.locFrom(start), Name: name, Fields: fields, Rest: hasRest}
		}
		var t TypeNode
		if p.eatPunct(":") {
			t = p.parseType()
		}
		return &BindPat{Loc_: p.locFrom(start), Name: name, Type: t}
	}
	switch t.Kind {
	case TokenInt, TokenFloat, TokenHex, TokenBinary, TokenOctal, TokenChar, TokenString:
		e := p.parseAtom(true)
		return &LitPat{Loc_: p.locFrom(start), Value: e}
	}
	if p.isKeyword("true") || p.isKeyword("false") {
		e := p.parseAtom(true)
		return &LitPat{Loc_: p.locFrom(start), Value: e}
	}
	if p.isPunct("-") {
		e := p.parseExpr(true)
		return &LitPat{Loc_: p.locFrom(start), Value: e}
	}
	p.err(fmt.Sprintf("expected pattern, found %q at %s", fallback(t.Value), locStr(t.Loc)))
	return &WildcardPat{Loc_: p.locFrom(start)}
}

// ----------------------------------------------------------------------------
// Expressions
// ----------------------------------------------------------------------------

func (p *Parser) parseExpr(allowStruct bool) Expr {
	return p.parseBinary(0, allowStruct)
}

func (p *Parser) parseBinary(minPrec int, allowStruct bool) Expr {
	left := p.parseUnary(allowStruct)
	for {
		t := p.peek()
		if t.Kind == TokenPunct {
			if prec, ok := binPrec[t.Value]; ok && prec >= minPrec {
				op := p.advance().Value
				right := p.parseBinary(prec+1, allowStruct)
				left = &Binary{Loc_: p.locFrom(left.Loc()), Op: op, Left: left, Right: right}
				left = p.applyPostfix(left, allowStruct)
				continue
			}
			if (t.Value == ".." || t.Value == "..=") && rangePrec >= minPrec {
				op := p.advance().Value
				right := p.parseBinary(rangePrec+1, allowStruct)
				left = &Range{Loc_: p.locFrom(left.Loc()), Start: left, End: right, Inclusive: op == "..="}
				continue
			}
		}
		if t.Kind == TokenKeyword && t.Value == "as" && asPrec >= minPrec {
			p.advance()
			ty := p.parseType()
			left = &As{Loc_: p.locFrom(left.Loc()), Expr: left, Type: ty}
			left = p.applyPostfix(left, allowStruct)
			continue
		}
		if t.Kind == TokenKeyword && t.Value == "or" && 0 >= minPrec {
			p.advance()
			right := p.parseBinary(1, allowStruct)
			left = &Binary{Loc_: p.locFrom(left.Loc()), Op: "or", Left: left, Right: right}
			continue
		}
		break
	}
	return left
}

func (p *Parser) parseUnary(allowStruct bool) Expr {
	t := p.peek()
	if t.Kind == TokenPunct && (t.Value == "!" || t.Value == "-" || t.Value == "~") {
		op := p.advance().Value
		operand := p.parseUnary(allowStruct)
		return &Unary{Loc_: p.locFrom(t.Loc), Op: op, Operand: operand}
	}
	if t.Kind == TokenPunct && t.Value == "&" {
		start := t.Loc
		p.advance()
		mutable := false
		if p.isKeyword("mut") {
			p.advance()
			mutable = true
		}
		operand := p.parseUnary(allowStruct)
		return &Borrow{Loc_: p.locFrom(start), Operand: operand, Mutable: mutable}
	}
	if t.Kind == TokenPunct && t.Value == "*" {
		start := t.Loc
		p.advance()
		operand := p.parseUnary(allowStruct)
		return &Deref{Loc_: p.locFrom(start), Operand: operand}
	}
	if t.Kind == TokenKeyword && t.Value == "move" {
		start := t.Loc
		p.advance()
		operand := p.parseUnary(allowStruct)
		return &Move{Loc_: p.locFrom(start), Operand: operand}
	}
	return p.parsePostfix(nil, allowStruct)
}

func (p *Parser) parsePostfix(initial Expr, allowStruct bool) Expr {
	var e Expr
	if initial != nil {
		e = initial
	} else {
		e = p.parseAtom(allowStruct)
	}
	for {
		t := p.peek()
		if t.Kind == TokenPunct && t.Value == "(" {
			start := e.Loc().Start
			p.advance()
			var args []Expr
			if !p.isPunct(")") {
				for {
					if p.isPunct(")") {
						break
					}
					args = append(args, p.parseExpr(true))
					if !p.eatPunct(",") {
						break
					}
				}
			}
			p.expectPunct(")")
			e = &Call{Loc_: MakeLoc(start, start, p.file), Callee: e, Args: args}
			continue
		}
		if t.Kind == TokenPunct && t.Value == "[" {
			start := e.Loc().Start
			p.advance()
			idx := p.parseExpr(true)
			p.expectPunct("]")
			e = &Index{Loc_: MakeLoc(start, start, p.file), Object: e, Index: idx}
			continue
		}
		if t.Kind == TokenPunct && t.Value == "." {
			start := e.Loc().Start
			p.advance()
			nxt := p.peek()
			if nxt.Kind == TokenInt {
				p.advance()
				idx, _ := strconv.ParseInt(nxt.Value, 10, 64)
				e = &TupleField{Loc_: MakeLoc(start, start, p.file), Object: e, Index: int(idx)}
				continue
			}
			name := nxt.Value
			if nxt.Kind != TokenIdent && nxt.Kind != TokenKeyword {
				p.err(fmt.Sprintf("expected field name, found %q at %s", nxt.Value, locStr(nxt.Loc)))
				break
			}
			p.advance()
			if p.isPunct("(") {
				p.advance()
				var args []Expr
				if !p.isPunct(")") {
					for {
						if p.isPunct(")") {
							break
						}
						args = append(args, p.parseExpr(true))
						if !p.eatPunct(",") {
							break
						}
					}
				}
				p.expectPunct(")")
				e = &MethodCall{Loc_: MakeLoc(start, start, p.file), Object: e, Name: name, Args: args}
			} else {
				e = &Field{Loc_: MakeLoc(start, start, p.file), Object: e, Name: name}
			}
			continue
		}
		if t.Kind == TokenPunct && t.Value == "?" {
			start := e.Loc().Start
			p.advance()
			e = &ErrorProp{Loc_: MakeLoc(start, start, p.file), Expr: e}
			continue
		}
		if allowStruct && t.Kind == TokenPunct && t.Value == "{" {
			if ident, ok := e.(*Ident); ok {
				save := p.pos
				p.advance()
				if p.isPunct("}") {
					p.advance()
					e = &StructExpr{Loc_: p.locFrom(ident.Loc_), Name: ident.Name, Fields: nil}
					continue
				}
				if p.peek().Kind == TokenIdent && p.peekN(1).Kind == TokenPunct && p.peekN(1).Value == ":" {
					var fields []StructExprField
					for {
						if p.isPunct("}") || p.isPunct("..") {
							break
						}
						fname := p.advance().Value
						p.expectPunct(":")
						value := p.parseExpr(false)
						fields = append(fields, StructExprField{Name: fname, Value: value, Loc: MakeLoc(p.peek().Loc.Start, p.peek().Loc.Start, p.file)})
						if !p.eatPunct(",") {
							break
						}
					}
					var spread Expr
					if p.isPunct("..") {
						p.advance()
						spread = p.parseExpr(false)
						p.eatPunct(",")
					}
					p.expectPunct("}")
					e = &StructExpr{Loc_: p.locFrom(ident.Loc_), Name: ident.Name, Fields: fields, Spread: spread}
					continue
				}
				p.pos = save // not a struct literal — restore and bail
				break
			}
		}
		break
	}
	return e
}

func (p *Parser) applyPostfix(e Expr, allowStruct bool) Expr {
	return p.parsePostfix(e, allowStruct)
}

func (p *Parser) parseAtom(allowStruct bool) Expr {
	t := p.peek()
	start := t.Loc
	switch t.Kind {
	case TokenInt:
		p.advance()
		v, _ := strconv.ParseInt(t.Value, 10, 64)
		return &IntLit{Loc_: p.locFrom(start), Value: v}
	case TokenFloat:
		p.advance()
		v, _ := strconv.ParseFloat(t.Value, 64)
		return &FloatLit{Loc_: p.locFrom(start), Value: v}
	case TokenHex:
		p.advance()
		v, _ := strconv.ParseInt(t.Value[2:], 16, 64)
		return &IntLit{Loc_: p.locFrom(start), Value: v}
	case TokenBinary:
		p.advance()
		v, _ := strconv.ParseInt(t.Value[2:], 2, 64)
		return &IntLit{Loc_: p.locFrom(start), Value: v}
	case TokenOctal:
		p.advance()
		v, _ := strconv.ParseInt(t.Value[2:], 8, 64)
		return &IntLit{Loc_: p.locFrom(start), Value: v}
	case TokenChar:
		p.advance()
		return &CharLit{Loc_: p.locFrom(start), Value: t.Value}
	case TokenString:
		p.advance()
		segs := p.parseStringSegments(t.Segments)
		return &StringLit{Loc_: p.locFrom(start), Segments: segs}
	case TokenKeyword:
		switch t.Value {
		case "true":
			p.advance()
			return &BoolLit{Loc_: p.locFrom(start), Value: true}
		case "false":
			p.advance()
			return &BoolLit{Loc_: p.locFrom(start), Value: false}
		case "self":
			p.advance()
			return &SelfExpr{Loc_: p.locFrom(start)}
		case "unit":
			p.advance()
			return &UnitLit{Loc_: p.locFrom(start)}
		case "fn":
			p.advance()
			params := p.parseParams()
			var ret TypeNode
			if p.eatPunct("->") {
				ret = p.parseType()
			}
			body := p.parseBlock()
			return &Lambda{Loc_: p.locFrom(start), Params: params, Ret: ret, Body: &body}
		case "return":
			p.advance()
			var e Expr
			if !(p.isPunct(";") || p.isPunct("}") || p.isPunct(")") || p.atEnd()) {
				e = p.parseExpr(true)
			}
			return &Return{Loc_: p.locFrom(start), Expr: e}
		case "if":
			return p.parseIf()
		case "match":
			return p.parseMatch()
		case "dyn":
			p.advance()
			traitTok := p.advance()
			if traitTok.Kind != TokenIdent {
				p.errAt(fmt.Sprintf("expected trait name after 'dyn', found %q", traitTok.Value), traitTok.Loc)
			}
			traitName := traitTok.Value
			if traitName == "" {
				traitName = "_"
			}
			if p.isPunct("<") {
				p.advance()
				for !p.isPunct(">") {
					p.advance()
				}
				p.expectPunct(">")
			}
			if p.isPunct("(") {
				p.advance()
				var args []Expr
				if !p.isPunct(")") {
					for {
						if p.isPunct(")") {
							break
						}
						args = append(args, p.parseExpr(true))
						if !p.eatPunct(",") {
							break
						}
					}
				}
				p.expectPunct(")")
				return &Call{Loc_: p.locFrom(start), Callee: &Ident{Loc_: p.locFrom(start), Name: "__dyn_" + traitName}, Args: args}
			}
			return &Ident{Loc_: p.locFrom(start), Name: "__dyn_" + traitName}
		case "range":
			p.advance()
			if p.isPunct("(") {
				p.advance()
				var args []Expr
				if !p.isPunct(")") {
					for {
						if p.isPunct(")") {
							break
						}
						args = append(args, p.parseExpr(true))
						if !p.eatPunct(",") {
							break
						}
					}
				}
				p.expectPunct(")")
				return &Call{Loc_: p.locFrom(start), Callee: &Ident{Loc_: p.locFrom(start), Name: "range"}, Args: args}
			}
			return &Ident{Loc_: p.locFrom(start), Name: "range"}
		}
	}
	if p.isPunct("(") {
		p.advance()
		if p.eatPunct(")") {
			return &UnitLit{Loc_: p.locFrom(start)}
		}
		e := p.parseExpr(true)
		if p.eatPunct(",") {
			elements := []Expr{e}
			for {
				if p.isPunct(")") {
					break
				}
				elements = append(elements, p.parseExpr(true))
				if !p.eatPunct(",") {
					break
				}
			}
			p.expectPunct(")")
			return &TupleExpr{Loc_: p.locFrom(start), Elements: elements}
		}
		p.expectPunct(")")
		return &Paren{Loc_: p.locFrom(start), Expr: e}
	}
	if p.isPunct("[") {
		p.advance()
		var elements []Expr
		if !p.isPunct("]") {
			for {
				if p.isPunct("]") {
					break
				}
				if p.isPunct("..") {
					p.advance()
					_ = p.parseExpr(false) // v1 ignores spread in arrays
					continue
				}
				elements = append(elements, p.parseExpr(true))
				if !p.eatPunct(",") {
					break
				}
			}
		}
		p.expectPunct("]")
		return &ArrayExpr{Loc_: p.locFrom(start), Elements: elements}
	}
	if p.isPunct("{") {
		return p.parseBraceExpr()
	}
	if t.Kind == TokenIdent {
		name := p.advance().Value
		if p.isPunct("::") {
			p.advance()
			variant := p.advance().Value
			var args []Expr
			if p.eatPunct("(") {
				if !p.isPunct(")") {
					for {
						if p.isPunct(")") {
							break
						}
						args = append(args, p.parseExpr(true))
						if !p.eatPunct(",") {
							break
						}
					}
				}
				p.expectPunct(")")
			}
			return &EnumVariant{Loc_: p.locFrom(start), EnumName: name, Variant: variant, Args: args}
		}
		if p.isPunct("<") && couldStartType(p.peekN(1)) {
			save := p.pos
			saveErrCount := len(p.errors)
			p.advance() // consume <
			var typeArgs []TypeNode
			valid := true
			func() {
				defer func() {
					if r := recover(); r != nil {
						valid = false
					}
				}()
				for {
					if p.isPunct(">") {
						break
					}
					typeArgs = append(typeArgs, p.parseType())
					if !p.eatPunct(",") {
						break
					}
				}
				if !p.eatPunct(">") {
					valid = false
				}
			}()
			errored := len(p.errors) != saveErrCount
			if valid && !errored && p.isPunct("(") {
				p.advance()
				var args []Expr
				if !p.isPunct(")") {
					for {
						if p.isPunct(")") {
							break
						}
						args = append(args, p.parseExpr(true))
						if !p.eatPunct(",") {
							break
						}
					}
				}
				p.expectPunct(")")
				return &Call{Loc_: p.locFrom(start), Callee: &Ident{Loc_: p.locFrom(start), Name: name}, Args: args, TypeArgs: typeArgs}
			}
			// not a generic call — restore
			p.errors = p.errors[:saveErrCount]
			p.pos = save
		}
		return &Ident{Loc_: p.locFrom(start), Name: name}
	}
	if t.Kind == TokenEof || t.Kind == TokenError {
		p.err(fmt.Sprintf("unexpected end of input at %s", locStr(t.Loc)))
		return &UnitLit{Loc_: p.locFrom(start)}
	}
	p.err(fmt.Sprintf("unexpected token %q at %s", t.Value, locStr(t.Loc)))
	p.advance()
	return &UnitLit{Loc_: p.locFrom(start)}
}

func (p *Parser) parseStringSegments(segments []StringSegment) []StringSegment {
	out := []StringSegment{}
	for _, seg := range segments {
		if seg.Kind == "text" {
			out = append(out, seg)
			continue
		}
		func() {
			defer func() {
				if r := recover(); r != nil {
					p.err(fmt.Sprintf("failed to parse interpolation %q: %v", seg.Value, r))
					out = append(out, seg)
				}
			}()
			tokens, errs := TokenizeWithErrors(seg.Value, p.file)
			if len(tokens) <= 1 {
				out = append(out, seg)
				return
			}
			for _, le := range errs {
				p.errors = append(p.errors, ParseError{Message: le.Message, Loc: le.Loc})
			}
			sub := NewParser(tokens, p.file)
			e := sub.parseExpr(true)
			if len(sub.errors) > 0 {
				for _, e := range sub.errors {
					p.errors = append(p.errors, e)
				}
			}
			out = append(out, StringSegment{Kind: "interp", Value: seg.Value, Expr: e})
		}()
	}
	return out
}

func (p *Parser) parseIf() Expr {
	start := p.peek().Loc
	p.advance() // if
	cond := p.parseExpr(false)
	then := p.parseBlock()
	var els Expr
	if p.eatKeyword("else") {
		if p.isKeyword("if") {
			els = p.parseIf()
		} else {
			b := p.parseBlock()
			els = &b
		}
	}
	return &If{Loc_: p.locFrom(start), Cond: cond, Then: &then, Else_: els}
}

func (p *Parser) parseMatch() Expr {
	start := p.peek().Loc
	p.advance() // match
	scrutinee := p.parseExpr(false)
	p.expectPunct("{")
	var arms []MatchArm
	for !p.isPunct("}") && !p.atEnd() {
		aStart := p.peek().Loc
		pattern := p.parsePattern()
		var guard Expr
		if p.eatKeyword("if") {
			guard = p.parseExpr(false)
		}
		p.expectPunct("=>")
		body := p.parseExpr(true)
		arms = append(arms, MatchArm{Pattern: pattern, Body: body, Loc: p.locFrom(aStart), Guard: guard})
		if !p.eatPunct(",") {
			if !p.isPunct("}") {
				p.err(fmt.Sprintf("expected ',' or '}' after match arm at %s", locStr(p.peek().Loc)))
				p.recover()
			}
		}
	}
	p.expectPunct("}")
	return &Match{Loc_: p.locFrom(start), Scrutinee: scrutinee, Arms: arms}
}

func (p *Parser) parseBlock() Block {
	start := p.peek().Loc
	p.expectPunct("{")
	var stmts []Stmt
	var trailing Expr
	for !p.isPunct("}") && !p.atEnd() {
		if p.isStmtStart() {
			s := p.parseStmt()
			if s != nil {
				stmts = append(stmts, s)
			}
			p.eatPunct(";")
			continue
		}
		e := p.parseExpr(true)
		if p.isPunct("=") {
			p.advance()
			value := p.parseExpr(true)
			p.expectPunct(";")
			stmts = append(stmts, &AssignStmt{Loc_: p.locFrom(start), Target: e, Value: value})
			continue
		}
		if p.isPunctAny("+=", "-=", "*=", "/=", "%=") {
			op := p.advance().Value[0:1]
			value := p.parseExpr(true)
			p.expectPunct(";")
			stmts = append(stmts, &AssignStmt{Loc_: p.locFrom(start), Target: e, Value: &CompoundAssign{Loc_: p.locFrom(start), Op: op, Target: e, Value: value}})
			continue
		}
		if p.isPunct(";") {
			p.advance()
			if a, ok := e.(*Assign); ok {
				stmts = append(stmts, &AssignStmt{Loc_: a.Loc_, Target: a.Target, Value: a.Value})
			} else if a, ok := e.(*CompoundAssign); ok {
				stmts = append(stmts, &AssignStmt{Loc_: a.Loc_, Target: a.Target, Value: a.Value})
			} else {
				stmts = append(stmts, &ExprStmt{Loc_: p.locFrom(start), Expr: e})
			}
			continue
		}
		if p.isPunct("}") {
			trailing = e
			break
		}
		p.err(fmt.Sprintf("expected ';' or '}' in block at %s", locStr(p.peek().Loc)))
		p.recover()
	}
	p.expectPunct("}")
	return Block{Loc_: p.locFrom(start), Stmts: stmts, Expr: trailing}
}

func (p *Parser) parseBraceExpr() Expr {
	start := p.peek().Loc
	p.advance() // {
	if p.isPunct("}") {
		p.advance()
		return &Block{Loc_: p.locFrom(start), Stmts: nil, Expr: nil}
	}
	if !p.isStmtStart() {
		first := p.parseExpr(true)
		if p.isPunct(":") {
			p.advance()
			value := p.parseExpr(true)
			entries := []MapEntry{{Key: first, Value: value, Loc: p.locFrom(start)}}
			for p.eatPunct(",") {
				if p.isPunct("}") {
					break
				}
				k := p.parseExpr(true)
				p.expectPunct(":")
				v := p.parseExpr(true)
				entries = append(entries, MapEntry{Key: k, Value: v, Loc: p.locFrom(start)})
			}
			p.expectPunct("}")
			return &MapExpr{Loc_: p.locFrom(start), Entries: entries}
		}
		var stmts []Stmt
		if p.isPunctAny("=", "+=", "-=", "*=", "/=", "%=") {
			op := p.advance().Value
			value := p.parseExpr(true)
			p.expectPunct(";")
			if op == "=" {
				stmts = append(stmts, &AssignStmt{Loc_: p.locFrom(start), Target: first, Value: value})
			} else {
				stmts = append(stmts, &AssignStmt{Loc_: p.locFrom(start), Target: first, Value: &CompoundAssign{Loc_: p.locFrom(start), Op: op[0:1], Target: first, Value: value}})
			}
		} else if p.isPunct(";") {
			p.advance()
			if a, ok := first.(*Assign); ok {
				stmts = append(stmts, &AssignStmt{Loc_: a.Loc_, Target: a.Target, Value: a.Value})
			} else if a, ok := first.(*CompoundAssign); ok {
				stmts = append(stmts, &AssignStmt{Loc_: a.Loc_, Target: a.Target, Value: a.Value})
			} else {
				stmts = append(stmts, &ExprStmt{Loc_: p.locFrom(start), Expr: first})
			}
		} else if p.isPunct("}") {
			p.advance()
			return &Block{Loc_: p.locFrom(start), Stmts: nil, Expr: first}
		} else {
			p.err(fmt.Sprintf("expected ';' or '}' in block at %s", locStr(p.peek().Loc)))
			p.recover()
		}
		var trailing Expr
		for !p.isPunct("}") && !p.atEnd() {
			if p.isStmtStart() {
				s := p.parseStmt()
				if s != nil {
					stmts = append(stmts, s)
				}
				p.eatPunct(";")
				continue
			}
			e := p.parseExpr(true)
			if p.isPunctAny("=", "+=", "-=", "*=", "/=", "%=") {
				op := p.advance().Value
				value := p.parseExpr(true)
				p.expectPunct(";")
				if op == "=" {
					stmts = append(stmts, &AssignStmt{Loc_: p.locFrom(start), Target: e, Value: value})
				} else {
					stmts = append(stmts, &AssignStmt{Loc_: p.locFrom(start), Target: e, Value: &CompoundAssign{Loc_: p.locFrom(start), Op: op[0:1], Target: e, Value: value}})
				}
			} else if p.isPunct(";") {
				p.advance()
				if a, ok := e.(*Assign); ok {
					stmts = append(stmts, &AssignStmt{Loc_: a.Loc_, Target: a.Target, Value: a.Value})
				} else if a, ok := e.(*CompoundAssign); ok {
					stmts = append(stmts, &AssignStmt{Loc_: a.Loc_, Target: a.Target, Value: a.Value})
				} else {
					stmts = append(stmts, &ExprStmt{Loc_: p.locFrom(start), Expr: e})
				}
			} else if p.isPunct("}") {
				trailing = e
				break
			} else {
				p.err(fmt.Sprintf("expected ';' or '}' in block at %s", locStr(p.peek().Loc)))
				p.recover()
			}
		}
		p.expectPunct("}")
		return &Block{Loc_: p.locFrom(start), Stmts: stmts, Expr: trailing}
	}
	// Statement-start: parse statements (mirror parseBlock).
	var stmts []Stmt
	var trailing Expr
	for !p.isPunct("}") && !p.atEnd() {
		if p.isStmtStart() {
			s := p.parseStmt()
			if s != nil {
				stmts = append(stmts, s)
			}
			p.eatPunct(";")
			continue
		}
		e := p.parseExpr(true)
		if p.isPunctAny("=", "+=", "-=", "*=", "/=", "%=") {
			op := p.advance().Value
			value := p.parseExpr(true)
			p.expectPunct(";")
			if op == "=" {
				stmts = append(stmts, &AssignStmt{Loc_: p.locFrom(start), Target: e, Value: value})
			} else {
				stmts = append(stmts, &AssignStmt{Loc_: p.locFrom(start), Target: e, Value: &CompoundAssign{Loc_: p.locFrom(start), Op: op[0:1], Target: e, Value: value}})
			}
		} else if p.isPunct(";") {
			p.advance()
			if a, ok := e.(*Assign); ok {
				stmts = append(stmts, &AssignStmt{Loc_: a.Loc_, Target: a.Target, Value: a.Value})
			} else if a, ok := e.(*CompoundAssign); ok {
				stmts = append(stmts, &AssignStmt{Loc_: a.Loc_, Target: a.Target, Value: a.Value})
			} else {
				stmts = append(stmts, &ExprStmt{Loc_: p.locFrom(start), Expr: e})
			}
		} else if p.isPunct("}") {
			trailing = e
			break
		} else {
			p.err(fmt.Sprintf("expected ';' or '}' in block at %s", locStr(p.peek().Loc)))
			p.recover()
		}
	}
	p.expectPunct("}")
	return &Block{Loc_: p.locFrom(start), Stmts: stmts, Expr: trailing}
}

func (p *Parser) isStmtStart() bool {
	t := p.peek()
	if t.Kind != TokenKeyword {
		return false
	}
	if t.Value == "fn" {
		return p.peekN(1).Kind == TokenIdent
	}
	switch t.Value {
	case "let", "const", "enum", "struct", "type", "return", "break",
		"continue", "while", "for", "import", "pub", "print",
		"trait", "impl":
		return true
	}
	return false
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

func couldStartType(t Token) bool {
	if t.Kind == TokenIdent {
		return true
	}
	if t.Kind == TokenKeyword {
		switch t.Value {
		case "fn", "map", "option", "result", "unit":
			return true
		}
		return false
	}
	if t.Kind == TokenPunct {
		return t.Value == "(" || t.Value == "["
	}
	return false
}

// stringSegmentsText concatenates all text segments of a string token
// into a single string. Used for parsing import paths.
func stringSegmentsText(segments []StringSegment) string {
	var sb strings.Builder
	for _, seg := range segments {
		if seg.Kind == "text" {
			sb.WriteString(seg.Value)
		}
	}
	return sb.String()
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

// Parse parses a token slice into a ParseResult (never panics; all
// errors are collected in result.Errors).
func Parse(tokens []Token, file string) ParseResult {
	p := NewParser(tokens, file)
	return p.Parse()
}

// ParseSource tokenises and parses a source string in one call.
func ParseSource(source, file string) ParseResult {
	tokens, _ := TokenizeWithErrors(source, file)
	return Parse(tokens, file)
}
