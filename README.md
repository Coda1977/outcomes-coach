# Outcomes Coach - Deployment Guide

A simple AI chat that helps managers define outcomes for their team, based on Marcus Buckingham's methodology.

---

## Step-by-Step Deployment to Vercel

### Step 1: Get Your Anthropic API Key

1. Go to **https://console.anthropic.com**
2. Sign up or log in
3. Go to **API Keys** in the left sidebar
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-...`) — you'll need it in Step 4

💡 **Cost**: Claude API is pay-as-you-go. Typical conversation costs ~$0.01-0.05

---

### Step 2: Upload Code to GitHub

**Option A: If you have GitHub Desktop:**
1. Create a new repository on github.com
2. Clone it to your computer
3. Copy all files from this folder into the repository folder
4. Commit and push

**Option B: If you prefer the web:**
1. Go to **github.com** → Click **+** → **New repository**
2. Name it `outcomes-coach`
3. Click **Create repository**
4. Click **uploading an existing file**
5. Drag all files from this folder
6. Click **Commit changes**

---

### Step 3: Connect to Vercel

1. Go to **https://vercel.com**
2. Sign up with your GitHub account (or log in)
3. Click **Add New...** → **Project**
4. Find `outcomes-coach` in your repository list
5. Click **Import**

---

### Step 4: Add Your API Key

Before clicking Deploy:

1. Expand **Environment Variables**
2. Add:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: Your API key from Step 1 (the `sk-ant-...` key)
3. Click **Add**

---

### Step 5: Deploy

1. Click **Deploy**
2. Wait 1-2 minutes
3. You'll get a URL like `outcomes-coach-abc123.vercel.app`

**That's it!** Share this URL with anyone — no Claude account needed.

---

## Project Structure

```
outcomes-coach-vercel/
├── package.json          # Dependencies
├── next.config.js        # Next.js config
├── pages/
│   ├── index.js          # The chat interface
│   └── api/
│       └── chat.js       # Secure API route (hides your key)
└── README.md             # This file
```

---

## Customization

**Change the coaching topic:**
Edit `pages/api/chat.js` — modify the `SYSTEM_PROMPT` constant

**Change colors:**
Edit `pages/index.js` — look for the color values like `#F5F0E8`, `#1A1A1A`

**Change the welcome message:**
Edit `pages/index.js` — find the first message in the `useState` array

---

## Costs & Limits

- **Vercel**: Free tier includes 100GB bandwidth/month (plenty for a tool like this)
- **Anthropic**: ~$3 per million input tokens, ~$15 per million output tokens
- A typical coaching conversation costs less than $0.10

---

## Questions?

- Vercel docs: https://vercel.com/docs
- Anthropic API docs: https://docs.anthropic.com
