# SYKB downloads

SYKB shares its files on Baidu Netdisk. Set up the
[Baidu Netdisk connection](baidu-netdisk.md) first.

## Download

Open **Utilities → Downloader**, select **New**, and choose **SYKB**.

Enter a share URL starting with `https://pan.baidu.com/s/`, a four-character
alphanumeric extraction code, and a filename without an extension. The separate
code field takes precedence over a `pwd` query parameter.

Ella expects one outer archive holding exactly one inner archive, which holds
exactly one video. Either archive may be ZIP, 7z, tar (including old V7 tar) or
tar.gz; both are recognised by their contents, not by their names. Directory
wrappers are allowed. The video is recognised by its header, so a file with no
extension is found and stored as `.mp4`. Links and paths that leave the
extraction folder are rejected. Encrypted archives are not supported: the share
extraction code does not unlock archive encryption.

## When the layout does not match

The download is kept instead of deleted. The failed entry shows **Inspect**,
which lists what arrived with every nested archive opened. Choose a video and
select **Use This File** to import it under the task's name, without
downloading again. A file that is not a video is refused and the download stays
available to choose again.

Kept files are removed when the video is imported, when the entry is removed or
cleared, or when **Retry** downloads again.

The video uses the same import pipeline as Qinglanhua: filename and content conflict
checks, safe naming, metadata, thumbnail, library registration and automatic tag
suggestions. Working files are removed on success and on any other failure. Downloads run in
the background: closing the browser does not cancel an active download.
