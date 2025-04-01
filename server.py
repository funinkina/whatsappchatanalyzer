import os
import tempfile
import shutil
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import uvicorn
from main import analyze_chat


app = FastAPI(
    title="WhatsApp Chat Analyzer API",
    description="Upload a WhatsApp chat export file (.txt) to get analysis results.",
    version="1.0.0",
)

# Define the path for stopwords relative to this script's location
STOPWORDS_FILE = os.path.join(os.path.dirname(__file__), "stopwords.txt")

@app.post("/analyze/",
          summary="Analyze WhatsApp Chat File",
          description="Upload a .txt WhatsApp chat export file. Returns JSON analysis.",
          tags=["Analysis"])
async def analyze_whatsapp_chat(file: UploadFile = File(..., description="WhatsApp chat export file (.txt)"), convo_break_minutes: int = 60):
    """
    Endpoint to upload and analyze a WhatsApp chat file.

    - **file**: The WhatsApp chat export (.txt format).
    - **convo_break_minutes**: The number of minutes of inactivity to consider a new conversation (default: 60).

    Returns a JSON object with chat statistics.
    Raises HTTPException on errors (e.g., file type, processing error).
    """
    # Basic validation for file type (optional but recommended)
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a .txt file.")

    # Create a temporary file to store the uploaded content
    # Using NamedTemporaryFile ensures it has a path accessible by analyze_chat
    # We use delete=False because analyze_chat needs to open the file by path.
    # We will manually delete it in the finally block.
    temp_file_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="wb") as temp_file:
            # Copy the uploaded file's content to the temporary file
            shutil.copyfileobj(file.file, temp_file)
            temp_file_path = temp_file.name

        # Ensure the temp file path was set
        if not temp_file_path:
            raise HTTPException(status_code=500, detail="Failed to create temporary file.")

        # Run the analysis using the function from main.py
        results = analyze_chat(
            chat_file=temp_file_path,
            convo_break_minutes=convo_break_minutes,
            stopwords_file=STOPWORDS_FILE
        )

        # Return the results as JSON
        return JSONResponse(content=results)

    except FileNotFoundError as e:
        # Handle case where stopwords file might be missing specifically
        if "stopwords.txt" in str(e):
            print(f"Warning from analyze_chat: {e}")
            # If analyze_chat handles this gracefully (as it seems to), we can proceed
            # Re-run analysis allowing the warning from analyze_chat
            try:
                results = analyze_chat(
                    chat_file=temp_file_path,
                    convo_break_minutes=convo_break_minutes,
                    stopwords_file=STOPWORDS_FILE
                )
                return JSONResponse(content=results)
            except Exception as inner_e:
                raise HTTPException(status_code=500, detail=f"Error during chat analysis after stopwords warning: {inner_e}")
        else:
            raise HTTPException(status_code=500, detail=f"An internal error occurred: {e}")

    except Exception as e:
        # Catch any other errors during processing
        # Log the error for debugging (optional)
        # logger.error(f"Error processing file {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing chat file: {e}")

    finally:
        # Clean up the temporary file if it was created
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        # Close the uploaded file stream
        await file.close()


if __name__ == "__main__":
    print(f"Looking for stopwords file at: {STOPWORDS_FILE}")
    uvicorn.run(app, host="0.0.0.0", port=8000)
