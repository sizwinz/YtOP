<div align="center">

<img src="ytOP.png" alt="ytOP Logo" width="100" />

# ytOP

### YouTube Enhanced Suite and Local Download Engine

A modular YouTube power-user suite integrating browser playback enhancements with a local, multi-threaded `yt-dlp` and `FFmpeg` bridge.

<br/>

[![Install Userscript](https://img.shields.io/badge/Install-Userscript-DC2626?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/Sahaj33-op/YtOP/master/YouTube%20Enhanced%20Suite.user.js)

[![Version](https://img.shields.io/badge/Version-3.2.0-2563EB?style=flat-square)](https://github.com/Sahaj33-op/YtOP)
[![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-Latest-FF0000?style=flat-square&logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Required-007808?style=flat-square&logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)

<br/>

<img src="ytOP-interface.png" alt="ytOP Interface Preview" width="840" />

</div>

---

## Overview

ytOP bridges the gap between browser convenience and the raw power of command-line media tools. It couples a lightweight Tampermonkey userscript with a local Python background bridge (`http://127.0.0.1:9898`) to deliver full-quality stream extraction, hardware-accelerated muxing, and granular player controls directly within YouTube.

Downloads execute asynchronously through your local system binaries (`yt-dlp` and `FFmpeg`), ensuring maximum throughput, custom resolution selection, and zero reliance on third-party web converters.

---

## Key Capabilities

### 1. Multi-Stream Media Downloader
* **Dynamic Stream Discovery**: Queries YouTube's format manifests in real time for watch pages and Shorts.
* **Categorized Quality Tiers**:
  * **Video + Audio**: Muxed high-definition tracks (1080p, 1440p, 4K, 8K) paired with best available audio and merged via FFmpeg.
  * **Video Only**: Direct video streams without audio tracks.
  * **Audio Only**: Pristine source audio streams (M4A, Opus, WebM) and auto-converted MP3 presets.
* **Format Filtering**: One-click filter chips to isolate specific container formats (`MP4`, `WEBM`, `M4A`, `OPUS`).
* **Estimated File Sizes**: Calculated byte sizes displayed per quality tier before initiating downloads.

### 2. Non-Blocking Progress and Background Execution
* **Inline Transfer Metrics**: Live progress percentages, download speed, and ETA indicators.
* **Floating Mini-Player Mode**: Minimize the download modal into an unobtrusive floating status card using the minimize button or pressing `M`.
* **State Persistence**: Navigate to other YouTube videos while downloads continue undisturbed in the background.
* **Safe Dismissal**: Pressing `Esc` or clicking outside the interface automatically collapses the active task into the mini-card rather than terminating the process.

### 3. Integrated Player Controls
* **Quick Speed Presets**: Instant playback rates ranging from `0.5x` to `3.0x`.
* **Fine-Grained Speed Adjustments**: Step up or down by `0.25x` increments (supports range from `0.1x` to `16.0x`).
* **A/B Loop Range**: Set custom start (`A`) and end (`B`) timestamps for continuous segment repetition.
* **HD Frame Capture**: Capture full-resolution screenshots directly from the video canvas.
* **Cinema Mode Overlay**: Focus lighting mode that dims surrounding YouTube interface clutter.
* **On-Screen Display (OSD)**: Minimal visual toast indicators for speed, loop markers, and status changes.

### 4. Local Python Bridge Server
* **Auto-Discovery**: Automatically detects `yt-dlp` and `ffmpeg` from system `PATH` and standard Windows WinGet directories.
* **Threaded Queue**: Handles concurrent format extraction and download tasks without freezing the interface.
* **Localhost Security**: Binds exclusively to `127.0.0.1:9898` with origin verification restricted to `https://www.youtube.com`.
* **Optional System Tray**: Desktop tray icon with quick actions to stop the server, open the downloads folder, or visit the repository.

---

## Architecture Flow

```
+-----------------------------------------------------------------------+
|                         YouTube Client (Browser)                      |
|                                                                       |
|   Tampermonkey / Violentmonkey Userscript                             |
|   - Format discovery interface and filter pills                       |
|   - Speed controls, A/B looping, cinema mode, frame capture           |
|   - Floating background mini-card and progress tracking               |
+-----------------------------------+-----------------------------------+
                                    |
                         HTTP (JSON / REST API)
                         Origin: https://www.youtube.com
                                    |
                                    v
+-----------------------------------------------------------------------+
|                    Local Python Bridge Server                         |
|                    http://127.0.0.1:9898                              |
|                                                                       |
|   yt-dlp-server.py (ThreadingHTTPServer)                              |
|   - GET  /health          : Status validation and dependency check    |
|   - GET  /formats?url=... : Format extraction via yt-dlp metadata     |
|   - POST /download        : Non-blocking process invocation           |
|   - GET  /progress?url=.. : Real-time transfer statistics             |
|   - GET  /cancel?url=...  : Graceful process termination              |
+-----------------------------------+-----------------------------------+
                                    |
                             Subprocess Pipe
                                    |
                                    v
+-----------------------------------------------------------------------+
|                       Local System Toolchain                          |
|                                                                       |
|   yt-dlp.exe                      FFmpeg.exe                          |
|   - Media stream retrieval        - Audio/Video multiplexing          |
|   - Protocol parsing (DASH/HLS)   - Audio transcoding & post-process  |
+-----------------------------------+-----------------------------------+
                                    |
                               File Write
                                    |
                                    v
+-----------------------------------------------------------------------+
|                       Output Storage Target                           |
|                       ~/Downloads/ytOP/                               |
+-----------------------------------------------------------------------+
```

---

## Installation and Setup

### Prerequisites

1. **Python 3.8+**: Ensure Python is installed and added to your system `PATH`.
2. **Userscript Manager**: Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) in your browser.
3. **Core Dependencies (`yt-dlp` and `FFmpeg`)**:
   Install via Windows Package Manager:
   ```powershell
   winget install yt-dlp Gyan.FFmpeg
   ```
4. **Optional Desktop Tray Dependencies**:
   To enable the system tray icon, install `pystray` and `Pillow`:
   ```powershell
   pip install pystray Pillow
   ```

---

### Step 1: Clone Repository

```bash
git clone https://github.com/Sahaj33-op/YtOP.git
cd YtOP
```

### Step 2: Install Userscript

1. Click the **[Install Userscript](https://raw.githubusercontent.com/Sahaj33-op/YtOP/master/YouTube%20Enhanced%20Suite.user.js)** badge or direct link.
2. Tampermonkey will prompt you to confirm the installation. Click **Install**.
3. Alternatively, open Tampermonkey, create a new script, paste the contents of `YouTube Enhanced Suite.user.js`, and save (`Ctrl + S`).

### Step 3: Start Bridge Server

Choose your preferred startup mode:

| Method | Script | Description |
| :--- | :--- | :--- |
| **Interactive Console** | `start-server.bat` | Launches the server inside an active terminal window with live log outputs. |
| **Silent Background** | `start-silent.vbs` | Runs the server completely hidden in the background with zero desktop windows. |

To stop a running background server, execute `stop-server.bat` or use the system tray context menu.

---

## File Structure

```
YtOP/
├── YouTube Enhanced Suite.user.js   # Browser client userscript (UI, player controls, API client)
├── yt-dlp-server.py                 # Multi-threaded HTTP bridge server and process orchestrator
├── start-server.bat                 # Standard interactive terminal launcher
├── start-silent.vbs                 # VBScript runner for hidden background execution
├── stop-server.bat                  # Process killer to cleanly shut down active server instances
├── ytOP.png                         # Project branding and documentation assets
├── ytOP-interface.png               # Modal interface screenshot preview
├── ytOP-trayicon.png                # System tray context menu preview
├── .gitignore                       # Git exclusions for virtual environments and runtime artifacts
└── README.md                        # Documentation and user reference
```

---

## Configuration

Server settings can be customized directly in `yt-dlp-server.py`:

```python
# Server connection port
PORT = 9898

# Destination directory for downloaded media files
DOWNLOAD_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "ytOP")

# Allowed request origin for CORS security
ALLOWED_ORIGIN = "https://www.youtube.com"

# Manual binary path overrides (leave default for auto-detection)
YTDLP_BIN = "yt-dlp"
FFMPEG_BIN = "ffmpeg"
```

---

## Controls and Shortcuts

| Action | Control / Shortcut | Description |
| :--- | :--- | :--- |
| **Open Download Modal** | Click `Download` button | Fetches media formats and displays the format picker overlay. |
| **Minimize / Restore** | `M` key or `_` header button | Collapses modal into a floating card; click card to restore. |
| **Dismiss Modal** | `Esc` key or click outside | Closes inactive modal or auto-minimizes during active downloads. |
| **Fine Speed Tuning** | `+` / `-` buttons | Increments or decrements player playback speed by `0.25x`. |
| **A/B Loop** | `Loop` button | Click once to mark point A, click again for point B, click once more to reset. |
| **Frame Capture** | `Screenshot` button | Extracts a full-resolution PNG capture of the current video frame. |
| **Cinema Mode** | `Cinema` button | Activates dimmed backdrop overlay around the YouTube player. |

---

## System Tray Integration

When `pystray` and `Pillow` are installed, ytOP initializes an icon in the Windows taskbar tray:

<div align="center">
  <img src="ytOP-trayicon.png" alt="ytOP Tray Icon Context Menu" width="300" />
</div>

* **Open Downloads Folder**: Opens `~/Downloads/ytOP` in Windows Explorer.
* **GitHub Repository**: Launches the repository page in your default browser.
* **Stop Server**: Shuts down the HTTP server and cleans up active processes.

If tray dependencies are omitted, the server runs normally in headless console mode.

---

## Frequently Asked Questions

<details>
<summary><b>How can I configure ytOP to start automatically on Windows boot?</b></summary>

1. Press `Win + R` to open the Windows Run dialog.
2. Type `shell:startup` and press **Enter** to open the Windows Startup directory.
3. Right-click inside the folder, select **New ➔ Shortcut**.
4. Browse and select `start-silent.vbs` located in your cloned `YtOP` directory.
5. Click **Finish**. The server will now start silently whenever Windows boots.
</details>

<details>
<summary><b>Why is the interface showing an "FFmpeg missing" notice?</b></summary>

High-resolution streams (1080p, 1440p, 4K, 8K) require FFmpeg to merge video and audio streams. If this indicator appears:
* Verify FFmpeg is installed (`winget install Gyan.FFmpeg`).
* If installed in a non-standard directory, update `FFMPEG_BIN` in `yt-dlp-server.py` with the absolute path to `ffmpeg.exe` (for example, `r"C:\tools\ffmpeg\bin\ffmpeg.exe"`).
</details>

<details>
<summary><b>Is the local bridge server secure?</b></summary>

Yes. The server binds strictly to the `127.0.0.1` loopback interface, meaning external devices on your local network cannot access it. Furthermore, CORS headers explicitly reject cross-origin requests originating outside `https://www.youtube.com`.
</details>

<details>
<summary><b>Where are completed downloads stored?</b></summary>

By default, files are saved in your user profile under `Downloads\ytOP`. You can customize this target folder by modifying `DOWNLOAD_DIR` in `yt-dlp-server.py`.
</details>

---

## Disclaimer

This software is developed strictly for personal, educational, and backup purposes. Downloading copyrighted content from YouTube without permission may violate YouTube's Terms of Service and local intellectual property laws. The developers assume no liability for misuse of this software.

---

## License

This project is licensed under the terms of the [MIT License](LICENSE).
