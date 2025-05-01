![Logo](/whatsfrontend/public/bloop_white.svg)

This project provides insightful analysis of your WhatsApp chat history. Gain a deeper understanding of your conversations with features like:

*   **Top Words and Emojis:** Discover the most frequently used words and emojis in your chat.
*   **Engagement Metrics:** Identify who replies the most and whose messages tend to be ignored.
*   **Conversation Starters:** Find out who initiates conversations most often.
*   **AI-Powered Analysis:** Get an AI-generated summary and analysis of the chat dynamics (powered by models via Genezio).

## Project Structure

*   **Backend (`server.py`, `main_analysis.py`, `ai_analysis.py`, `utils.py`):** A Python application using FastAPI to provide an API for chat analysis and a script for direct command-line analysis.
*   **Frontend (`whatsfrontend/`):** A Next.js application to provide a user-friendly web interface for uploading and analyzing chats.

## Installation

### Backend (Python)

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd whatsappchatanalyzer
    ```
2.  **Create and activate a virtual environment:**

    *   **Linux/macOS:**
        ```bash
        python -m venv .venv
        source .venv/bin/activate
        ```
    *   **Windows:**
        ```bash
        python -m venv .venv
        .venv\Scripts\activate
        ```
3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Set up environment variables:**
    Copy `.env.example` to `.env` and fill in your API keys (e.g., for the AI analysis service).

### Frontend (Next.js)

1.  **Navigate to the frontend directory:**
    ```bash
    cd whatsfrontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```
3.  **Set up environment variables:**
    Copy `whatsfrontend/.env.example` to `whatsfrontend/.env` and configure necessary variables (e.g., the backend API endpoint).

## Usage

### Running the Backend Server

1.  Make sure you are in the project's root directory (`whatsappchatanalyzer`) and your Python virtual environment is activated.
2.  Run the FastAPI development server:
    ```bash
    fastapi dev server.py
    ```
    The API will typically be available at `http://127.0.0.1:8000`.

### Running the Frontend Development Server

1.  Navigate to the `whatsfrontend/` directory.
2.  Start the Next.js development server:
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```
    The frontend will usually be accessible at `http://localhost:3000`.

## TODO

*   [ ] Add more analysis features (e.g., activity over time, sentiment analysis).
*   [ ] Give users a shareable link to their analysis.
*   [x] Build a frontend (Initial version exists in `whatsfrontend/`).
*   [x] Make the LLM return a structured JSON object for easier frontend integration.
*   [x] Implement more robust error handling for file parsing and API calls.
*   [x] Add optional logging for debugging and monitoring.
*   [ ] Include more input validations (file type, size, format).