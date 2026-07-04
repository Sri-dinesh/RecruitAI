import io
import pypdf
import docx

def parse_pdf(file_bytes: bytes) -> str:
    """
    Extracts plain text from PDF bytes using pypdf.
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        raise ValueError(f"Failed to parse PDF file: {e}")

def parse_docx(file_bytes: bytes) -> str:
    """
    Extracts plain text from DOCX bytes using python-docx.
    """
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
        paragraphs_text = [p.text for p in doc.paragraphs if p.text]
        return "\n".join(paragraphs_text).strip()
    except Exception as e:
        raise ValueError(f"Failed to parse DOCX file: {e}")
