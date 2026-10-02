import { writeFile } from "node:fs/promises";

import { IgnoreConfig } from "./ignore-config.js";
import { buildPrompt } from "./prompt-template.js";
import { TreeBuilder } from "./tree-builder.js";

export interface PromptGeneratorOptions {
  output: string | null;
  task: string | null;
  withTree: boolean;
  cwd: string;
  configDir: string;
  ignore: string[];
}

export class PromptGenerator {
  private readonly options: PromptGeneratorOptions;

  public constructor(options: PromptGeneratorOptions) {
    this.options = options;
  }

  public async execute(): Promise<void> {
    const tree = this.options.withTree ? await this.buildTree() : undefined;
    const content = buildPrompt({
      task: this.options.task ?? undefined,
      tree,
    });

    if (this.options.output === null) {
      process.stdout.write(content);
      return;
    }

    await writeFile(this.options.output, content, "utf8");
    console.log(`✅ Инструкция записана в ${this.options.output}`);
  }

  private async buildTree(): Promise<string> {
    const ignoreConfig = new IgnoreConfig(
      this.options.configDir,
      this.options.ignore,
    );
    const builder = new TreeBuilder(this.options.cwd, ignoreConfig);
    return builder.build();
  }
}
