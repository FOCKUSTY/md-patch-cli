export interface PromptOptions {
  task?: string;
  tree?: string;
}

const EXAMPLE_MODIFY = [
  "MPC-PATH: src/utils/greet.ts",
  "MPC-CONTENT",
  "@@ -1,3 +1,4 @@",
  " export function greet(name: string) {",
  "-  return `hi, ${name}`",
  "+  return `Hello, ${name}`",
  " }",
  "+",
  '+export const VERSION = "1.0.0"',
  "MPC-END",
].join("\n");

const EXAMPLE_NEW = [
  "MPC-PATH: src/utils/format.ts",
  "MPC-CONTENT",
  "+export function capitalize(value: string): string {",
  "+  if (!value) return value",
  "+  return value.charAt(0).toUpperCase() + value.slice(1)",
  "+}",
  "MPC-END",
].join("\n");

const EXAMPLE_MULTI = [
  "MPC-PATH: src/index.ts",
  "MPC-CONTENT",
  "@@ -1,3 +1,4 @@",
  ' import { greet } from "./utils/greet.js"',
  '+import { capitalize } from "./utils/format.js"',
  " ",
  '-console.log(greet("world"))',
  '+console.log(greet(capitalize("world"), { excited: true }))',
  "MPC-END",
  "",
  "MPC-PATH: src/utils/greet.ts",
  "MPC-CONTENT",
  "@@ -1,3 +1,7 @@",
  "-export function greet(name: string) {",
  "-  return `hi, ${name}`",
  "-}",
  "+export interface GreetOptions {",
  "+  excited?: boolean",
  "+}",
  "+",
  "+export function greet(name: string, options: GreetOptions = {}): string {",
  '+  const suffix = options.excited ? "!" : "."',
  "+  return `Hello, ${name}${suffix}`",
  "+}",
  "MPC-END",
].join("\n");

export function buildPrompt(options: PromptOptions = {}): string {
  const taskBlock = options.task ? `## Задача\n\n${options.task}\n\n` : "";

  const treeBlock = options.tree
    ? `## Структура проекта\n\n\`\`\`\n${options.tree}\n\`\`\`\n\n`
    : "";

  return `# Инструкция для нейросети

Ты помогаешь редактировать проект. Пришли изменения в формате,
который понимает \`md-patch-cli\` (команда \`mp\`).

${taskBlock}${treeBlock}## Формат ответа

Каждый файл — отдельный блок с тремя маркерами:
\`MPC-PATH\`, \`MPC-CONTENT\` и \`MPC-END\`. Никаких \`\`\` в ответе.

**Все изменения — в одном ответе.** Не дроби на несколько сообщений
и не спрашивай разрешения перед каждым файлом.

### Изменение существующего файла

\`\`\`
${EXAMPLE_MODIFY}
\`\`\`

### Создание нового файла

Только строки с \`+\`:

\`\`\`
${EXAMPLE_NEW}
\`\`\`

### Несколько файлов в одном ответе

Блоки идут подряд, без пустых строк и комментариев между ними:

\`\`\`
${EXAMPLE_MULTI}
\`\`\`

## Правила

1. **Путь** — после \`MPC-PATH:\`, относительный от корня проекта.
2. **Содержимое** — между \`MPC-CONTENT\` и \`MPC-END\`, сырое, без обёрток.
3. **Контекст** — строки, которые остаются, начинаются с одного пробела.
4. **Удаление** — строки с \`-\`. Должны **точно** совпадать с оригиналом.
5. **Добавление** — строки с \`+\`.
6. **\`@@\`-заголовки** опциональны. Если пишешь — указывай реальные номера строк.
7. **Новый файл** — только \`+\`-строки, без \`@@\`.
8. **Один блок = один файл.**
9. **Ничего лишнего** между блоками — никаких «вот изменённый файл:» и резюме.
10. **Не вываливай весь файл**, если меняется пара строк — используй \`@@\`-хунки.
11. **Пути только из дерева выше** — не выдумывай новые файлы без необходимости.
12. **Никаких \`\`\` в ответе** — только маркеры \`MPC-*\`.
13. **Один ответ = один файл с патчами.** Сколько угодно MPC-блоков
    подряд, без разделителей и комментариев между ними.
14. **Можно править один файл несколько раз** — просто повтори
    \`MPC-PATH\` с тем же путём в следующем блоке.

## Применение

\`\`\`bash
mp patch.md              # применить
mp patch.md --dry-run    # проверить без записи
mp backup undo           # откатить
\`\`\`
`;
}
