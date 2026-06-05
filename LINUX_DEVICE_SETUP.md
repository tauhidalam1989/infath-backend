# Linux/Ubuntu Device Setup Guide

## Problem
Your device "my ubuntu" is a Linux machine, not an Android device. ADB (Android Debug Bridge) only works on Android devices.

## Solution Options

### Option 1: Enable SSH on Linux Device (Recommended)

SSH allows remote control of the Linux device to play videos.

#### Step 1: Enable SSH on Ubuntu Device (192.168.1.7)

**On the Ubuntu device**, run these commands:

```bash
# Install SSH server
sudo apt-get update
sudo apt-get install openssh-server

# Enable and start SSH service
sudo systemctl enable ssh
sudo systemctl start ssh

# Check if SSH is running
sudo systemctl status ssh
```

#### Step 2: Configure SSH (Optional - for passwordless access)

**On your MacBook**, generate SSH key if you don't have one:

```bash
ssh-keygen -t rsa -b 4096
```

**Copy public key to Ubuntu device:**

```bash
ssh-copy-id username@192.168.1.7
```

Replace `username` with your Ubuntu username.

#### Step 3: Test SSH Connection

```bash
ssh username@192.168.1.7
```

If connection works, you're ready!

---

### Option 2: Use Android TV Device Instead

If you want to use ADB, you need an **Android TV device** or **Android device with ADB enabled**.

#### Enable ADB on Android TV:

1. **Enable Developer Options:**
   - Go to Settings → About
   - Tap "Build Number" 7 times

2. **Enable USB Debugging:**
   - Go to Settings → Developer Options
   - Enable "USB Debugging"

3. **Enable Network ADB:**
   - Go to Settings → Developer Options
   - Enable "Network Debugging" or "ADB over Network"
   - Note the IP address and port (usually 5555)

4. **Connect from MacBook:**
   ```bash
   adb connect <ANDROID_DEVICE_IP>:5555
   adb devices
   ```

---

### Option 3: Use HTTP API (If device has web server)

If your Linux device has a web server running, we can use HTTP API to control it.

---

## Current Status

Your device (192.168.1.7) shows:
- ❌ SSH connection refused (port 22)
- ❌ ADB connection refused (port 5555) - Expected, as it's Linux not Android

## Next Steps

1. **For Linux Device**: Enable SSH (Option 1)
2. **For Android Device**: Enable Network ADB (Option 2)
3. **Test**: Restart backend and try playing video again

---

## Troubleshooting

### SSH Connection Refused

```bash
# On Ubuntu device, check if SSH is running
sudo systemctl status ssh

# Check if port 22 is open
sudo netstat -tlnp | grep :22

# Check firewall
sudo ufw status
sudo ufw allow 22/tcp
```

### ADB Connection Refused (Android)

```bash
# Check if ADB is enabled on device
# Check Developer Options → Network Debugging

# Try connecting
adb connect <IP>:5555
adb devices
```

