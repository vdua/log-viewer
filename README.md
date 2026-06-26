# HDFC Wizard Log Explorer

A lightweight, dependency-free developer dashboard to browse, search, and trace HDFC wizard application network logs. It runs on a simple Node.js/Express backend and serves a clean, dark-themed Single Page Application (SPA) frontend.

## 🚀 Key Features

* **Multiple Application Workspaces**: Add, manage, and toggle between multiple application pathways directly in the browser. 
* **Automatic Subdirectory Scanning**: Under each registered application, the tool automatically scans the path `code/test/integration/logs/` for log transactions (falling back to the application path itself if not present).
* **Dual-Pane Dashboard**:
  * **Left Side**: Displays a chronological list of API transaction names (using path basenames like `login.json`).
  * **Right Side**: Inspector containing a scrollable view of the API status, request/response bodies, and extracted state details.
* **Wizard State Extraction**: Automatically scans request and response JSON payloads for wizard `stateInfo` objects, parses them, and highlights transactions modifying wizard states with a `State` indicator badge.
* **Collapsible Accordions**: Details panels (Request, Response, and Wizard State) are organized into interactive accordions that can be collapsed or expanded to save screen space.
* **Real-time Searching**:
  * **Payload-Wide Filter**: Filter sidebar transactions based on keys or values inside their payloads using the top search bar.
  * **Local Highlights**: Search inside specific payload code blocks to highlight matching tokens and scroll them into view automatically.

## 🛠️ Setup & Installation

1. Clone or download the repository:
   ```bash
   git clone https://github.com/vdua/log-viewer.git
   cd log-viewer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

## ⚙️ Configuration

You can configure the server port and default application workspace using environment variables:

* `PORT`: Port to listen on (Default: `3000`).
* `DEFAULT_APP` (or `LOGS_DIR`): The absolute path of the default application directory to load on startup (Default: current directory).

### Example commands:

```bash
# Run server on port 8080 and scan a specific application directory
PORT=8080 DEFAULT_APP=/Users/varundua/projects/my-hdfc-app npm start
```

## 📦 Project Structure

```
├── package.json
├── server.js            # Express server (manages workspaces, scans logs, parses index files)
├── apps-config.json     # Saved list of workspaces (auto-generated)
├── public/
│   ├── index.html       # UI Layout
│   ├── app.css          # Sleek Developer Dark styling
│   └── app.js           # Client-side workspace switcher and filtering engine
└── README.md
```
