import os
import tempfile
import asyncio
import logging
import time
import functools
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

import uvicorn
from dotenv import load_dotenv

from main_analysis import analyze_chat

load_dotenv()

API_KEY = os.getenv("VAL_API_KEY")

MAX_CONCURRENT_ANALYSES = int(os.getenv("MAX_CONCURRENT_ANALYSES", "4"))
TEMP_DIR_ROOT = Path(tempfile.gettempdir()) / "bloop"

MAX_TEMP_FILE_AGE_SECONDS = int(os.getenv("MAX_TEMP_FILE_AGE_SECONDS", "6000"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

ANALYSIS_TIMEOUT_SECONDS = int(os.getenv("ANALYSIS_TIMEOUT_SECONDS", "120"))

TEMP_DIR_ROOT.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=LOG_LEVEL, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

if not API_KEY:
    logger.warning(
        "VAL_API_KEY not set in environment variables. API access will be restricted."
    )

analysis_semaphore = asyncio.Semaphore(MAX_CONCURRENT_ANALYSES)


async def run_sync_in_executor(func, *args):
    """Runs a blocking synchronous function in FastAPI's default thread pool."""
    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(None, func, *args)


async def cleanup_temp_files():
    """Periodically cleans up old files in the app's temp directory."""
    while True:
        logger.info(f"Running periodic temp file cleanup in {TEMP_DIR_ROOT}...")
        try:
            now = time.time()
            count = 0
            total_size = 0
            for item in TEMP_DIR_ROOT.iterdir():

                is_file = await run_sync_in_executor(item.is_file)
                if is_file:
                    try:
                        stat_result = await run_sync_in_executor(item.stat)
                        file_age = now - stat_result.st_mtime
                        file_size = stat_result.st_size

                        if file_age > MAX_TEMP_FILE_AGE_SECONDS:
                            await run_sync_in_executor(os.remove, item)
                            logger.info(
                                f"Cleaned up old temp file: {item} ({(file_size / 1024):.2f} KB)"
                            )
                            count += 1
                            total_size += file_size

                    except FileNotFoundError:

                        continue
                    except OSError as e:
                        logger.error(f"Error removing temp file {item}: {e}")
            if count > 0:
                logger.info(
                    f"Periodic cleanup removed {count} files, total size: {(total_size / (1024 * 1024)):.2f} MB."
                )
            else:
                logger.info("Periodic cleanup found no old files to remove.")

        except Exception as e:
            logger.error(f"Error during periodic temp file cleanup: {e}", exc_info=True)

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


class LimitUploadSizeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_size: int):
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):

        content_length = request.headers.get("content-length")

        if request.url.path == "/analyze/" and content_length:
            try:
                size = int(content_length)
                if size > self.max_size:
                    logger.warning(
                        f"Rejected upload: Content-Length {size} bytes exceeds limit {self.max_size} bytes."
                    )

                    return Response(
                        content=f"Maximum request body size limit exceeded ({self.max_size / (1024 * 1024):.1f} MB)",
                        status_code=413,
                    )
            except ValueError:
                logger.warning("Invalid Content-Length header received.")

        response = await call_next(request)
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application startup...")
    logger.info(f"Max concurrent analyses: {MAX_CONCURRENT_ANALYSES}")
    logger.info(f"Temporary directory: {TEMP_DIR_ROOT}")
    logger.info(f"Max temp file age: {MAX_TEMP_FILE_AGE_SECONDS} seconds")
    logger.info(f"Max upload size: {MAX_UPLOAD_SIZE_BYTES / (1024 * 1024):.1f} MB")
    logger.info(f"Analysis timeout: {ANALYSIS_TIMEOUT_SECONDS} seconds")

    cleanup_task = asyncio.create_task(cleanup_temp_files())
    logger.info("Started background task for temporary file cleanup.")
    yield
    logger.info("Application shutdown...")
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        logger.info("Temporary file cleanup task cancelled.")
    except Exception as e:
        logger.error(f"Error during cleanup task shutdown: {e}", exc_info=True)


app = FastAPI(
    title="WhatsApp Chat Analyzer API",
    description="Upload a WhatsApp chat export file (.txt) to get analysis results. Requires API Key.",
    version="1.0.2",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://bloopit.vercel.app"],
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

app.add_middleware(LimitUploadSizeMiddleware, max_size=MAX_UPLOAD_SIZE_BYTES)


@app.get("/health", tags=["Health"], summary="Health Check")
async def health_check():
    """Basic health check endpoint."""

    return JSONResponse(
        content={
            "status": "ok",
            "pending_analyses": MAX_CONCURRENT_ANALYSES - analysis_semaphore._value,
        }
    )


@app.post(
    "/analyze/",
    summary="Analyze WhatsApp Chat File",
    description=f"Upload a .txt WhatsApp chat export file (max {MAX_UPLOAD_SIZE_MB}MB). Returns JSON analysis.",
    tags=["Analysis"],
    dependencies=[Depends(verify_api_key)],
)
async def analyze_whatsapp_chat(
    request: Request,
    file: UploadFile = File(..., description="WhatsApp chat export file (.txt)"),
):
    """
    Endpoint to upload and analyze a WhatsApp chat file.
    """
    client_host = request.client.host if request.client else "unknown"
    log_prefix = f"[Req from {client_host} | File: {file.filename or 'unknown'}]"

    logger.info(
        f"{log_prefix} Received analysis request. Content-Type: {file.content_type}"
    )

    if not file.filename:
        logger.warning(f"{log_prefix} Filename is empty.")
        raise HTTPException(status_code=400, detail="Filename cannot be empty.")
    if not file.filename.lower().endswith(".txt"):
        logger.warning(f"{log_prefix} Invalid file extension: {file.filename}")
        raise HTTPException(
            status_code=400, detail="Invalid file extension. Please upload a .txt file."
        )
    if file.content_type != "text/plain":
        logger.warning(
            f"{log_prefix} Potentially incorrect Content-Type: {file.content_type}. Expected 'text/plain'. Proceeding."
        )

    temp_file_path: Path | None = None
    acquired_semaphore = False
    fd = -1  # Initialize file descriptor

    try:
        logger.debug(
            f"{log_prefix} Attempting to acquire analysis semaphore ({analysis_semaphore._value} available)..."
        )
        try:
            await asyncio.wait_for(analysis_semaphore.acquire(), timeout=30.0)
            acquired_semaphore = True
            logger.info(
                f"{log_prefix} Analysis semaphore acquired ({analysis_semaphore._value} available)."
            )
        except asyncio.TimeoutError:
            logger.error(
                f"{log_prefix} Could not acquire analysis semaphore within 30s. Server is too busy."
            )
            raise HTTPException(
                status_code=503, detail="Server is busy, please try again later."
            )

        # --- File Saving ---
        # Create a partial function for mkstemp with its keyword arguments
        mkstemp_partial = functools.partial(
            tempfile.mkstemp, suffix=".txt", prefix="upload_", dir=TEMP_DIR_ROOT
        )

        # Run the partial function in the executor
        # No need for our custom helper here, use run_in_executor directly
        loop = asyncio.get_running_loop()
        fd, temp_path_str = await loop.run_in_executor(None, mkstemp_partial)
        temp_file_path = Path(temp_path_str)

        # Write the uploaded file content to the temporary file asynchronously
        bytes_written = 0
        try:
            # Use 'with open(fd, "wb")' which correctly handles closing the fd
            with open(fd, "wb") as temp_file_handle:
                while True:
                    chunk = await file.read(1024 * 1024)  # Read 1MB chunks
                    if not chunk:
                        break
                    # Use run_sync_in_executor for the blocking write method
                    await run_sync_in_executor(temp_file_handle.write, chunk)
                    bytes_written += len(chunk)

            # fd is now closed by the 'with open' context manager
            fd = -1  # Mark fd as closed/invalid

            logger.info(
                f"{log_prefix} Saved uploaded file to temporary path: {temp_file_path} ({bytes_written / (1024 * 1024):.2f} MB)"
            )
        except Exception as e:
            # Ensure temp file is cleaned up if saving fails
            if fd != -1:  # Close fd if 'with open' failed before exit
                try:
                    os.close(fd)
                except OSError:
                    pass  # Ignore errors closing already closed fd
                fd = -1  # Ensure fd is marked as closed after attempt
            if temp_file_path and await run_sync_in_executor(
                os.path.exists, temp_file_path
            ):
                await run_sync_in_executor(os.remove, temp_file_path)
            logger.error(
                f"{log_prefix} Failed to save uploaded file: {e}", exc_info=True
            )
            raise HTTPException(
                status_code=500, detail="Server error: Failed to save chat file."
            )

        if not bytes_written:
            logger.warning(f"{log_prefix} Uploaded file appears to be empty.")
            # Clean up the empty temp file before raising
            if temp_file_path and await run_sync_in_executor(
                os.path.exists, temp_file_path
            ):
                await run_sync_in_executor(os.remove, temp_file_path)
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        logger.info(
            f"{log_prefix} Starting analysis (Timeout: {ANALYSIS_TIMEOUT_SECONDS}s)..."
        )
        try:
            # analyze_chat should be awaited directly if it's an async function
            # Remove the run_sync_in_executor wrapper
            results = await asyncio.wait_for(
                analyze_chat(
                    str(temp_file_path), file.filename
                ),  # Await analyze_chat directly
                timeout=ANALYSIS_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.error(
                f"{log_prefix} Analysis timed out after {ANALYSIS_TIMEOUT_SECONDS}s."
            )
            raise HTTPException(
                status_code=504,
                detail=f"Analysis processing timed out after {ANALYSIS_TIMEOUT_SECONDS} seconds.",
            )
        except Exception as analysis_exc:
            logger.error(
                f"{log_prefix} Analysis function failed: {analysis_exc}", exc_info=True
            )
            # Check if the error is the specific TypeError and provide a more specific message if needed
            if isinstance(
                analysis_exc, TypeError
            ) and "coroutines cannot be used" in str(analysis_exc):
                logger.error(
                    f"{log_prefix} Attempted to run async function analyze_chat synchronously."
                )
                # You might want to re-raise a more specific internal server error here
            raise HTTPException(
                status_code=500,
                detail=f"Analysis failed: {type(analysis_exc).__name__}",
            )

        logger.info(f"{log_prefix} Analysis completed successfully.")
        return JSONResponse(content=results)

    except HTTPException as http_exc:
        # Re-raise HTTPExceptions directly
        raise http_exc
    except Exception as e:
        # Catch any other unexpected errors
        logger.error(
            f"{log_prefix} Unhandled error during request processing: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected server error occurred: {type(e).__name__}",
        )

    finally:
        # --- Cleanup for this request ---
        if acquired_semaphore:
            analysis_semaphore.release()
            logger.debug(
                f"{log_prefix} Analysis semaphore released ({analysis_semaphore._value} available)."
            )

        # Close the upload file handle
        try:
            await file.close()
        except Exception as e:
            logger.warning(f"{log_prefix} Error closing upload file handle: {e}")

        # Ensure fd is closed if an error happened *after* mkstemp but *before* or *during* the 'with open' block
        if fd != -1:
            try:
                os.close(fd)
                logger.warning(
                    f"{log_prefix} Closed lingering file descriptor {fd} in finally block."
                )
            except OSError as e:
                logger.error(
                    f"{log_prefix} Error closing fd {fd} in finally block: {e}"
                )

        # Remove the temporary file for this specific request
        if temp_file_path and await run_sync_in_executor(
            os.path.exists, temp_file_path
        ):
            try:
                await run_sync_in_executor(os.remove, temp_file_path)
                logger.info(
                    f"{log_prefix} Successfully removed temporary file: {temp_file_path}"
                )
            except Exception as e:
                # Log error, but rely on periodic cleanup if removal fails here
                logger.error(
                    f"{log_prefix} Error removing temporary file {temp_file_path} in finally block: {e}. Will be cleaned up later."
                )

        # Optional: Trigger garbage collection if memory usage is a concern
        # gc.collect()
        # logger.debug(f"{log_prefix} Triggered garbage collection.")


if __name__ == "__main__":
    logger.info(f"Starting development server on {HOST}:{PORT} (Single Worker)")
    logger.warning("For production, run using 'uvicorn server:app --workers <N> ...'")
    uvicorn.run(app, host=HOST, port=PORT, log_level=LOG_LEVEL.lower())
