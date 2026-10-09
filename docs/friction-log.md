# Friction log

Bee CLI, library, API and device. All entries from real build sessions on
Windows 11, Node v24.18.0, @beeai/cli 0.7.3, Bee Pioneer paired to the
Android app. Dates are when the issue was hit.

---

## 1. Library is unusable on Windows: spawn ENOENT on every API call

**Severity: critical**

**Task** — Call `bee.api.me()` from `@beeai/cli/lib` in a Node project.

**Steps** — `npm install @beeai/cli`, then `createBeeClient()` and `await bee.api.me()`.

**Expected** — Profile JSON, as the README shows.

**Actual** — `Error: spawn bee ENOENT`. The library does not make HTTP calls;
it shells out to the `bee` binary. On Windows the global install is `bee.cmd`,
and since the Node security fix for CVE-2024-27980, `child_process.spawn`
refuses to execute `.cmd` or `.bat` without `shell: true`. Every method on
`api`, `auth` and `sse` fails identically. The package advertises no platform
restriction.

**Workaround** — `createBeeCliRunner` accepts `options.command` and
`options.baseArgs`, and `createBeeClient` passes options straight through.
Pointing `command` at `process.execPath` and `baseArgs` at the package's own
`bin/bee.js` bypasses the shim:

```js
createBeeClient({ command: process.execPath, baseArgs: [beeEntry] })
```

`require.resolve("@beeai/cli/bin/bee.js")` does not work, because the bin is
not in the package `exports` map, so the path has to be built by hand. Patching
`child_process.spawn` from outside also does not work: `dist/lib/index.js:178`
does `import { spawn as nodeSpawn }`, a live binding.

**Suggestion** — In the runner's spawn call, set `shell: true` on win32, or
resolve the `.cmd` path explicitly. Two lines at `dist/lib/index.js:215`. Also
worth exposing `bin/bee.js` in `exports` so consumers can resolve it, and
documenting `command`/`baseArgs`, which are the only reason a workaround exists
at all.

---

## 2. `bee-cli` on npm is a different, unrelated package

**Severity: high**

**Task** — Install the Bee CLI.

**Steps** — The hackathon resources page and the GitHub README both refer to it
as "bee-cli", so: `npm install -g bee-cli`.

**Expected** — The Bee CLI.

**Actual** — A Chinese-language scaffolding tool that owns that name on npm.
`bee login` returned `login 不是合法的命令` with only `init` and `help`
available. The real package is `@beeai/cli`. Both install a binary called
`bee`, so they collide.

**Workaround** — `npm uninstall -g bee-cli && npm install -g @beeai/cli`.

**Suggestion** — Write `@beeai/cli` everywhere the CLI is named, including the
hackathon resources page and the repo README. A new developer's first command
installs the wrong thing.

---

## 3. Developer Mode is documented as iOS-only but works on Android

**Severity: medium**

**Task** — Unlock Developer Mode to use the CLI.

**Steps** — Docs state the Bee iOS app is required, with Version tapped five
times in Settings. Running Android.

**Expected** — Based on the docs, no path forward on Android.

**Actual** — It works on Android. The Version row is one level deeper, under
Settings then About, not on the Settings list itself.

**Suggestion** — Say Android is supported and name the About screen. The
current wording tells Android users to stop.

---

## 4. `bee version` reports 0.0.0

**Severity: low**

**Task** — Confirm which CLI version is installed.

**Actual** — `bee --version` printed `0.0.0`; `bee version` printed
`@beeai/cli 0.7.3`. The former is the reflex command and gives a wrong answer
rather than an error.

**Suggestion** — Populate the version field, or have `--version` defer to the
same source as `version`.

---

## 5. `bee today` returns no conversations

**Severity: medium**

**Task** — Get today's conversations.

**Actual** — `bee today --json` returns `calendar_events`, `emails` and
`timezone`, with no conversations key at all. `bee now --json` does carry a
`conversations` key. Two commands that read as covering the same ground return
different shapes, and the one named for the day omits the device's primary
output.

**Workaround** — Use `bee now`, or the `/v1/conversations` endpoint via
`bee proxy`.

**Suggestion** — Include conversations in `today`, or document why it does not.

---

## 6. PDF export discards per-utterance timestamps

**Severity: high**

**Task** — Work out whether utterances carry timing, before building a
time-alignment layer.

**Steps** — Shared a conversation from the app as PDF and inspected it: 71
pages, 1,224 utterances, two hours.

**Expected** — Some per-utterance timing.

**Actual** — No clock reference anywhere except the session header. Nothing
below the conversation level. This made utterance-level alignment look
impossible and nearly changed the architecture.

**Then** — The API does return it. Every utterance carries `spoken_at` as an
absolute epoch, plus `start` and `end` offsets. The export is throwing away
data the API has.

**Suggestion** — Keep timestamps in the export, or state in the docs that the
export is lossy and the API is authoritative.

---

## 7. `utterances_count` is exactly double the real count

**Severity: high**

**Task** — Size work and budget tokens from the conversation list before
fetching full records.

**Actual** — `utterances_count` is exactly 2x the number of utterances actually
returned, verified across five conversations: 708/354, 1728/864, 402/201,
146/73, 72/36. Anyone paginating or estimating cost from this field is wrong
by half.

**Suggestion** — Fix the count, or document what it is counting.

---

## 8. Field is `transcriptions`, documentation and events say `utterance`

**Severity: low**

**Task** — Read utterances off a conversation.

**Actual** — `GET /v1/conversations/{id}` returns
`conversation.transcriptions[]`, and each transcription holds `utterances[]`.
The CLI docs and the SSE event type `new-utterance` both use "utterance", so
the intermediate `transcriptions` layer is a surprise. A conversation can hold
several transcriptions, so reading `transcriptions[0]` silently loses data.

**Suggestion** — Document the shape, including that transcriptions is a list.

---

## 9. `device_type` reports "unknown" for every conversation

**Severity: medium**

**Task** — Distinguish capture sources.

**Actual** — All conversations return `device_type: "unknown"`, though the docs
show values such as `ios`. Captured on a Pioneer band paired to Android. If a
user mixes a band and a watch, there is no way to tell the records apart.

**Suggestion** — Populate it, or drop it.

---

## 10. Speaker diarization is sparse, unexplained, and never identifies the owner

**Severity: high**

**Task** — Attribute an utterance to the person who said it.

**Actual** — Across four multi-person conversations, exactly one speaker ever
resolved: one instructor, named, in one conversation, 87 of 354 utterances.
Everything else returned `Unknown`, including every other participant in other
conversations, and including the device owner in all of them.

The app's People list has an entry for the owner showing "No conversations
yet", while the owner was present for every conversation recorded. There is no
voice enrollment or training anywhere in the app, and nothing documents what
makes a speaker resolve.

**Impact** — Any application that needs to know whether the wearer said
something, as opposed to someone near them, cannot use this field. Ownership
has to be inferred from phrasing, which is strictly worse.

**Suggestion** — Let the owner enroll a voiceprint, and treat the owner as the
default speaker when no other match is found. Document what drives
identification so developers know whether to build on it.

---

## Also worth noting

A webinar played through laptop speakers was recorded, transcribed, and
summarized as a conversation, complete with atmosphere and key takeaways. So
was an episode of a television show. Captured audio cannot be assumed to be
conversation the user took part in, and nothing in the record flags the
difference.