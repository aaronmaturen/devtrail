#!/bin/bash

# AWS Credentials Refresh Script
# This script uses MFA to get temporary AWS credentials and updates your .env file

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.local"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: .env file not found at $ENV_FILE${NC}"
    exit 1
fi

# Load AWS_MFA_DEVICE_ARN from .env
if ! AWS_MFA_DEVICE_ARN=$(grep "^AWS_MFA_DEVICE_ARN=" "$ENV_FILE" | cut -d '=' -f2-); then
    echo -e "${RED}Error: Could not read AWS_MFA_DEVICE_ARN from .env${NC}"
    exit 1
fi

if [ -z "$AWS_MFA_DEVICE_ARN" ]; then
    echo -e "${RED}Error: AWS_MFA_DEVICE_ARN is not set in .env${NC}"
    echo "Please add your MFA device ARN to .env:"
    echo "AWS_MFA_DEVICE_ARN=arn:aws:iam::ACCOUNT_ID:mfa/DEVICE_NAME"
    exit 1
fi

# Prompt for MFA token
echo -e "${YELLOW}AWS Credential Refresh${NC}"
echo "MFA Device: $AWS_MFA_DEVICE_ARN"
echo ""
read -p "Enter your MFA token code: " MFA_TOKEN

if [ -z "$MFA_TOKEN" ]; then
    echo -e "${RED}Error: MFA token cannot be empty${NC}"
    exit 1
fi

# Get session token from AWS
echo -e "\n${YELLOW}Requesting session token from AWS...${NC}"

if ! STS_OUTPUT=$(aws sts get-session-token \
    --serial-number "$AWS_MFA_DEVICE_ARN" \
    --token-code "$MFA_TOKEN" \
    2>&1); then
    echo -e "${RED}Error: Failed to get session token${NC}"
    echo "$STS_OUTPUT"
    exit 1
fi

# Parse the JSON output
ACCESS_KEY=$(echo "$STS_OUTPUT" | grep -o '"AccessKeyId": "[^"]*' | cut -d'"' -f4)
SECRET_KEY=$(echo "$STS_OUTPUT" | grep -o '"SecretAccessKey": "[^"]*' | cut -d'"' -f4)
SESSION_TOKEN=$(echo "$STS_OUTPUT" | grep -o '"SessionToken": "[^"]*' | cut -d'"' -f4)
EXPIRATION=$(echo "$STS_OUTPUT" | grep -o '"Expiration": "[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_KEY" ] || [ -z "$SECRET_KEY" ] || [ -z "$SESSION_TOKEN" ]; then
    echo -e "${RED}Error: Failed to parse credentials from AWS response${NC}"
    exit 1
fi

# Create a backup of .env
cp "$ENV_FILE" "$ENV_FILE.backup"

# Update .env file
# Use perl for more reliable in-place editing across platforms
perl -i -pe "s|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID=$ACCESS_KEY|" "$ENV_FILE"
perl -i -pe "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$SECRET_KEY|" "$ENV_FILE"
perl -i -pe "s|^AWS_SESSION_TOKEN=.*|AWS_SESSION_TOKEN=$SESSION_TOKEN|" "$ENV_FILE"

echo -e "${GREEN}Success!${NC} AWS credentials have been updated in .env"
echo ""
echo "Credentials will expire at: $EXPIRATION"
echo "Backup saved to: .env.backup"
