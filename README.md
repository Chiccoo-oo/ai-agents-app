# AI Agents — LangChain Exercise
**Calculator Agent + Document QA Bot** | Built with Next.js + Groq + LLaMA-3

---

## 🏗 Project Structure

```
ai-agents-app/
├── app/
│   ├── api/
│   │   ├── chat/route.ts       ← Calculator Agent API (tool-use + mathjs)
│   │   ├── upload/route.ts     ← PDF/TXT upload + chunking
│   │   └── docqa/route.ts      ← Document QA retrieval + Groq
│   ├── globals.css             ← Design system + fonts
│   ├── layout.tsx
│   └── page.tsx                ← Tab navigation
├── components/
│   ├── CalculatorTab.tsx       ← Math agent UI
│   └── DocQATab.tsx            ← Document QA UI
├── .env.example                ← Copy to .env.local
├── next.config.js
├── package.json
└── vercel.json
```

---

## 🚀 FULL SETUP GUIDE (D: Drive + Anaconda)

### Step 1 — Create project folder on D: drive

Open **Anaconda Prompt** (search in Start menu):

```bash
# Navigate to D: drive
D:

# Create project folder
mkdir ai-agents-app
cd ai-agents-app
```

### Step 2 — Create & activate Conda environment

```bash
# Create a new env with Node.js support (Python not needed here, Conda manages Node)
conda create -n ai-agents nodejs=20 -c conda-forge -y

# Activate it
conda activate ai-agents

# Verify Node.js
node --version    # Should show v20.x.x
npm --version     # Should show 10.x.x
```

> **Alternative if conda nodejs fails:**
> Download Node.js LTS from https://nodejs.org and install normally.
> Then just use regular Command Prompt from D:\ai-agents-app

### Step 3 — Copy project files

Copy the entire `ai-agents-app` folder you received into `D:\ai-agents-app`

Your structure should be:
```
D:\ai-agents-app\
├── app\
├── components\
├── package.json
├── next.config.js
└── ...
```

### Step 4 — Install dependencies

In Anaconda Prompt (with ai-agents env active), inside `D:\ai-agents-app`:

```bash
npm install
```

This installs: Next.js, Groq SDK, pdf-parse, mathjs, and all dependencies.

### Step 5 — Get Groq API Key (FREE)

1. Go to **https://console.groq.com**
2. Sign up / Log in
3. Click **"API Keys"** in sidebar → **"Create API Key"**
4. Copy the key (starts with `gsk_...`)

### Step 6 — Set environment variable

In your project folder (`D:\ai-agents-app`), create `.env.local`:

```bash
# In Anaconda Prompt:
copy .env.example .env.local
```

Then open `.env.local` in Notepad and replace the placeholder:
```
GROQ_API_KEY=gsk_your_actual_key_here
```

### Step 7 — Run locally

```bash
npm run dev
```

Open your browser: **http://localhost:3000**

You should see the app with two tabs:
- **⟨∑⟩ CALCULATOR AGENT** — math + word problems
- **◈ DOCUMENT QA BOT** — upload PDFs and ask questions

---

## 🌐 DEPLOY TO VERCEL

### Step 1 — Install Git (if not installed)

Download from: https://git-scm.com/download/win

### Step 2 — Push to GitHub

```bash
# Inside D:\ai-agents-app in Anaconda Prompt:
git init
git add .
git commit -m "Initial: AI Agents app"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/ai-agents-app.git
git branch -M main
git push -u origin main
```

### Step 3 — Deploy on Vercel

1. Go to **https://vercel.com** → Sign up with GitHub
2. Click **"New Project"**
3. Import your `ai-agents-app` repo
4. In **"Environment Variables"** section, add:
   - Key: `GROQ_API_KEY`
   - Value: `gsk_your_actual_key_here`
5. Click **Deploy**

Vercel auto-detects Next.js — no config needed!

Your app will be live at: `https://ai-agents-app-xxxx.vercel.app`

---

## 🧠 Agent Workflow (as per exercise)

### Task 1: Calculator Agent

```
User Query: "What is 45 × 23?"
        ↓
LLM (LLaMA-3 70B) decides → USE calculator tool
        ↓
Tool execution: calculator("45 * 23")
        ↓
Observation: Result = 1035
        ↓
LLM reasoning: formats answer with explanation
        ↓
Final Answer: "45 × 23 = 1035"
```

The agent uses **Groq's tool-use API** with a real math engine (`mathjs`).

### Task 2: Document QA Bot

```
User Query: "What is cloud computing?"
        ↓
Retrieval: BM25-style keyword search across document chunks
        ↓
Top-K chunks retrieved (with page numbers)
        ↓
LLM reasoning: generates answer from retrieved context
        ↓
Final Answer: context-aware response with source pages
```

---

## 📝 Recording Your Results (for submission)

### Task 1 — Calculator Agent

| Field | Example |
|-------|---------|
| Prompt used | "A train travels at 80 km/h for 2.5 hours. How far?" |
| Tool selected | `calculator("80 * 2.5")` |
| Final output | "The train travels 200 km" |

### Task 2 — Document QA Bot

| Field | Example |
|-------|---------|
| Document used | cloud_computing_notes.pdf (45 pages) |
| User query | "What is cloud computing?" |
| Retrieved context | Section from page 3 mentioning "on-demand computing..." |
| Final answer | "Cloud computing is..." |

---

## 🔧 Troubleshooting

**`npm install` fails:**
```bash
npm install --legacy-peer-deps
```

**PDF upload error "could not extract text":**
- Your PDF is scanned/image-only. Use a text-based PDF.
- Convert at: https://www.ilovepdf.com/ocr-pdf

**Groq API error 401:**
- Check `.env.local` has correct key with no spaces
- Restart dev server after changing `.env.local`

**Port 3000 in use:**
```bash
npm run dev -- --port 3001
```

**Node not found in Conda:**
```bash
conda install nodejs -c conda-forge -y
```

---

## 🛠 Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + Custom CSS |
| AI Models | Groq API (LLaMA-3 70B) |
| Tool Use | Groq Function Calling |
| Math Engine | mathjs |
| PDF Parsing | pdf-parse |
| Vector Search | BM25 keyword retrieval (in-memory) |
| Deployment | Vercel |
