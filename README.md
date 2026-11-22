# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/bayusantosz3995/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/bayusantosz3995/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` answers every case exactly
as the reference does, but parses record by record instead of character by
character. A record whose line holds no double quote and no stray CR takes
the fast path (one slice + `split(',')`); anything else goes through an
`indexOf`/regex-driven state machine that reproduces the reference's exact
answers, including its error reporting (`stray_cr`, `quote_junk`,
`unterminated_quote`, `short_row`, `long_row`). Quote and CR positions are
tracked with forward-only cursors so no scan ever re-reads text, keeping the
whole parse linear.

`main.ts` is the harness driver: it reads `/input/cases.json`, answers each
case alone with `run()` from `solve.js`, and writes `/output/answers.json`.

## Verify

```sh
MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

then score `/tmp/out/answers.json` against the kit's
`practice/reference/expected.json` with the kit scorer.
