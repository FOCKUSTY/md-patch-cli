import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { readdirSync, writeFileSync } from "fs";

import {
  DEFAULT_IGNORE_CONFIG,
  ROOT_DIRECTORY,
  WORKING_DIRECTORY,
} from "./constants.js";

export type IgnorePatternConfig = {
  isNegative: boolean;
  isDirectory: boolean;
};

export type IgnorePattern = IgnorePatternConfig & {
  pattern: string;
  regex: RegExp;
};

export class IgnoreConfig {
  private static readonly FILE_NAME = ".mpignore";
  private static readonly SYMBOLS = {
    COMMENT: "#",
    NEGATIVE: "!",
    DIRECTORY: "/",
    SPLIT: /\r?\n/,
  } as const;

  private readonly _dirPath: string;
  private readonly _ignore: Set<string>;

  public static getConfigPathSync(): string {
    const dir = readdirSync(WORKING_DIRECTORY);
    if (dir.includes(IgnoreConfig.FILE_NAME)) {
      return WORKING_DIRECTORY;
    }

    return ROOT_DIRECTORY;
  }

  public static createSync(root: string = WORKING_DIRECTORY): string {
    const path = join(root, IgnoreConfig.FILE_NAME);
    writeFileSync(path, DEFAULT_IGNORE_CONFIG, "utf-8");

    return path;
  }

  public constructor(dirPath: string = ROOT_DIRECTORY, ignore: string[] = []) {
    this._dirPath = dirPath;
    this._ignore = new Set(ignore);
  }

  public async execute(): Promise<IgnorePattern[]> {
    const ignore = await this.read();
    const resolvedIgnore = this.resolveIgnore(ignore);
    const filteredIgnore = this.filter(resolvedIgnore);

    return this.parse(filteredIgnore);
  }

  public isIgnore(filePath: string, patterns: IgnorePattern[]): boolean {
    const normalizedPath = filePath.replace(
      /\\/g,
      IgnoreConfig.SYMBOLS.DIRECTORY,
    );

    let ignored = false;
    for (const pattern of patterns) {
      if (!normalizedPath.match(pattern.regex)) {
        continue;
      }

      if (pattern.isNegative) {
        ignored = false;
        continue;
      }

      ignored = true;
    }

    return ignored;
  }

  private resolveIgnore(ignore: string[]): string[] {
    return Array.from(new Set([...ignore, ...this._ignore]));
  }

  private async read(): Promise<string[]> {
    const filePath = join(this._dirPath, IgnoreConfig.FILE_NAME);

    try {
      const file = await readFile(filePath, "utf-8");
      return file.split(IgnoreConfig.SYMBOLS.SPLIT);
    } catch {
      return DEFAULT_IGNORE_CONFIG.split(IgnoreConfig.SYMBOLS.SPLIT);
    }
  }

  private filter(ignore: string[]): string[] {
    return ignore.filter((value) => {
      const trimmed = value.trim();
      if (trimmed.startsWith(IgnoreConfig.SYMBOLS.COMMENT)) {
        return false;
      }

      if (trimmed === "") {
        return false;
      }

      return true;
    });
  }

  private parse(ignore: string[]): IgnorePattern[] {
    return ignore.map((value) => {
      let pattern = value.trim();
      const config: IgnorePatternConfig = {
        isNegative: false,
        isDirectory: false,
      };

      if (pattern.startsWith(IgnoreConfig.SYMBOLS.NEGATIVE)) {
        config.isNegative = true;
        pattern = pattern.slice(1);
      }

      if (pattern.endsWith(IgnoreConfig.SYMBOLS.DIRECTORY)) {
        config.isDirectory = true;
        pattern = pattern.slice(0, -1);
      }

      return {
        pattern,
        regex: this.patternToRegex(pattern),
        ...config,
      };
    });
  }

  private patternToRegex(pattern: string): RegExp {
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\{\{GLOBSTAR\}\}/g, ".*");

    regexPattern = (() => {
      if (pattern.startsWith(IgnoreConfig.SYMBOLS.DIRECTORY)) {
        return `^${regexPattern.slice(1)}`;
      }

      return `(^|/)${regexPattern}`;
    })();

    if (pattern.endsWith(IgnoreConfig.SYMBOLS.DIRECTORY)) {
      regexPattern += IgnoreConfig.SYMBOLS.DIRECTORY;
    }

    regexPattern += "($|/)";

    return new RegExp(regexPattern);
  }
}
