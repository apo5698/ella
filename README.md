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

Create `.env.local` in the project root:

```dotenv
VIDEO_ROOT=/absolute/path/to/videos
```

### Start the development server

```bash
bun run dev
```

Open the video management page and select **扫描目录** to import videos.

Open [http://localhost:3000](http://localhost:3000).
