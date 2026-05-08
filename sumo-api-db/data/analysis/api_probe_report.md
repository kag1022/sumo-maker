# sumo-api.com API Probe Report (Phase 1)
Generated: 2026-05-07T11:00:26Z

## Step 1: Division 表記確認

| URL | Candidate | HTTP | Type | Top-Level Keys | OK |
|-----|-----------|------|------|----------------|----|
| `.../Makuuchi` | `Makuuchi` | 200 | `object` | bashoId, division, east, west | YES |
| `.../Juryo` | `Juryo` | 200 | `object` | bashoId, division, east, west | YES |
| `.../Makushita` | `Makushita` | 200 | `object` | bashoId, division, east, west | YES |
| `.../Sandanme` | `Sandanme` | 200 | `object` | bashoId, division, east, west | YES |
| `.../Jonidan` | `Jonidan` | 200 | `object` | bashoId, division, east, west | YES |
| `.../Jonokuchi` | `Jonokuchi` | 200 | `object` | bashoId, division, east, west | YES |
| `.../makuuchi` | `makuuchi` | 200 | `object` | bashoId, division, east, west | YES |
| `.../juryo` | `juryo` | 200 | `object` | bashoId, division, east, west | YES |
| `.../makushita` | `makushita` | 200 | `object` | bashoId, division, east, west | YES |
| `.../sandanme` | `sandanme` | 200 | `object` | bashoId, division, east, west | YES |
| `.../jonidan` | `jonidan` | 200 | `object` | bashoId, division, east, west | YES |
| `.../jonokuchi` | `jonokuchi` | 200 | `object` | bashoId, division, east, west | YES |
| `.../幕内` | `幕内` | -1 | `None` | - | NO |
| `.../十両` | `十両` | -1 | `None` | - | NO |
| `.../幕下` | `幕下` | -1 | `None` | - | NO |
| `.../三段目` | `三段目` | -1 | `None` | - | NO |
| `.../序二段` | `序二段` | -1 | `None` | - | NO |
| `.../序ノ口` | `序ノ口` | -1 | `None` | - | NO |
| `.../Maku-uchi` | `Maku-uchi` | 400 | `None` | - | NO |
| `.../Makunouchi` | `Makunouchi` | 400 | `None` | - | NO |
| `.../Ju-ryo` | `Ju-ryo` | 400 | `None` | - | NO |
| `.../Juryou` | `Juryou` | 400 | `None` | - | NO |

**結論**: PascalCase 6種のみ有効。
```
Jonidan, Jonokuchi, Juryo, Makushita, Makuuchi, Sandanme
```

## Step 2: Basho Metadata

| URL | bashoId | HTTP | Type | Top-Level Keys |
|-----|---------|------|------|----------------|
| `.../basho/202603` | 202603 | 200 | `object` | date, startDate, endDate, yusho, specialPrizes |
| `.../basho/202601` | 202601 | 200 | `object` | date, startDate, endDate, yusho, specialPrizes |
| `.../basho/201903` | 201903 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes |
| `.../basho/200001` | 200001 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes |
| `.../basho/198901` | 198901 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes |
| `.../basho/197001` | 197001 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes |
| `.../basho/196007` | 196007 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes |

## Step 2: Banzuke

| URL | bashoId | Division | HTTP | Type | Top-Level Keys | #Rikishi | Record | wins field |
|-----|---------|----------|------|------|----------------|----------|--------|------------|
| `.../banzuke/Jonidan` | 202603 | Jonidan | 200 | `object` | bashoId, division, east, west | 200 | YES | YES |
| `.../banzuke/Jonokuchi` | 202603 | Jonokuchi | 200 | `object` | bashoId, division, east, west | 42 | YES | YES |
| `.../banzuke/Juryo` | 202603 | Juryo | 200 | `object` | bashoId, division, east, west | 28 | YES | YES |
| `.../banzuke/Makushita` | 202603 | Makushita | 200 | `object` | bashoId, division, east, west | 121 | YES | YES |
| `.../banzuke/Makuuchi` | 202603 | Makuuchi | 200 | `object` | bashoId, division, east, west | 42 | YES | YES |
| `.../banzuke/Sandanme` | 202603 | Sandanme | 200 | `object` | bashoId, division, east, west | 161 | YES | YES |
| `.../banzuke/Jonidan` | 202601 | Jonidan | 200 | `object` | bashoId, division, east, west | 202 | YES | YES |
| `.../banzuke/Jonokuchi` | 202601 | Jonokuchi | 200 | `object` | bashoId, division, east, west | 42 | YES | YES |
| `.../banzuke/Juryo` | 202601 | Juryo | 200 | `object` | bashoId, division, east, west | 28 | YES | YES |
| `.../banzuke/Makushita` | 202601 | Makushita | 200 | `object` | bashoId, division, east, west | 121 | YES | YES |
| `.../banzuke/Makuuchi` | 202601 | Makuuchi | 200 | `object` | bashoId, division, east, west | 42 | YES | YES |
| `.../banzuke/Sandanme` | 202601 | Sandanme | 200 | `object` | bashoId, division, east, west | 160 | YES | YES |
| `.../banzuke/Jonidan` | 201903 | Jonidan | 200 | `object` | bashoId, division, east, west | 212 | YES | YES |
| `.../banzuke/Jonokuchi` | 201903 | Jonokuchi | 200 | `object` | bashoId, division, east, west | 51 | YES | YES |
| `.../banzuke/Juryo` | 201903 | Juryo | 200 | `object` | bashoId, division, east, west | 28 | YES | YES |
| `.../banzuke/Makushita` | 201903 | Makushita | 200 | `object` | bashoId, division, east, west | 120 | YES | YES |
| `.../banzuke/Makuuchi` | 201903 | Makuuchi | 200 | `object` | bashoId, division, east, west | 42 | YES | YES |
| `.../banzuke/Sandanme` | 201903 | Sandanme | 200 | `object` | bashoId, division, east, west | 200 | YES | YES |
| `.../banzuke/Jonidan` | 200001 | Jonidan | 200 | `object` | bashoId, division, east, west | 300 | YES | YES |
| `.../banzuke/Jonokuchi` | 200001 | Jonokuchi | 200 | `object` | bashoId, division, east, west | 83 | YES | YES |
| `.../banzuke/Juryo` | 200001 | Juryo | 200 | `object` | bashoId, division, east, west | 26 | YES | YES |
| `.../banzuke/Makushita` | 200001 | Makushita | 200 | `object` | bashoId, division, east, west | 120 | YES | YES |
| `.../banzuke/Makuuchi` | 200001 | Makuuchi | 200 | `object` | bashoId, division, east, west | 40 | YES | YES |
| `.../banzuke/Sandanme` | 200001 | Sandanme | 200 | `object` | bashoId, division, east, west | 200 | YES | YES |
| `.../banzuke/Jonidan` | 198901 | Jonidan | 200 | `object` | bashoId, division, east, west | 279 | YES | YES |
| `.../banzuke/Jonokuchi` | 198901 | Jonokuchi | 200 | `object` | bashoId, division, east, west | 84 | YES | YES |
| `.../banzuke/Juryo` | 198901 | Juryo | 200 | `object` | bashoId, division, east, west | 26 | YES | YES |
| `.../banzuke/Makushita` | 198901 | Makushita | 200 | `object` | bashoId, division, east, west | 121 | YES | YES |
| `.../banzuke/Makuuchi` | 198901 | Makuuchi | 200 | `object` | bashoId, division, east, west | 38 | YES | YES |
| `.../banzuke/Sandanme` | 198901 | Sandanme | 200 | `object` | bashoId, division, east, west | 201 | YES | YES |
| `.../banzuke/Jonidan` | 197001 | Jonidan | 200 | `object` | bashoId, division, east, west | 162 | NO | YES |
| `.../banzuke/Jonokuchi` | 197001 | Jonokuchi | 200 | `object` | bashoId, division, east, west | 32 | NO | YES |
| `.../banzuke/Juryo` | 197001 | Juryo | 200 | `object` | bashoId, division, east, west | 26 | YES | YES |
| `.../banzuke/Makushita` | 197001 | Makushita | 200 | `object` | bashoId, division, east, west | 121 | YES | YES |
| `.../banzuke/Makuuchi` | 197001 | Makuuchi | 200 | `object` | bashoId, division, east, west | 34 | YES | YES |
| `.../banzuke/Sandanme` | 197001 | Sandanme | 200 | `object` | bashoId, division, east, west | 200 | NO | YES |
| `.../banzuke/Jonidan` | 196007 | Jonidan | 200 | `object` | bashoId, division, east, west | 252 | YES | YES |
| `.../banzuke/Jonokuchi` | 196007 | Jonokuchi | 200 | `object` | bashoId, division, east, west | 49 | YES | YES |
| `.../banzuke/Juryo` | 196007 | Juryo | 200 | `object` | bashoId, division, east, west | 38 | YES | YES |
| `.../banzuke/Makushita` | 196007 | Makushita | 200 | `object` | bashoId, division, east, west | 170 | YES | YES |
| `.../banzuke/Makuuchi` | 196007 | Makuuchi | 200 | `object` | bashoId, division, east, west | 41 | YES | YES |
| `.../banzuke/Sandanme` | 196007 | Sandanme | 200 | `object` | bashoId, division, east, west | 211 | NO | YES |

## Step 2: Torikumi

| URL | bashoId | HTTP | Type | Top-Level Keys | Matches |
|-----|---------|------|------|----------------|---------|
| `.../torikumi/Makuuchi/1` | 202603 | 200 | `object` | date, startDate, endDate, yusho, specialPrizes, torikumi | 21 |
| `.../torikumi/Makuuchi/1` | 202601 | 200 | `object` | date, startDate, endDate, yusho, specialPrizes, torikumi | 21 |
| `.../torikumi/Makuuchi/1` | 201903 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes, torikumi | 21 |
| `.../torikumi/Makuuchi/1` | 200001 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes, torikumi | 19 |
| `.../torikumi/Makuuchi/1` | 198901 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes, torikumi | 18 |
| `.../torikumi/Makuuchi/1` | 197001 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes, torikumi | 17 |
| `.../torikumi/Makuuchi/1` | 196007 | 200 | `object` | date, location, startDate, endDate, yusho, specialPrizes, torikumi | 21 |

## Step 2: Torikumi Entry Fields (item 7)

| bashoId | winnerId | eastId | westId | kimarite | winnerEn |
|---------|----------|--------|--------|----------|----------|
| 202603 | YES | YES | YES | YES | YES |
| 202601 | YES | YES | YES | YES | YES |
| 201903 | YES | YES | YES | YES | YES |
| 200001 | YES | YES | YES | YES | YES |
| 198901 | YES | YES | YES | YES | YES |
| 197001 | YES | YES | YES | YES | YES |
| 196007 | YES | YES | YES | YES | YES |

## Step 2: Banzuke Entry Fields (items 5-6)

| bashoId | Division | rikishiID | rank | side | shikonaEn | rankValue | wins | losses | absences |
|---------|----------|-----------|------|------|-----------|-----------|------|--------|----------|
| 202603 | Jonidan | YES | YES | YES | YES | YES | YES | YES | YES |
| 202603 | Jonokuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 202603 | Juryo | YES | YES | YES | YES | YES | YES | YES | YES |
| 202603 | Makushita | YES | YES | YES | YES | YES | YES | YES | YES |
| 202603 | Makuuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 202603 | Sandanme | YES | YES | YES | YES | YES | YES | YES | YES |
| 202601 | Jonidan | YES | YES | YES | YES | YES | YES | YES | YES |
| 202601 | Jonokuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 202601 | Juryo | YES | YES | YES | YES | YES | YES | YES | YES |
| 202601 | Makushita | YES | YES | YES | YES | YES | YES | YES | YES |
| 202601 | Makuuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 202601 | Sandanme | YES | YES | YES | YES | YES | YES | YES | YES |
| 201903 | Jonidan | YES | YES | YES | YES | YES | YES | YES | YES |
| 201903 | Jonokuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 201903 | Juryo | YES | YES | YES | YES | YES | YES | YES | YES |
| 201903 | Makushita | YES | YES | YES | YES | YES | YES | YES | YES |
| 201903 | Makuuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 201903 | Sandanme | YES | YES | YES | YES | YES | YES | YES | YES |
| 200001 | Jonidan | YES | YES | YES | YES | YES | YES | YES | YES |
| 200001 | Jonokuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 200001 | Juryo | YES | YES | YES | YES | YES | YES | YES | YES |
| 200001 | Makushita | YES | YES | YES | YES | YES | YES | YES | YES |
| 200001 | Makuuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 200001 | Sandanme | YES | YES | YES | YES | YES | YES | YES | YES |
| 198901 | Jonidan | YES | YES | YES | YES | YES | YES | YES | YES |
| 198901 | Jonokuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 198901 | Juryo | YES | YES | YES | YES | YES | YES | YES | YES |
| 198901 | Makushita | YES | YES | YES | YES | YES | YES | YES | YES |
| 198901 | Makuuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 198901 | Sandanme | YES | YES | YES | YES | YES | YES | YES | YES |
| 197001 | Jonidan | YES | YES | YES | YES | YES | YES | YES | YES |
| 197001 | Jonokuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 197001 | Juryo | YES | YES | YES | YES | YES | YES | YES | YES |
| 197001 | Makushita | YES | YES | YES | YES | YES | YES | YES | YES |
| 197001 | Makuuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 197001 | Sandanme | YES | YES | YES | YES | YES | YES | YES | YES |
| 196007 | Jonidan | YES | YES | YES | YES | YES | YES | YES | YES |
| 196007 | Jonokuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 196007 | Juryo | YES | YES | YES | YES | YES | YES | YES | YES |
| 196007 | Makushita | YES | YES | YES | YES | YES | YES | YES | YES |
| 196007 | Makuuchi | YES | YES | YES | YES | YES | YES | YES | YES |
| 196007 | Sandanme | YES | YES | YES | YES | YES | YES | YES | YES |

**結論**: 全場所・全階級で rikishiID, rank, side, shikona, rankValue, wins, losses, absences が利用可能。

## Response Structure (202603/Makuuchi)
```json
{
  "bashoId": "str",
  "division": "str",
  "east": [
    "dict"
  ],
  "west": [
    "dict"
  ]
}
```

## Entry Fields
```
side, rikishiID, shikonaEn, shikonaJp, rankValue, rank, record, wins, losses, absences
```

## 正規化上の不明点 (item 10)

1. **rank 文字列のパース**: API は `"Yokozuna 1 East"` 形式。`normalize.py` の `parse_api_rank()` で分割可能。
2. **rankValue の意味**: 101=Yokozuna1East, 201=Ozeki1East。side は rank 文字列側に含まれ、rankValue 単体では東西を判別できない。
3. **張出の有無**: API レスポンスに張出フラグはない。`"Yokozuna 2 East"` のような複数横綱時代の表現で代用。
4. **division 名と rank 名の不一致**: division=Makuuchi だが rank=Maegashira。`normalize.py` は rank 文字列の先頭トークンのみを使うため問題なし。
5. **空 rank**: 196007 など古い場所で rank 文字列が空のエントリが 16 件確認。これらは遷移計算から除外（`to_banzuke_label` が None を返す）。
6. **wins/losses/absences の直接利用**: record 配列をパースしなくても、entry 直下に wins/losses/absences が存在するため、`records.py` の `parse_record` は不要の可能性あり。
7. **torikumi vs banzuke の record**: banzuke の record 配列と torikumi エンドポイントは別物。banzuke 内蔵 record で W-L-A は事足りる。
8. **division 名の大文字小文字**: API は case-insensitive だが、レスポンスの `division` フィールドは常に PascalCase。
