import os
import tempfile
import shutil
import zipfile
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from main_analysis import analyze_chat
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="WhatsApp Chat Analyzer API",
    description="Upload a WhatsApp chat export file (.txt or .zip containing a .txt) to get analysis results.",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://bloopit.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyze/",
          summary="Analyze WhatsApp Chat File",
          description="Upload a .txt WhatsApp chat export file or a .zip file containing one .txt file. Returns JSON analysis.",
          tags=["Analysis"])
async def analyze_whatsapp_chat(file: UploadFile = File(..., description="WhatsApp chat export file (.txt or .zip)")):
    """
    Endpoint to upload and analyze a WhatsApp chat file.

    - **file**: The WhatsApp chat export (.txt format or .zip containing one .txt file).

    Returns a JSON object with chat statistics.
    Raises HTTPException on errors (e.g., file type, processing error).
    """
    print(f"Received file: {file.filename}, Content-Type: {file.content_type}")

    # Allow .txt and .zip files
    if not (file.filename.endswith(".txt") or file.filename.endswith(".zip")):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a .txt or .zip file.")

    temp_file_path = None
    temp_dir = None
    original_filename = file.filename

    try:
        if file.filename.endswith(".txt"):
            # Handle .txt file directly
            with tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="wb") as temp_file:
                shutil.copyfileobj(file.file, temp_file)
                temp_file_path = temp_file.name
        elif file.filename.endswith(".zip"):
            # Handle .zip file
            temp_dir = tempfile.mkdtemp()
            zip_file_path = os.path.join(temp_dir, file.filename)

            # Save the uploaded zip file
            with open(zip_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Extract the zip file
            try:
                with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
            except zipfile.BadZipFile:
                raise HTTPException(status_code=400, detail="Invalid or corrupted zip file.")

            # Find the .txt file in the extracted contents
            txt_files = [f for f in os.listdir(temp_dir) if f.endswith(".txt")]

            if len(txt_files) == 1:
                temp_file_path = os.path.join(temp_dir, txt_files[0])
                original_filename = txt_files[0]  # Update original_filename to use the extracted filename
                print(f"Found .txt file in zip: {temp_file_path}")
            elif len(txt_files) == 0:
                raise HTTPException(status_code=400, detail="No .txt file found inside the zip archive.")
            else:
                raise HTTPException(status_code=400, detail="Multiple .txt files found inside the zip archive. Please provide a zip with only one .txt file.")

        # Ensure the temp file path was set (either from .txt or extracted from .zip)
        if not temp_file_path or not os.path.exists(temp_file_path):
            raise HTTPException(status_code=500, detail="Failed to prepare chat file for analysis.")

        # Run the analysis using the function from main_analysis.py, passing the original filename
        results = await analyze_chat(
            chat_file=temp_file_path,
            original_filename=original_filename  # Pass the original filename
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
                # Ensure temp_file_path is still valid before re-running
                if not temp_file_path or not os.path.exists(temp_file_path):
                    raise HTTPException(status_code=500, detail="Chat file path lost before re-analysis attempt.")
                results = await analyze_chat(  # Changed to await
                    chat_file=temp_file_path,
                    original_filename=original_filename  # Pass the original filename here too
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
        # Clean up temporary file or directory
        if temp_file_path and os.path.exists(temp_file_path) and not temp_dir:  # Only remove if it wasn't in a temp dir
            try:
                os.remove(temp_file_path)
            except OSError as e:
                print(f"Error removing temporary file {temp_file_path}: {e}")
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)  # Remove the whole temporary directory for zip files
            except OSError as e:
                print(f"Error removing temporary directory {temp_dir}: {e}")
        await file.close()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
