# TillFlow Deployment Guide 🇬🇭

## For: Supermarket in Ghana

This guide helps you set up TillFlow on a local computer at the supermarket.

---

## What You Need

- **Computer** (Windows, Mac, or Linux)
- **WiFi Router** (for other devices like tablets to connect)
- **Node.js** installed (download from https://nodejs.org - choose LTS version)

---

## Step 1: Copy TillFlow to the Computer

Copy the entire TillFlow folder to the computer, for example to:
- Windows: `C:\TillFlow`
- Mac/Linux: `/home/user/TillFlow`

---

## Step 2: First-Time Setup

Open **Command Prompt** (Windows) or **Terminal** (Mac/Linux):

```bash
cd C:\TillFlow   # or wherever you copied it

npm install      # Install dependencies (takes 2-3 minutes)
npm run db:setup # Create the database
npm run build    # Build for production
```

---

## Step 3: Start TillFlow

```bash
npm start
```

You should see:
```
> Ready on http://localhost:3000
```

**TillFlow is now running!**

---

## Step 4: Access from Other Devices

To access from tablets, phones, or other computers on the same WiFi:

1. Find the computer's IP address:
   - Windows: Run `ipconfig` and look for "IPv4 Address" (e.g., `192.168.1.100`)
   - Mac/Linux: Run `ifconfig` or `ip addr`

2. On other devices, open a browser and go to:
   ```
   http://192.168.1.100:3000
   ```
   (Replace with your actual IP address)

---

## Getting Updates

Since the code is on GitHub, you can easily update TillFlow:

```bash
cd C:\TillFlow
git pull origin master
npm install
npm run build
npm start
```

Repository: https://github.com/joshowusu-alt/TillFlow

---

## Step 5: First Login & Setup

1. Open http://localhost:3000 (or the IP address on other devices)
2. Login with:
   - **Email:** owner@demo.com
   - **Password:** Pass1234!
3. Follow the onboarding wizard to:
   - Set your business name
   - Change currency to **GHS** (Ghana Cedi)
   - Add your products
   - Create staff accounts

---

## Daily Operation

### Starting TillFlow Each Day
```bash
cd C:\TillFlow
npm start
```

### Keeping It Running 24/7 (Optional)
Use PM2 to keep TillFlow running even after computer restarts:
```bash
npm install -g pm2
pm2 start npm --name "tillflow" -- start
pm2 save
pm2 startup  # Follow the instructions shown
```

---

## Backup Your Data

Your data is stored in `dev.db` file. To backup:

1. Go to **Settings → Data Backup**
2. Click **Export All Data**
3. Save the JSON file to a USB drive or cloud storage

---

## Troubleshooting

### "Port 3000 is in use"
```bash
npm start -- -p 3001  # Use port 3001 instead
```

### "Cannot connect from tablet"
- Make sure both devices are on the same WiFi network
- Check if Windows Firewall is blocking the connection
- Try turning off the firewall temporarily to test

### Need to reset everything?
```bash
npm run db:reset  # Warning: This deletes all data!
```

---

## Getting Help

Contact the developer or check the in-app **Help → Setup Guide** for more information.

---

**Happy selling! 🎉**
