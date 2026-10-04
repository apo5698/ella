---
name: ella
description: Writing standard for every user-facing string in Ella (labels, help text, status, errors, empty states, log lines). Use before adding or editing any string a user reads, and when reviewing a component for copy quality. Enforces ASD-STE100, formal product language, no dashes, and no explaining the obvious.
---

# Writing standard

Ella is sold to customers. Every string a user can read follows these rules:
labels, buttons, help tips, status text, errors, empty states, and log lines
shown in the interface. Code comments, commit messages, and identifiers are
exempt.

## 1. ASD-STE100

English follows ASD-STE100 Simplified Technical English. Chinese follows the
same rules where they apply.

- Simple tenses only. No progressive tense and no -ing nouns: "Download in
  progress", "Smartag: {title}", not "Downloading", "Updating tags for {title}".
- Approved words: Cannot (not Unable to), keep (not retain), must (not
  require), can (not may), Cannot find (not does not exist), is not correct
  (not Invalid). No "Please" and no 请.
- One instruction per sentence, in the imperative. Split steps: "Save the
  file. Then run this command."
- Active voice with a named actor: "Ella added {title} to the library",
  "Smartag generated these tags".
- Short sentences: 20 words for procedures, 25 for descriptions.

## 2. Formal and precise

Write as product documentation, not as speech. Cut hedges and filler.

| Avoid                                  | Use                                  |
| -------------------------------------- | ------------------------------------ |
| 每个视频抽几帧                         | 每视频帧数                           |
| 决定送进模型的画面怎么选、选几张、多大 | 控制送入模型的帧选取方式、数量与尺寸 |
| 中途修改不影响正在跑的这一轮           | 任务开始后修改设置，更改在下一个任务生效 |

- Prefer 中 over 里, 于 over 在……上面, 该 over 这个.
- Precise nouns for quantities: 帧数, 宽度, 耗时, 数量. Not 几张, 多大, 多久.
- Name features by their exact interface label, in ASCII "" quotes. Never
  「」 or “”.
- One term per concept across the product: Smartag (not recognition or
  tagging, not 识别), media library (媒体库), endpoint (端点), tag suggestions
  (标签建议).

## 3. No dashes

Em dash, en dash as punctuation, and 破折号 are prohibited. Split the sentence,
or use a colon when the second clause defines the first. Hyphens in
identifiers, versions, and ranges (`28-135`, `qwen3-vl-8b`) are fine.

```
✗ 这是推理耗时最直接的杠杆——像素越多模型读图越慢，但太小会看不清细节。
✓ 宽度直接影响推理耗时。数值越大细节越清晰，耗时越长。
```

## 4. No explaining the obvious

Do not narrate what the interface shows or justify a design decision. If a
sentence does not change what the reader does, delete it. Mechanism belongs in
code comments; the interface states outcomes and tradeoffs.

```
✗ 不含模型推理时间。推理远大于这里的数字，且不随抽帧方式变化。
✓ 不含模型推理耗时。
```

## Checklist

1. Search the diff for `—`, `–`, `——`, `「`, `」`, `“`, `”`, `请` (as "please"), `Please`, `Unable`. There must be none.
2. Each sentence holds one instruction or one fact.
3. Every feature name matches its on-screen label and the product term list.
4. Delete any sentence the reader would not miss.
