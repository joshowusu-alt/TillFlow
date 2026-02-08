# How to Set Up TillFlow (Simple Guide)

Follow these steps to put the software on your computer.

## Step 1: Install Tools
You need two programs on your computer first.
1. **Download Node.js:** [Click here to download (LTS version)](https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi) -> Install it.
2. **Download Git:** [Click here to download](https://git-scm.com/download/win) -> Install it (just click Next, Next, Next).

## Step 2: Get the App
1. Create a new folder on your Desktop called `TillFlow`.
2. Open that folder.
3. Right-click inside the empty folder and select **"Git Bash Here"** (this option appeared when you installed Git).
   *(If you don't see it, search your computer for "Git Bash", open it, and type `cd Desktop`)*
4. Type this command and press Enter:
   ```bash
   git clone https://github.com/joshowusu-alt/TillFlow.git .
   ```
   *(Note the dot at the end!)*

## Step 3: Turn it On
1. Go into the new folder:
   ```bash
   cd TillFlow
   ```
2. Install the files (only do this once):
   ```bash
   npm install
   ```
3. Set up the database (only do this once):
   ```bash
   npm run db:setup
   ```
4. Start the app:
   ```bash
   npm start
   ```

## Step 4: Use it!
Open your browser (Chrome or Edge) and type:
**http://localhost:3000**

**Login details:**
- **Email:** owner@demo.com
- **Password:** Pass1234!

---

### Need to run it tomorrow?
Just open the folder, right-click "Open Terminal", and type:
```bash
npm start
```
