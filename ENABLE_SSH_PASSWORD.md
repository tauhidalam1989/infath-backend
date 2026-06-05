# Enable SSH Password Authentication on Ubuntu

## Problem
SSH connection is failing with "All configured authentication methods failed" or "Permission denied (publickey,password)".

## Solution: Enable Password Authentication

### On Ubuntu Device (192.168.1.7), run these commands:

```bash
# 1. Edit SSH configuration
sudo nano /etc/ssh/sshd_config

# 2. Find and change these lines (remove # if commented):
PasswordAuthentication yes
PubkeyAuthentication yes
ChallengeResponseAuthentication yes

# 3. Save and exit (Ctrl+X, then Y, then Enter)

# 4. Restart SSH service
sudo systemctl restart ssh

# 5. Verify SSH is running
sudo systemctl status ssh
```

### Alternative: Quick Command

```bash
sudo sed -i 's/#PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sudo sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## Verify Password Authentication

After enabling, test from MacBook:

```bash
ssh jainishali@192.168.1.7
# Enter password: jaaai@19
```

Should connect successfully!

## Check Current SSH Config

```bash
# On Ubuntu device
sudo cat /etc/ssh/sshd_config | grep -E 'PasswordAuthentication|PubkeyAuthentication|ChallengeResponse'
```

Should show:
```
PasswordAuthentication yes
PubkeyAuthentication yes
ChallengeResponseAuthentication yes
```

## After Enabling

1. Restart backend server
2. Try playing video again
3. SSH connection should work now



