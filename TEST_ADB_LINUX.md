# Test ADB on Linux Device

## Verify ADB Installation

On your Linux device (192.168.1.7), run:

```bash
# Check ADB version
adb version

# List connected devices
adb devices
```

## Important Note

**ADB is for Android devices only!**

- ✅ **Linux device (192.168.1.7)**: Uses **SSH** for video playback
- ✅ **Android TV devices**: Use **ADB** for video playback

## Current Setup

Your Linux device (192.168.1.7) is configured to use:
- **SSH** for remote control (already setup)
- **ADB** is installed but won't be used for this Linux device itself

## If You Have Android Devices

If you have Android TV devices on your network, you can use ADB to control them:

```bash
# Connect to Android device
adb connect <ANDROID_IP>:5555

# List devices
adb devices

# Play video on Android device
adb shell am start -a android.intent.action.VIEW -d "https://youtube.com/..."
```

## For Your Linux Device

To play videos on your Linux device (192.168.1.7), the backend uses:
- **SSH** commands (already configured with password in database)

## Test Video Playback

1. Make sure backend is running
2. Try playing a video from the frontend
3. Check backend logs for SSH connection status



