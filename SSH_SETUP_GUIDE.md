# SSH Setup Guide for Linux Devices

## Problem
SSH connection is being refused with "Permission denied (publickey,password)" error.

## Solution: Setup SSH Keys (Passwordless SSH)

### Step 1: Generate SSH Key on MacBook (if not already exists)

```bash
# Check if you already have SSH keys
ls -la ~/.ssh/id_rsa.pub

# If not, generate new SSH key
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
# Press Enter to accept default location
# Press Enter twice for no passphrase (or set one if you want)
```

### Step 2: Copy Public Key to Ubuntu Device

**Option A: Using ssh-copy-id (Easiest)**

```bash
# This will prompt for password once, then setup passwordless access
ssh-copy-id jainishali@192.168.1.7
```

**Option B: Manual Copy**

```bash
# On MacBook - Copy your public key
cat ~/.ssh/id_rsa.pub

# Copy the output, then SSH to Ubuntu device
ssh jainishali@192.168.1.7

# On Ubuntu device - Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your public key to authorized_keys
echo "PASTE_YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Exit
exit
```

### Step 3: Test Passwordless SSH

```bash
# This should work without password now
ssh jainishali@192.168.1.7
```

If it works, you're done! Backend will now be able to connect.

---

## Alternative: If You Want to Use Password Authentication

If you prefer to use password instead of SSH keys, you need to:

1. **Install sshpass on MacBook** (for password authentication):
   ```bash
   brew install hudochenkov/sshpass/sshpass
   ```

2. **Update screen in database** with SSH password:
   ```sql
   UPDATE screens 
   SET ssh_username = 'jainishali', 
       ssh_password = 'your_password_here'
   WHERE ip_address = '192.168.1.7';
   ```

**Note**: Storing passwords in database is less secure. SSH keys are recommended.

---

## Troubleshooting

### Still Getting Permission Denied?

1. **Check SSH service on Ubuntu:**
   ```bash
   ssh jainishali@192.168.1.7 "sudo systemctl status ssh"
   ```

2. **Check permissions on Ubuntu:**
   ```bash
   ssh jainishali@192.168.1.7 "ls -la ~/.ssh"
   # Should show:
   # drwx------ .ssh
   # -rw------- authorized_keys
   ```

3. **Check SSH config on Ubuntu:**
   ```bash
   ssh jainishali@192.168.1.7 "sudo cat /etc/ssh/sshd_config | grep -E 'PubkeyAuthentication|PasswordAuthentication'"
   # Should show:
   # PubkeyAuthentication yes
   # PasswordAuthentication yes (or no, if using keys only)
   ```

### Test SSH Connection

```bash
# Verbose mode to see what's happening
ssh -v jainishali@192.168.1.7
```

---

## Quick Setup Command (All in One)

```bash
# On MacBook - Run this single command
ssh-copy-id jainishali@192.168.1.7

# Enter password when prompted (one time only)
# After this, passwordless SSH will work!
```

