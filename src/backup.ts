import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface BackupFileEntry {
  path: string;
  index: number;
  beforeExists: boolean;
  afterExists: boolean;
}

export interface BackupGroup {
  id: string;
  patchFile: string;
  createdAt: string;
  files: BackupFileEntry[];
}

export interface BackupIndex {
  current: number;
  groups: BackupGroup[];
}

export interface BackupChange {
  path: string;
  before: string | null;
  after: string;
}

export class BackupManager {
  public static readonly DIR_NAME = "backup";
  private static readonly INDEX_FILE = "index.json";
  private static readonly META_FILE = "meta.json";
  private static readonly FILES_DIR = "files";

  private readonly cwd: string;
  private readonly root: string;

  public constructor(cwd: string) {
    this.cwd = cwd;
    this.root = join(cwd, BackupManager.DIR_NAME);
  }

  public async load(): Promise<BackupIndex> {
    const indexPath = join(this.root, BackupManager.INDEX_FILE);
    try {
      const raw = await readFile(indexPath, "utf8");
      const parsed = JSON.parse(raw) as BackupIndex;
      if (!Array.isArray(parsed.groups)) throw new Error("invalid index");
      return parsed;
    } catch {
      return { current: -1, groups: [] };
    }
  }

  public async save(index: BackupIndex): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(
      join(this.root, BackupManager.INDEX_FILE),
      JSON.stringify(index, null, 2),
      "utf8",
    );
  }

  public async commit(
    patchFile: string,
    changes: BackupChange[],
  ): Promise<BackupGroup> {
    const id = this.makeId();
    const groupDir = join(this.root, id);
    const filesDir = join(groupDir, BackupManager.FILES_DIR);
    await mkdir(filesDir, { recursive: true });

    const entries: BackupFileEntry[] = [];
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const entry: BackupFileEntry = {
        path: change.path,
        index: i,
        beforeExists: change.before !== null,
        afterExists: change.after !== null,
      };

      if (change.before !== null) {
        await writeFile(join(filesDir, `${i}.before`), change.before, "utf8");
      }

      if (change.after !== null) {
        await writeFile(join(filesDir, `${i}.after`), change.after, "utf8");
      }

      entries.push(entry);
    }

    const group: BackupGroup = {
      id,
      patchFile,
      createdAt: new Date().toISOString(),
      files: entries,
    };

    await writeFile(
      join(groupDir, BackupManager.META_FILE),
      JSON.stringify(group, null, 2),
      "utf8",
    );

    return group;
  }

  public async removeGroup(id: string): Promise<void> {
    await rm(join(this.root, id), { recursive: true, force: true });
  }

  public async clear(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  public async list(): Promise<void> {
    const index = await this.load();

    if (index.groups.length === 0) {
      console.log("📭 История бэкапов пуста.");
      return;
    }

    console.log(`📚 Группы бэкапов (${index.groups.length}):\n`);

    for (let i = 0; i < index.groups.length; i++) {
      const group = index.groups[i];
      const applied = i <= index.current;
      const marker = i === index.current ? " ← текущий" : "";
      const status = applied ? "применён" : "откатан ";
      const when = group.createdAt.replace("T", " ").slice(0, 19);
      const name = group.patchFile.split(/[\\/]/).pop() ?? group.patchFile;

      console.log(`  [${i}] ${when}  ${name.padEnd(24)}  ${status}${marker}`);
    }

    console.log("");
    console.log(
      index.current === -1
        ? "Указатель: начальное состояние."
        : `Указатель: после группы [${index.current}].`,
    );
  }

  public async undo(): Promise<void> {
    const index = await this.load();
    if (index.current < 0) {
      console.error("⚠️  Нечего откатывать.");
      return;
    }

    const group = index.groups[index.current];
    await this.restoreBefore(group);
    index.current--;
    await this.save(index);

    console.log(`↩️  Откатили группу [${index.current + 1}] (${group.id})`);
  }

  public async redo(): Promise<void> {
    const index = await this.load();
    if (index.current >= index.groups.length - 1) {
      console.error("⚠️  Нечего возвращать.");
      return;
    }

    const next = index.current + 1;
    const group = index.groups[next];
    await this.restoreAfter(group);
    index.current = next;
    await this.save(index);

    console.log(`↪️  Вернули группу [${next}] (${group.id})`);
  }

  public async restoreTo(target: number): Promise<void> {
    const index = await this.load();

    if (target < -1 || target >= index.groups.length) {
      throw new Error(
        `Некорректный индекс ${target}. Всего групп: ${index.groups.length}.`,
      );
    }

    while (index.current > target) {
      await this.restoreBefore(index.groups[index.current]);
      index.current--;
    }

    while (index.current < target) {
      index.current++;
      await this.restoreAfter(index.groups[index.current]);
    }

    await this.save(index);
    console.log(
      target === -1
        ? "↩️  Вернулись к начальному состоянию."
        : `📍 Указатель после группы [${target}].`,
    );
  }

  public async restoreBefore(group: BackupGroup): Promise<void> {
    await this.restoreSide(group, "before");
  }

  private async restoreAfter(group: BackupGroup): Promise<void> {
    await this.restoreSide(group, "after");
  }

  private async restoreSide(
    group: BackupGroup,
    side: "before" | "after",
  ): Promise<void> {
    const filesDir = join(this.root, group.id, BackupManager.FILES_DIR);

    for (const entry of group.files) {
      const absolutePath = isAbsolute(entry.path)
        ? entry.path
        : resolve(this.cwd, entry.path);

      const exists = side === "before" ? entry.beforeExists : entry.afterExists;

      if (!exists) {
        await rm(absolutePath, { force: true });
        continue;
      }

      const content = await readFile(
        join(filesDir, `${entry.index}.${side}`),
        "utf8",
      );
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
    }
  }

  private makeId(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(36).slice(2, 8);
    return `${stamp}_${rand}`;
  }
}
