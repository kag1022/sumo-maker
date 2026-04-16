#!/usr/bin/env node
/*
 * README が欠けている feature / logic / app / shared / scripts 配下の
 * ディレクトリを検出する。CI やローカル確認で「ドキュメントが腐る前」に気付くための軽量監査。
 *
 * 使い方:
 *   npm run doc:audit
 *   node scripts/shared/doc_audit.cjs
 *
 * 監査対象:
 *   - src/features/<name>/       README.md 必須
 *   - src/logic/<name>/          README.md 必須（ファイル単体は対象外）
 *   - src/app, src/shared, scripts ルート README.md 必須
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// 監査対象の親ディレクトリ：配下の各サブディレクトリに README.md を要求
const DIRS_REQUIRING_CHILDREN_README = [
  'src/features',
  'src/logic',
];

// 監査対象の単独ディレクトリ：そのディレクトリ自体に README.md を要求
const DIRS_REQUIRING_SELF_README = [
  'src/app',
  'src/features',
  'src/logic',
  'src/shared',
  'scripts',
];

// README を要求しないディレクトリ（ビルド成果物や小さすぎるもの）
const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  '.tmp',
]);

const missing = [];

const auditSelf = (relDir) => {
  const abs = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(abs)) return;
  const readme = path.join(abs, 'README.md');
  if (!fs.existsSync(readme)) {
    missing.push(path.join(relDir, 'README.md'));
  }
};

const auditChildren = (relDir) => {
  const abs = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(abs)) return;
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP.has(entry.name)) continue;
    const childRel = path.join(relDir, entry.name);
    const readme = path.join(REPO_ROOT, childRel, 'README.md');
    if (!fs.existsSync(readme)) {
      missing.push(path.join(childRel, 'README.md'));
    }
  }
};

for (const rel of DIRS_REQUIRING_SELF_README) auditSelf(rel);
for (const rel of DIRS_REQUIRING_CHILDREN_README) auditChildren(rel);

if (missing.length === 0) {
  console.log('doc:audit OK - すべての監査対象ディレクトリに README.md があります');
  process.exit(0);
}

console.error('doc:audit 失敗 - 以下のディレクトリに README.md がありません:');
for (const m of missing) {
  console.error('  - ' + m);
}
console.error('');
console.error('運用ルールは AGENTS.md の「ドキュメント運用ルール」を参照してください。');
process.exit(1);
