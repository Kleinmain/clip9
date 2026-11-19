# Shared Clipboard

A tiny online clipboard for Netlify. Open `yoursite.netlify.app/2357` on any device and you get the same text box. Change it on one device and the others update within a couple of seconds.

- Number in the URL = clipboard ID (1 to 10 digits). A new number is a fresh, empty clipboard.
- `/` shows a page to type or generate a number.
- Auto-saves as you type, auto-syncs by polling every 2 seconds.
- Clipboards remain stored until someone clears them.
- The homepage shows the last 10 clipboard numbers opened in that browser.
- No password. Anyone who knows or guesses the number can read and edit it, so don't store secrets.
- Storage: Netlify Blobs (built in, no database to set up). Backend: one Netlify Function.

## Folder structure

```
shared-clipboard/
├── netlify.toml                  # publish dir, functions dir, /<number> rewrite
├── package.json                  # depends on @netlify/blobs
├── public/
│   └── index.html                # the whole front end
└── netlify/functions/
    └── clip.mjs                  # GET/PUT API, stores text in Netlify Blobs
```

## Deploy

Use Git or the CLI. Plain drag-and-drop of a folder is not reliable here because the function needs `@netlify/blobs` installed and bundled at build time.

### Option A: Git (easiest long-term)

1. Push this folder to a GitHub repository.
2. In Netlify: **Add new site, Import an existing project**, pick the repo.
3. Leave the build command empty. Netlify reads `netlify.toml` (publish `public`, functions `netlify/functions`) and installs dependencies automatically.
4. Click **Deploy**. Open `https://<your-site>.netlify.app/2357`.

### Option B: Netlify CLI

```bash
npm install -g netlify-cli
cd shared-clipboard
npm install
netlify login
netlify deploy --prod     # first run: choose "Create & configure a new project"
```

If prompted for the publish directory enter `public`; the functions directory is picked up from `netlify.toml`.

### Test locally (optional)

```bash
npm install
netlify dev
```

Then open `http://localhost:8888/2357` in two browser windows.

## Settings you may want to change

In `netlify/functions/clip.mjs`:

- `MAX_CHARS` is the size limit (default 500,000 characters).

In `public/index.html`:

- `POLL_MS` is the sync interval (default 2000 ms).

## Notes

- If two people type at the same moment, the last save wins. The page does not merge edits.
- Netlify Functions and Blobs have free-tier limits; with polling every 2 seconds, each open tab makes about 30 requests a minute. Fine for personal use, but close tabs you don't need.
