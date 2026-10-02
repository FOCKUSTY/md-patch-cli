import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { CliOptions } from "./cli-options.js";
import { applyDiff, extractNewFileContent } from "./diff.js";
import { IgnoreConfig, type IgnorePattern } from "./ignore-config.js";
import type { BackupChange, BackupManager } from "./backup.js";
import { MPC_MARKERS } from "./constants.js";

interface Patch {
  filePath: string;
  content: string;
}

interface FileState {
  original: string | null;
  current: string | null;
}

const PATCH_REGEX = new RegExp(
  `^${MPC_MARKERS.PATH}:[ \\t]*(.+?)[ \\t]*\\r?\\n` +
    `${MPC_MARKERS.CONTENT}[ \\t]*\\r?\\n` +
    `([\\s\\S]*?)\\r?\\n` +
    `${MPC_MARKERS.END}[ \\t]*(?:\\r?\\n|$)`,
  "gm",
);

export class MarkdownPatch {
  private readonly patchFile: string;
  private readonly cwd: string;
  private readonly dryRun: boolean;
  private readonly showProgress: boolean;
  private readonly backup: BackupManager | null;

  private readonly ignoreConfig: IgnoreConfig;
  private ignorePatterns: IgnorePattern[] = [];

  public constructor(
    options: CliOptions,
    patchFile: string,
    backup: BackupManager | null,
  ) {
    this.patchFile = patchFile;
    this.cwd = options.cwd;
    this.dryRun = options.dryRun;
    this.showProgress = options.showProgress;
    this.backup = backup;

    this.ignoreConfig = new IgnoreConfig(options.configDir, options.ignore);
  }

  public async execute(): Promise<void> {
    if (this.showProgress) {
      console.log(`🔍 Читаем патч: ${this.patchFile}`);
    }

    const markdown = await readFile(this.patchFile, "utf8");
    const patches = this.parse(markdown);

    if (patches.length === 0) {
      console.error("❌ В файле не найдено ни одного патча.");
      process.exit(1);
    }

    this.ignorePatterns = await this.ignoreConfig.execute();

    const state = new Map<string, FileState>();
    const changeMap = new Map<string, BackupChange>();
    const changes: BackupChange[] = [];
    let skipped = 0;
    let applied = 0;

    for (const patch of patches) {
      const result = await this.prepareChange(patch, state);
      if (result === null) {
        skipped++;
        continue;
      }

      const existing = changeMap.get(result.path);
      if (existing) {
        existing.after = result.after;
      } else {
        const change: BackupChange = {
          path: result.path,
          before: result.before,
          after: result.after,
        };
        changeMap.set(result.path, change);
        changes.push(change);
      }
      applied++;
    }

    for (const change of changes) {
      const created = change.before === null;
      const marker = created ? "➕" : "📝";
      const action = created ? "создан" : "изменён";

      if (this.showProgress || this.dryRun) {
        console.log(
          `${marker} ${change.path} (${action}${this.dryRun ? ", dry-run" : ""})`,
        );
      }
    }

    if (this.dryRun) {
      console.log(
        `✅ Dry-run завершён. К применению: ${changes.length}, пропущено: ${skipped}.`,
      );
      return;
    }

    if (changes.length === 0) {
      console.log(`✅ Нечего применять. Пропущено: ${skipped}.`);
      return;
    }

    if (this.backup) {
      await this.commitWithBackup(changes);
    } else {
      await this.applyChanges(changes);
    }

    console.log(`✅ Готово. Применено: ${applied}, пропущено: ${skipped}.`);
  }

  private parse(markdown: string): Patch[] {
    const patches: Patch[] = [];
    let match: RegExpExecArray | null;

    PATCH_REGEX.lastIndex = 0;
    while ((match = PATCH_REGEX.exec(markdown)) !== null) {
      patches.push({ filePath: match[1].trim(), content: match[2] });
    }

    return patches;
  }

  private async prepareChange(
    patch: Patch,
    state: Map<string, FileState>,
  ): Promise<BackupChange | null> {
    const absolutePath = isAbsolute(patch.filePath)
      ? patch.filePath
      : resolve(this.cwd, patch.filePath);

    const relativePath = relative(this.cwd, absolutePath) || absolutePath;
    const normalized = relativePath.replace(/\\/g, "/");

    if (normalized === "backup" || normalized.startsWith("backup/")) {
      if (this.showProgress || this.dryRun) {
        console.log(`🚫 ${normalized} (защищено: backup/)`);
      }
      return null;
    }

    if (this.ignoreConfig.isIgnore(relativePath, this.ignorePatterns)) {
      if (this.showProgress || this.dryRun) {
        console.log(`🚫 ${normalized} (игнорируется)`);
      }
      return null;
    }

    let fileState = state.get(normalized);
    if (!fileState) {
      let original: string | null = null;
      try {
        original = await readFile(absolutePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      fileState = { original, current: original };
      state.set(normalized, fileState);
    }

    const before = fileState.current;
    const after =
      before === null
        ? extractNewFileContent(patch.content)
        : applyDiff(before, patch.content);

    fileState.current = after;

    return {
      path: normalized,
      before: fileState.original,
      after,
    };
  }

  private async applyChanges(changes: BackupChange[]): Promise<void> {
    for (const change of changes) {
      const absolutePath = resolve(this.cwd, change.path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, change.after, "utf8");
    }
  }

  private async commitWithBackup(changes: BackupChange[]): Promise<void> {
    const backup = this.backup!;
    const index = await backup.load();
    const dropped = index.groups.slice(index.current + 1);

    const group = await backup.commit(this.patchFile, changes);

    try {
      await this.applyChanges(changes);
    } catch (error) {
      await backup.restoreBefore(group);
      await backup.removeGroup(group.id);
      throw error;
    }

    for (const future of dropped) {
      await backup.removeGroup(future.id);
    }

    index.groups = index.groups.slice(0, index.current + 1);
    index.groups.push(group);
    index.current = index.groups.length - 1;
    await backup.save(index);
  }
}
