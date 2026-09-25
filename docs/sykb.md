# SYKB downloads

SYKB shares its files on Baidu Netdisk. Set up the
[Baidu Netdisk connection](baidu-netdisk.md) first.

## Download

Open **Utilities → Downloader**, select **New**, and choose **SYKB**.

Enter a share URL starting with `https://pan.baidu.com/s/`, a four-character
alphanumeric extraction code, and a filename without an extension. The separate
code field takes precedence over a `pwd` query parameter.

Ella extracts exactly one inner ZIP or 7z from the downloaded ZIP or 7z, then
exactly one MP4. Directory wrappers are allowed; extra files, links and other
layouts are rejected. Encrypted archives are not supported: the share extraction
code does not unlock archive encryption.

The MP4 uses the same import pipeline as Qinglanhua: filename and content conflict
checks, safe naming, metadata, thumbnail, library registration and automatic tag
suggestions. Temporary files are removed on success or failure. Downloads run in
the background: closing the browser does not cancel an active download.
