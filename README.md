# Asset Editor

A standalone metadata editor that loads avatar and board assets from `assets/data.js` and `assets/boards_metadata.json`.

## Getting Started

Use any static file server to open the tool in a browser. For example:

```bash
npx http-server .
```

Then open [http://localhost:8080/asset_editor/](http://localhost:8080/asset_editor/) in your browser.

## Features

- Switch between girl and boy base avatars.
- Search and filter assets by category, id, or filename.
- Add assets to the avatar with correct layering and drag-and-drop positioning.
- Layer management panel with ordering controls similar to image editors.
- Manual coordinate inputs, reset, and removal for each asset layer.
- Draggable avatar stage for comfortable placement.
- Local persistence of placements and JSON export of modified metadata.
