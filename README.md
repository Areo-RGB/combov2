# Motion Signal & Sprint Duels

An application that combines two powerful tools: a real-time motion detection system using your device's camera, and a comprehensive management suite for "Sprint Duels" to track player rankings and head-to-head matches.

---

## Part 1: Motion Signal

An application that uses your device's camera to detect motion and sends a real-time signal to other connected devices, which visualize the signal in various creative ways.

It leverages the browser's `getUserMedia` API to access the camera feed. It processes video frames on a hidden `<canvas>` to compare consecutive frames for significant changes, indicating motion. When motion is detected, it writes a timestamp to a specific session in a Firebase Realtime Database. Any device connected to the same session as a "Display" will listen for this change and react by updating its UI.

### Motion Signal Features

- **Real-time Signaling:** Near-instantaneous communication between devices using Firebase.
- **Session-Based Connectivity:** Easily connect a detector and one or more displays using a simple 6-character session ID.
- **Versatile Display Modes:** Choose how to visualize motion signals:
    - **Colors:** Display a random vibrant color.
    - **Math Game:** Progress through a sequence of simple math problems.
    - **Wechsel:** Randomly show "Rechts" (Right) or "Links" (Left).
    - **Counter:** Keep a running tally of motion detections.
- **Configurable Motion Detection:**
    - Adjust **sensitivity** to fine-tune what triggers a detection.
    - Define a specific vertical **detection zone** or use the full camera view.
    - Set a **cooldown** period to prevent rapid, successive triggers.
- **Multi-Camera Support:** Select from any available camera on your device.
- **Responsive Design:** A clean, modern UI built with Tailwind CSS that works on various screen sizes.
- **Fullscreen Display:** Immerse yourself with a fullscreen view for the signal display.

### Modes of Operation

1.  **Create a Session (Detector):** Use your device as the motion detector. The app generates a unique Session ID for others to join.
2.  **Join a Session (Display):** Enter a Session ID to turn your device into a display screen that visualizes the signals sent by a detector.
3.  **Single Device Mode:** Run both the detector and the display on the same device, perfect for testing or single-user interactions.

---

## Part 2: Sprint Duels

A complete management suite for tracking head-to-head sprint competitions. It uses the Elo rating system to provide a dynamic and fair ranking of players based on their match outcomes. Player data and match history are persisted in the browser and synchronized with Firebase.

### Sprint Duels Features

- **Elo-Based Ranking:** Players are ranked using a robust Elo system, with ratings updated after every match to reflect performance.
- **Detailed Player Stats:** View comprehensive statistics for each player, including win-loss-draw records, tournament victories, and detailed head-to-head matchup history.
- **Flexible Matchmaking:**
    - **Random Pairings:** Quickly generate random duels for casual play.
    - **Elo-Based Pairings:** Create balanced matches by pairing players with similar skill levels.
- **Tournament Mode:** Organize and run elimination-style tournaments to crown a champion.
- **Audio Cues:** Immersive audio cues announce player jersey numbers and a starting beep to begin races.
- **Comprehensive Match History:** Browse a complete log of all past matches with detailed results and Elo changes.
- **Data Management:** Easily manage player data, reset individual player stats, or perform a full application data reset.
- **Firebase Integration:** Match history is backed up to Firebase, ensuring data persistence.

---

## Technology Stack

- **Framework:** Angular (Standalone, Zoneless, Signals)
- **Real-time Database & Sync:** Firebase
- **Styling:** Tailwind CSS
- **Browser APIs:** `getUserMedia`, Canvas API, `localStorage`

---

### AI Assistant Workflow

To ensure consistency and maintain project context, any AI assistant working on this project must follow this strict workflow for every request:

1.  **Context is Key - Read First:** Before implementing any code changes, you **MUST** first read and fully understand this `README.md` file. It is the single source of truth for the project's architecture, features, and goals.

2.  **Implement Changes:** Based on the user's request and your understanding from this document, implement the necessary code changes. Adhere to the existing patterns, architecture, and technology stack.

3.  **Document Your Work - Update Last:** After completing the code modifications, you **MUST** update this `README.md` file to accurately reflect the changes. The documentation must always be synchronized with the codebase.