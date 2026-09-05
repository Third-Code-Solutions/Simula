# Redis evidence digest false positives

The History secret gate for source `585d6334b2e49bf32f321e6c4b6a76e57bb0b7af`
failed with 18 `generic-api-key` findings. Every match was one of six
`key_sha256` fields repeated in the three Redis pre/post verification receipts.
The capture implementation computes `hashlib.sha256(key.encode()).hexdigest()`;
it never records Redis key values or authentication credentials. These are
structural name fingerprints used to compare the live upgrade snapshots.

The configuration now recognizes only those six exact digests, only in those
three exact evidence paths, and only for `generic-api-key`. It does not skip a
commit, a file, all hashes, or another scanner rule. Git history remains intact.
The [pinned Gitleaks configuration documentation](https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md)
defines the AND condition and extracted-secret matching used here.

Verification with checksum-verified Gitleaks 8.30.1:

- `gitleaks git --log-opts=--all --redact --no-banner --no-color`: PASSED,
  297 commits / 20.80 MB scanned, no findings, 17.5 seconds.
- A dedicated synthetic Git fixture admitted the exact digest/path pair.
- A different synthetic digest in the same path was rejected (exit 1).
- The same digest in an unrelated path was rejected (exit 1).

The three-case receipt is [gitleaks-digest-scope.json](gitleaks-digest-scope.json).
Windows binary archive SHA256:
`d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`, checked
against the official versioned release checksums before extraction/execution.
The original hosted failure remains recorded; the next source commit must pass
the hosted gate with this reviewed configuration.

## Final production-receipt review

The post-release evidence commit0f82e00246bdc053500390ff9bb16fad71ffceed produced
seven generic-api-key findings in the three production promotion/migration
receipts. They are three file SHA256 values repeated across the frontend/backend
manifests and the previous deployed API Git commit. The file values were independently
rehashed from the verified signed source and matched its manifest; the previous
SHA resolves to an actual Git commit and matches the recorded live pre-migration
health response. No finding was an authentication credential.

New exceptions require the exact JSON field, exact known value, exact evidence
path and generic-api-key rule. Different values, fields and paths continue to fail.
Eight real synthetic Git/scanner cases passed; full300-commit history scanned
21.35MB with no findings after the configuration change. No commits were skipped
or rewritten, and the original failed scan is retained in the task history.
Proof: gitleaks-release-digest-proof.json and gitleaks-release-digest-scope.json.
