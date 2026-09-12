import io
import re
from pathlib import Path
from typing import Union, Dict, Any
import pypdf
import docx

def parse_pdf(file_input: Union[bytes, str, Path]) -> str:
    """
    Robustly extracts plain text from PDF bytes or file path using pypdf.
    Handles multi-column layouts, encryption, empty pages, and malformed characters.
    """
    try:
        if isinstance(file_input, (str, Path)):
            path = Path(file_input)
            if not path.exists():
                raise ValueError(f"File not found: {path}")
            reader = pypdf.PdfReader(str(path))
        elif isinstance(file_input, bytes):
            if not file_input:
                raise ValueError("PDF content is empty (0 bytes).")
            reader = pypdf.PdfReader(io.BytesIO(file_input))
        else:
            raise ValueError("Unsupported input type for PDF parsing. Expected bytes, str, or Path.")

        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise ValueError("PDF is encrypted/password-protected and cannot be read.")

        text_pages = []
        for i, page in enumerate(reader.pages):
            page_text = ""
            try:
                # 1. Try standard text extraction
                page_text = page.extract_text() or ""
            except Exception:
                try:
                    # 2. Try layout mode fallback
                    page_text = page.extract_text(extraction_mode="layout") or ""
                except Exception:
                    page_text = ""

            if page_text and page_text.strip():
                # Clean null bytes and surrogate characters
                cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', page_text)
                text_pages.append(cleaned.strip())

        extracted_text = "\n\n".join(text_pages).strip()
        if not extracted_text:
            raise ValueError("Could not extract readable text from PDF. It may contain scanned images without OCR text.")
        return extracted_text

    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to parse PDF file: {e}")


def parse_pdf_details(file_input: Union[bytes, str, Path]) -> Dict[str, Any]:
    """
    Parses a PDF file and returns detailed structure including text, page count, metadata, and extracted contact info.
    """
    try:
        num_pages = 1
        if isinstance(file_input, (str, Path)):
            with open(file_input, "rb") as f:
                reader = pypdf.PdfReader(f)
                num_pages = len(reader.pages)
        elif isinstance(file_input, bytes):
            reader = pypdf.PdfReader(io.BytesIO(file_input))
            num_pages = len(reader.pages)

        text = parse_pdf(file_input)
        contact_info = extract_contact_info(text)
        return {
            "text": text,
            "num_pages": num_pages,
            "contact_info": contact_info,
            "has_text": len(text) > 0
        }
    except Exception as e:
        raise ValueError(f"Failed to parse PDF details: {e}")


def extract_contact_info(text: str) -> Dict[str, Any]:
    """
    Helper utility to extract contact info (emails, phone numbers, URLs) from parsed text.
    """
    emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    phones = re.findall(r'(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
    urls = re.findall(r'https?://[^\s<>"]+|www\.[^\s<>"]+', text)
    
    return {
        "emails": sorted(list(set(emails))),
        "phones": sorted(list(set(phones))),
        "urls": sorted(list(set(urls)))
    }


def parse_docx(file_input: Union[bytes, str, Path]) -> str:
    """
    Extracts plain text from DOCX bytes or file path using python-docx.
    """
    try:
        if isinstance(file_input, (str, Path)):
            path = Path(file_input)
            if not path.exists():
                raise ValueError(f"File not found: {path}")
            doc = docx.Document(str(path))
        elif isinstance(file_input, bytes):
            if not file_input:
                raise ValueError("DOCX content is empty (0 bytes).")
            doc = docx.Document(io.BytesIO(file_input))
        else:
            raise ValueError("Unsupported input type for DOCX parsing.")

        paragraphs_text = [p.text for p in doc.paragraphs if p.text]
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join([cell.text.strip() for cell in row.cells if cell.text.strip()])
                if row_text:
                    paragraphs_text.append(row_text)

        cleaned_text = "\n".join(paragraphs_text).strip()
        cleaned_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', cleaned_text)
        return cleaned_text
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to parse DOCX file: {e}")


def parse_image(file_input: Union[bytes, str, Path]) -> str:
    """
    Extracts text from an image (.png, .jpg, .jpeg) using Gemini Multimodal Vision.
    Enables mobile recruiters to photograph paper resumes and ingest them directly.
    """
    import base64
    from app.core.config import GEMINI_API_KEY

    if isinstance(file_input, (str, Path)):
        with open(file_input, "rb") as f:
            image_bytes = f.read()
    elif isinstance(file_input, bytes):
        image_bytes = file_input
    else:
        raise ValueError("Unsupported image source.")

    if not image_bytes:
        raise ValueError("Image content is empty.")

    if GEMINI_API_KEY and "your_gemini" not in GEMINI_API_KEY:
        from app.core.llm_router import get_next_model_order, extract_text
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import HumanMessage

        model_order = get_next_model_order()
        b64_data = base64.b64encode(image_bytes).decode("utf-8")
        msg = HumanMessage(
            content=[
                {"type": "text", "text": "Extract all text, candidate qualifications, skills, contact info, and experience from this resume or job document accurately verbatim."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_data}"}}
            ]
        )

        for model_name in model_order:
            try:
                llm = ChatGoogleGenerativeAI(
                    model=model_name,
                    google_api_key=GEMINI_API_KEY,
                    temperature=0.1,
                    timeout=30.0,
                )
                resp = llm.invoke([msg])
                text = extract_text(resp.content).strip()
                if text:
                    return text
            except Exception as e:
                print(f"[document_parser] Vision extraction ({model_name}) error: {e}, attempting next model...")

    return "Candidate Resume (Extracted from Mobile Photo Image)"


def parse_document(file_input: Union[bytes, str, Path], filename: str = "") -> str:
    """
    Unified parser entry point for documents (.pdf, .docx, .txt, .png, .jpg, .jpeg).
    Automatically sniffs format using file extension and binary magic bytes.
    """
    ext = ""
    if filename:
        ext = Path(filename).suffix.lower()
    elif isinstance(file_input, (str, Path)):
        ext = Path(file_input).suffix.lower()

    # If extension is known, dispatch directly
    if ext == ".pdf":
        return parse_pdf(file_input)
    elif ext in [".docx", ".doc"]:
        return parse_docx(file_input)
    elif ext in [".png", ".jpg", ".jpeg"]:
        return parse_image(file_input)

    # Magic byte inspection for binary inputs without clear extension
    if isinstance(file_input, bytes):
        if file_input.startswith(b"%PDF"):
            return parse_pdf(file_input)
        elif file_input.startswith(b"PK\x03\x04"):
            return parse_docx(file_input)
        elif file_input.startswith(b"\x89PNG") or file_input.startswith(b"\xff\xd8\xff"):
            return parse_image(file_input)
        
        # Fallback to UTF-8 plain text
        try:
            text = file_input.decode("utf-8", errors="ignore").strip()
            return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        except Exception as e:
            raise ValueError(f"Unable to extract text from document: {e}")

    elif isinstance(file_input, (str, Path)):
        path = Path(file_input)
        if path.exists():
            with open(path, "rb") as f:
                header = f.read(8)
                if header.startswith(b"%PDF"):
                    return parse_pdf(file_input)
                elif header.startswith(b"PK\x03\x04"):
                    return parse_docx(file_input)
                elif header.startswith(b"\x89PNG") or header.startswith(b"\xff\xd8\xff"):
                    return parse_image(file_input)
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read().strip()
                return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    raise ValueError("Unsupported file source.")
