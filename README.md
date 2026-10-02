# md-patch-cli

Применяет патчи из Markdown-файла к проекту.

Скармливаешь нейросети инструкцию (`mp prompt`), получаешь файл с патчами — применяешь одной командой (`mp patch.md`). Есть откат, история версий и fuzzy-поиск, чтобы не падать от кривых `@@`-номеров.

## Установка

```bash
npm install -g md-patch-cli
```

Или из исходников:

```bash
git clone https://github.com/FOCKUSTY/md-patch-cli.git
cd md-patch-cli
npm install
npm run build
npm link
```

## Быстрый старт

```bash
# 1. Сгенерировать инструкцию для нейросети
mp prompt --with-tree -t "Добавь JSDoc ко всем экспортам" -o instruction.md

# 2. Отправить instruction.md + снапшот проекта модели

# 3. Полученный ответ сохранить как patch.md и проверить
mp patch.md --dry-run

# 4. Применить
mp patch.md

# 5. Если что-то не так — откатить
mp backup undo
```

## Использование

```bash
mp <patch-файл.md|команда> [опции]
```

## Формат патча

Каждый файл — отдельный блок с тремя маркерами:

```
MPC-PATH: src/utils/greet.ts
MPC-CONTENT
@@ -1,3 +1,7 @@
-export function greet(name: string) {
-  return `hi, ${name}`
-}
+export interface GreetOptions {
+  excited?: boolean
+}
+
+export function greet(name: string, options: GreetOptions = {}): string {
+  const suffix = options.excited ? "!" : "."
+  return `Hello, ${name}${suffix}`
+}
MPC-END
```

Почему не ` ```diff `: файл целиком безопасно вставляется в другой Markdown — в README, issue, чат — и не ломает форматирование.

### Правила

1. **Путь** — после `MPC-PATH:`, относительный от корня проекта.
2. **Содержимое** — между `MPC-CONTENT` и `MPC-END`, сырое, без обёрток.
3. **Контекст** — строки, которые остаются, начинаются с одного пробела.
4. **Удаление** — строки с `-`, должны **точно** совпадать с оригиналом.
5. **Добавление** — строки с `+`.
6. **`@@`-заголовки** опциональны. Если есть — номера не обязаны быть точными (см. [Fuzzy-поиск](#fuzzy-поиск)).
7. **Новый файл** — только `+`-строки, без `@@`.
8. **Один блок = один файл.**
9. **Один ответ = один файл с патчами.** Сколько угодно блоков подряд.
10. **Можно править один файл несколько раз** — просто повтори `MPC-PATH` с тем же путём; второй блок увидит результат первого.

### Создание нового файла

Только `+`-строки, без `@@`:

```
MPC-PATH: src/utils/format.ts
MPC-CONTENT
+export function capitalize(value: string): string {
+  if (!value) return value
+  return value.charAt(0).toUpperCase() + value.slice(1)
+}
MPC-END
```

### Несколько файлов в одном ответе

Блоки идут подряд, порядок не важен:

```
MPC-PATH: src/index.ts
MPC-CONTENT
@@ -1,3 +1,4 @@
 import { greet } from "./utils/greet.js"
+import { capitalize } from "./utils/format.js"
 
-console.log(greet("world"))
+console.log(greet(capitalize("world"), { excited: true }))
MPC-END

MPC-PATH: src/utils/greet.ts
MPC-CONTENT
@@ -1,3 +1,7 @@
 ...
MPC-END
```

## Команды

### `mp <patch.md>` — применить патч

Основная команда. Парсит файл, применяет к `cwd`, создаёт бэкап.

```bash
mp patch.md
mp patch.md --dry-run
mp patch.md --cwd ./src
mp patch.md --no-backup
```

### `mp prompt` — сгенерировать инструкцию

Собирает Markdown-файл с описанием формата и примерами — его отправляешь нейросети.

```bash
mp prompt                                # в stdout
mp prompt -o instruction.md              # в файл
mp prompt -t "Перепиши greet на класс"   # с задачей
mp prompt --with-tree                    # + дерево проекта
```

### `mp config` — создать `.mpignore`

Кладёт `.mpignore` в текущую папку с разумными дефолтами (`node_modules/`, `dist/`, `backup/` и т.д.).

```bash
mp config
```

### `mp backup` — история и откат

Каждое применение `mp patch.md` создаёт **группу бэкапов**: слепок `before`/`after` для всех затронутых файлов. Указатель ходит по истории туда-сюда.

```bash
mp backup list              # список групп и текущее положение указателя
mp backup undo              # откатить последнюю применённую группу
mp backup redo              # вернуть последнюю откатанную
mp backup restore <N>       # перейти к состоянию после группы N
mp backup restore -1        # вернуться к начальному состоянию
mp backup clear             # стереть всю историю
```

Пример:

```
$ mp backup list
📚 Группы бэкапов (3):

  [0] 2026-10-02 15:30:00  01-update-greet.md        применён
  [1] 2026-10-02 15:30:01  02-add-format.md          применён
  [2] 2026-10-02 15:30:02  03-update-index.md        применён  ← текущий

Указатель: после группы [2].

$ mp backup undo
↩️  Откатили группу [2] (2026-10-02T15-30-02-000Z_a1b2c3)
```

Структура на диске:

```
backup/
├── index.json
└── 2026-10-02T15-30-02-000Z_a1b2c3/
    ├── meta.json
    └── files/
        ├── 0.before
        └── 0.after
```

Если файл был создан патчем, `before` не существует, и `undo` его удалит. Папка `backup/` защищена — патчи в неё не пройдут никогда, даже если забыть про `.mpignore`.

## Опции

| Параметр             | Краткий | Описание                                                                 |
| -------------------- | ------- | ------------------------------------------------------------------------ |
| `--cwd`              | `-C`    | Рабочая директория (по умолчанию `cwd`)                                  |
| `--ignore`           | `-i`    | Дополнительные игнорируемые пути через запятую                           |
| `--output`           | `-o`    | Куда записать результат (для `mp prompt`)                                |
| `--task`             | `-t`    | Описание задачи, встраивается в prompt                                   |
| `--with-tree`        | `-wt`   | Добавить дерево файлов проекта в prompt                                  |
| `--dry-run`          | `-dr`   | Показать, что будет изменено, но не записывать                           |
| `--no-backup`        | `-nb`   | Не создавать бэкап (undo/redo станут недоступны)                         |
| `--fuzz`             |         | Окно поиска хунка вокруг `@@`-номера (по умолчанию 50)                   |
| `--no-fuzz`          | `-nf`   | Строгое совпадение по `@@`-номеру                                        |
| `--no-progress`      | `-np`   | Отключить прогресс-вывод                                                 |
| `--help`             | `-h`    | Эта справка                                                              |

## Fuzzy-поиск

Нейросети часто врут с `@@`-номерами: пишут `@@ -42,3`, хотя реально хунк начинается на 5-й строке. `mp` это прощает.

Алгоритм:

1. Попробовать ровно на позиции из `@@`. Совпало — применяем.
2. Не совпало — расширять окно `±fuzz` строк, проверяя сначала вниз, потом вверх.
3. Если совсем нигде рядом — полный скан вперёд от курсора.

По умолчанию `fuzz = 50`. Если нужно строгое совпадение (например, для CI):

```bash
mp patch.md --no-fuzz
```

При неудаче получишь читаемое сообщение:

```
💥 Фатальная ошибка: DiffError: Хунк @@ -42,3 +42,3 @@ не найден.
Ожидалось:
    "export function greet(name: string, options: GreetOptions = {}): string {"
    "  const suffix = options.excited ? \"!\" : \".\""
    "}"
А в файле рядом:
    40: undefined
    41: undefined
    42: undefined
    43: undefined
    44: undefined
```

## `.mpignore`

Патчи фильтруются через `.mpignore` — синтаксис как у `.gitignore`:

```
node_modules/
dist/
*.log

# Отрицание
!important.log
```

Дефолтный конфиг создаётся командой `mp config` и включает `node_modules/`, `dist/`, `backup/` и типовой мусор. Если файла нет, используются встроенные дефолты — `node_modules/` не тронется никогда.

Дополнительные паттерны можно задать на лету:

```bash
mp patch.md --ignore "migrations/,*.sql"
```

## Генерация промпта

`mp prompt` собирает Markdown-файл с:

- задачей (если указана `--task`),
- деревом проекта (если `--with-tree`),
- описанием формата `MPC-*`,
- примерами: изменение файла, создание файла, несколько файлов в одном ответе,
- списком правил.

Пример:

````bash
mp prompt --with-tree -t "Добавь JSDoc ко всем экспортам" -o instruction.md
````

Содержимое `instruction.md`:

````markdown
# Инструкция для нейросети

...

## Задача

Добавь JSDoc ко всем экспортам

## Структура проекта

```
md-patch-cli/
├── src/
│   ├── backup.ts
│   ├── cli-options.ts
│   └── ...
├── .mpignore
├── package.json
└── tsconfig.json
```

## Формат ответа

Каждый файл — отдельный блок с тремя маркерами:
`MPC-PATH`, `MPC-CONTENT` и `MPC-END`. Никаких ``` в ответе.

**Все изменения — в одном ответе.** ...
````

Дерево уважает `.mpignore` и исключает `backup/`.

## Разработка

- Язык: TypeScript
- Модульная система: ESM (`"type": "module"`)
- Компиляция: `tsc`

```bash
npm run build   # сборка в dist/
npm start       # запуск собранной версии
```

### Демо

```bash
npm run build
bash examples/demo/run.sh
```

Скрипт копирует игрушечный проект в `mktemp -d`, применяет несколько патчей, показывает `backup list`/`undo`/`redo`, демонстрирует fuzzy-поиск, проверяет игнор `node_modules/`, генерирует промпт.

## Лицензия

MIT
