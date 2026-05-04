## Conformance Matrix Fixtures

The ten templates in `templates/` are plain-text brief snippets fed to the adapter
conformance harness as prompt seeds. Each template stresses a distinct shape so
different failure modes surface when a new adapter is tested: `t01` is minimal
(baseline), `t02` is long (buffer/truncation), `t03` lists image attachments
(attachment-handling), `t04` is dense Markdown (parse complexity), `t05` uses
terse imperative voice (brevity handling), `t06` demands a high accessibility bar
(a11y focus), `t07` chains must-fix items (multi-item feedback), `t08` tests brand
collision copy (brand conflict detection), `t09` contains CJK text (multibyte
UTF-8), and `t10` exercises a full three-round grind (round exhaustion).

A template "passes" when `runOnce` returns verdict `shipped`. An adapter passes the
full matrix when at least 90% of templates are `shipped` and at most 5% are
`parse_failed` (after retries). Templates do not need to be production-quality
briefs; they only need to trigger the adapter's failure modes reliably in CI.
