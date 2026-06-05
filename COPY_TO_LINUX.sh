#!/bin/bash

# ============================================
# SSH Key Setup Script for Ubuntu/Linux
# Copy and paste these commands on your Linux device (192.168.1.7)
# ============================================

echo "Setting up SSH key for passwordless access..."

# Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add the public key to authorized_keys
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCoWQHrZidw+VzVRhGgZ+YUknpNEJEfrlunm6RS1/WvbySkcr//4lRkeb2UevSdBd8keRri1FYnIpsATk0JMYekZfec3ugeDKEBae0O7EMtaZ1MOrQZjrgXf+nsyzdUE8bOSbmRO+o+TcFiNh5IeMS4R/YehuueZVw3fgthoh/SPGa6HaOIX1+yO5hprIjUJT5Uph6aPfdjalix2cphki9D20aleobZP13rUNTRvVeOKh5u2TKksht/ZZJZTwl9HEnfWZDKu+BBN0aSrHR9KxAkgP28+iFDPXEO2A5XnQcXgxXDfNO802kJ1u27XA3wetT3C2Poe63yCnKtcv2xBU/X7I3zgnPB6KUPTytgDUzY+ouDajPMGsrM/QKLYlofpACUIXSsdQqwbC33SwNoRdO4ug+dI6p8wRWhq74SCSMPTgQgZcD5uMomPVmG1iZZ+NImSCgbhRidiZFKHyz1oW35rwZACAXuKKKHkZCi5Rm6cf5NYDqgRCjiDKuMVwDqlJhueKd4g8PkIVToq877eQoQqolv8Q5YDjisleNtC65k0Vzu7VVVqGBvbZ6Ebi2InlUKUzLPfxTcFdNcpy9Z87Rnx9qdON3PVQlamkYCOhjb2HyZ+0UUGtD/rnTYmW+FqNY4a/UiTlsj1rquHWJcGIV435XRuKFyez00qqeM5KViMw== jainishali@jainishs-MacBook-Air.local" >> ~/.ssh/authorized_keys

# Set correct permissions
chmod 600 ~/.ssh/authorized_keys

echo "✅ SSH key setup complete!"
echo ""
echo "Now test from MacBook with:"
echo "ssh jainishali@192.168.1.7"
echo ""
echo "It should connect without password."

