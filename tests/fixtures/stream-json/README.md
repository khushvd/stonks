# stream-json fixtures

Captured from `claude -p "<prompt>" --output-format stream-json --verbose`.

Event lines our parser (`src/coordinator/stream.ts`) cares about — one JSON object per line:

- `{"type":"system","subtype":"init","model":"<model>", ...}` → `{kind:'text', text:'started'}` is NOT emitted; init is mapped to `null` (ignored). Model pin is asserted at spawn, not here.
- `{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}` → `{kind:'text'}`
- `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"pnpm scrape ..."}}]}}` → `{kind:'step'}` (pnpm step) or `{kind:'tool'}` (other)
- `{"type":"result","subtype":"success","is_error":false,"result":"..."}` → `{kind:'done', ok:true}`
- `{"type":"result","is_error":true, ...}` → `{kind:'error'}`

Everything else (`hook_started`, `hook_completed`, `type:"user"` tool results, blank lines) → `null`.

`hello.jsonl` is the happy-path capture. The synthetic `tool_use` and `error` lines used in
`tests/coordinator/stream.test.ts` are hand-written inline (documented there) because a trivial
prompt does not exercise tool calls or errors.
