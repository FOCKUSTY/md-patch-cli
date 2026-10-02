#!/usr/bin/env node
import { CliOptionsParser } from "./cli-options.js";
import { MarkdownPatch } from "./markdown-patch.js";
import { BackupManager } from "./backup.js";
import { IgnoreConfig } from "./ignore-config.js";
import { WORKING_DIRECTORY } from "./constants.js";
import { PromptGenerator } from "./prompt-generator.js";

const main = async (): Promise<void> => {
  try {
    const options = CliOptionsParser.parse(process.argv);
    const backup = new BackupManager(options.cwd);

    switch (options.command) {
      case "apply": {
        if (options.patchFile === null) {
          console.error("⚠️  Не указан patch-файл.");
          process.exit(1);
        }

        const patch = new MarkdownPatch(
          options,
          options.patchFile,
          options.useBackup ? backup : null,
        );
        await patch.execute();
        break;
      }

      case "prompt": {
        const generator = new PromptGenerator({
          output: options.promptOutput,
          task: options.task,
          withTree: options.withTree,
          cwd: options.cwd,
          configDir: options.configDir,
          ignore: options.ignore,
        });
        await generator.execute();
        break;
      }

      case "backup-list":
        await backup.list();
        break;

      case "backup-undo":
        await backup.undo();
        break;

      case "backup-redo":
        await backup.redo();
        break;

      case "backup-restore":
        await backup.restoreTo(options.restoreTarget);
        break;

      case "backup-clear":
        await backup.clear();
        console.log("🗑️  История бэкапов очищена.");
        break;

      case "config": {
        const path = IgnoreConfig.createSync(WORKING_DIRECTORY);
        console.log(`✅ Создан конфиг: ${path}`);
        break;
      }
    }
  } catch (error) {
    console.error("💥 Фатальная ошибка:", error);
    process.exit(1);
  }
};

main();
