import { describe, expect, it } from "vitest";
import type { KnowledgeNote } from "../src/components/types";
import {
  buildKnowledgeGraph,
  extractMarkdownMetadata,
  getIncomingKnowledgeGraphLinks,
  getKnowledgeGraphNeighborhood,
  mergeKnowledgeGraphData,
  summarizeKnowledgeFileChanges,
  type KnowledgeFileSnapshot,
} from "../src/utils/knowledgeGraph";

const note = (
  relativePath: string,
  content: string,
  overrides: Partial<KnowledgeNote> = {},
): KnowledgeNote => ({
  id: relativePath,
  path: `/vault/${relativePath}`,
  relativePath,
  title: relativePath.replace(/\.md$/i, ""),
  content,
  ...overrides,
});

const snapshot = (
  relativePath: string,
  size: number,
  mtime: number,
): KnowledgeFileSnapshot => ({
  path: `/vault/${relativePath}`,
  relativePath,
  size,
  mtime,
});

describe("knowledge graph indexing", () => {
  it("merges multiple vault graphs without colliding note ids", () => {
    const graphA = buildKnowledgeGraph([note("index.md", "# A")]);
    const graphB = buildKnowledgeGraph([note("index.md", "# B")]);
    const merged = mergeKnowledgeGraphData([
      { vaultPath: "/vault-a", graph: graphA },
      { vaultPath: "/vault-b", graph: graphB },
    ]);

    expect(merged.notes).toHaveLength(2);
    expect(new Set(merged.nodes.map((node) => node.id)).size).toBe(
      merged.nodes.length,
    );
    expect(
      merged.nodes.filter((node) => node.category === "note"),
    ).toHaveLength(2);
  });
  it("extracts headings, inline tags, frontmatter tags, and aliases", () => {
    expect(
      extractMarkdownMetadata(
        "---\naliases: [Home, Start]\ntags: [guide, setup]\n---\n# Home\n\nText #work",
        "home.md",
      ),
    ).toEqual({
      headings: [{ id: "home.md#heading-1", text: "Home", level: 1 }],
      tags: ["guide", "setup", "work"],
      aliases: ["Home", "Start"],
    });
  });

  it("adds heading and tag nodes with semantic links", () => {
    const graph = buildKnowledgeGraph([
      note("home.md", "# Overview\n\n#guide", {
        headings: [{ id: "home.md#heading-1", text: "Overview", level: 1 }],
        tags: ["guide"],
      }),
    ]);

    expect(graph.nodes.map((node) => node.category)).toEqual([
      "note",
      "heading",
      "tag",
    ]);
    expect(graph.links.map((link) => link.type)).toEqual([
      "contains",
      "tagged_with",
    ]);
  });

  it("returns incoming links and a filtered neighborhood", () => {
    const graph = buildKnowledgeGraph([
      note("a.md", "[[b]]"),
      note("b.md", "[[c]]"),
      note("c.md", "# C"),
    ]);

    expect(getIncomingKnowledgeGraphLinks(graph, "b.md")).toHaveLength(1);
    const neighborhood = getKnowledgeGraphNeighborhood(graph, {
      rootId: "b.md",
      depth: 1,
      linkTypes: new Set(["wiki"]),
    });
    expect(neighborhood.nodes.map((node) => node.id).sort()).toEqual([
      "a.md",
      "b.md",
      "c.md",
    ]);
    expect(neighborhood.links).toHaveLength(2);
  });

  it("filters neighborhood nodes by category", () => {
    const graph = buildKnowledgeGraph([
      note("a.md", "# Intro\n\n#guide", {
        headings: [{ id: "a.md#heading-1", text: "Intro", level: 1 }],
        tags: ["guide"],
      }),
    ]);
    const tags = getKnowledgeGraphNeighborhood(graph, {
      categories: new Set(["tag"]),
    });
    expect(tags.nodes.map((node) => node.id)).toEqual(["tag:guide"]);
    expect(tags.links).toHaveLength(0);
  });

  it("handles a 1,000-node neighborhood without changing graph semantics", () => {
    const notes = Array.from({ length: 1000 }, (_, index) =>
      note(`note-${index}.md`, index === 0 ? "[[note-1]]" : ""),
    );
    const graph = buildKnowledgeGraph(notes);
    const startedAt = performance.now();
    const neighborhood = getKnowledgeGraphNeighborhood(graph, {
      rootId: "note-0.md",
      depth: 1,
      linkTypes: new Set(["wiki"]),
    });
    const durationMs = performance.now() - startedAt;

    expect(graph.nodes).toHaveLength(1000);
    expect(durationMs).toBeLessThan(100);
    expect(neighborhood.nodes.map((node) => node.id).sort()).toEqual([
      "note-0.md",
      "note-1.md",
    ]);
  });

  it("builds the same graph after a modified note is re-indexed", () => {
    const previousNotes = [note("a.md", "[[b]]"), note("b.md", "# B")];
    const nextNotes = [
      note("a.md", "[[c]]", { size: 5, mtime: 2 }),
      note("c.md", "# C", { size: 3, mtime: 2 }),
    ];

    const incrementalGraph = buildKnowledgeGraph(nextNotes);
    const fullGraph = buildKnowledgeGraph(nextNotes);

    expect(incrementalGraph.nodes.map((node) => node.id).sort()).toEqual(
      fullGraph.nodes.map((node) => node.id).sort(),
    );
    expect(incrementalGraph.links).toEqual(fullGraph.links);
    expect(previousNotes).toHaveLength(2);
  });

  it("classifies added, modified, unchanged, and deleted files", () => {
    const previous = [
      snapshot("unchanged.md", 10, 1),
      snapshot("modified.md", 10, 1),
      snapshot("deleted.md", 10, 1),
    ];
    const current = [
      snapshot("unchanged.md", 10, 1),
      snapshot("modified.md", 11, 2),
      snapshot("added.md", 4, 2),
    ];

    expect(summarizeKnowledgeFileChanges(current, previous)).toEqual({
      changedFiles: 2,
      unchangedFiles: 1,
      deletedFiles: 1,
    });
  });

  it("removes deleted note nodes and preserves missing link nodes", () => {
    const graph = buildKnowledgeGraph([note("a.md", "[[missing]]")]);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "a.md",
      "missing:missing",
    ]);
    expect(graph.links).toHaveLength(1);
  });
});
