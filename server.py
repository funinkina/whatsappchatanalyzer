import os
import tempfile
import shutil
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from dotenv import load_dotenv

try:
    from main_analysis import analyze_chat
except ImportError:

    async def analyze_chat(chat_file: str, original_filename: str):
        logging.warning("Using dummy analyze_chat function.")
        await asyncio.sleep(1)
        return {
            "analysis": "dummy_results",
            "filename": original_filename,
            "file_path": chat_file,
        }


load_dotenv()

API_KEY = os.getenv("VAL_API_KEY")
MAX_CONCURRENT_ANALYSES = 50
TEMP_DIR_ROOT = Path(tempfile.gettempdir()) / "whatsapp_analyzer_temp"
MAX_TEMP_FILE_AGE_SECONDS = 6000
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

TEMP_DIR_ROOT.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=LOG_LEVEL, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

if not API_KEY:
    logger.warning(
        "API_KEY not set in environment variables. API access will be restricted."
    )

analysis_semaphore = asyncio.Semaphore(MAX_CONCURRENT_ANALYSES)


async def run_sync_io(func, *args):
    """Runs a blocking synchronous function in a separate thread."""
    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(None, func, *args)


async def cleanup_temp_files():
    """Periodically cleans up old files in the app's temp directory."""
    while True:
        try:
            now = time.time()
            count = 0
            for item in TEMP_DIR_ROOT.iterdir():
                if item.is_file():
                    try:
                        file_age = now - item.stat().st_mtime
                        if file_age > MAX_TEMP_FILE_AGE_SECONDS:
                            await run_sync_io(os.remove, item)
                            logger.info(f"Cleaned up old temp file: {item}")
                            count += 1
                    except FileNotFoundError:

                        continue
                    except OSError as e:
                        logger.error(f"Error removing temp file {item}: {e}")
            if count > 0:
                logger.info(
                    f"Temporary file cleanup finished. Removed {count} old files."
                )
        except Exception as e:
            logger.error(f"Error during periodic temp file cleanup: {e}")

        await asyncio.sleep(MAX_TEMP_FILE_AGE_SECONDS / 2)


async def verify_api_key(x_api_key: str = Header(None)):
    if not API_KEY:
        logger.error(
            "API Key verification called, but VAL_API_KEY is not configured on server."
        )
        raise HTTPException(
            status_code=503, detail="Server configuration error: API Key not set"
        )

    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key is missing")

    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")

    return x_api_key


@asynccontextmanager
async def lifespan(app: FastAPI):

    logger.info("Application startup...")
    logger.info(f"Max concurrent analyses: {MAX_CONCURRENT_ANALYSES}")
    logger.info(f"Temporary directory: {TEMP_DIR_ROOT}")
    logger.info(f"Max temp file age: {MAX_TEMP_FILE_AGE_SECONDS} seconds")

    cleanup_task = asyncio.create_task(cleanup_temp_files())
    logger.info("Started background task for temporary file cleanup.")
    yield

    logger.info("Application shutdown...")
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        logger.info("Temporary file cleanup task cancelled.")


app = FastAPI(
    title="WhatsApp Chat Analyzer API",
    description="Upload a WhatsApp chat export file (.txt) to get analysis results. Requires API Key.",
    version="1.0.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://bloopit.vercel.app"],
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"], summary="Health Check")
async def health_check():
    """Basic health check endpoint."""
    return JSONResponse(content={"status": "ok"})


@app.post(
    "/analyze/",
    summary="Analyze WhatsApp Chat File",
    description="Upload a .txt WhatsApp chat export file. Returns JSON analysis.",
    tags=["Analysis"],
    dependencies=[Depends(verify_api_key)],
)
async def analyze_whatsapp_chat(
    request: Request,
    file: UploadFile = File(..., description="WhatsApp chat export file (.txt)"),
):
    """
    Endpoint to upload and analyze a WhatsApp chat file.

    - **file**: The WhatsApp chat export (.txt format). Requires `Content-Type: text/plain`.
    - **Requires Header**: `X-API-Key` with a valid API key.

    Returns a JSON object with chat statistics.
    Raises HTTPException on errors (e.g., file type, processing error, auth error).
    """
    client_host = request.client.host if request.client else "unknown"
    logger.info(
        f"Received analysis request from {client_host} for file: {file.filename}, Content-Type: {file.content_type}"
    )

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename cannot be empty.")
    if not file.filename.lower().endswith(".txt"):
        raise HTTPException(
            status_code=400, detail="Invalid file extension. Please upload a .txt file."
        )

    if file.content_type != "text/plain":
        logger.warning(
            f"File '{file.filename}' uploaded with potentially incorrect Content-Type: {file.content_type}. Proceeding, but expected 'text/plain'."
        )

    temp_file_path: Path | None = None
    original_filename = file.filename

    try:

        logger.debug("Attempting to acquire analysis semaphore...")
        async with analysis_semaphore:
            logger.debug("Analysis semaphore acquired.")

            with tempfile.NamedTemporaryFile(
                delete=False, suffix=".txt", dir=TEMP_DIR_ROOT, mode="wb"
            ) as temp_file:
                temp_file_path = Path(temp_file.name)

                await run_sync_io(shutil.copyfileobj, file.file, temp_file)
                logger.info(
                    f"Saved uploaded file '{original_filename}' to temporary path: {temp_file_path}"
                )

            if not temp_file_path or not await run_sync_io(
                os.path.exists, temp_file_path
            ):
                logger.error(
                    f"Failed to create or save temporary file for {original_filename}"
                )
                raise HTTPException(
                    status_code=500,
                    detail="Server error: Failed to prepare chat file for analysis.",
                )

            logger.info(
                f"Starting analysis for {original_filename} (path: {temp_file_path})"
            )
            start_time = time.time()

            ANALYSIS_TIMEOUT_SECONDS = 120
            try:

                results = await asyncio.wait_for(
                    analyze_chat(
                        chat_file=str(temp_file_path),
                        original_filename=original_filename,
                    ),
                    timeout=ANALYSIS_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                logger.error(
                    f"Analysis timed out for {original_filename} after {ANALYSIS_TIMEOUT_SECONDS}s"
                )
                raise HTTPException(
                    status_code=504,
                    detail=f"Analysis processing timed out after {ANALYSIS_TIMEOUT_SECONDS} seconds.",
                )

            end_time = time.time()
            logger.info(
                f"Analysis for {original_filename} completed in {end_time - start_time:.2f} seconds."
            )

            return JSONResponse(content=results)

    except FileNotFoundError as e:

        logger.error(
            f"Analysis failed for {original_filename}: File not found during processing. Error: {e}",
            exc_info=True,
        )

        raise HTTPException(
            status_code=500,
            detail="An internal error occurred: Required file not found during processing.",
        )

    except HTTPException as e:

        raise e
    except asyncio.TimeoutError:
        logger.error(f"Analysis timed out for {original_filename}", exc_info=True)
        raise HTTPException(status_code=504, detail="Analysis task timed out.")
    except Exception as e:
        logger.error(
            f"Unhandled error processing chat file {original_filename}: {e}",
            exc_info=True,
        )

        raise HTTPException(
            status_code=500,
            detail=f"An unexpected server error occurred during analysis: {type(e).__name__}",
        )

    finally:

        logger.debug("Analysis semaphore released (implicitly).")

        try:
            await file.close()
        except Exception as e:
            logger.warning(
                f"Error closing upload file handle for {original_filename}: {e}"
            )

        if temp_file_path and await run_sync_io(os.path.exists, temp_file_path):
            try:

                await run_sync_io(os.remove, temp_file_path)
                logger.info(f"Successfully removed temporary file: {temp_file_path}")
            except Exception as e:

                logger.error(
                    f"Error removing temporary file {temp_file_path} in finally block: {e}. It will be cleaned up later."
                )


if __name__ == "__main__":
    logger.info(f"Starting server on {HOST}:{PORT}")

    uvicorn.run(app, host=HOST, port=PORT, log_level=LOG_LEVEL.lower())
