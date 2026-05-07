# sumo-api-db

sumo-api.com 由来の長期番付遷移データパイプライン。

**対象期間**: 1960年7月場所 〜 2026年3月場所 (393場所)
**対象階級**: Makuuchi, Juryo, Makushita, Sandanme, Jonidan, Jonokuchi
**対象サイト**: [https://www.sumo-api.com/](https://www.sumo-api.com/)

## API アクセスルール

sumo-api.com は無料の公開 API です。以下のルールを必ず守ってください。

1. **レート制限**: リクエスト間隔 **1.0 秒以上**（`api_client.py` に実装済み）
2. **raw JSON 保存**: 同じ URL は再リクエストしない（キャッシュファイルがあればスキップ）
3. **指数バックオフ**: HTTP エラー時は 1s → 2s → 4s → 8s → 16s で最大5回リトライ（404 は即停止）
4. **404/空レスポンスは即失敗扱いしない**: `collection_report.md` に記録し、処理を継続する
5. **取得失敗の記録**: 失敗した URL、HTTP status、例外、保存先を `data/analysis/collection_report.md` に記録
6. **API仕様の検証**: 実レスポンス構造を `api_probe_report.md` に記録し、推測で進めない
7. **途中再開可能**: キャッシュファイルがある限り、中断・再開しても重複取得しない
8. **全件取得の禁止**: いきなり395場所を取得しない。`--sample` / `--range` / `--all` で範囲を明示する

## 構成

```
raw_json → intermediate JSON → analysis JSON
```

### ファイル配置とサイズ

| 階層 | ディレクトリ | サイズ | Git |
|------|-------------|--------|-----|
| Raw | `data/raw_json/basho/` | ~200 KB | 除外 |
| Raw | `data/raw_json/banzuke/` | ~80 MB | 除外 |
| Intermediate | `data/intermediate/` | ~120 MB | 除外 |
| Analysis (full) | `data/analysis/banzuke_transition_sumo_api_196007_202603.json` | ~20 MB | 除外 |
| Analysis (sample) | `data/analysis/banzuke_transition_sumo_api_sample.json` | ~40 KB | **コミット** |
| Reports | `data/analysis/*.md` | ~2 KB | **コミット** |

### 生成手順

```bash
# 1. API 疎通確認（必須）
npm run sumo-api:probe

# 2. データ取得（範囲を明示）
python sumo-api-db/scripts/01_fetch_basho.py --sample 3     # 最初の3場所のみ
python sumo-api-db/scripts/02_fetch_banzuke.py --sample 3   # 最初の3場所×6階級
python sumo-api-db/scripts/02_fetch_banzuke.py --range 196007 196011  # 指定範囲
python sumo-api-db/scripts/02_fetch_banzuke.py --all         # 全範囲（要確認）

# 3. 中間→分析JSON生成（約2分）
npm run sumo-api:build

# npm 経由の一括（全範囲）
npm run sumo-api:all
```

### パイプライン詳細

| Step | Script | 入力 | 出力 |
|------|--------|------|------|
| Probe | `00_probe_api.py` | API | `api_probe_report.json/md` |
| Fetch | `01_fetch_basho.py` | `GET /api/basho/{id}` | `raw_json/basho/` |
| Fetch | `02_fetch_banzuke.py` | `GET /api/basho/{id}/banzuke/{division}` | `raw_json/banzuke/` |
| Build | `04_build_basho_records.py` | `raw_json/banzuke/` | `intermediate/banzuke_entries/`, `intermediate/basho_records/` |
| Build | `05_build_rank_movement.py` | `intermediate/banzuke_entries/` | `intermediate/rank_movements/` |
| Export | `06_export_predict_json.py` | `intermediate/` | `analysis/banzuke_transition_sumo_api_*.json` |
| Compare | `07_compare_with_existing_predict.py` | analysis JSON | `analysis/compare_with_existing_predict.md` |
| Validate | `08_validate_long_range.py` | analysis JSON | `analysis/long_range_summary.md` |

### 欠損場所

本場所中止により以下の bashoId はデータが存在しません。

| bashoId | 理由 |
|---------|------|
| `201103` | 東日本大震災により中止 |
| `202005` | COVID-19 により中止 |

### predict:demo 接続

```bash
# 単一ソース
npm run predict:demo -- --source sumo-api 東横綱1枚目 13-2

# 平成データとの比較
npm run predict:demo -- --compare 東前頭5枚目 10-5
```

### tests/

```bash
# 未実装。以下を予定:
# python -m pytest sumo-api-db/tests/
```

### ソースモジュール

```
src/sumo_api_data/
  api_client.py        HTTP クライアント（レート制限内蔵）
  basho_ids.py         場所ID生成・次場所計算
  normalize.py         API rank → 日本語ラベル変換
  rank_order.py        ラベル順序付け・数値化
  records.py           取組 record → W-L-A 集計
  transition_model.py  遷移確率テーブル構築
  io_utils.py          JSON 読み書き
  report.py            レポート・サマリ生成
```
