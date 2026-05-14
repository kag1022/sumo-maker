# Current Architecture Snapshot

このファイルは、リリース前ガードレール確認時点の実コードを正として記録する短い現況メモです。
詳細な設計方針は各 feature / logic README と AGENTS.md を優先します。

## Persistence

- Dexie DB 名: `sumo-maker-v15`
- 最新 Dexie schema version: `18`
- DB 名と Dexie schema version は別物です。
- 破壊的に旧 save を読めなくする変更では DB 名更新を検討します。
- additive な table / index 追加や backfill 可能な変更では Dexie schema migration を使います。

## Release Guardrail Notes

- `src/logic/persistence/db.ts` を DB 名と schema version の一次情報源にします。
- README / AGENTS / persistence README / この snapshot の値がずれた場合は、実コードを確認してドキュメントを更新します。
