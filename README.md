# Ella

## Getting Started

### Requirements

- Node.js 20.9 or later
- Bun
- FFmpeg and FFprobe

### Installation

```bash
git clone https://github.com/OWNER/REPOSITORY.git
cd ella
bun install
```

### Configuration

Copy the configuration template:

```bash
cp .env.example .env.local
```

Set `VIDEO_ROOT` in `.env.local`:

```dotenv
VIDEO_ROOT=/absolute/path/to/videos
```

### Start the development server

```bash
bun run dev
```

Open the video management page and select **扫描目录** to import videos.

Open [http://localhost:3000](http://localhost:3000).
