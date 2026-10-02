import { join } from "path";
import { cwd } from "process";

export const ROOT_DIRECTORY = join(import.meta.dirname, "..");
export const WORKING_DIRECTORY = cwd();

export const MPC_MARKERS = {
  PATH: "MPC-PATH",
  CONTENT: "MPC-CONTENT",
  END: "MPC-END",
} as const;

export const DEFAULT_IGNORE_CONFIG = `\
# .mpignore — файл игнорирования для md-patch-cli
# Вышестоящие линии имеют больший приоритет
# Если нашли ошибку, пишите:
# https://github.com/FOCKUSTY/md-patch-cli/issues/new
# MIT License Copyright (c) 2026-present FOCKUSTY

# Бэкапы md-patch-cli
backup/

# Зависимости
node_modules/
package-lock.json
yarn.lock
pnpm-lock.yaml
bun.lockb

# Системы контроля версий и IDE
.git/
.idea/
.vscode/

# Результаты сборки
dist/
build/
.next/
.nuxt/
.output/
.svelte-kit/
target/
.gradle/

# Покрытие кода и метрики
coverage/
.nyc_output/

# Кэш сборщиков
.cache/
.parcel-cache/

# Python
__pycache__/
.pytest_cache/

# Go, PHP, Ruby
vendor/

# Временные файлы
.tmp/
tmp/
temp/
logs/
*.log

# Бекапы
*.bak
*.backup
*.old

# Файлы окружения
.env
.env.local
.env.*.local

# Системные файлы
.DS_Store
Thumbs.db
`;
