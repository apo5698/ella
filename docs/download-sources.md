# Download sources

A download source tells Ella how to get a video: how to fetch the files, and
how the video is packed inside them. Sources are settings, not code. Edit them
as JSON in **Settings → Download Settings → Download Sources**. Ella ships with
no sources.

## Format

The setting is a JSON array. Each item is one source:

```json
[
  {
    "id": "example-direct",
    "name": "Example direct link",
    "description": "One 7z archive behind a direct link.",
    "transport": "http",
    "layers": 1,
    "password": "example-password",
    "onUnexpectedLayout": "fail"
  },
  {
    "id": "example-share",
    "name": "Example share",
    "transport": "baidu-share",
    "layers": 2
  }
]
```

| Field                | Required | Meaning                                                                                                                                 |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | Yes      | Lowercase letters, digits and `-`, 32 characters at most. Each download stores it. Do not change it after the first download.           |
| `name`               | Yes      | The name in the source list and the download history.                                                                                   |
| `description`        | No       | Text under the source list in the **New Download** dialog.                                                                              |
| `transport`          | Yes      | `http`: a direct HTTP or HTTPS link. `baidu-share`: a Baidu Netdisk share link and its extraction code.                                 |
| `layers`             | No       | The number of archives around the video, from 0 to 3. Default: 1. 0 means that the download is the video.                               |
| `password`           | No       | The archive password. If it is present, the form shows a password field with this value. Use `""` to show an empty field.               |
| `onUnexpectedLayout` | No       | `retain`: keep the files, so you can choose the video with **Inspect**. `fail`: delete the files and show the error. Default: `retain`. |

Unknown fields are errors. A save with an error does not change the saved
sources, and the editor shows each error with its location, for example
`[1].transport`.

The editor checks the list while you type. Press Ctrl+Space for the fields
and values that are valid at the cursor, or for a template of a new source
inside the list. Point at a field to see its description. Press Ctrl+S or
Cmd+S to save.

## Layout

Ella recognises archives and videos by their contents, not by their names.

- Each layer before the last must hold exactly one archive. Directory wrappers
  are allowed.
- After the last layer, exactly one file must be a video. Other files are
  ignored.
- ZIP, 7z, tar (including old V7 tar) and tar.gz archives are supported. The
  password, if there is one, applies to every layer.
- Ella rejects links and paths that leave the extraction folder.

When the layout does not match and `onUnexpectedLayout` is `retain`, the failed
entry shows **Inspect**. Inspect lists the downloaded files with every nested
archive opened. Select a video, then select **Use This File** to import it
without a new download.

## Transports

`baidu-share` uses the Baidu Netdisk connection. Set it up first, see
[Baidu Netdisk](baidu-netdisk.md). A new transport is code: add it to
`DOWNLOAD_TRANSPORTS` in `lib/utilities/downloadSources.ts` and to
`fetchFiles` in `lib/utilities/downloadPipeline.ts`.

## Existing installations

An installation that downloaded before sources were settings has no saved
list. Ella then builds one from the download history: one source for each id
in the history, with the layout that source had. Change the names in the
editor.
