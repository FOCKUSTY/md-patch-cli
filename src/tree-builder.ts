import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { IgnoreConfig, type IgnorePattern } from "./ignore-config.js";

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

export class TreeBuilder {
  private readonly cwd: string;
  private readonly ignoreConfig: IgnoreConfig;
  private patterns: IgnorePattern[] = [];

  public constructor(cwd: string, ignoreConfig: IgnoreConfig) {
    this.cwd = cwd;
    this.ignoreConfig = ignoreConfig;
  }

  public async build(): Promise<string> {
    this.patterns = await this.ignoreConfig.execute();

    const root = await this.scan();
    const lines: string[] = [this.rootLabel()];
    this.render(root, "", lines);

    return lines.join("\n");
  }

  private rootLabel(): string {
    const parts = this.cwd.split(/[\\/]/).filter(Boolean);
    return `${parts[parts.length - 1] ?? this.cwd}/`;
  }

  private async scan(): Promise<TreeNode> {
    const root: TreeNode = {
      name: "",
      children: new Map(),
      isFile: false,
    };

    const entries = await (async () => {
      try {
        return await readdir(this.cwd, {
          withFileTypes: true,
          recursive: true,
        });
      } catch {
        return [];
      }
    })();

    for (const entry of entries) {
      const absolutePath = join(entry.parentPath, entry.name);
      const relativePath = relative(this.cwd, absolutePath);
      const normalized = relativePath.replace(/\\/g, "/");

      if (this.ignoreConfig.isIgnore(normalized, this.patterns)) {
        continue;
      }

      if (normalized === "backup" || normalized.startsWith("backup/")) {
        continue;
      }

      const segments = normalized.split("/");
      let node = root;
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const isLeaf = i === segments.length - 1;

        let child = node.children.get(segment);
        if (!child) {
          child = {
            name: segment,
            children: new Map(),
            isFile: isLeaf && entry.isFile(),
          };
          node.children.set(segment, child);
        }

        node = child;
      }
    }

    this.sortTree(root);
    return root;
  }

  private sortTree(node: TreeNode): void {
    const sorted = Array.from(node.children.entries()).sort(
      ([a, aNode], [b, bNode]) => {
        if (aNode.isFile !== bNode.isFile) {
          return aNode.isFile ? 1 : -1;
        }
        return a.localeCompare(b);
      },
    );

    node.children.clear();
    for (const [key, value] of sorted) {
      node.children.set(key, value);
    }

    for (const child of node.children.values()) {
      this.sortTree(child);
    }
  }

  private render(node: TreeNode, prefix: string, lines: string[]): void {
    const entries = Array.from(node.children.values());

    for (let i = 0; i < entries.length; i++) {
      const child = entries[i];
      const isLast = i === entries.length - 1;
      const branch = isLast ? "└── " : "├── ";
      const suffix = child.isFile ? "" : "/";

      lines.push(`${prefix}${branch}${child.name}${suffix}`);

      if (child.children.size > 0) {
        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        this.render(child, nextPrefix, lines);
      }
    }
  }
}
