---
name: ui-copy
description: Writing standard for every user-facing string in Ella (labels, help text, status, errors, empty states, log lines). Use before adding or editing any string a user reads, and when reviewing a component for copy quality. Enforces formal product language, bans dashes, and bans explaining the obvious.
---

# UI copy standard

Ella is sold to customers. Its copy is part of the product, not a
note between developers. Every string a user can read is held to this
standard: labels, buttons, help tips, status text, error messages, empty
states, and any log line surfaced in the interface.

## The three rules

### 1. Formal, professional, concise, precise

Write as product documentation, not as speech. State what a thing is or what
happened. Cut hedges, filler, and rhetorical asides.

| Avoid                                  | Use                                    |
| -------------------------------------- | -------------------------------------- |
| 每个视频抽几帧                         | 每视频帧数                             |
| 决定送进模型的画面怎么选、选几张、多大 | 控制送入模型的帧选取方式、数量与尺寸   |
| 停掉服务或换成非视觉模型都会让识别失败 | 服务停止或模型不支持图像时，识别不可用 |
| 快得多，但抽到的是那一刻恰好的画面     | 速度显著提升，所选画面不保证具有代表性 |
| 请在 LM Studio 里下载该模型            | 请在 LM Studio 中下载该模型            |
| 中途修改不影响正在跑的这一轮           | 任务启动后修改设置不影响本次运行       |

Specifics to observe:

- Prefer 中 over 里, 于 over 在……上面, 该 over 这个.
- Name features by their exact interface label, in ASCII "" quotes. Never 「」, never “”.
- Use precise nouns for quantities: 帧数, 宽度, 耗时, 数量. Not 几张, 多大, 多久.
- Keep terminology identical across the product. One concept, one term.

### 2. No dashes

Em dash, en dash used as punctuation, and Chinese 破折号 are prohibited in all
strings. They read as informal asides.

Rewrite by splitting into two sentences, or by using a colon when the second
clause defines the first.

```
✗ 这是推理耗时最直接的杠杆——像素越多模型读图越慢，但太小会看不清细节。
✓ 宽度直接影响推理耗时。数值越大细节越清晰，耗时越长。

✗ 无法连接 http://localhost:1234/v1 — 连接超时（3 秒）。
✓ 无法连接 http://localhost:1234/v1，连接超时（3 秒）。
```

A hyphen inside an identifier, a version, or a numeric range (`28-135`,
`qwen3-vl-8b`) is not a dash and is fine.

### 3. No explaining the obvious

Do not narrate what the interface already shows, and do not justify a design
decision to the user. If a sentence would not change what someone does, delete
it.

```
✗ 不含模型推理时间。推理远大于这里的数字，且不随抽帧方式变化。
✓ 不含模型推理耗时。

✗ 整片解码一遍，给每一帧的画面变化打分，再分段挑出变化最大的一帧。选帧更有代表性，代价是解码整个文件。
✓ 解码完整文件并评估画面变化，分段选取变化最显著的帧。选帧质量高，耗时较长。
```

Mechanism belongs in code comments, where the audience is a maintainer. The
interface states outcomes and tradeoffs only.

## Checklist before committing a string

1. Read it aloud. If it sounds like speech, rewrite it.
2. Search the diff for `—`, `–`, `——`, `「`, `」`, `“`, and `”`. There must be none.
3. For each sentence, ask what the reader would do differently without it. If
   nothing, delete it.
4. Confirm every feature name matches its on-screen label exactly.
5. Confirm the same concept uses the same word as elsewhere in the product.

## Scope

This governs user-facing strings only. Code comments, commit messages, and
variable names follow the surrounding code's conventions and are exempt.
