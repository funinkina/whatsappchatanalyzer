import os
import tempfile
import shutil
from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from main_analysis import analyze_chat
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="WhatsApp Chat Analyzer API",
    description="Upload a WhatsApp chat export file (.txt) to get analysis results.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://bloopit.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("VAL_API_KEY")
if not API_KEY:
    print("WARNING: API_KEY not set in environment variables. API access will be restricted.")

async def verify_api_key(x_api_key: str = Header(None)):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API_KEY not configured on server")

    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing API key")

    return x_api_key

@app.post("/analyze/",
          summary="Analyze WhatsApp Chat File",
          description="Upload a .txt WhatsApp chat export file. Returns JSON analysis.",
          tags=["Analysis"])
async def analyze_whatsapp_chat(
    file: UploadFile = File(..., description="WhatsApp chat export file (.txt)"),
    api_key: str = Depends(verify_api_key)
):
    """
    Endpoint to upload and analyze a WhatsApp chat file.

    - **file**: The WhatsApp chat export (.txt format).
    - **x-api-key**: API key required for authentication (provide in request header)

    Returns a JSON object with chat statistics.
    Raises HTTPException on errors (e.g., file type, processing error).
    """
    print(f"Received file: {file.filename}, Content-Type: {file.content_type}")

    if not file.filename.endswith(".txt") or file.content_type != "text/plain":
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a .txt file.")

    temp_file_path = None
    original_filename = file.filename

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="wb") as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_file_path = temp_file.name

        if not temp_file_path or not os.path.exists(temp_file_path):
            raise HTTPException(status_code=500, detail="Failed to prepare chat file for analysis.")

        results = await analyze_chat(
            chat_file=temp_file_path,
            original_filename=original_filename
        )

        return JSONResponse(content=results)

    except FileNotFoundError as e:
        # Handle case where stopwords file might be missing specifically
        if "stopwords.txt" in str(e):
            print(f"Warning from analyze_chat: {e}")
            # If analyze_chat handles this gracefully (as it seems to), we can proceed
            # Re-run analysis allowing the warning from analyze_chat
            try:
                # Ensure temp_file_path is still valid before re-running
                if not temp_file_path or not os.path.exists(temp_file_path):
                    raise HTTPException(status_code=500, detail="Chat file path lost before re-analysis attempt.")
                results = await analyze_chat(
                    chat_file=temp_file_path,
                    original_filename=original_filename
                )
                return JSONResponse(content=results)
            except Exception as inner_e:
                raise HTTPException(status_code=500, detail=f"Error during chat analysis after stopwords warning: {inner_e}")
        else:
            raise HTTPException(status_code=500, detail=f"An internal error occurred: {e}")

    except HTTPException as e:  # Re-raise HTTPExceptions directly
        raise e
    except Exception as e:
        print(f"Error processing chat file: {e}")  # Log the actual error
        raise HTTPException(status_code=500, detail=f"Error processing chat file: {e}")

    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except OSError as e:
                print(f"Error removing temporary file {temp_file_path}: {e}")
        await file.close()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
