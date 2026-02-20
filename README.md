# Souls Randomizer Tracker

Item checklist trackers for Elden Ring and Dark Souls III randomizers, with real-time multiplayer sync so you can track progress with friends.

**https://www.soulsrandomizertracker.com**

## Features

- **Elden Ring tracker** (`index.html`) — covers base game + Shadow of the Erdtree DLC
- **Dark Souls III tracker** (`ds3.html`) — covers base game + Ashes of Ariandel + The Ringed City
- **Room system** — create or join a room with a 6-character code to sync checked items in real time via Firebase
- Search and filter (all / remaining / completed)
- Collapsible location sections with per-location progress counts
- Overall progress bar

## Usage

Just open `index.html` or `ds3.html` in a browser. No build step or server needed — everything is self-contained in each HTML file.

On first load you'll be prompted to create or join a room. Share the room code with your group and everyone's checks sync automatically.

## Setup

The trackers use Firebase Realtime Database for multiplayer sync. To run your own instance:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
2. Enable Realtime Database in test mode
3. Register a web app and copy the config into both HTML files
4. Set database rules to allow read/write on `rooms/` and `ds3rooms/` paths
