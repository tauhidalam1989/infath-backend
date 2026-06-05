# SSH Password Setup

## Your Password
Password: `jaaai@19`

## Option 1: Setup SSH Keys Using Password (Recommended)

### On MacBook, run this command:

```bash
cat ~/.ssh/id_rsa.pub | ssh jainishali@192.168.1.7 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

**When prompted, enter password: `jaaai@19`**

This will:
1. Copy your public key to Ubuntu device
2. Setup proper permissions
3. Enable passwordless SSH

### Then test:

```bash
ssh jainishali@192.168.1.7
```

Should connect without password now!

---

## Option 2: Store Password in Database (Less Secure)

If you want to use password authentication instead of SSH keys, you can store the password in the database:

```sql
UPDATE screens 
SET ssh_username = 'jainishali', 
    ssh_password = 'jaaai@19'
WHERE ip_address = '192.168.1.7';
```

**Note**: This is less secure than SSH keys. SSH keys are recommended.

---

## Quick Setup Command

Run this on MacBook (will prompt for password once):

```bash
cat ~/.ssh/id_rsa.pub | ssh jainishali@192.168.1.7 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Enter password: `jaaai@19` when prompted.

