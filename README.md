# Whatsapp Chat Analyzer
Provides some cool analysis of your whatsapp chat, such as:
- Top words and emojis
- Most replies
- Most ignored
- Biggest conversation starter
- AI analysis of the chat

## Installation

### Linux
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Windows
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Usage
```bash
fastapi dev server.py
```

### You can also use the script to analyze the chat
```bash
python main_analysis.py --file </path/to/your/Whatsapp Chat with friend.txt>
```

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## TODO
- [ ] Add more analysis
- [ ] Build a frontend
- [ ] Make the llm return a json object
- [ ] Add more error handling
- [ ] Enable optional logging
- [ ] Add more validations