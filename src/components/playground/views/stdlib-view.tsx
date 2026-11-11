"use client";

import * as React from "react";
import { BookOpen, Search, FunctionSquare } from "lucide-react";
import { PageHeader } from "../ui/page-header";
import { SectionCard } from "../ui/section-card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STDLIB_MANIFEST, type StdlibModuleManifest } from "@aether/stdlib";
import { EmptyState } from "../ui/empty-state";

/** Group the 10 stdlib modules by tier for nicer presentation. */
const TIER_BY_MODULE: Record<string, string> = {
  io: "I/O",
  string: "String",
  text: "Text",
  math: "Math",
  collections: "Collections",
  datetime: "DateTime",
  regex: "Regex",
  encoding: "Encoding",
  crypto: "Crypto",
  async: "Async (host-only)",
};

export function StdlibView() {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();

  const filtered = React.useMemo<StdlibModuleManifest[]>(() => {
    if (!q) return STDLIB_MANIFEST;
    return STDLIB_MANIFEST.map((m) => ({
      ...m,
      fns: m.fns.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.sig.toLowerCase().includes(q) ||
          f.desc.toLowerCase().includes(q),
      ),
    })).filter((m) => m.fns.length > 0);
  }, [q]);

  const totalFns = STDLIB_MANIFEST.reduce((n, m) => n + m.fns.length, 0);
  const visibleFns = filtered.reduce((n, m) => n + m.fns.length, 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<BookOpen className="size-5" />}
        title="Standard Library"
        description={
          <>
            Aether ships {STDLIB_MANIFEST.length} stdlib modules and {totalFns}{" "}
            built-in functions. They are wired into the evaluator automatically —
            no import required.
          </>
        }
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search functions…"
              className="w-[220px] pl-8"
              aria-label="Search standard library functions"
            />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<FunctionSquare className="size-6" />}
            title={`No matches for "${query}"`}
            description="Try a different name, signature fragment, or description word."
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Modules"
          description={
            q
              ? `${visibleFns} of ${totalFns} functions match your search.`
              : "Browse each module's function reference. The async module is host-only — its functions are not callable from the sync evaluator."
          }
          icon={<BookOpen className="size-4" />}
        >
          <Accordion type="multiple" defaultValue={["io"]} className="w-full">
            {filtered.map((m) => (
              <AccordionItem key={m.module} value={m.module}>
                <AccordionTrigger>
                  <span className="flex w-full items-center gap-2">
                    <code className="font-mono text-sm font-semibold text-foreground">
                      {m.module}
                    </code>
                    <Badge variant="outline" className="text-[10px]">
                      {TIER_BY_MODULE[m.module] ?? "module"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {m.fns.length} fn{m.fns.length === 1 ? "" : "s"}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[20%]">Name</TableHead>
                        <TableHead className="w-[35%]">Signature</TableHead>
                        <TableHead className="w-[45%]">Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {m.fns.map((f) => (
                        <TableRow key={f.name}>
                          <TableCell>
                            <code className="font-mono text-xs font-medium text-foreground">
                              {f.name}
                            </code>
                          </TableCell>
                          <TableCell>
                            <code className="font-mono text-xs text-muted-foreground">
                              {f.sig}
                            </code>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {f.desc}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </SectionCard>
      )}
    </div>
  );
}
