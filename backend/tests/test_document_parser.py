import pytest
import io
import tempfile
from pathlib import Path
from reportlab.pdfgen import canvas

from app.services.document_parser import (
    parse_pdf,
    parse_pdf_details,
    extract_contact_info,
    parse_docx,
    parse_document
)

def create_sample_pdf_bytes(lines: list[str]) -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    y = 750
    for line in lines:
        c.drawString(100, y, line)
        y -= 20
    c.save()
    return buffer.getvalue()

def test_parse_pdf_bytes():
    pdf_bytes = create_sample_pdf_bytes([
        "Alice Smith - Software Engineer",
        "Email: alice@example.com",
        "Phone: 123-456-7890",
        "Skills: Python, FastAPI, React"
    ])
    text = parse_pdf(pdf_bytes)
    assert "Alice Smith" in text
    assert "alice@example.com" in text
    assert "Python, FastAPI, React" in text

def test_parse_pdf_file_path(tmp_path):
    pdf_bytes = create_sample_pdf_bytes([
        "Bob Jones",
        "Senior Data Scientist",
        "Contact: bob@datacorp.com"
    ])
    file_path = tmp_path / "resume.pdf"
    file_path.write_bytes(pdf_bytes)
    
    text = parse_pdf(file_path)
    assert "Bob Jones" in text
    assert "bob@datacorp.com" in text

def test_parse_pdf_details():
    pdf_bytes = create_sample_pdf_bytes([
        "Jane Doe - Resume",
        "Contact: jane.doe@tech.io | Phone: +1 (555) 234-5678",
        "Website: https://janedoe.dev"
    ])
    details = parse_pdf_details(pdf_bytes)
    assert details["num_pages"] == 1
    assert details["has_text"] is True
    assert "jane.doe@tech.io" in details["contact_info"]["emails"]
    assert "https://janedoe.dev" in details["contact_info"]["urls"]

def test_extract_contact_info():
    text = "Reach me at contact@domain.com or call 987-654-3210. Portfolio: https://myportfolio.com"
    info = extract_contact_info(text)
    assert info["emails"] == ["contact@domain.com"]
    assert len(info["phones"]) > 0
    assert info["urls"] == ["https://myportfolio.com"]

def test_parse_pdf_empty_bytes():
    with pytest.raises(ValueError, match="empty"):
        parse_pdf(b"")

def test_parse_document_pdf(tmp_path):
    pdf_bytes = create_sample_pdf_bytes(["John Doe Resume", "Role: Developer"])
    file_path = tmp_path / "john.pdf"
    file_path.write_bytes(pdf_bytes)
    
    text = parse_document(file_path)
    assert "John Doe Resume" in text
