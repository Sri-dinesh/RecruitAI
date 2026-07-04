import io
import re
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def markdown_to_html(text: str) -> str:
    """
    Translates simple markdown bold, lists, and code snippets
    into ReportLab compatible inline HTML tags.
    """
    # Replace XML special characters (excluding tags we inject ourselves)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    
    # Restore HTML tags we actually need for styling
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'`(.*?)`', r"<font face='Courier' color='#b91c1c'>\1</font>", text)
    
    # Fix back converted symbols
    text = text.replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>")
    text = text.replace("&lt;font", "<font").replace("&lt;/font&gt;", "</font>")
    text = text.replace("color=&#x27;#b91c1c&#x27;", "color='#b91c1c'")
    text = text.replace("face=&#x27;Courier&#x27;", "face='Courier'")
    return text

def generate_recruitment_report(jd: dict, shortlist: list, interview_questions: str, salary_data: str) -> bytes:
    """
    Compiles JD, candidate shortlist, interview prep questions, and salary
    expectations into a styled, corporate assessment ReportLab PDF.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom color palette styling
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#059669")
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#64748b")
    )
    
    section_title_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=14,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155")
    )
    
    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
        leftIndent=15,
        firstLineIndent=-10
    )
    
    header_style = ParagraphStyle(
        'Header',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.white
    )
    
    story = []
    
    # 1. Page Header Block
    story.append(Paragraph("RecruitAI Candidate Assessment Report", title_style))
    story.append(Paragraph(f"System Co-Pilot Summary | Date Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", subtitle_style))
    story.append(Spacer(1, 12))
    
    # 2. Section 1: Active Job Description
    story.append(Paragraph("1. Position Target Requirements", section_title_style))
    
    role = jd.get("role", "N/A") if jd else "N/A"
    exp = f"{jd.get('experience_years', 'N/A')}+ years" if jd else "N/A"
    tone = jd.get("tone", "N/A") if jd else "N/A"
    skills = ", ".join(jd.get("required_skills", [])) if jd else "N/A"
    
    jd_data = [
        [Paragraph("<b>Target Role:</b>", body_style), Paragraph(markdown_to_html(role), body_style)],
        [Paragraph("<b>Target Experience:</b>", body_style), Paragraph(markdown_to_html(exp), body_style)],
        [Paragraph("<b>Job Tone & Culture:</b>", body_style), Paragraph(markdown_to_html(tone.capitalize()), body_style)],
        [Paragraph("<b>Core Skills List:</b>", body_style), Paragraph(markdown_to_html(skills), body_style)]
    ]
    
    jd_table = Table(jd_data, colWidths=[120, 420])
    jd_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(jd_table)
    story.append(Spacer(1, 10))
    
    # 3. Section 2: Shortlisted Candidates
    story.append(Paragraph("2. Screening Shortlist Results", section_title_style))
    if shortlist:
        table_data = [
            [
                Paragraph("Candidate Name", header_style),
                Paragraph("Match Score", header_style),
                Paragraph("Matched Skills", header_style),
                Paragraph("Identified Gaps", header_style)
            ]
        ]
        
        for c in shortlist:
            name = c.get("name", "N/A")
            score_val = c.get("match_score", 0)
            score = f"{score_val}/100"
            matched_skills = ", ".join(c.get("matched_skills", [])) if c.get("matched_skills") else "None"
            gaps = ", ".join(c.get("gaps", [])) if c.get("gaps") else "None"
            
            # Color-code Match Score
            score_color = "#059669" if score_val >= 80 else "#d97706" if score_val >= 50 else "#dc2626"
            score_paragraph = Paragraph(f"<font color='{score_color}'><b>{score}</b></font>", body_style)
            
            table_data.append([
                Paragraph(markdown_to_html(name), body_style),
                score_paragraph,
                Paragraph(markdown_to_html(matched_skills), body_style),
                Paragraph(markdown_to_html(gaps), body_style)
            ])
            
        shortlist_table = Table(table_data, colWidths=[110, 70, 180, 180])
        shortlist_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#059669")),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
            ('PADDING', (0,0), (-1,-1), 5),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
        ]))
        story.append(shortlist_table)
    else:
        story.append(Paragraph("No shortlist finalizations recorded in this session.", body_style))
        
    story.append(Spacer(1, 10))
    
    # 4. Section 3: Salary Expectations
    story.append(Paragraph("3. Market Salary Benchmark", section_title_style))
    salary_html = markdown_to_html(salary_data).replace("\n", "<br/>")
    salary_table = Table([[Paragraph(salary_html, body_style)]], colWidths=[540])
    salary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 7),
    ]))
    story.append(salary_table)
    story.append(Spacer(1, 10))
    
    # 5. Section 4: Interview Prep Questions
    story.append(PageBreak())
    story.append(Paragraph("4. Technical & Gap-Probing Interview Questions", section_title_style))
    story.append(Spacer(1, 4))
    
    questions_lines = interview_questions.split('\n')
    for q_line in questions_lines:
        if q_line.strip():
            html_line = markdown_to_html(q_line.strip())
            # List bullet indent
            if q_line.strip().startswith('-') or q_line.strip().startswith('*') or re.match(r'^\d+\.', q_line.strip()):
                story.append(Paragraph(html_line, bullet_style))
            else:
                story.append(Paragraph(html_line, body_style))
            story.append(Spacer(1, 3))
            
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
