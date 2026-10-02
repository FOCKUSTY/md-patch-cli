import { resolve } from "path";
import { IgnoreConfig } from "./ignore-config.js";
import { DEFAULT_FUZZ } from "./diff.js";

export type CliCommand =
  | "apply"
  | "prompt"
  | "backup-list"
  | "backup-undo"
  | "backup-redo"
  | "backup-restore"
  | "backup-clear"
  | "config";

export interface CliOptions {
  command: CliCommand;
  patchFile: string | null;
  restoreTarget: number;
  cwd: string;
  configDir: string;
  ignore: string[];
  fuzz: number;
  dryRun: boolean;
  useBackup: boolean;
  promptOutput: string | null;
  showProgress: boolean;
  withTree: boolean;
  task: string | null;
}

export class CliOptionsParser {
  public static parse(argv: string[]): CliOptions {
    const args = argv.slice(2);
    const ignore: string[] = [];
    const positionals: string[] = [];

    let cwd = process.cwd();
    let dryRun = false;
    let useBackup = true;
    let showProgress = true;
    let fuzz = DEFAULT_FUZZ;
    let promptOutput: string | null = null;
    let task: string | null = null;
    let withTree = false;
    const configDir = IgnoreConfig.getConfigPathSync();

    for (let i = 0; i < args.length; i++) {
      const current = args[i];
      const next = args[i + 1];

      switch (current) {
        case "--cwd":
        case "-C":
          if (!next) {
            console.error("⚠️  Не указан путь для --cwd.");
            process.exit(1);
          }
          cwd = resolve(next);
          i++;
          break;

        case "--ignore":
        case "-i":
          if (!next) {
            console.error("⚠️  Не указан список для --ignore.");
            process.exit(1);
          }
          ignore.push(...next.split(",").map((p) => p.trim()));
          i++;
          break;

        case "--dry-run":
        case "-dr":
          dryRun = true;
          break;

        case "--no-backup":
        case "-nb":
          useBackup = false;
          break;

        case "--output":
        case "-o":
          if (!next) {
            console.error("⚠️  Не указан путь для --output.");
            process.exit(1);
          }
          promptOutput = resolve(next);
          i++;
          break;

        case "--task":
        case "-t":
          if (!next) {
            console.error("⚠️  Не указан текст для --task.");
            process.exit(1);
          }
          task = next;
          i++;
          break;

        case "--fuzz": {
          if (!next) {
            console.error("⚠️  Не указано число для --fuzz.");
            process.exit(1);
          }
          const parsed = Number(next);
          if (!Number.isInteger(parsed) || parsed < 0) {
            console.error(`⚠️  Некорректное значение --fuzz: ${next}`);
            process.exit(1);
          }
          fuzz = parsed;
          i++;
          break;
        }

        case "--no-fuzz":
        case "-nf":
          fuzz = 0;
          break;

        case "--with-tree":
        case "-wt":
          withTree = true;
          break;

        case "--no-progress":
        case "-np":
          showProgress = false;
          break;

        case "--help":
        case "-h":
          CliOptionsParser.showHelp();
          process.exit(0);

        case "--":
          positionals.push(...args.slice(i + 1));
          i = args.length;
          break;

        default:
          if (/^--?[A-Za-z]/.test(current)) {
            console.error(`⚠️  Неизвестный флаг: ${current}`);
            CliOptionsParser.showHelp();
            process.exit(1);
          }
          positionals.push(current);
          break;
      }
    }

    const { command, patchFile, restoreTarget } =
      CliOptionsParser.parseCommand(positionals);

    return {
      command,
      patchFile,
      restoreTarget,
      promptOutput,
      task,
      cwd,
      fuzz,
      configDir,
      withTree,
      ignore,
      dryRun,
      useBackup,
      showProgress,
    };
  }

  private static parseCommand(positionals: string[]): {
    command: CliCommand;
    patchFile: string | null;
    restoreTarget: number;
  } {
    const [first, second, third] = positionals;

    if (first === undefined) {
      console.error("⚠️  Не указан patch-файл или команда.");
      CliOptionsParser.showHelp();
      process.exit(1);
    }

    if (first === "config") {
      return { command: "config", patchFile: null, restoreTarget: -1 };
    }

    if (first === "prompt") {
      return { command: "prompt", patchFile: null, restoreTarget: -1 };
    }

    if (first === "backup") {
      switch (second) {
        case undefined:
        case "list":
          return { command: "backup-list", patchFile: null, restoreTarget: -1 };

        case "undo":
          return { command: "backup-undo", patchFile: null, restoreTarget: -1 };

        case "redo":
          return { command: "backup-redo", patchFile: null, restoreTarget: -1 };

        case "clear":
          return {
            command: "backup-clear",
            patchFile: null,
            restoreTarget: -1,
          };

        case "restore": {
          if (third === undefined || !/^-?\d+$/.test(third)) {
            console.error(
              `⚠️  Некорректный индекс для restore: ${third ?? "(не указан)"}`,
            );
            process.exit(1);
          }

          const target = Number(third);
          if (target < -1) {
            console.error(`⚠️  Индекс должен быть >= -1, получено: ${target}`);
            process.exit(1);
          }

          return {
            command: "backup-restore",
            patchFile: null,
            restoreTarget: target,
          };
        }

        default:
          console.error(`⚠️  Неизвестная backup-команда: ${second}`);
          CliOptionsParser.showHelp();
          process.exit(1);
      }
    }

    if (positionals.length > 1) {
      console.error(
        `⚠️  Указано несколько patch-файлов: ${positionals.join(", ")}`,
      );
      process.exit(1);
    }

    return {
      command: "apply",
      patchFile: resolve(first),
      restoreTarget: -1,
    };
  }

  private static showHelp(): void {
    console.log(`
Использование: mp <patch-файл.md|команда> [опции]

Применяет патчи из Markdown-файла к проекту.
Формат: \`{path}\` + \`\`\`diff с unified diff \`\`\`.

Команды:
  config                     Создать .mpignore в рабочей папке

  backup list                Показать историю бэкапов
  backup undo                Откатить последнюю применённую группу
  backup redo                Вернуть последнюю откатанную группу
  backup restore <N>         Перейти к состоянию после группы N (-1 = начало)
  backup clear               Удалить всю историю бэкапов

Параметры:
  --cwd, -C <директория>     Рабочая директория (по умолчанию cwd)
  --ignore, -i <список>      Дополнительные игнорируемые пути через запятую
  --dry-run, -dr             Показать, что будет изменено, но не записывать
  --no-backup, -nb           Не создавать бэкап (undo/redo станут недоступны)
  --fuzz <число>             Окно поиска хунка вокруг @@-номера (по умолчанию 50)
  --with-tree, -wt           Добавить дерево файлов проекта в prompt
  --no-fuzz, -nf             Строгое совпадение по @@-номеру
  --no-progress, -np         Отключить прогресс-вывод
  --help, -h                 Эта справка

Примеры:
  mp patch.md
  mp patch.md --dry-run
  mp patch.md -C ./src
  mp backup list
  mp backup undo
  mp backup redo
  mp backup restore 2
  mp backup restore -1
`);
  }
}
