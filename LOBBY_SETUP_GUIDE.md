# Lobby Setup Guide

## Overview

This guide provides step-by-step instructions for setting up and using the local lobby system in the Motion Signal & Sprint Duels application. The lobby system allows multiple devices to connect and communicate without requiring internet connectivity, using Bluetooth for device discovery and WebRTC for high-performance communication.

## Quick Start

### What You'll Need
- **Multiple Devices**: At least 2 devices (host + client) with the app installed
- **Bluetooth Enabled**: All devices must have Bluetooth turned on
- **Android Devices**: Currently supported platform with full functionality
- **Same App Version**: All devices should be running the same version of the app

### Basic Workflow
1. **Host** creates a lobby and gets a 6-character lobby ID
2. **Clients** enter the lobby ID to join the session
3. **Host** establishes connections and completes setup
4. **Host** selects a game mode for all connected devices
5. **All devices** automatically join the selected mode and begin

## Step-by-Step Setup

### Step 1: Access the Lobby Setup

1. Open the Motion Signal & Sprint Duels app on your device
2. From the main menu, look for "Local Lobby Setup" option
3. Tap to enter the lobby setup screen

You'll see three options:
- **Device Name**: Name that identifies your device to others
- **Create Lobby**: Start a new lobby as the host device
- **Join Lobby**: Connect to an existing lobby as a client device

### Step 2: Setting Device Names

For each device participating in the lobby:

1. **Device Name Field**: Enter a descriptive name (e.g., "Teacher Tablet", "Student Phone 1", "Timing Station")
2. **Auto-Generated Name**: The app provides a default name based on device type
3. **Naming Tips**:
   - Use clear, descriptive names
   - Include device purpose or location
   - Avoid special characters or emojis
   - Keep names under 20 characters for best display

### Step 3: Creating a Host Lobby

On the device that will act as the host:

1. **Set Device Name**: Enter a name for the host device
2. **Tap "Create Lobby"**: The app will:
   - Generate a unique 6-character lobby ID (e.g., "A3K9M2")
   - Start Bluetooth advertising
   - Display the lobby screen with connection status
3. **Share Lobby ID**: Share the 6-character code with other device users:
   - ** verbally**: "The lobby code is A3K9M2"
   - ** written**: Write it on a whiteboard or paper
   - ** screenshot**: Take a screenshot to show others

4. **Wait for Connections**: The host screen shows:
   - Lobby ID prominently displayed
   - Number of connected devices
   - Connection status for each device
   - Real-time updates as devices join

### Step 4: Joining as a Client

On each client device:

1. **Set Device Name**: Enter a unique name for this client device
2. **Enter Lobby ID**: Type the 6-character lobby ID exactly as provided
3. **Tap "Join Lobby"**: The app will:
   - Scan for Bluetooth devices with matching lobby ID
   - Automatically connect when found
   - Display connection status
   - Show "Connected to Host" when successful

4. **Connection Process**:
   - **Scanning**: Device searches for the host (2-10 seconds)
   - **Connecting**: Establishes Bluetooth connection (3-5 seconds)
   - **Identifying**: Exchanges device information (1-2 seconds)
   - **Ready**: Shows "Connected to Host" status

### Step 5: Establishing WebRTC Connections

Once all devices are connected via Bluetooth, the host needs to establish high-performance WebRTC connections:

1. **Check Device Count**: Verify all intended devices have joined
2. **Tap "Establish WebRTC Connections"**: The host device will:
   - Create WebRTC peer connections with each client
   - Send connection offers via Bluetooth
   - Receive answers from clients
   - Establish data channels for communication

3. **Monitor Progress**: Watch the connection status for each device:
   - **🔴 Red**: Not connected via Bluetooth
   - **🟡 Yellow**: Connected, but WebRTC not ready
   - **🟢 Green**: Fully connected via WebRTC

4. **Wait for Completion**: All devices should show "WebRTC Ready" status

### Step 6: Completing Lobby Setup

Once all devices show WebRTC ready status:

1. **Verify All Devices**: Confirm all expected devices are connected and ready
2. **Tap "Complete Setup"**: This finalizes the lobby configuration
3. **Setup Confirmation**: The host screen shows "Setup Complete!" message

### Step 7: Selecting Game Mode

With setup complete, the host can now select a game mode for all connected devices:

1. **Return to Main Menu**: Use the "Back to Menu" option
2. **Select Game Mode**: Choose from available modes (Sprint Duels, Team Duels, etc.)
3. **Automatic Joining**: All connected devices automatically join the selected mode
4. **Begin Activity**: Start using the selected game mode with all devices synchronized

## Troubleshooting Guide

### Common Issues and Solutions

#### Devices Not Discovering Each Other

**Problem**: Client devices can't find the host lobby

**Solutions**:
1. **Check Bluetooth**: Ensure Bluetooth is enabled on all devices
2. **Verify Lobby ID**: Double-check the 6-character code is entered correctly
3. **Proximity Check**: Bring devices within 10 meters of each other
4. **Restart Bluetooth**: Turn Bluetooth off and on again
5. **Check Permissions**: Ensure the app has Bluetooth permissions

**Steps**:
1. On host device: Verify lobby is active and advertising
2. On client device: Re-enter the lobby ID carefully
3. Move devices closer together (within 3-5 meters)
4. Try joining again with fresh connection attempt

#### Connection Drops During Setup

**Problem**: Devices connect but disconnect during WebRTC setup

**Solutions**:
1. **Stable Position**: Keep devices stationary during setup
2. **Reduce Interference**: Move away from other Bluetooth devices or WiFi routers
3. **Battery Check**: Ensure devices have adequate battery life
4. **Retry Setup**: Go back and restart the connection process

#### WebRTC Connection Failures

**Problem**: Bluetooth works but WebRTC connections fail

**Solutions**:
1. **Complete Restart**: Have all devices restart the app
2. **Check Device Count**: Limit to 8 or fewer connected devices
3. **Sequential Setup**: Connect devices one at a time
4. **Environment Check**: Avoid metal objects or thick walls between devices

#### Mode Selection Not Working

**Problem**: Host selects mode but clients don't join

**Solutions**:
1. **Verify WebRTC**: Check all devices show "WebRTC Ready"
2. **Wait for Sync**: Allow 2-3 seconds for mode propagation
3. **Check App State**: Ensure clients haven't left the lobby screen
4. **Restart Mode**: Have host select a different mode, then retry

### Performance Optimization Tips

#### Best Practices for Reliable Connections

1. **Optimal Device Placement**:
   - Keep devices in the same room
   - Avoid placing devices behind metal objects
   - Maintain clear line of sight when possible
   - Elevate devices off the floor when possible

2. **Environmental Considerations**:
   - Reduce Bluetooth interference from other devices
   - Turn off unnecessary Bluetooth devices nearby
   - Avoid crowded WiFi environments when possible
   - Use open spaces rather than enclosed areas

3. **Device Management**:
   - Close unnecessary apps on all devices
   - Ensure adequate battery charge (>20%)
   - Keep devices awake during setup process
   - Use similar device types when possible

#### Connection Quality Indicators

**Good Connection Signs**:
- Fast device discovery (<5 seconds)
- All devices showing green status quickly
- Stable connections during setup
- Responsive mode switching

**Poor Connection Signs**:
- Slow device discovery (>10 seconds)
- Intermittent connection drops
- Yellow status indicators
- Delayed mode changes

## Advanced Usage

### Large Group Setup

For groups with many devices (6+ devices):

1. **Stagger Connections**: Join devices in smaller batches (3-4 at a time)
2. **Environment Setup**: Use a large, open space with minimal interference
3. **Device Priority**: Connect critical devices first (displays, controls)
4. **Time Management**: Allow extra time for setup (5-10 minutes)

### Mixed Device Types

When using different types of devices:

1. **Host Selection**: Use the most powerful device as host (tablet preferred)
2. **Role Assignment**: Consider device capabilities when planning roles
3. **Power Management**: Ensure devices can stay powered for the entire session
4. **Testing**: Do a quick test run before the main activity

### Reusing Lobby Configurations

For repeated sessions with the same devices:

1. **Save Device Names**: Use consistent device names across sessions
2. **Document Setup**: Note successful device placements and configurations
3. **Template IDs**: Keep a record of working lobby patterns
4. **Performance Notes**: Track which setups work best for your environment

## Safety and Privacy

### Data Privacy

- **Local Only**: All communication stays within the local lobby
- **No Internet Required**: No data transmitted to external servers
- **Session Temporary**: Connections only exist during the session
- **Encrypted**: WebRTC provides encryption for data transfers

### Physical Safety

- **Device Placement**: Place devices where they won't be knocked over
- **Cable Management**: Secure charging cables to prevent tripping hazards
- **Battery Safety**: Use proper charging practices for devices
- **Environmental Awareness**: Be aware of surroundings when using devices

## FAQ

### Q: How many devices can join a lobby?
**A**: The system supports 8+ client devices reliably. For larger groups, consider splitting into multiple lobbies.

### Q: Does this work on iOS devices?
**A**: Currently Android devices have full support. iOS support is planned for future releases.

### Q: Can I join a lobby from a web browser?
**A**: The lobby system is designed for mobile apps with Bluetooth capabilities. Web browser support may be added in the future.

### Q: What happens if the host device loses battery or shuts down?
**A**: The lobby session will end. All devices will need to reconnect when the host is available again.

### Q: Can multiple lobbies exist in the same area?
**A**: Yes, each lobby has a unique 6-character ID that prevents interference between different lobbies.

### Q: How far apart can devices be?
**A**: Bluetooth range is typically 10-100 meters depending on environment and device capabilities.

### Q: What if I enter the wrong lobby ID?
**A**: The device will simply not find a matching lobby. Try again with the correct ID.

## Getting Help

If you encounter issues not covered in this guide:

1. **Check Documentation**: Review the [Lobby API Documentation](./LOBBY_API.md)
2. **Technical Details**: See [Lobby Technical Implementation](./LOBBY_TECHNICAL.md)
3. **Developer Guide**: Review the [Lobby Development Guide](./LOBBY_DEVELOPMENT.md)
4. **Community Support**: Check for community forums or support channels

## Conclusion

The lobby system provides a reliable way to connect multiple devices for local multiplayer experiences without requiring internet connectivity. By following this guide, you should be able to successfully set up and use lobbies for your activities.

Remember to test the setup before important events, have backup devices ready if possible, and follow the troubleshooting steps if issues arise. The system is designed to be robust and user-friendly, but proper setup ensures the best experience for all participants.